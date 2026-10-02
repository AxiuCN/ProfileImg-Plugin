import fs from 'node:fs'
import path from 'node:path'
import { MIAO_PROFILE_LINK, getRepoDir } from '../components/constants.js'
import { getActiveRepoIds } from './mapJson.js'
import { getThirdPartyRepos } from './galleryConfig.js'
import { probeRepo, resolveSourceDirs } from './srcProbe.js'
import { parseFilename } from '../components/panelUtils.js'
import { normalizeRoleName } from '../modules/proMap.js'

/**
 * 多源面板图索引
 *
 * 源 = 默认图库（miao-plugin/resources/profile，'profile'）+ 各主仓库 + 可直读的第三方仓库
 * 寻址规则：
 *   - 默认图库 / 主仓库：按文件名段位 n 寻址（default 10001+ / main 1~9999），参与 #面板图N
 *   - 第三方仓库：第三方源用原生命名，不参与段位与 #面板图N（displayN 为 null），仅展示
 */

const IMG_RE = /\.(webp|png|jpg|jpeg)$/i

/**
 * 图库源列表
 * 第三方源支持「一层分组」（如按游戏分层的 gs-character / sr-character），
 * 每个可直读子目录各自成为一个平铺源；主仓库 / 默认图库保持单源
 * @param {object} [opts]
 * @param {Array<{name: string, dir: string, enabled?: boolean}>} [opts.thirdParty] - 指定第三方列表（套件用）
 * @returns {Array<{kind: 'default'|'main'|'thirdParty', label: string, dir: string, level: string, repoId?: number}>}
 */
export function getSources (opts = {}) {
  const sources = [{ kind: 'default', label: '默认图库', dir: MIAO_PROFILE_LINK, level: 'tier' }]
  for (const repoId of getActiveRepoIds()) {
    const dir = getRepoDir(repoId)
    if (!fs.existsSync(dir)) continue
    sources.push({ kind: 'main', label: repoId === 0 ? '主图库' : `主图库-${repoId}`, dir, repoId, level: 'tier' })
  }
  for (const tp of opts.thirdParty || getThirdPartyRepos()) {
    if (tp.enabled === false) continue
    const probe = probeRepo(tp.dir)
    for (const d of resolveSourceDirs(probe, { allowGroup: true })) {
      sources.push({
        kind: 'thirdParty',
        label: d.groupName ? `${tp.name}·${d.groupName}` : tp.name,
        dir: d.dir,
        level: d.level
      })
    }
  }
  return sources
}

/**
 * 某源下角色的图片目录（平铺源无 super 层）
 * @param {object} source - getSources 元素
 * @param {'normal'|'super'} type
 * @param {string} role
 * @returns {string} 目录绝对路径（不可用时空串）
 */
function roleDirOf (source, type, role) {
  if (source.level === 'flat') return type === 'normal' ? path.join(source.dir, role) : ''
  return path.join(source.dir, `${type}-character`, role)
}

/**
 * 列出角色在全部源的图片
 * @param {string} roleName - 角色名（自动 Pro 归一）
 * @param {'normal'|'super'} [type]
 * @returns {Array<{
 *   source: string, label: string, dir: string, name: string, filePath: string,
 *   seq: number|null, displayN: number|null, isStandard: boolean, role: string
 * }>}
 */
export function listRoleImages (roleName, type = 'normal') {
  const role = normalizeRoleName(roleName)
  const out = []
  for (const source of getSources()) {
    const dir = roleDirOf(source, type, role)
    if (!dir || !fs.existsSync(dir)) continue
    let names = []
    try {
      names = fs.readdirSync(dir).filter(f => IMG_RE.test(f))
    } catch {
      continue
    }
    for (const name of names) {
      const parsed = parseFilename(name, role)
      const seq = parsed.isStandard ? parsed.seq : null
      out.push({
        source: source.kind,
        label: source.label,
        dir,
        name,
        filePath: path.join(dir, name),
        seq,
        // 第三方源不参与段位寻址，displayN 置空（仅展示）
        displayN: source.kind === 'thirdParty' ? null : seq,
        isStandard: parsed.isStandard,
        role
      })
    }
  }
  out.sort((a, b) => {
    if (a.displayN !== null && b.displayN !== null) return a.displayN - b.displayN
    if (a.displayN !== null) return -1
    if (b.displayN !== null) return 1
    if (a.label !== b.label) return a.label.localeCompare(b.label)
    return a.name.localeCompare(b.name)
  })
  return out
}

/**
 * 按段位序号定位图片（仅默认图库与主仓库；第三方不参与）
 * @param {string} roleName
 * @param {'normal'|'super'} type
 * @param {number} n
 * @returns {object|null}
 */
export function findImageByN (roleName, type, n) {
  return listRoleImages(roleName, type).find(img => img.displayN === n) || null
}

/**
 * 列出角色已屏蔽（.bak）的文件
 * @param {string} roleName
 * @param {'normal'|'super'} [type]
 * @returns {Array<{source: string, label: string, dir: string, name: string, filePath: string, baseName: string}>}
 */
export function listRoleBlocked (roleName, type = 'normal') {
  const role = normalizeRoleName(roleName)
  const out = []
  for (const source of getSources()) {
    const dir = roleDirOf(source, type, role)
    if (!dir || !fs.existsSync(dir)) continue
    let names = []
    try {
      names = fs.readdirSync(dir).filter(f => f.endsWith('.bak') && IMG_RE.test(f.slice(0, -4)))
    } catch {
      continue
    }
    for (const name of names) {
      out.push({
        source: source.kind,
        label: source.label,
        dir,
        name,
        baseName: name.slice(0, -4),
        filePath: path.join(dir, name)
      })
    }
  }
  return out
}

/**
 * 启用（去 .bak）时按基础名定位屏蔽文件
 * @param {string} roleName
 * @param {'normal'|'super'} type
 * @param {number} n - 段位序号（第三方不参与，返回 null）
 * @returns {object|null}
 */
export function findBlockedByN (roleName, type, n) {
  const role = normalizeRoleName(roleName)
  for (const item of listRoleBlocked(roleName, type)) {
    const parsed = parseFilename(item.baseName, role)
    if (parsed.isStandard && parsed.seq === n) return item
  }
  return null
}

/**
 * 单源规模统计：一次遍历同时得到角色数 / 图片数 / 体积
 * 分层源统计 normal-character 与 super-character 两层；平铺源统计源根
 * 体积按目录内全部文件累计（与旧口径一致），跳过 `.git` 等版本目录
 * @param {{kind: string, label: string, dir: string, level: string}} source - getSources 元素
 * @returns {{roles: number, images: number, size: number}}
 */
export function statSource (source) {
  const stat = { roles: 0, images: 0, size: 0 }
  const roots = source.level === 'flat'
    ? [source.dir]
    : [path.join(source.dir, 'normal-character'), path.join(source.dir, 'super-character')]

  /** 累计目录内全部文件体积（递归，跳过 .git） */
  const addSize = (dir) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === '.git') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) addSize(p)
      else if (e.isFile()) {
        try { stat.size += fs.statSync(p).size } catch { /* 忽略 */ }
      }
    }
  }

  for (const typeDir of roots) {
    if (!typeDir || !fs.existsSync(typeDir)) continue
    let entries = []
    try {
      entries = fs.readdirSync(typeDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name === '.git') continue
      const p = path.join(typeDir, e.name)
      if (e.isDirectory()) {
        // 角色目录：图片数按目录内文件算，体积递归累计
        stat.roles++
        addSize(p)
        try {
          stat.images += fs.readdirSync(p).filter(f => IMG_RE.test(f)).length
        } catch { /* 忽略 */ }
      } else if (e.isFile()) {
        if (IMG_RE.test(e.name)) stat.images++
        try { stat.size += fs.statSync(p).size } catch { /* 忽略 */ }
      }
    }
  }
  return stat
}

/**
 * 统计各源的规模（状态命令用）
 * @returns {Array<{kind: string, label: string, dir: string, roles: number, images: number, size: number}>}
 */
export function countSourceImages () {
  return getSources().map(source => ({
    kind: source.kind,
    label: source.label,
    dir: source.dir,
    ...statSource(source)
  }))
}
