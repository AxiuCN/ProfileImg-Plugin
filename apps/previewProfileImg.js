import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { guardLayout } from '../model/layoutGuard.js'
import { supportsPanelPreview } from '../model/profileSrc.js'

/**
 * 面板图预览 — 用指定序号的面板图渲染一张**完整的 miao 角色面板**
 *
 * 实现方式：把命令改写为 miao 自己的面板指令后 **return false**，交给 miao 的处理器渲染
 * （Yunzai 按优先级顺序匹配插件，返回 false 时后续插件会拿到改写后的 e.msg）。
 * 这样不 import miao 内部模块，面板 UI、选图逻辑、取数、CD、权限与错误提示全部由 miao 负责。
 *
 * 两个必须遵守的点：
 *   1) **`e.original_msg` 也要一起改写**：miao 多处是 `let msg = e.original_msg || e.msg`，
 *      只改 `e.msg` 会让它拿到原始命令、解析不出角色并静默返回 false（命令会继续落到别的插件）；
 *   2) **注入「补 N 级」走虚拟面板**：miao 的「面板变换」（fork 功能）在没有该角色面板数据时
 *      以 `source = {}` 构造虚拟面板，因此不依赖账号里有这个角色；不注入时 miao 取不到数据只会回
 *      「暂无数据」。等级必须按游戏给（原神 90 / 星铁 80）：星铁属性表按突破段索引，
 *      等级超上限会算出越界的 promote（如星铁 90 级 → promote 8）并在取属性时抛错。
 *
 * 前置条件（miao 自身的提示，本插件不代答）：发起者已绑定 UID；miao 的「面板变换」开关已开启。
 * 星铁角色需带 `#星铁` 前缀（与 miao 面板命令一致），否则按原神解析。
 *
 * 能力门槛：`面板图N` 序号寻址与 `补` 虚拟面板都是配套 miao-plugin fork 的功能，上游版本没有，
 * 改写后的命令连 miao 的 rule 都匹配不上（会静默落到其他插件），故先由 supportsPanelPreview() 探测，
 * 探测不过时本插件直接给出提示并终止，不改写消息。
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
          // #预览琴面板图3 / #星铁预览遐蝶面板图2
          reg: /^#?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/,
          fnc: 'preview'
        }
      ]
    })
  }

  async preview(e) {
    if (!(await guardLayout(e))) return true
    // 能力门槛：面板图序号寻址与 `补` 虚拟面板都是配套 fork 的功能，上游 miao 接不住改写后的命令
    if (!supportsPanelPreview()) {
      return e.reply([
        '[面板图图库管理器]\n无法预览：当前 miao-plugin 不支持面板图序号与虚拟面板\n',
        '（本命令依赖 miao-plugin 的「面板图N 序号选图」与「补」虚拟面板，上游版本没有这两项，',
        '可先用 #角色名面板图列表 / #角色名面板图可视化 查看图片）'
      ].join(''))
    }
    return this.previewBySlot(e)
  }

  /**
   * 定位序号并改写成 miao 面板命令（返回 false 交给 miao 渲染）
   * 序号必须真实存在：miao 的 getProfileImgByIndex 匹配不到序号时会**回退随机图**，会误导预览
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
        `（第三方图库的图片不参与序号，可用 #${roleName}面板图列表 查看全部）`
      ].join(''))
    }

    // 交给 miao 渲染完整面板：改写消息后返回 false，后续插件（miao）按新消息匹配
    const cmd = buildPanelPreviewMsg(roleName, n, isSr)
    e.msg = cmd
    e.original_msg = cmd
    return false
  }
}

/**
 * 生成交给 miao 的面板命令（本命令与 miao 之间的唯一契约）
 * 原神：#琴面板 面板图3 补90级   星铁：#星铁遐蝶面板 面板图2 补80级
 * @param {string} roleName - 角色名（官方名）
 * @param {number} n - 面板图序号（段位 n）
 * @param {boolean} [isSr] - 是否星铁角色（决定前缀与虚拟面板等级）
 * @returns {string} miao 面板命令
 */
export function buildPanelPreviewMsg(roleName, n, isSr = false) {
  const level = isSr ? 80 : 90
  const prefix = isSr ? '#星铁' : '#'
  return `${prefix}${roleName}面板 面板图${n} 补${level}级`
}
