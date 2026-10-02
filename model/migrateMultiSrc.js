import fs from 'node:fs'
import path from 'node:path'
import {
  PROFILE_DIR, MIAO_PROFILE_LINK, BACKUP_DIR, LEGACY_DEFAULT_DIR,
  MAP_JSON_PATH, GALLERY_CONFIG_PATH, getRepoDir
} from '../components/constants.js'
import { getActiveRepoIds } from './mapJson.js'
import { getThirdPartyRepos } from './galleryConfig.js'
import { isJunction, removeJunction } from './junction.js'
import { probeRepo } from './srcProbe.js'
import { SEGMENTS, getNextSeqInRange, parseFilename, resolveNRange, escapeRegExp } from '../components/panelUtils.js'
import {
  supportsMultiSrc, buildSrcList, syncProfileImgSrc, readProfileImgSrc,
  DEFAULT_SRC_VALUE, PROFILE_CONFIG_PATH
} from './profileSrc.js'

/**
 * 旧布局（junction 聚合）→ 多图库源布局的迁移
 *
 * 目标布局：
 *   miao-plugin/resources/profile/   真实目录 = 默认图库（唯一可写，miao 的 'profile' 源）
 *   gallery/ProfileImg/<仓库>/        各主仓库 / 第三方仓库作为独立只读源
 *   miao config/profile.js            profileImgSrc = ['profile', ...各仓库绝对路径]
 *
 * 迁移为**一次切换**：删 junction → 建真实默认图库 → 搬迁 default 内容 →
 * 清理主仓库来源副本 → 清理聚合层角色级 junction → 写入源列表。
 * 完成后必须重启 Yunzai（miao 只在模块加载时读 profileImgSrc）。
 */

const IMG_EXT_RE = /\.(webp|png|jpe?g)$/i
/** default 复制文件名标识 */
const DEFAULT_COPY_TAG = '_本地默认图库_默认_'
/** 第三方复制文件名标识 */
const THIRD_COPY_TAG = '_第三方图库_'

/** 安全判定 junction（异常视为否） */
function isJunctionDir (p) {
  try {
    return fs.existsSync(p) && isJunction(p)
  } catch {
    return false
  }
}

/**
 * 当前布局状态
 * legacy  — 旧布局（resources/profile 为 junction 或子目录 junction），必须迁移
 * ready   — 已迁移/已注册自有源，正常
 * fresh   — 未初始化（无源且无旧 junction）
 * @returns {'legacy'|'ready'|'fresh'}
 */
export function getLayoutState () {
  if (isJunctionDir(MIAO_PROFILE_LINK)) return 'legacy'
  if (isJunctionDir(path.join(MIAO_PROFILE_LINK, 'normal-character'))) return 'legacy'
  if (isJunctionDir(path.join(MIAO_PROFILE_LINK, 'super-character'))) return 'legacy'
  const src = readProfileImgSrc()
  if (src.ok && src.hasDecl && src.list.some(v => v !== DEFAULT_SRC_VALUE)) return 'ready'
  return 'fresh'
}

/**
 * 统计某个 `{type}-character` 目录的角色数与图片数
 * @param {string} typeDir
 * @returns {{ roles: number, images: number }}
 */
function countTypeDir (typeDir) {
  const stat = { roles: 0, images: 0 }
  if (!fs.existsSync(typeDir)) return stat
  let entries = []
  try {
    entries = fs.readdirSync(typeDir, { withFileTypes: true })
  } catch {
    return stat
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    stat.roles++
    try {
      stat.images += fs.readdirSync(path.join(typeDir, e.name)).filter(f => IMG_EXT_RE.test(f)).length
    } catch { /* 忽略 */ }
  }
  return stat
}

/**
 * 统计单个主仓库内的图片构成（主图库 / default 副本 / 第三方副本）
 * @param {string} repoDir
 * @returns {{ main: number, defaultCopy: number, thirdCopy: number }}
 */
function countRepoImages (repoDir) {
  const out = { main: 0, defaultCopy: 0, thirdCopy: 0 }
  for (const type of ['normal-character', 'super-character']) {
    const typeDir = path.join(repoDir, type)
    if (!fs.existsSync(typeDir)) continue
    let roles = []
    try {
      roles = fs.readdirSync(typeDir, { withFileTypes: true }).filter(d => d.isDirectory())
    } catch {
      continue
    }
    for (const role of roles) {
      let files = []
      try {
        files = fs.readdirSync(path.join(typeDir, role.name))
      } catch {
        continue
      }
      for (const f of files) {
        // .bak 屏蔽副本同样计入来源副本（迁移阶段会被清理并迁移屏蔽状态）
        const isBak = f.endsWith('.bak')
        const plain = isBak ? f.slice(0, -4) : f
        if (!IMG_EXT_RE.test(plain)) continue
        if (plain.includes(DEFAULT_COPY_TAG)) out.defaultCopy++
        else if (plain.includes(THIRD_COPY_TAG)) out.thirdCopy++
        else if (!isBak) out.main++
      }
    }
  }
  return out
}

/**
 * 预检（只读，不写盘）：迁移前影响面报告
 * @returns {object}
 */
export function precheckMultiSrc () {
  const supported = supportsMultiSrc()
  const state = getLayoutState()
  const defaultDir = LEGACY_DEFAULT_DIR
  const defaultStat = {
    normal: countTypeDir(path.join(defaultDir, 'normal-character')),
    super: countTypeDir(path.join(defaultDir, 'super-character'))
  }

  const repos = getActiveRepoIds().map(id => {
    const dir = getRepoDir(id)
    return { id, dir, exists: fs.existsSync(dir), images: countRepoImages(dir) }
  })

  const thirdParty = getThirdPartyRepos().map(tp => {
    const probe = probeRepo(tp.dir)
    return { name: tp.name, dir: tp.dir, enabled: tp.enabled !== false, level: probe.level, reason: probe.reason }
  })

  const built = supported ? buildSrcList() : { list: [], entries: [], skipped: [] }

  return {
    ok: supported,
    supported,
    state,
    defaultDir,
    defaultStat,
    repos,
    thirdParty,
    srcList: built.list,
    srcEntries: built.entries,
    srcSkipped: built.skipped,
    // 迁移会执行的写操作清单（供用户确认）
    actions: [
      '移除 miao-plugin/resources/profile 的 junction，改建为真实默认图库目录',
      '把 default 图库内容搬迁进默认图库目录',
      '清理主仓库中的 default / 第三方来源副本（来源仍在，可重建）',
      '默认图库文件名规范为 default 段位（10001+），原名以「」保留在备注段',
      '保持屏蔽状态：副本的 .bak 迁移到默认图库 / 第三方源对应文件',
      '清理聚合目录 gallery/profile 下的角色级 junction',
      '写入 miao config/profile.js 的 profileImgSrc 源列表'
    ]
  }
}

/** 迁移前备份关键配置（map.json / miao profile.js / gallery_config.yaml） */
function backupConfigs (report) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(BACKUP_DIR, `migrate-${stamp}`)
  fs.mkdirSync(dir, { recursive: true })
  const files = [
    [MAP_JSON_PATH, 'map.json'],
    [GALLERY_CONFIG_PATH, 'gallery_config.yaml'],
    [PROFILE_CONFIG_PATH, 'miao-profile.js']
  ]
  const copied = []
  for (const [src, name] of files) {
    if (!fs.existsSync(src)) continue
    fs.copyFileSync(src, path.join(dir, name))
    copied.push(name)
  }
  report.backupDir = dir
  report.backupFiles = copied
}

/** 目录搬迁：优先 rename，跨设备时回退逐个文件复制 */
function moveDir (from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    fs.renameSync(from, to)
    return
  } catch { /* 跨设备或占用 → 回退复制 */ }
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name)
    const dest = path.join(to, e.name)
    if (e.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
      for (const f of fs.readdirSync(src)) {
        const destFile = path.join(dest, f)
        if (!fs.existsSync(destFile)) fs.copyFileSync(path.join(src, f), destFile)
      }
    } else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
    }
  }
}

/** 步骤 1：确保 resources/profile 为真实目录（移除 junction） */
function ensureRealProfileDir (report) {
  const removed = []
  if (isJunctionDir(MIAO_PROFILE_LINK)) {
    removeJunction(MIAO_PROFILE_LINK)
    removed.push('profile 根 junction')
  } else {
    for (const type of ['normal-character', 'super-character']) {
      const p = path.join(MIAO_PROFILE_LINK, type)
      if (isJunctionDir(p)) {
        removeJunction(p)
        removed.push(`${type} 子目录 junction`)
      }
    }
  }
  if (!fs.existsSync(MIAO_PROFILE_LINK)) fs.mkdirSync(MIAO_PROFILE_LINK, { recursive: true })
  for (const type of ['normal-character', 'super-character']) {
    fs.mkdirSync(path.join(MIAO_PROFILE_LINK, type), { recursive: true })
  }
  report.removedJunctions += removed.length
  if (removed.length) report.steps.push(`移除 junction：${removed.join('、')}`)
}

/** 步骤 2：把 default 图库内容搬迁进默认图库目录 */
function moveDefaultIntoProfile (report) {
  const srcDir = LEGACY_DEFAULT_DIR
  if (!fs.existsSync(srcDir)) {
    report.steps.push('default 图库目录不存在，跳过搬迁')
    return
  }
  let movedRoles = 0
  let movedImages = 0
  for (const type of ['normal-character', 'super-character']) {
    const srcType = path.join(srcDir, type)
    if (!fs.existsSync(srcType)) continue
    const destType = path.join(MIAO_PROFILE_LINK, type)
    fs.mkdirSync(destType, { recursive: true })
    for (const role of fs.readdirSync(srcType, { withFileTypes: true })) {
      if (!role.isDirectory()) continue
      const from = path.join(srcType, role.name)
      const to = path.join(destType, role.name)
      if (!fs.existsSync(to)) {
        moveDir(from, to)
      } else {
        // 目标已存在：逐文件合并，同名跳过
        for (const f of fs.readdirSync(from)) {
          const destFile = path.join(to, f)
          if (!fs.existsSync(destFile)) fs.copyFileSync(path.join(from, f), destFile)
        }
        fs.rmSync(from, { recursive: true, force: true })
      }
      movedRoles++
      movedImages += fs.readdirSync(to).filter(f => IMG_EXT_RE.test(f)).length
    }
    // 源类型目录已空则清理
    try {
      if (fs.readdirSync(srcType).length === 0) fs.rmdirSync(srcType)
    } catch { /* 忽略 */ }
  }
  report.movedRoles = movedRoles
  report.movedImages = movedImages
  report.steps.push(`搬迁 default 图库内容：${movedRoles} 个角色目录`)
  try {
    if (fs.existsSync(srcDir) && fs.readdirSync(srcDir).length === 0) fs.rmdirSync(srcDir)
  } catch { /* 忽略 */ }
}

/**
 * 步骤 3：清理主仓库中的来源副本（default / 已注册第三方），并收集 .bak 屏蔽状态
 * @returns {{ defaults: Set<string>, thirds: Array<{tp: object, role: string, type: string, srcName: string}> }}
 */
function cleanRepoCopies (report) {
  const registeredThird = new Map(
    getThirdPartyRepos()
      .filter(tp => tp.enabled !== false && probeRepo(tp.dir).level !== 'unsupported')
      .map(tp => [tp.name, tp])
  )
  const blocked = { defaults: new Set(), thirds: [] }
  let keptThird = 0
  for (const repoId of getActiveRepoIds()) {
    const repoDir = getRepoDir(repoId)
    if (!fs.existsSync(repoDir)) continue
    for (const type of ['normal-character', 'super-character']) {
      const typeDir = path.join(repoDir, type)
      if (!fs.existsSync(typeDir)) continue
      for (const role of fs.readdirSync(typeDir, { withFileTypes: true })) {
        if (!role.isDirectory()) continue
        const roleDir = path.join(typeDir, role.name)
        for (const f of fs.readdirSync(roleDir)) {
          const isBak = f.endsWith('.bak')
          const plain = isBak ? f.slice(0, -4) : f
          if (!IMG_EXT_RE.test(plain)) continue
          const full = path.join(roleDir, f)
          // default 副本：记录屏蔽状态（源文件名）后清理
          if (plain.includes(DEFAULT_COPY_TAG)) {
            const srcName = plain.split(DEFAULT_COPY_TAG)[1]
            if (isBak && srcName) blocked.defaults.add(srcName)
            fs.unlinkSync(full)
            report.removedDefaultCopies++
            continue
          }
          // 第三方副本：来源仓库可直读才清理，.bak 屏蔽状态迁到源内
          if (plain.includes(THIRD_COPY_TAG)) {
            const name = plain.match(/_第三方图库_([^_]+)_/)?.[1]
            const tp = name ? registeredThird.get(name) : null
            if (tp) {
              const srcName = plain.split(`_第三方图库_${name}_`)[1]
              if (isBak && srcName) {
                blocked.thirds.push({ tp, role: role.name, type: type.replace('-character', ''), srcName })
              }
              fs.unlinkSync(full)
              report.removedThirdCopies++
            } else {
              // 来源仓库不可直读 → 保留副本避免丢图
              keptThird++
            }
          }
        }
      }
    }
  }
  report.keptThirdCopies = keptThird
  report.steps.push(`清理来源副本：default ${report.removedDefaultCopies} 张 / 第三方 ${report.removedThirdCopies} 张${keptThird ? `（保留 ${keptThird} 张，来源不可直读）` : ''}`)
  return blocked
}

/**
 * 步骤 3.5：把默认图库内的文件规范为 default 段位命名
 * 原名以「」包裹放入备注段保留；被屏蔽（主仓库副本为 .bak）的文件保持 .bak
 * @param {object} report
 * @param {Set<string>} blockedDefaults - 需保持屏蔽的源文件名集合
 */
function normalizeDefaultNames (report, blockedDefaults) {
  let renamed = 0
  let blockedKept = 0
  for (const type of ['normal-character', 'super-character']) {
    const typeDir = path.join(MIAO_PROFILE_LINK, type)
    if (!fs.existsSync(typeDir)) continue
    for (const roleEntry of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!roleEntry.isDirectory()) continue
      const role = roleEntry.name
      const roleDir = path.join(typeDir, role)
      let files = []
      try {
        files = fs.readdirSync(roleDir)
      } catch {
        continue
      }
      const plains = files.filter(f => !f.endsWith('.bak') && IMG_EXT_RE.test(f))
      const baks = files.filter(f => f.endsWith('.bak') && IMG_EXT_RE.test(f.slice(0, -4)))
      const mapping = new Map()
      for (const f of plains) {
        const newName = renameToDefaultSeg(roleDir, role, f)
        if (newName) {
          renamed++
          mapping.set(f, newName)
        }
        if (blockedDefaults.has(f)) {
          const p = path.join(roleDir, newName || f)
          if (fs.existsSync(p)) {
            fs.renameSync(p, p + '.bak')
            blockedKept++
          }
        }
      }
      // .bak 文件跟随其基础文件的新名
      for (const f of baks) {
        const base = f.slice(0, -4)
        const target = mapping.get(base)
        try {
          if (target) {
            fs.renameSync(path.join(roleDir, f), path.join(roleDir, target + '.bak'))
            renamed++
          } else {
            const newName = renameToDefaultSeg(roleDir, role, base)
            if (newName) {
              fs.renameSync(path.join(roleDir, f), path.join(roleDir, newName + '.bak'))
              renamed++
            }
          }
        } catch (e) {
          report.warnings.push(`.bak 重命名失败：${f}（${e.message}）`)
        }
      }
    }
  }
  report.renamedDefaults = renamed
  report.blockedKept = blockedKept
  if (renamed || blockedKept) {
    report.steps.push(`默认图库规范为 default 段位：重命名 ${renamed} 张${blockedKept ? ` / 保持屏蔽 ${blockedKept} 张` : ''}`)
  }
}

/**
 * 构造 default 段位命名（原名保留在备注段，以「」包裹）
 * 有版权 → 角色_n_作者_来源[_备注]_「原名去扩展名」.ext
 * 无版权/非标准 → 角色_n_本地默认图库_默认_「原名去扩展名」.ext
 * @param {string} filename - 原文件名
 * @param {string} role - 角色名
 * @param {number} n - default 段位序号
 * @returns {string}
 */
export function buildDefaultName (filename, role, n) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  const esc = escapeRegExp(role)
  const withCopyright = filename.match(new RegExp(`^${esc}_(\\d+)_(.+?)_(.+?)(?:_(.+?))?\\.([^.]+)$`, 'i'))
  if (withCopyright) {
    const [, , author, source, mods] = withCopyright
    return `${role}_${n}_${author}_${source}${mods ? `_${mods}` : ''}_「${base}」${ext}`
  }
  return `${role}_${n}_本地默认图库_默认_「${base}」${ext}`
}

/**
 * 单个文件重命名为 default 段位命名；已规范（标准命名且段位在 default 范围）返回 null
 * @param {string} roleDir
 * @param {string} role
 * @param {string} filename
 * @returns {string|null} 新文件名
 */
function renameToDefaultSeg (roleDir, role, filename) {
  const parsed = parseFilename(filename, role)
  if (parsed.isStandard && resolveNRange(parsed.seq).source === 'default') return null
  const n = getNextSeqInRange(roleDir, role, SEGMENTS.default.start, SEGMENTS.default.end)
  if (n < 0) {
    logWarn(`default 段位已满，跳过重命名：${filename}`)
    return null
  }
  const newName = buildDefaultName(filename, role, n)
  if (newName === filename) return null
  try {
    fs.renameSync(path.join(roleDir, filename), path.join(roleDir, newName))
    return newName
  } catch (e) {
    logWarn(`重命名失败，跳过：${filename}（${e.message}）`)
    return null
  }
}

/** 统一的告警输出（重命名细节只进日志） */
function logWarn (msg) {
  logger?.warn('[ProfileImg-Plugin] ' + msg)
}

/**
 * 步骤 3.6：第三方副本的 .bak 屏蔽状态迁到第三方源内（改源文件为 .bak，保持屏蔽）
 * @param {object} report
 * @param {Array<{tp: object, role: string, type: string, srcName: string}>} thirds
 */
function applyThirdBlocked (report, thirds) {
  let applied = 0
  for (const item of thirds) {
    const { tp, role, type, srcName } = item
    const level = probeRepo(tp.dir).level
    let target = ''
    if (level === 'tier') target = path.join(tp.dir, `${type}-character`, role, srcName)
    else if (level === 'flat') target = path.join(tp.dir, role, srcName)
    if (!target || !fs.existsSync(target)) continue
    try {
      fs.renameSync(target, target + '.bak')
      applied++
    } catch (e) {
      report.warnings.push(`第三方屏蔽状态恢复失败：${srcName}（${e.message}）`)
    }
  }
  report.thirdBlockedKept = applied
  if (applied) report.steps.push(`第三方源保持屏蔽 .bak：${applied} 张`)
}

/** 步骤 4：清理聚合目录下的角色级 junction（保留 blocked-character 与目录本身） */
function cleanAggJunctions (report) {
  for (const type of ['normal-character', 'super-character']) {
    const typeDir = path.join(PROFILE_DIR, type)
    if (!fs.existsSync(typeDir)) continue
    for (const e of fs.readdirSync(typeDir, { withFileTypes: true })) {
      const p = path.join(typeDir, e.name)
      if (isJunctionDir(p)) {
        removeJunction(p)
        report.removedJunctions++
      }
    }
  }
  report.steps.push(`清理聚合层角色级 junction（累计移除 ${report.removedJunctions} 个）`)
}

/**
 * 执行迁移（一次切换，幂等）
 * @returns {{
 *   ok: boolean, already?: boolean, error?: string, steps: string[], warnings: string[],
 *   backupDir?: string, backupFiles?: string[],
 *   movedRoles?: number, movedImages?: number,
 *   removedDefaultCopies?: number, removedThirdCopies?: number, keptThirdCopies?: number,
 *   removedJunctions?: number, srcList?: string[], srcSkipped?: Array<object>, needRestart?: boolean
 * }}
 */
export function migrateToMultiSrc () {
  const report = {
    ok: false,
    steps: [],
    warnings: [],
    movedRoles: 0,
    movedImages: 0,
    removedDefaultCopies: 0,
    removedThirdCopies: 0,
    keptThirdCopies: 0,
    removedJunctions: 0
  }

  if (!supportsMultiSrc()) {
    report.error = 'miao-plugin 不支持 profileImgSrc（需 2.5.20+），请先升级 miao-plugin 再迁移'
    return report
  }
  if (getLayoutState() === 'ready') {
    report.ok = true
    report.already = true
    report.steps.push('当前已是多图库源布局，无需迁移')
    return report
  }

  try {
    backupConfigs(report)
    report.steps.push(`已备份配置到 ${report.backupDir}`)

    ensureRealProfileDir(report)
    moveDefaultIntoProfile(report)
    const blocked = cleanRepoCopies(report)
    normalizeDefaultNames(report, blocked.defaults)
    applyThirdBlocked(report, blocked.thirds)
    cleanAggJunctions(report)

    const synced = syncProfileImgSrc()
    if (!synced.ok) {
      report.error = '写入 miao profileImgSrc 失败：' + (synced.error || '未知错误')
      return report
    }
    report.srcList = synced.list
    report.srcSkipped = synced.skipped
    report.steps.push(`已写入 profileImgSrc（${synced.list.length} 个源）`)
    if (synced.skipped.length) {
      report.warnings.push(
        `${synced.skipped.length} 个图库仓库无法直读，未注册：` +
        synced.skipped.map(s => `${s.label}（${s.reason}）`).join('；') +
        '。请把仓库目录整理为 normal-character/{角色}/ 或平铺 {角色}/（根目录不要放 docs 等含图目录），整理后执行 #更新第三方图库 或重启 Yunzai 重新注册'
      )
    }
    report.needRestart = true
    report.ok = true
  } catch (e) {
    report.error = e.message
    logger?.error('[ProfileImg-Plugin] 多图库源迁移失败:', e)
  }
  return report
}
