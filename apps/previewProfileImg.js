import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { guardLayout } from '../model/layoutGuard.js'
import { parsePreviewCommand, renderPanelPreview } from '../modules/preview/index.js'

/**
 * 面板图预览 — 把指定序号的面板图放进**完整的 miao 角色面板**里渲染一张图
 *
 * 命令：`#预览琴面板图3` / `*预览遐蝶面板图2`
 *   - `#` → 按原神角色处理（默认），`*` → 按星铁角色处理
 *   - 也兼容 `#星铁预览…` / `#原神预览…` 写法
 *
 * 实现见 `modules/preview/`：用虚拟数据（伪造 UID + 一套伪造圣遗物）构造面板，
 * 立绘换成该序号的面板图，再用 miao 自己的面板模板渲染。
 * 因此不需要账号里有这个角色、不需要绑定 UID，也不依赖 miao 的 `面板图N` / `补`
 * 等 fork 私有能力（上游 miao 同样可用）；面板里会标注「虚拟面板，非实际账号数据」。
 *
 * 图库可能先收录 miao 还没有的角色（未实装 / 未来角色）：此时按前缀定游戏，
 * 并借该游戏的占位骨架出面板（原神 胡桃 / 星铁 三月七），只换名字、立绘与头像，
 * 面板顶部会标注这是占位数据。
 *
 * 两个容易踩的点：
 *   1) 已知角色的游戏由 miao 决定（`Character.get(name).isSr`）——用前缀猜会让星铁角色
 *      按原神解析，等级/属性表随之越界；
 *   2) 序号必须真实存在：miao 按序号取不到图时**不报错**而是随机取一张，会给出误导性预览。
 */
export class PreviewProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图预览',
      dsc: '用指定序号的面板图渲染一张完整角色面板预览',
      event: 'message',
      priority: 1,
      rule: [
        {
          // #预览琴面板图3 / *预览遐蝶面板图2 / #星铁预览遐蝶面板图2
          reg: /^[#*]?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/,
          fnc: 'preview'
        }
      ]
    })
  }

  async preview(e) {
    if (!(await guardLayout(e))) return true
    const cmd = parsePreviewCommand(e.msg)
    if (!cmd) return true

    const roleName = resolveRoleName(cmd.roleName)
    // 先自己校验序号：miao 取不到序号时会静默回退随机图，预览会张冠李戴
    if (!findImageByN(roleName, 'normal', cmd.n)) {
      return e.reply([
        `[面板图图库管理器]\n序号无效：角色${roleName}没有第${cmd.n}张图\n`,
        `（第三方图库的图片不参与序号，可用 #${roleName}面板图列表 查看全部）`
      ].join(''))
    }

    try {
      const ret = await renderPanelPreview({ e, roleName, n: cmd.n, game: cmd.game })
      if (!ret.ok) return e.reply(`[面板图图库管理器]\n${ret.msg}`)
      // 渲染结果已是框架包好的图片段（renderType base64 返回的是 segment.image(...)），原样回复即可，
      // 不要再自己拼 `base64://`（会变成 base64://[object Object]，适配器报 unsupported file type）
      return e.reply(ret.image)
    } catch (err) {
      logger?.error('[ProfileImg-Plugin] 面板图预览渲染异常:', err)
      return e.reply(`[面板图图库管理器]\n预览渲染失败：${err?.message || err}`)
    }
  }
}
