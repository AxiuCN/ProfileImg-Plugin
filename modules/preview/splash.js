import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { findImageByN } from '../../model/galleryIndex.js'
import { MIAO_RES_DIR } from './miao.js'

/**
 * 预览立绘（面板图）的定位与路径转换
 *
 * 面板里显示的立绘由 miao 模板的 `data.costumeSplash` 决定，这里做两件事：
 *   1) 按序号在我们自己的图库里定位那张图（跨源顺序与 miao 的 profileImgSrc 一致：
 *      默认图库 → 主仓库 → 第三方；第三方不参与序号，由 galleryIndex 保证）；
 *   2) 把绝对路径转成模板可用的形式——miao 模板用 `_imgUrl()` 拼 `pluResPath`，
 *      只接受「相对 miao resources 的路径」或「带协议的 URL」（Windows 绝对路径会被拼坏）。
 *      规则与 miao fork 的 `CharImg.getProfileImgRes()` 相同，但这里自己实现，不依赖 fork。
 */

/**
 * 按序号定位立绘
 * 只走 normal 层（与列表里的序号一致）；彩蛋立绘（super）不参与，避免与序号对不上
 * @param {string} roleName
 * @param {number} n
 * @returns {{ filePath: string, name: string, label: string }|null}
 */
export function findSplash (roleName, n) {
  return findImageByN(roleName, 'normal', n)
}

/**
 * 图库绝对路径 → miao 模板可用路径
 * 同盘（能算出相对路径）→ 相对 resources 的路径（basename 做 URL 编码，中文/空格安全）
 * 跨盘（path.relative 返回绝对路径）→ file:// URL
 * @param {string} file - 图片绝对路径
 * @param {string} [resDir] - miao resources 目录（套件用）
 * @returns {string}
 */
export function toTemplatePath (file, resDir = MIAO_RES_DIR) {
  const name = encodeURIComponent(path.basename(file))
  const rel = path.relative(resDir, path.dirname(file)).split(path.sep).join('/')
  if (!path.isAbsolute(rel)) return `${rel}/${name}`
  return pathToFileURL(file).href
}
