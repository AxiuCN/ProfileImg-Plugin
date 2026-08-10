import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar, getActiveRepoIds } from './mapJson.js'
import { getRepoDir, PROFILE_DIR } from '../components/constants.js'
import { createCharJunction } from './junction.js'
import { normalizeRoleName, getProNames, listProEntries } from '../modules/proMap.js'
import {
  SEGMENTS, THIRD_PARTY_SLOT, getNextSeqInRange, escapeRegExp
} from '../components/panelUtils.js'
import {
  getThirdPartyRoleDir, listThirdPartyRoles, getDefaultDir
} from './galleryConfig.js'

/**
 * 复制聚合 — 将 default / 第三方图库的图片物理复制到主图库
 *
 * 新架构核心：聚合层为角色级 junction（profile/{type}-character/角色 → 主仓库），
 * 第三方与 default 图库的文件通过复制进入主仓库角色目录，
 * 文件名前缀编码来源（见计划 §文件名命名规范）。
 */

const IMG_RE = /\.(webp|png|jpg|jpeg|gif)$/i

/**
 * 获取主仓库角色目录（不存在则创建），并确保 profile 聚合 junction 存在
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type
 * @returns {string} 主仓库角色目录绝对路径
 */
export function getMainRoleDir(roleName, type) {
  // Pro 角色归一到基础角色目录（共享图库，复制/序号/反查统一）
  const dirName = normalizeRoleName(roleName)
  const repoId = getRepoForChar(dirName)
  const repoDir = getRepoDir(repoId)
  const roleDir = path.join(repoDir, `${type}-character`, dirName)
  if (!fs.existsSync(roleDir)) fs.mkdirSync(roleDir, { recursive: true })
  // 确保聚合目录中的角色级 junction 指向主仓库角色目录
  createCharJunction(dirName, type, repoDir, PROFILE_DIR)
  return roleDir
}

/**
 * 复制一张 default 图库图片到主仓库
 * @param {string} defaultFile - default 图库源文件绝对路径
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type
 * @returns {{ ok: boolean, name?: string, error?: string }}
 */
export function copyDefaultToMain(defaultFile, roleName, type) {
  try {
    // Pro 角色用基础角色名（文件名前缀统一，序号段位共享）
    const dirName = normalizeRoleName(roleName)
    const mainRoleDir = getMainRoleDir(dirName, type)
    const n = getNextSeqInRange(mainRoleDir, dirName, SEGMENTS.default.start, SEGMENTS.default.end)
    if (n < 0) {
      return { ok: false, error: `default 段位(${SEGMENTS.default.start}~${SEGMENTS.default.end})已满` }
    }
    const base = path.basename(defaultFile)
    const newName = `${dirName}_${n}_本地默认图库_默认_${base}`
    fs.copyFileSync(defaultFile, path.join(mainRoleDir, newName))
    return { ok: true, name: newName }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 确保指定仓库（默认所有活跃主仓库）的角色级 junction 存在
 * 下载/更新/初始化后调用，新增角色自动接入聚合层
 * @param {number[]} [repoIds] - 仓库编号列表，默认所有活跃主仓库
 * @returns {number} 角色级 junction 数量
 */
export function ensureAllCharJunctions(repoIds = getActiveRepoIds()) {
  let count = 0
  for (const repoId of repoIds) {
    const repoDir = getRepoDir(repoId)
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(repoDir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      const chars = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const c of chars) {
        const r = createCharJunction(c.name, type, repoDir, PROFILE_DIR)
        if (r.ok) count++
      }
    }
  }
  // Pro 角色 junction：link 保持 Pro 名，target 归一到基础角色主仓库目录（基础目录存在才建）
  for (const { pro, base } of listProEntries()) {
    for (const type of ['normal', 'super']) {
      const repoDir = getRepoDir(getRepoForChar(base))
      if (!fs.existsSync(path.join(repoDir, `${type}-character`, base))) continue
      const r = createCharJunction(pro, type, repoDir, PROFILE_DIR)
      if (r.ok) count++
    }
  }
  return count
}

/**
 * 同步单个第三方仓库到主图库（#更新第三方图库 后调用）
 * ① 复制源仓库新增图片到主仓库（幂等：已有同图库+原名的副本则跳过）
 * ② 清理主仓库中源已删除的孤儿副本（含 .bak 屏蔽文件）
 * @param {object} tp - getThirdPartyRepos 产物
 * @param {number} idx - 第三方仓库序号（0 起，决定段位）
 * @returns {{ ok: boolean, copied: number, skipped: number, removed: number, error?: string }}
 */
export function syncThirdPartyRepo(tp, idx) {
  const start = SEGMENTS.thirdBase + idx * THIRD_PARTY_SLOT + 1
  const end = SEGMENTS.thirdBase + (idx + 1) * THIRD_PARTY_SLOT
  let copied = 0, skipped = 0, removed = 0

  try {
    // 按基础角色名分组收集第三方源目录（base + 所有 Pro 变体归并处理，序号/反查统一）
    const groups = new Map()
    for (const { type, roleName } of listThirdPartyRoles(tp)) {
      const srcRoleDir = getThirdPartyRoleDir(tp, type, roleName)
      if (!srcRoleDir || !fs.existsSync(srcRoleDir)) continue
      const effectiveRole = normalizeRoleName(roleName)
      const key = `${type}::${effectiveRole}`
      let g = groups.get(key)
      if (!g) {
        g = { type, effectiveRole, srcDirs: [] }
        groups.set(key, g)
      }
      g.srcDirs.push(srcRoleDir)
    }

    for (const { type, effectiveRole, srcDirs } of groups.values()) {
      // 合并所有源目录（base + Pro）的图片文件集合
      const srcFilesAll = new Set()
      for (const srcDir of srcDirs) {
        for (const f of fs.readdirSync(srcDir)) {
          if (IMG_RE.test(f)) srcFilesAll.add(f)
        }
      }
      if (srcFilesAll.size === 0) continue

      const mainRoleDir = getMainRoleDir(effectiveRole, type)
      let mainFiles = []
      try { mainFiles = fs.readdirSync(mainRoleDir) } catch { /* ignore */ }

      // ① 清理本图库孤儿副本：所有源目录（base + Pro）都已删除的文件（含 .bak）
      const escRole = escapeRegExp(effectiveRole)
      const escName = escapeRegExp(tp.name)
      const copyRe = new RegExp(`^${escRole}_(\\d+)_第三方图库_${escName}_(.+)$`, 'i')
      for (const mf of mainFiles) {
        const m = mf.match(copyRe)
        if (!m) continue
        const originalName = m[2].replace(/\.bak$/, '')
        if (!srcFilesAll.has(originalName)) {
          try {
            fs.unlinkSync(path.join(mainRoleDir, mf))
            removed++
          } catch { /* ignore */ }
        }
      }

      // ② 复制新增图片
      const marker = `_第三方图库_${tp.name}_`
      for (const srcDir of srcDirs) {
        for (const f of fs.readdirSync(srcDir)) {
          if (!IMG_RE.test(f)) continue
          const suffix = marker + f
          const hasCopy = mainFiles.some(mf => mf.endsWith(suffix) || mf.endsWith(suffix + '.bak'))
          if (hasCopy) { skipped++; continue }
          const n = getNextSeqInRange(mainRoleDir, effectiveRole, start, end)
          if (n < 0) continue
          const newName = `${effectiveRole}_${n}${marker}${f}`
          try {
            fs.copyFileSync(path.join(srcDir, f), path.join(mainRoleDir, newName))
            mainFiles.push(newName)
            copied++
          } catch { /* 单个文件失败继续 */ }
        }
      }
    }
    return { ok: true, copied, skipped, removed }
  } catch (e) {
    return { ok: false, copied, skipped, removed, error: e.message }
  }
}

/**
 * 同步 default 图库到主图库（#刷新图库副本 后调用）
 * ① 复制 default 图库新增图片到主仓库（幂等：已有同源文件名的副本则跳过）
 * ② 清理主仓库中 default 源已删除的孤儿副本（含 .bak 屏蔽文件）
 * @returns {{ ok: boolean, copied: number, skipped: number, removed: number, error?: string }}
 */
export function syncDefaultToMain() {
  const defaultDir = getDefaultDir()
  let copied = 0, skipped = 0, removed = 0
  if (!fs.existsSync(defaultDir)) return { ok: true, copied, skipped, removed }

  try {
    // 按基础角色名分组收集源目录（base + 所有 Pro 变体归并处理，序号/反查统一）
    const groups = new Map()
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(defaultDir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      const chars = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())

      for (const charDir of chars) {
        const srcRoleDir = path.join(typeDir, charDir.name)
        const effectiveRole = normalizeRoleName(charDir.name)
        const key = `${type}::${effectiveRole}`
        let g = groups.get(key)
        if (!g) {
          g = { type, effectiveRole, srcDirs: [] }
          groups.set(key, g)
        }
        g.srcDirs.push(srcRoleDir)
      }
    }

    for (const { type, effectiveRole, srcDirs } of groups.values()) {
      // 合并所有源目录（base + Pro）的图片文件集合
      const srcFilesAll = new Set()
      for (const srcDir of srcDirs) {
        for (const f of fs.readdirSync(srcDir)) {
          if (IMG_RE.test(f)) srcFilesAll.add(f)
        }
      }
      if (srcFilesAll.size === 0) continue

      const mainRoleDir = getMainRoleDir(effectiveRole, type)
      let mainFiles = []
      try { mainFiles = fs.readdirSync(mainRoleDir) } catch { /* ignore */ }

      // ① 清理孤儿副本：所有源目录（base + Pro）都已删除的文件（含 .bak）
      const escRole = escapeRegExp(effectiveRole)
      const copyRe = new RegExp(`^${escRole}_(\\d+)_本地默认图库_默认_(.+)$`, 'i')
      for (const mf of mainFiles) {
        const m = mf.match(copyRe)
        if (!m) continue
        const originalName = m[2].replace(/\.bak$/, '')
        if (!srcFilesAll.has(originalName)) {
          try {
            fs.unlinkSync(path.join(mainRoleDir, mf))
            removed++
          } catch { /* ignore */ }
        }
      }

      // ② 复制新增图片
      const marker = '_本地默认图库_默认_'
      for (const srcDir of srcDirs) {
        for (const f of fs.readdirSync(srcDir)) {
          if (!IMG_RE.test(f)) continue
          const suffix = marker + f
          const hasCopy = mainFiles.some(mf => mf.endsWith(suffix) || mf.endsWith(suffix + '.bak'))
          if (hasCopy) { skipped++; continue }
          const n = getNextSeqInRange(mainRoleDir, effectiveRole, SEGMENTS.default.start, SEGMENTS.default.end)
          if (n < 0) continue
          const newName = `${effectiveRole}_${n}${marker}${f}`
          try {
            fs.copyFileSync(path.join(srcDir, f), path.join(mainRoleDir, newName))
            mainFiles.push(newName)
            copied++
          } catch { /* 单个文件失败继续 */ }
        }
      }
    }
    return { ok: true, copied, skipped, removed }
  } catch (e) {
    return { ok: false, copied, skipped, removed, error: e.message }
  }
}

/**
 * 全量清理主图库中的 default 孤儿副本（含 .bak 屏蔽文件）
 * 遍历所有活跃主仓库的角色目录，删除所有 `_本地默认图库_默认_` 前缀、
 * 且 base 在 default 源中反查不到的副本。
 * 不依赖 default 源目录是否存在该角色（源角色目录缺失 → 其中副本一律视为孤儿），
 * 补全 syncDefaultToMain 仅清理源存在角色的局限。
 * @returns {number} 删除的副本数量
 */
export function cleanDefaultOrphans() {
  const defaultDir = getDefaultDir()
  let removed = 0
  for (const repoId of getActiveRepoIds()) {
    const repoDir = getRepoDir(repoId)
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(repoDir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      const chars = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const c of chars) {
        const roleDir = path.join(typeDir, c.name)
        // 源目录候选：基础角色 + 所有 Pro 变体（Pro 源图归并进基础目录）
        const srcCandidates = [c.name, ...getProNames(c.name)]
          .map(n => path.join(defaultDir, `${type}-character`, n))
        const re = new RegExp(`^${escapeRegExp(c.name)}_(\\d+)_本地默认图库_默认_(.+)$`)
        for (const f of fs.readdirSync(roleDir)) {
          const m = f.match(re)
          if (!m) continue
          const original = m[2].replace(/\.bak$/, '')
          const srcExists = srcCandidates.some(dir => fs.existsSync(path.join(dir, original)))
          if (srcExists) continue
          try {
            fs.unlinkSync(path.join(roleDir, f))
            removed++
          } catch { /* 单个文件失败继续 */ }
        }
      }
    }
  }
  return removed
}

/**
 * 全量清理主图库中指定第三方图库的孤儿副本（含 .bak 屏蔽文件）
 * 遍历所有活跃主仓库的角色目录，删除所有 `_第三方图库_<图库名>_` 前缀、
 * 且 base 在第三方源中反查不到的副本。
 * 源角色目录不存在（normalPath/superPath 未配置或目录缺失）→ 该角色该图库副本一律视为孤儿。
 * 补全 syncThirdPartyRepo 仅清理源存在角色的局限。
 * @param {object} tp - getThirdPartyRepos 产物
 * @returns {number} 删除的副本数量
 */
export function cleanThirdPartyOrphans(tp) {
  let removed = 0
  for (const repoId of getActiveRepoIds()) {
    const repoDir = getRepoDir(repoId)
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(repoDir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      const chars = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const c of chars) {
        const roleDir = path.join(typeDir, c.name)
        // 源目录候选：基础角色 + 所有 Pro 变体（Pro 源图归并进基础目录）
        const srcCandidates = [c.name, ...getProNames(c.name)]
          .map(n => getThirdPartyRoleDir(tp, type, n))
          .filter(Boolean)
        const re = new RegExp(`^${escapeRegExp(c.name)}_(\\d+)_第三方图库_${escapeRegExp(tp.name)}_(.+)$`)
        for (const f of fs.readdirSync(roleDir)) {
          const m = f.match(re)
          if (!m) continue
          if (srcCandidates.length > 0) {
            const original = m[2].replace(/\.bak$/, '')
            const srcExists = srcCandidates.some(dir => fs.existsSync(path.join(dir, original)))
            if (srcExists) continue
          }
          try {
            fs.unlinkSync(path.join(roleDir, f))
            removed++
          } catch { /* 单个文件失败继续 */ }
        }
      }
    }
  }
  return removed
}

/**
 * 删除第三方图库时清理主图库中该图库的所有副本（含 .bak 屏蔽文件）
 * 遍历所有活跃主仓库的角色目录，文件名前缀匹配 `_第三方图库_<图库名>_`
 * @param {string} tpName - 第三方图库名（与配置 thirdParty[].name 一致）
 * @returns {number} 删除的副本数量
 */
export function removeThirdPartyCopies(tpName) {
  let removed = 0
  const escName = escapeRegExp(tpName)
  const markerRe = new RegExp(`_第三方图库_${escName}_`, 'i')
  for (const repoId of getActiveRepoIds()) {
    const repoDir = getRepoDir(repoId)
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(repoDir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      for (const charName of fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())) {
        const roleDir = path.join(typeDir, charName.name)
        for (const f of fs.readdirSync(roleDir)) {
          if (markerRe.test(f)) {
            try {
              fs.unlinkSync(path.join(roleDir, f))
              removed++
            } catch { /* 单个文件失败继续 */ }
          }
        }
      }
    }
  }
  return removed
}

/**
 * 在 default 图库源目录中查找角色源文件（基础角色 + 所有 Pro 变体源目录）
 * Pro 源图归并进基础角色图库，删除/重命名时需在 Pro 源目录定位实际文件
 * @param {string} roleName - 基础角色名
 * @param {string} originalName - default 源文件名
 * @param {'normal'|'super'} [type] - 图库类型，默认 'normal'
 * @returns {string|null} 源文件绝对路径，未找到返回 null
 */
export function findDefaultSourceFile(roleName, originalName, type = 'normal') {
  const defaultDir = getDefaultDir()
  const candidates = [roleName, ...getProNames(roleName)]
  for (const n of candidates) {
    const p = path.join(defaultDir, `${type}-character`, n, originalName)
    if (fs.existsSync(p)) return p
  }
  return null
}
