import fs from 'node:fs'
import path from 'node:path'
import { getRepoDir } from '../components/constants.js'
import { getActiveRepoIds } from './mapJson.js'
import { getThirdPartyRepos } from './galleryConfig.js'
import { probeAll, resolveSourceDirs } from './srcProbe.js'

/**
 * miao-plugin 图库源配置读写（`config/profile.js` 的 `profileImgSrc`）
 *
 * 上游 2.5.20 起，miao 通过 `profileImgSrc`（有序数组）读取多个面板图图库源；
 * 本插件负责把「默认图库 + 主仓库 + 第三方仓库」注册进去：
 *   - `config/profile.js` 不存在时从 `config/profile_default.js` 复制生成（文件名去 `_default`）
 *   - 仅替换 `profileImgSrc` 声明段，保留文件内其他 export 与注释
 *   - miao 只在模块加载时读一次，写完必须重启才生效
 */

/** miao-plugin 插件目录 */
export const MIAO_PLUGIN_DIR = path.join(process.cwd(), 'plugins/miao-plugin')
/** miao-plugin 配置目录 */
export const MIAO_CONFIG_DIR = path.join(MIAO_PLUGIN_DIR, 'config')
/** 用户配置（运行时，被 miao 读取） */
export const PROFILE_CONFIG_PATH = path.join(MIAO_CONFIG_DIR, 'profile.js')
/** 默认配置模板（复制源） */
export const PROFILE_DEFAULT_PATH = path.join(MIAO_CONFIG_DIR, 'profile_default.js')
/** 默认图库在 profileImgSrc 中的取值（相对 miao 的 resources/ 目录） */
export const DEFAULT_SRC_VALUE = 'profile'

/** 匹配 `export const profileImgSrc = [...]` 声明段 */
const SRC_DECL_RE = /export\s+const\s+profileImgSrc\s*=\s*\[[\s\S]*?\]/

/** 路径转 miao 可识别的正斜杠形式（Windows 反斜杠在 file:// 转换里不通用） */
function toPosix (p) {
  return String(p).split(path.sep).join('/')
}

/** 生成 profileImgSrc 声明段文本 */
function formatSrcBlock (list) {
  const lines = list.map(v => `  '${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
  return `export const profileImgSrc = [\n${lines.join(',\n')}\n]`
}

/**
 * 确保 `config/profile.js` 存在（不存在则从 profile_default.js 复制）
 * @param {object} [opts]
 * @param {string} [opts.defaultFile] - 复制源（默认 miao 的 profile_default.js）
 * @param {string} [opts.targetFile] - 目标（默认 miao 的 profile.js）
 * @returns {{ ok: boolean, created: boolean, error?: string }}
 */
export function ensureProfileConfig (opts = {}) {
  const defaultFile = opts.defaultFile || PROFILE_DEFAULT_PATH
  const targetFile = opts.targetFile || PROFILE_CONFIG_PATH
  try {
    if (fs.existsSync(targetFile)) return { ok: true, created: false }
    if (!fs.existsSync(defaultFile)) {
      return { ok: false, created: false, error: `默认配置不存在：${defaultFile}` }
    }
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.copyFileSync(defaultFile, targetFile)
    logger?.info('[ProfileImg-Plugin] 已从 profile_default.js 创建 miao 配置 profile.js')
    return { ok: true, created: true }
  } catch (e) {
    return { ok: false, created: false, error: e.message }
  }
}

/**
 * miao 是否支持多图库源（模板里存在 profileImgSrc 声明）
 * 旧版 miao 无此配置项，注册源不会生效
 * @param {object} [opts]
 * @param {string} [opts.defaultFile]
 * @returns {boolean}
 */
export function supportsMultiSrc (opts = {}) {
  const file = opts.defaultFile || PROFILE_DEFAULT_PATH
  try {
    if (!fs.existsSync(file)) return false
    return SRC_DECL_RE.test(fs.readFileSync(file, 'utf8'))
  } catch {
    return false
  }
}

/**
 * 读取配置中的 profileImgSrc 列表
 * @param {object} [opts]
 * @param {string} [opts.file]
 * @returns {{ ok: boolean, list: string[], hasDecl: boolean, error?: string }}
 */export function readProfileImgSrc (opts = {}) {
  const file = opts.file || PROFILE_CONFIG_PATH
  try {
    if (!fs.existsSync(file)) return { ok: false, list: [], hasDecl: false, error: '配置文件不存在' }
    const content = fs.readFileSync(file, 'utf8')
    const match = content.match(SRC_DECL_RE)
    if (!match) return { ok: true, list: [], hasDecl: false }
    const list = []
    const strRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
    let m
    while ((m = strRe.exec(match[0])) !== null) {
      const raw = m[1] !== undefined ? m[1] : m[2]
      list.push(raw.replace(/\\(['"\\])/g, '$1'))
    }
    return { ok: true, list, hasDecl: true }
  } catch (e) {
    return { ok: false, list: [], hasDecl: false, error: e.message }
  }
}

/**
 * 写入 profileImgSrc（仅替换该声明段，保留其余内容；无声明时末尾追加）
 * @param {string[]} list - 源列表
 * @param {object} [opts]
 * @param {string} [opts.file]
 * @returns {{ ok: boolean, changed: boolean, hasDecl: boolean, error?: string }}
 */
export function writeProfileImgSrc (list, opts = {}) {
  const file = opts.file || PROFILE_CONFIG_PATH
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, changed: false, hasDecl: false, error: '源列表不能为空' }
  }
  try {
    if (!fs.existsSync(file)) return { ok: false, changed: false, hasDecl: false, error: '配置文件不存在' }
    const content = fs.readFileSync(file, 'utf8')
    const hasDecl = SRC_DECL_RE.test(content)
    const block = formatSrcBlock(list)
    let next
    if (hasDecl) {
      next = content.replace(SRC_DECL_RE, block)
    } else {
      const sep = content.endsWith('\n') ? '\n' : '\n\n'
      next = `${content}${sep}${block}\n`
    }
    const changed = next !== content
    if (changed) fs.writeFileSync(file, next, 'utf8')
    return { ok: true, changed, hasDecl }
  } catch (e) {
    return { ok: false, changed: false, hasDecl: false, error: e.message }
  }
}

/**
 * 构建目标源列表：默认图库 + 可注册的主仓库 / 第三方仓库
 * 只收录结构可直读的源（tier / 安全的平铺）；第三方仓库额外支持「一层分组」
 * （如按游戏分层的 gs-character / sr-character：每个子图库各自注册为平铺源）
 * @param {object} [opts]
 * @param {Array<{dir: string, label: string, kind: string}>} [opts.items] - 指定待注册项（套件用）
 * @returns {{
 *   list: string[],
 *   entries: Array<{ value: string, kind: string, label: string, level: string }>,
 *   skipped: Array<{ dir: string, label: string, kind: string, reason: string }>
 * }}
 */
export function buildSrcList (opts = {}) {
  let items = opts.items
  if (!items) {
    items = []
    for (const repoId of getActiveRepoIds()) {
      items.push({ dir: getRepoDir(repoId), label: repoId === 0 ? '主图库' : `主图库-${repoId}`, kind: 'main' })
    }
    for (const tp of getThirdPartyRepos()) {
      if (tp.enabled === false) continue
      items.push({ dir: tp.dir, label: tp.name, kind: 'thirdParty' })
    }
  }

  const probes = probeAll(items)
  const entries = [{ value: DEFAULT_SRC_VALUE, kind: 'default', label: '默认图库', level: 'tier' }]
  const skipped = []
  for (const p of probes) {
    // 只有第三方图库允许一层分组展开（主仓库 / 默认图库仍要求 tier 或平铺）
    const dirs = resolveSourceDirs(p, { allowGroup: p.kind === 'thirdParty' })
    if (dirs.length === 0) {
      skipped.push({ dir: p.dir, label: p.label, kind: p.kind, reason: p.reason })
      continue
    }
    for (const d of dirs) {
      entries.push({
        value: toPosix(d.dir),
        kind: p.kind,
        label: d.groupName ? `${p.label}·${d.groupName}` : p.label,
        level: d.level
      })
    }
  }
  const seen = new Set()
  const list = []
  for (const e of entries) {
    if (seen.has(e.value)) continue
    seen.add(e.value)
    list.push(e.value)
  }
  return { list, entries, skipped }
}

/**
 * 同步 profileImgSrc（确保配置文件存在 → 构建源列表 → 写入）
 * 幂等：内容未变化时 changed 为 false
 * @returns {{
 *   ok: boolean, changed: boolean, created: boolean, supported: boolean,
 *   list: string[], entries: Array<object>, skipped: Array<object>, error?: string
 * }}
 */
export function syncProfileImgSrc () {
  const supported = supportsMultiSrc()
  if (!supported) {
    return {
      ok: false, changed: false, created: false, supported: false,
      list: [], entries: [], skipped: [],
      error: 'miao-plugin 不支持 profileImgSrc（需 2.5.20+），请先升级 miao-plugin'
    }
  }
  const ensured = ensureProfileConfig()
  if (!ensured.ok) {
    return { ok: false, changed: false, created: false, supported: true, list: [], entries: [], skipped: [], error: ensured.error }
  }
  const { list, entries, skipped } = buildSrcList()
  const written = writeProfileImgSrc(list)
  if (!written.ok) {
    return { ok: false, changed: false, created: ensured.created, supported: true, list, entries, skipped, error: written.error }
  }
  return { ok: true, changed: written.changed, created: ensured.created, supported: true, list, entries, skipped }
}
