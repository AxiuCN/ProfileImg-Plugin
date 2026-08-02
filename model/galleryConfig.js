import path from 'node:path'
import fs from 'node:fs'
import { getGalleryConfig, getPluginConfig } from '../components/config.js'
import { PROFILE_IMG_DIR } from '../components/constants.js'

/**
 * 图库配置（config/gallery_config.yaml）读取工具
 *
 * 负责 default 图库路径与第三方图库列表的解析。
 * 第三方仓库目录结构各异，通过 normalPath / superPath 指定角色目录位置。
 * 第三方仓库目录固定位于 PROFILE_IMG_DIR（gallery/ProfileImg/）下。
 */

/** 将配置中的目录名解析为绝对路径（第三方仓库固定位于 PROFILE_IMG_DIR 下） */
function resolveDir(dir) {
  if (!dir) return ''
  return path.isAbsolute(dir) ? dir : path.join(PROFILE_IMG_DIR, dir)
}

/**
 * 获取 default 图库目录
 * 优先读取 config.yaml 的 gallery.defaultDir（目录名，位于 gallery/ProfileImg/ 下）；
 * 未配置时回退到固定默认目录 gallery/ProfileImg/default
 * @returns {string} 绝对路径（始终非空）
 */
export function getDefaultDir() {
  const dir = getPluginConfig()?.gallery?.defaultDir
  return resolveDir(dir) || path.join(PROFILE_IMG_DIR, 'default')
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
