import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { getImageSize } from '../modules/compress.js'
import { render } from '../components/render.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 面板图预览 — 自绘一张「这张面板图放进面板立绘区是什么效果」的预览图
 *
 * 为什么不直接把命令交给 miao 渲染（`#角色面板 面板图N 补90级`）：
 *   1) miao 的处理器读 `e.original_msg || e.msg`，改写消息要同时改两个字段才生效；
 *   2) 更关键的是**没有该角色数据时 miao 会崩溃或不出图**：虚拟面板基准（补）会让
 *      `ProfileChange.getProfile` 以 `source = {}` 构造 Avatar，星铁分支 `Character.getLvAttr`
 *      按 `promote` 取属性表，`promote` 为 undefined → `metaAttr[undefined].attrs` 抛 TypeError；
 *      不注入基准时 miao 取不到数据，只会回一句「暂无数据」。
 *   所以预览改为本插件自己画：立绘区尺寸直接对齐 miao 面板的 `.main-pic`
 *   （原神 1400×500 / 星铁 1400×520，等比 contain 居中），不依赖任何面板数据与账号。
 *
 * 想要带圣遗物/属性的完整面板时，可自行使用 miao 原生命令（需该角色数据）。
 */
export class PreviewProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图预览',
      dsc: '预览指定序号面板图在面板立绘区中的效果',
      event: 'message',
      priority: 1,
      rule: [
        {
          // #预览琴面板图3 / #星铁预览三月七面板图1
          reg: /^#?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/,
          fnc: 'preview'
        }
      ]
    })
  }

  async preview(e) {
    if (!(await guardLayout(e))) return true

    const target = await this.resolvePreviewTarget(e)
    if (!target.ok) return e.reply(target.reply)

    const imgPath = await render('preview', 'index', target.data, 'jpeg')
    if (!imgPath) {
      return e.reply('[面板图图库管理器] 预览图生成失败，请稍后重试')
    }
    return e.reply(imgPath)
  }

  /**
   * 定位序号并组装预览所需数据（不含渲染，便于单独验证）
   * @param {object} e - 消息事件
   * @returns {Promise<{ok: true, data: object} | {ok: false, reply: string}>}
   */
  async resolvePreviewTarget(e) {
    const match = e.msg.match(/^#?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/)
    if (!match) return { ok: false, reply: '[面板图图库管理器]\n用法：#预览角色名面板图序号' }

    const isSr = match[1] === '星铁'
    const roleName = resolveRoleName(match[2].trim())
    const n = parseInt(match[3], 10)

    const target = findImageByN(roleName, 'normal', n)
    if (!target) {
      return {
        ok: false,
        reply: [
          `[面板图图库管理器]\n序号无效：角色${roleName}没有第${n}张图\n`,
          `（第三方图库的图片不参与序号，可用 #${roleName}面板图列表 查看全部）`
        ].join('')
      }
    }

    const imageSize = await getImageSize(target.filePath)

    return {
      ok: true,
      data: buildPreviewData({
        roleName,
        n,
        filePath: target.filePath,
        label: target.source === 'default' ? '默认图库' : target.label,
        isSr,
        imageSize
      })
    }
  }
}

/** 面板立绘区尺寸（与 miao resources/character/profile-detail.css 的 .main-pic 对齐） */
export const PANEL_BOX = {
  gs: { width: 1400, height: 500 },
  sr: { width: 1400, height: 520 }
}

/**
 * 组装预览模板数据（本命令的对外契约：面板框尺寸、等比 contain 后的显示尺寸、提示文案）
 * @param {object} opts
 * @param {string} opts.roleName - 角色名
 * @param {number} opts.n - 面板图序号
 * @param {string} opts.filePath - 图片绝对路径
 * @param {string} opts.label - 图库来源标签
 * @param {boolean} [opts.isSr] - 是否星铁角色（决定立绘区尺寸）
 * @param {{width: number, height: number}} [opts.imageSize] - 原图尺寸
 * @returns {object} 模板数据
 */
export function buildPreviewData({ roleName, n, filePath, label, isSr = false, imageSize = {} }) {
  const box = isSr ? PANEL_BOX.sr : PANEL_BOX.gs
  const width = imageSize?.width || 0
  const height = imageSize?.height || 0

  let displaySize = ''
  let scalePct = ''
  if (width > 0 && height > 0) {
    const scale = Math.min(box.width / width, box.height / height)
    displaySize = `${Math.round(width * scale)}×${Math.round(height * scale)}`
    scalePct = `${Math.round(scale * 100)}%`
  }

  return {
    roleName,
    seq: n,
    fileName: path.basename(filePath),
    fileUrl: pathToFileURL(filePath).href,
    label,
    gameName: isSr ? '星铁' : '原神',
    boxWidth: box.width,
    boxHeight: box.height,
    imageSize: width > 0 ? `${width}×${height}` : '',
    displaySize,
    scalePct,
    note: `想看带圣遗物与属性的完整面板，可发 #${isSr ? '星铁' : ''}${roleName}面板 面板图${n}（需该角色数据）`
  }
}
