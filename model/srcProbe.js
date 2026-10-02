import fs from 'node:fs'
import path from 'node:path'

/**
 * 图库源结构探测
 *
 * 注册 miao 多图库源（`profileImgSrc`）前，判断每个图库仓库的目录层级是否符合
 * miao 的读取约定（上游 2.5.20+）：
 *   {源}/normal-character/{角色}/     普通立绘（tier 结构）
 *   {源}/super-character/{角色}/      彩蛋立绘（tier 结构）
 *   {源}/{角色}/                      平铺结构，仅参与普通立绘
 * 图片后缀口径与 miao 一致：webp / png / jpg / jpeg（大小写不敏感）。
 *
 * 平铺结构会被 miao 把「源根下的目录」整体当作角色目录，因此根下若存在
 * 含图的非角色目录（docs/ 等）即视为不安全（risky），不参与注册。
 */

/** 图片后缀（与 miao 读取口径一致） */
const IMG_EXT_RE = /\.(webp|png|jpe?g)$/i

/** 非角色目录名（平铺判定时视为工具/文档目录，小写比对） */
const NON_ROLE_DIRS = new Set([
  'node_modules', 'docs', 'doc', 'resources', 'src', 'test', 'tests',
  'scripts', 'temp', 'dist', 'build', 'assets', 'public', 'tool', 'tools'
])

/**
 * 目录内是否含图片文件（仅一层）
 * @param {string} dir - 目录绝对路径
 * @returns {boolean}
 */
function hasImages (dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .some(d => d.isFile() && IMG_EXT_RE.test(d.name))
  } catch {
    return false
  }
}

/**
 * 统计目录内图片数量（仅一层）
 * @param {string} dir - 目录绝对路径
 * @returns {number}
 */
function countImages (dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isFile() && IMG_EXT_RE.test(d.name)).length
  } catch {
    return 0
  }
}

/**
 * 列出目录下的角色条目
 * 角色条目 = 含图片的子目录，或 `{角色名}.ext` 单文件
 * @param {string} dir - 目录绝对路径
 * @returns {Array<{name: string, kind: 'dir'|'file', images: number}>}
 */
function listRoleEntries (dir) {
  const roles = []
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return roles
  }
  for (const d of entries) {
    if (d.isFile()) {
      if (IMG_EXT_RE.test(d.name)) {
        roles.push({ name: path.basename(d.name, path.extname(d.name)), kind: 'file', images: 1 })
      }
      continue
    }
    if (!d.isDirectory()) continue
    const full = path.join(dir, d.name)
    if (hasImages(full)) roles.push({ name: d.name, kind: 'dir', images: countImages(full) })
  }
  return roles
}

/**
 * 找出会让平铺注册变危险的目录（含图的工具/文档/隐藏目录）
 * miao 平铺读取时会把源根下的每个目录都当角色目录，这些目录会被误读
 * @param {string} root - 仓库根目录
 * @returns {string[]} 危险目录名（仓库根下第一层）
 */
function findRiskDirs (root) {
  const risky = []
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return risky
  }
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const name = d.name
    const isNonRole = name.startsWith('.') || NON_ROLE_DIRS.has(name.toLowerCase())
    if (!isNonRole) continue
    // .git 等工具目录不含图，miao 读不到图片，无害；含图的才算危险
    if (hasImages(path.join(root, name))) risky.push(name)
  }
  return risky
}

/**
 * 探测单个图库仓库的结构
 * @param {string} repoDir - 仓库目录绝对路径
 * @returns {{
 *   dir: string,
 *   level: 'tier'|'flat'|'unsupported',
 *   tier: { normal: number, super: number },
 *   flat: { roles: number, riskDirs: string[] },
 *   reason: string
 * }}
 */
export function probeRepo (repoDir) {
  const result = {
    dir: repoDir,
    level: 'unsupported',
    tier: { normal: 0, super: 0 },
    flat: { roles: 0, riskDirs: [] },
    reason: ''
  }
  if (!repoDir || !fs.existsSync(repoDir)) {
    result.reason = '目录不存在'
    return result
  }
  try {
    if (!fs.statSync(repoDir).isDirectory()) {
      result.reason = '不是目录'
      return result
    }
  } catch (e) {
    result.reason = '目录不可读：' + e.message
    return result
  }

  // 1. tier 结构：normal-character / super-character
  result.tier.normal = listRoleEntries(path.join(repoDir, 'normal-character')).length
  result.tier.super = listRoleEntries(path.join(repoDir, 'super-character')).length
  if (result.tier.normal > 0 || result.tier.super > 0) {
    result.level = 'tier'
    result.reason = `tier 结构（normal ${result.tier.normal} / super ${result.tier.super} 个角色）`
    return result
  }

  // 2. 平铺结构：仓库根直接放角色目录/单文件
  const flatRoles = listRoleEntries(repoDir)
  result.flat.roles = flatRoles.length
  result.flat.riskDirs = findRiskDirs(repoDir)
  if (flatRoles.length > 0 && result.flat.riskDirs.length === 0) {
    result.level = 'flat'
    result.reason = `平铺结构（${flatRoles.length} 个角色，仅普通立绘）`
    return result
  }
  if (flatRoles.length > 0) {
    result.level = 'unsupported'
    result.reason = `平铺结构但根目录含非角色图片目录（${result.flat.riskDirs.join('、')}），注册会被误读为角色`
    return result
  }

  result.level = 'unsupported'
  result.reason = '未找到 normal-character / super-character 层级，也没有平铺角色目录'
  return result
}

/**
 * 批量探测仓库目录（去重、过滤空路径）
 * @param {Array<{dir: string, label?: string, kind?: string}>} items
 * @returns {Array<object>} probeRepo 结果 + label/kind
 */
export function probeAll (items = []) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const dir = item?.dir
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    out.push({ ...probeRepo(dir), label: item.label || '', kind: item.kind || '' })
  }
  return out
}
