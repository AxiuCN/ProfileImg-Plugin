import fs from 'node:fs'
import path from 'node:path'

/**
 * miao-plugin 内部模块的懒加载入口
 *
 * 预览要在本插件自己的管线里复用 miao 的角色模型与面板模板，所以必须 import miao 内部模块。
 * 两点约定：
 *   1) **只能用相对路径**：`#miao` / `#miao.models` 是 miao-plugin 自己 package.json 的 imports，
 *      Node 的 `#` 说明符只查「最近作用域」的 package.json，本插件里 import 会直接报
 *      ERR_PACKAGE_IMPORT_NOT_DEFINED；
 *   2) **动态 import + 缓存**：miao 缺失或版本过旧时本插件仍要能加载，由调用方提示
 *      「未检测到 miao-plugin」，而不是让整个 apps 注册失败。
 */

/** miao 面板模板（预览渲染的目标） */
const PANEL_TPL = 'resources/character/profile-detail.html'

/** miao-plugin 资源根（图片相对路径的基准） */
export const MIAO_RES_DIR = path.join(process.cwd(), 'plugins/miao-plugin/resources')

let cache = null

/**
 * 加载并缓存 miao 内部模块
 * @returns {Promise<{
 *   Avatar: Function, Character: Function, Weapon: Function, Artifact: Function,
 *   ArtifactSet: Function, Common: object, Meta: object, Format: object
 * }|null>} 不可用时返回 null（不抛错）
 */
export async function loadMiao () {
  if (cache) return cache
  const tpl = path.join(process.cwd(), 'plugins/miao-plugin', PANEL_TPL)
  if (!fs.existsSync(tpl)) {
    logger?.warn('[ProfileImg-Plugin] 未找到 miao 面板模板，预览不可用:', tpl)
    return null
  }
  try {
    const [models, components] = await Promise.all([
      import('../../../miao-plugin/models/index.js'),
      import('../../../miao-plugin/components/index.js')
    ])
    const { Avatar, Character, Weapon, Artifact, ArtifactSet } = models || {}
    const { Common, Meta, Format } = components || {}
    if (!Avatar || !Character || !Weapon || !Common || !Format) {
      logger?.warn('[ProfileImg-Plugin] miao-plugin 内部模块导出不完整，预览不可用')
      return null
    }
    cache = { Avatar, Character, Weapon, Artifact, ArtifactSet, Common, Meta, Format }
    return cache
  } catch (err) {
    logger?.warn('[ProfileImg-Plugin] 加载 miao-plugin 内部模块失败，预览不可用:', err?.message || err)
    return null
  }
}
