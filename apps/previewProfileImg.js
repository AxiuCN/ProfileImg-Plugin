import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 面板图预览 — 用指定序号的面板图渲染一张 miao 角色面板
 *
 * 实现方式：把命令改写为 miao 自己的面板指令后 **return false**，交给 miao 的处理器渲染
 * （Yunzai 按优先级顺序匹配插件，返回 false 时后续插件会拿到改写后的 e.msg）。
 * 这样不 import miao 内部模块：取数、面板变换开关、CD、权限与错误提示全部由 miao 负责。
 *
 * 命令里注入的「补 N 级」（原神 90 / 星铁 80）是 miao 的虚拟面板基准：
 * 没有该角色面板数据时 miao 会 `source = {}` 起一个默认面板，因此**不需要账号里有这个角色**；
 * 不注入时 miao 拿不到数据会静默无回复。
 *
 * 前置条件（miao 自身的提示，本插件不代答）：
 *   - 发起者已绑定 UID（否则 miao 回「尚未绑定UID」）
 *   - miao 的「面板变换」开关已开启（否则 miao 回「面板替换功能已禁用」）
 *
 * 星铁角色需带 `#星铁` 前缀（与 miao 面板命令一致），否则按原神解析。
 */
export class PreviewProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图预览',
      dsc: '用指定序号的面板图渲染角色面板',
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
    return this.previewBySlot(e)
  }

  /**
   * 定位序号并改写成 miao 面板命令（守卫与权限之外的业务部分）
   * 命中即改写 e.msg 并返回 false（交给 miao 渲染），失败自行回复并返回 true
   * @param {object} e - 消息事件
   * @returns {boolean} false = 继续交给后续插件；true = 已由本插件处理
   */
  previewBySlot(e) {
    const match = e.msg.match(/^#?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/)
    if (!match) return true
    const isSr = match[1] === '星铁'
    const roleName = resolveRoleName(match[2].trim())
    const n = parseInt(match[3], 10)

    const target = findImageByN(roleName, 'normal', n)
    if (!target) {
      return e.reply([
        `[面板图图库管理器]\n序号无效：角色${roleName}没有第${n}张图\n`,
        '（第三方图库的图片不参与序号，可用 #' + roleName + '面板图列表 查看全部）'
      ].join(''))
    }

    // 交给 miao 渲染：改写消息后返回 false，后续插件（miao）按新消息匹配
    e.msg = buildPanelPreviewMsg(roleName, n, isSr)
    return false
  }
}

/**
 * 生成交给 miao 的面板命令（本命令与 miao 之间的唯一契约）
 * 原神：#琴面板 面板图3 补90级   星铁：#星铁三月七面板 面板图1 补80级
 * @param {string} roleName - 角色名（官方名）
 * @param {number} n - 面板图序号（段位 n）
 * @param {boolean} isSr - 是否星铁角色
 * @returns {string} miao 面板命令
 */
export function buildPanelPreviewMsg(roleName, n, isSr = false) {
  const level = isSr ? 80 : 90
  const prefix = isSr ? '#星铁' : '#'
  return `${prefix}${roleName}面板 面板图${n} 补${level}级`
}
