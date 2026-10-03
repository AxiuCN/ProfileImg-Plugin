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
 *   {源}/{分组}/{角色}/               一层分组（如按游戏分层的 gs-character / sr-character）
 * 图片后缀口径与 miao 一致：webp / png / jpg / jpeg（大小写不敏感）。
 *
 * 平铺结构会被 miao 把「源根下的目录」整体当作角色目录，因此根下若存在
 * 含图的非角色目录（docs/ 等）即视为不安全（risky），不参与注册。
 *
 * 一层分组不是 miao 的原生层级：注册时会把每个可直读的分组目录**各自注册为一个平铺源**
 * （`{分组}/{角色}/` 正好是 miao 的平铺形态），因此不依赖任何命名约定。
 */

/** 图片后缀（与 miao 读取口径一致） */
const IMG_EXT_RE = /\.(webp|png|jpe?g)$/i

/** 非角色目录名（平铺/分组判定时视为工具/文档目录，小写比对） */
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
 * 判定单个目录自身的层级（tier / flat / unsupported），不做分组展开
 * @param {string} dir - 目录绝对路径
 * @returns {{ level: 'tier'|'flat'|'unsupported', tier: object, flat: object, reason: string }}
 */
function probeLevels (dir) {
  const out = {
    level: 'unsupported',
    tier: { normal: 0, super: 0 },
    flat: { roles: 0, riskDirs: [] },
    reason: ''
  }

  // 1. tier 结构：normal-character / super-character
  out.tier.normal = listRoleEntries(path.join(dir, 'normal-character')).length
  out.tier.super = listRoleEntries(path.join(dir, 'super-character')).length
  if (out.tier.normal > 0 || out.tier.super > 0) {
    out.level = 'tier'
    out.reason = `tier 结构（normal ${out.tier.normal} / super ${out.tier.super} 个角色）`
    return out
  }

  // 2. 平铺结构：目录根直接放角色目录/单文件
  const flatRoles = listRoleEntries(dir)
  out.flat.roles = flatRoles.length
  out.flat.riskDirs = findRiskDirs(dir)
  if (flatRoles.length > 0 && out.flat.riskDirs.length === 0) {
    out.level = 'flat'
    out.reason = `平铺结构（${flatRoles.length} 个角色，仅普通立绘）`
    return out
  }
  if (flatRoles.length > 0) {
    out.reason = `平铺结构但根目录含非角色图片目录（${out.flat.riskDirs.join('、')}），注册会被误读为角色`
    return out
  }

  out.reason = '未找到 normal-character / super-character 层级，也没有平铺角色目录'
  return out
}

/**
 * 探测目录下可作为独立源的「一层分组」（如按游戏分层的 gs-character / sr-character）
 * 不依赖命名：任何本身能按 tier / 平铺读通的子目录都算，工具/隐藏目录跳过；
 * 平铺形态额外要求至少含一个角色**目录**，避免把「角色目录里直接放图」误判为分组
 * @param {string} root - 仓库根目录
 * @returns {Array<{name: string, dir: string, level: string, reason: string}>}
 */
function listGroupDirs (root) {
  const out = []
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const name = d.name
    if (name.startsWith('.') || NON_ROLE_DIRS.has(name.toLowerCase())) continue
    const dir = path.join(root, name)
    const sub = probeLevels(dir)
    if (sub.level !== 'tier' && sub.level !== 'flat') continue
    // 平铺分组必须含「角色目录」：只有角色名文件的话，像「角色目录里直接放图」的仓库
    // 会被误当成分组，注册后 miao 也读不到角色（只会变成空源）
    if (sub.level === 'flat' && !listRoleEntries(dir).some(r => r.kind === 'dir')) continue
    out.push({ name, dir, level: sub.level, reason: sub.reason })
  }
  return out
}

/**
 * 探测单个图库仓库的结构
 * @param {string} repoDir - 仓库目录绝对路径
 * @returns {{
 *   dir: string,
 *   level: 'tier'|'flat'|'group'|'unsupported',
 *   tier: { normal: number, super: number },
 *   flat: { roles: number, riskDirs: string[] },
 *   group: { dirs: Array<{name: string, dir: string, level: string, reason: string}> },
 *   reason: string
 * }}
 */
export function probeRepo (repoDir) {
  const result = {
    dir: repoDir,
    level: 'unsupported',
    tier: { normal: 0, super: 0 },
    flat: { roles: 0, riskDirs: [] },
    group: { dirs: [] },
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

  const own = probeLevels(repoDir)
  result.tier = own.tier
  result.flat = own.flat
  if (own.level === 'tier' || own.level === 'flat') {
    result.level = own.level
    result.reason = own.reason
    return result
  }

  // 一层分组：根自己读不通时，看下一层有没有可直读的子图库
  const groups = listGroupDirs(repoDir)
  result.group.dirs = groups
  if (groups.length > 0) {
    result.level = 'group'
    result.reason = `一层分组结构（${groups.length} 个子图库：${groups.map(g => g.name).join('、')}）`
    return result
  }

  result.reason = own.reason
  return result
}

/**
 * 把探测结果展开成「可直接注册的源目录」列表（单一实现，注册与读取共用）
 * tier / flat → 自身一项；group → 每个可直读子目录一项（各自按 tier / flat）
 * groupName 即分组目录的原始名（不美化，标签直接用目录名）
 * @param {object} probe - probeRepo 结果
 * @param {object} [opts]
 * @param {boolean} [opts.allowGroup] - 是否展开一层分组（第三方图库为 true，主仓库/默认图库为 false）
 * @returns {Array<{dir: string, level: string, groupName: string}>}
 */
export function resolveSourceDirs (probe, opts = {}) {
  if (!probe || !probe.dir) return []
  if (probe.level === 'tier' || probe.level === 'flat') {
    return [{ dir: probe.dir, level: probe.level, groupName: '' }]
  }
  if (probe.level === 'group' && opts.allowGroup) {
    return (probe.group?.dirs || []).map(g => ({
      dir: g.dir,
      level: g.level,
      groupName: g.name
    }))
  }
  return []
}

/**
 * 在源内定位某个角色图片的实际文件路径
 * tier → `{源}/{type}-character/{角色}/{文件名}`；flat（含分组子源）→ `{源}/{角色}/{文件名}`
 * 与 resolveSourceDirs 同属「源结构 → 实际位置」契约，注册 / 读取 / 迁移共用
 * @param {object} probe - probeRepo 结果
 * @param {{role: string, type?: 'normal'|'super', name: string}} query - 角色、立绘层、文件名
 * @param {object} [opts]
 * @param {boolean} [opts.allowGroup] - 是否展开一层分组
 * @returns {{dir: string, level: string, groupName: string, path: string}|null} 命中的源与实际路径
 */
export function resolveRoleFilePath (probe, query = {}, opts = {}) {
  const { role, type = 'normal', name } = query
  if (!role || !name) return null
  for (const d of resolveSourceDirs(probe, { allowGroup: opts.allowGroup })) {
    const p = d.level === 'flat'
      ? path.join(d.dir, role, name)
      : path.join(d.dir, `${type}-character`, role, name)
    if (fs.existsSync(p)) return { ...d, path: p }
  }
  return null
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
