import path from 'node:path'
import fs from 'node:fs'
import { getGalleryConfig, getPluginConfig, writeGalleryConfig } from '../components/config.js'
import { PROFILE_IMG_DIR, MIAO_PROFILE_LINK } from '../components/constants.js'
import { probeRepo } from './srcProbe.js'
import { getRepoRemoteUrl } from './git.js'

/**
 * 图库配置（config/gallery_config.yaml）读取工具
 *
 * 负责默认图库路径与第三方图库列表的解析。
 * 第三方仓库目录支持自定义：子目录名（相对 gallery/ProfileImg）或绝对路径（含其他盘、网络盘 UNC）；
 * 新写入一律为**绝对路径**（该字段是仓库实际位置的唯一凭证），读取兼容旧配置的相对名。
 * 迁移到多图库源布局后由 srcProbe 探测结构并注册为 miao 图库源。
 *
 * 契约：第三方仓库**必须在本配置中注册**才会被读取（不存在按目录扫描发现），
 * 跨盘仓库尤其如此；目录扫描只用于把插件子目录下已有的仓库补登记进本配置。
 */

/** 将配置中的目录值解析为绝对路径（绝对路径原样，相对名拼到 PROFILE_IMG_DIR 下） */
function resolveDir(dir) {
  return resolveThirdPartyDir(dir)
}

/**
 * 解析第三方图库目录值（兼容写法）
 * 相对名按 gallery/ProfileImg 下解析（旧配置兼容）；绝对路径原样使用
 * （支持其他盘、网络盘 UNC，正/反斜杠均可）
 * @param {string} dir - 配置中的 dir 值
 * @returns {string} 绝对路径（空值返回空串）
 */
export function resolveThirdPartyDir(dir) {
  if (!dir) return ''
  return path.isAbsolute(dir) ? dir : path.join(PROFILE_IMG_DIR, dir)
}

/**
 * 把绝对路径转为配置里的 dir 写法 —— 一律写**绝对路径**（正斜杠）
 * dir 是仓库实际位置的唯一凭证，写成相对名会在插件目录搬迁 / 图库整体移动后失效，
 * 且与跨盘仓库的写法不一致
 * @param {string} absDir - 绝对路径
 * @returns {string} 配置值（正斜杠绝对路径）
 */
export function toConfigDirValue(absDir) {
  if (!absDir) return ''
  return path.resolve(absDir).split(path.sep).join('/')
}

/**
 * 获取默认图库目录（固定，不随配置变化）
 * 多图库源布局下，默认图库即 miao-plugin/resources/profile（miao 的唯一可写位置，
 * 源列表中的 'profile'），文件名使用 default 段位（10001~99999）
 * @returns {string} 绝对路径
 */
export function getDefaultDir() {
  return MIAO_PROFILE_LINK
}

/**
 * 获取手动上传面板图的默认存放目录
 * 读 config.yaml 的 gallery.defaultDir（目录名，位于 gallery/ProfileImg/ 下）；
 * 留空时回退到 default 图库源目录（getDefaultDir）
 * @returns {string} 绝对路径（始终非空）
 */
export function getUploadDir() {
  const dir = getPluginConfig()?.gallery?.defaultDir
  return resolveDir(dir) || getDefaultDir()
}

/**
 * 获取规范化后的第三方图库列表
 * @returns {Array<{ name: string, dir: string, remoteUrl: string, normalPath: string, superPath: string, enabled: boolean, idx: number }>}
 */
export function getThirdPartyRepos() {
  const config = getGalleryConfig()
  const list = config?.thirdParty || []
  if (!Array.isArray(list)) return []
  return list
    .map((tp, idx) => ({
      name: tp.name || `tp-${idx}`,
      dir: resolveDir(tp.dir),
      remoteUrl: tp.remoteUrl || '',
      normalPath: tp.normalPath || '',
      superPath: tp.superPath || '',
      enabled: tp.enabled !== false,
      idx
    }))
    .filter(tp => tp.dir)
}

/**
 * 扫描 gallery/ProfileImg 下**尚未登记**的图库目录（补登记辅助，不是事实来源）
 *
 * gallery_config.yaml 是唯一凭证：本函数只负责发现插件子目录里已有的仓库/图库目录，
 * 交给 autoRegisterUnregisteredRepos() 先写进配置，再由配置注册 miao。
 * 跨盘 / 网络盘图库不在本目录内，只能由用户直接写进配置。
 *
 * 候选条件：含 .git（目录或文件的 worktree），或结构可直读（tier / 平铺）
 * @param {object} [opts]
 * @param {string} [opts.baseDir] - 扫描目录（默认 PROFILE_IMG_DIR，套件可注入临时目录）
 * @param {Array<{ dir: string }>} [opts.registered] - 已登记的第三方（默认取配置）
 * @param {boolean} [opts.withRemote] - 是否回填 remoteUrl（默认 true，套件可关闭以避开 git）
 * @returns {Array<{ name: string, dir: string, remoteUrl: string }>}
 */
export function listUnregisteredRepos (opts = {}) {
  const baseDir = opts.baseDir || PROFILE_IMG_DIR
  const withRemote = opts.withRemote !== false
  const registered = new Set(
    (opts.registered || getThirdPartyRepos()).map(tp => path.resolve(tp.dir))
  )
  const out = []
  if (!fs.existsSync(baseDir)) return out
  let entries = []
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    // 主仓库目录由 map.json / config.yaml 管理，不属于第三方
    if (/^miao-plugin-ProfileImg(-\d+)?$/.test(entry.name)) continue
    const dir = path.join(baseDir, entry.name)
    if (registered.has(path.resolve(dir))) continue

    const hasGit = fs.existsSync(path.join(dir, '.git'))
    const level = probeRepo(dir).level
    if (!hasGit && level !== 'tier' && level !== 'flat') continue
    out.push({
      name: entry.name,
      dir,
      remoteUrl: hasGit && withRemote ? getRepoRemoteUrl(dir) : ''
    })
  }
  return out
}

/**
 * 登记一个第三方图库到 gallery_config.yaml（幂等：按绝对路径比对）
 * 写入的 dir 一律为正斜杠绝对路径
 * @param {{ name: string, dir: string, remoteUrl?: string, enabled?: boolean }} entry
 * @param {object} [opts]
 * @param {string} [opts.file] - 指定配置文件（套件用）
 * @returns {{ ok: boolean, added: boolean, error?: string }}
 */
export function addThirdPartyRepo (entry, opts = {}) {
  const absDir = resolveThirdPartyDir(entry?.dir)
  const name = String(entry?.name || '').trim() || path.basename(absDir || '')
  if (!absDir || !name) return { ok: false, added: false, error: '缺少 name 或 dir' }

  const cfg = getGalleryConfig(opts.file)
  const list = Array.isArray(cfg.thirdParty) ? cfg.thirdParty : []
  if (list.some(tp => resolveThirdPartyDir(tp?.dir) && path.resolve(resolveThirdPartyDir(tp.dir)) === path.resolve(absDir))) {
    return { ok: true, added: false }
  }

  list.push({
    name,
    dir: toConfigDirValue(absDir),
    remoteUrl: String(entry.remoteUrl || ''),
    enabled: entry.enabled !== false
  })
  cfg.thirdParty = list
  const w = writeGalleryConfig(cfg, opts.file)
  return w.ok ? { ok: true, added: true } : { ok: false, added: false, error: w.error }
}

/**
 * 自动补登记：把扫描到的图库目录写进 gallery_config.yaml
 * 流程固定为「扫描 → 先登记配置 →（调用方）再由配置注册 miao → 提示用户」
 * @param {object} [opts] - 透传 listUnregisteredRepos / addThirdPartyRepo 的 opts
 * @returns {{ added: Array<{name: string, dir: string}>, failed: Array<{name: string, error: string}> }}
 */
export function autoRegisterUnregisteredRepos (opts = {}) {
  const added = []
  const failed = []
  for (const item of listUnregisteredRepos(opts)) {
    const r = addThirdPartyRepo({ name: item.name, dir: item.dir, remoteUrl: item.remoteUrl }, opts)
    if (r.added) added.push({ name: item.name, dir: item.dir })
    else if (!r.ok) failed.push({ name: item.name, error: r.error || '写入配置失败' })
  }
  return { added, failed }
}

/**
 * 获取第三方仓库中指定类型的角色目录
 * @param {object} tp - getThirdPartyRepos 产物
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 * @returns {string} 目录绝对路径（normalPath/superPath 为空则返回空串）
 */
export function getThirdPartyRoleDir(tp, type, roleName) {
  const rel = type === 'normal' ? tp.normalPath : tp.superPath
  if (!rel) return ''
  return path.join(tp.dir, rel, roleName)
}

/**
 * 获取第三方仓库中指定类型的角色目录根（不含角色名）
 * @param {object} tp - getThirdPartyRepos 产物
 * @param {'normal'|'super'} type
 * @returns {string}
 */
export function getThirdPartyTypeDir(tp, type) {
  const rel = type === 'normal' ? tp.normalPath : tp.superPath
  if (!rel) return ''
  return path.join(tp.dir, rel)
}

/**
 * 列出第三方仓库所有存在图片的角色（normal+super，去重）
 * @param {object} tp - getThirdPartyRepos 产物
 * @returns {Array<{ type: 'normal'|'super', roleName: string }>}
 */
export function listThirdPartyRoles(tp) {
  const result = []
  for (const type of ['normal', 'super']) {
    const typeDir = getThirdPartyTypeDir(tp, type)
    if (!typeDir || !fs.existsSync(typeDir)) continue
    const dirs = fs.readdirSync(typeDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const d of dirs) {
      result.push({ type, roleName: d.name })
    }
  }
  return result
}
