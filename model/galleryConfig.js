import path from 'node:path'
import fs from 'node:fs'
import { getGalleryConfig, getPluginConfig } from '../components/config.js'
import { PROFILE_IMG_DIR, MIAO_PROFILE_LINK } from '../components/constants.js'

/**
 * 图库配置（config/gallery_config.yaml）读取工具
 *
 * 负责默认图库路径与第三方图库列表的解析。
 * 第三方仓库目录**支持自定义**：子目录名（位于 gallery/ProfileImg/ 下）或绝对路径
 * （含其他盘、网络盘 UNC）；迁移到多图库源布局后由 srcProbe 探测结构并注册为 miao 图库源。
 *
 * 契约：第三方仓库**必须在本配置中注册**才会被读取（不存在按目录扫描发现），
 * 跨盘仓库尤其如此；未注册的仓库目录由 listUnregisteredRepos() 提示。
 */

/** 将配置中的目录值解析为绝对路径（绝对路径原样，相对名拼到 PROFILE_IMG_DIR 下） */
function resolveDir(dir) {
  return resolveThirdPartyDir(dir)
}

/**
 * 解析第三方图库目录值
 * 支持：gallery/ProfileImg 下的子目录名 / 绝对路径（含其他盘、网络盘 UNC）
 * @param {string} dir - 配置中的 dir 值
 * @returns {string} 绝对路径（空值返回空串）
 */
export function resolveThirdPartyDir(dir) {
  if (!dir) return ''
  return path.isAbsolute(dir) ? dir : path.join(PROFILE_IMG_DIR, dir)
}

/**
 * 把绝对路径转为配置文件里的 dir 写法
 * 位于 gallery/ProfileImg 下 → 相对子目录名（便于整体搬迁）；否则 → 正斜杠绝对路径
 * @param {string} absDir - 绝对路径
 * @returns {string} 配置值
 */
export function toConfigDirValue(absDir) {
  if (!absDir) return ''
  const base = path.resolve(PROFILE_IMG_DIR)
  const resolved = path.resolve(absDir)
  const rel = path.relative(base, resolved)
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/')
  return resolved.split(path.sep).join('/')
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
 * 扫描 gallery/ProfileImg 下「未注册」的第三方仓库目录
 *
 * 第三方仓库必须在 gallery_config.yaml 中注册才会被读取，此处仅用于提示：
 * 目录内含有 .git、不是主仓库目录、也不匹配任何已注册的 dir 时视为未注册。
 * 跨盘仓库不在本目录内，无法通过扫描发现，只能靠配置注册。
 * @param {object} [opts]
 * @param {string} [opts.baseDir] - 扫描目录（默认 PROFILE_IMG_DIR，套件可注入临时目录）
 * @param {Array<{ dir: string }>} [opts.registered] - 已注册的第三方（默认取配置）
 * @returns {Array<{ name: string, dir: string }>}
 */
export function listUnregisteredRepos (opts = {}) {
  const baseDir = opts.baseDir || PROFILE_IMG_DIR
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
    if (!fs.existsSync(path.join(dir, '.git'))) continue
    out.push({ name: entry.name, dir })
  }
  return out
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
