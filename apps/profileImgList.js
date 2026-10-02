import { listRoleImages } from '../model/galleryIndex.js'
import { getBlockedAggregated } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 面板图列表 — 接管 miao-plugin 的 #xxx面板图列表 + 屏蔽列表
 * 优先级 1（主列表接管 miao-plugin）+ 5（屏蔽列表）
 *
 * 多图库源布局：默认图库与主仓库图片按段位序号展示（可用于删除/屏蔽），
 * 第三方图库图片标源名展示（不参与序号，需在源仓库中管理）
 */
export class ProfileImgList extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图列表',
      dsc: '列出面板图（含版权信息）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?\s*(.+)(?:面板图列表)\s*$/, fnc: 'mainList' },
        { reg: '^#(.+)面板图屏蔽列表$', fnc: 'blockedList' }
      ]
    })
  }

  /** 全部图库源列表（默认图库 + 主仓库 + 第三方） */
  async mainList (e) {
    if (!(await guardLayout(e))) return true

    const roleName = resolveRoleName(
      e.msg.replace(/#|面板图列表/g, '').trim()
    )

    if (!roleName) {
      return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    }

    const files = listRoleImages(roleName, 'normal')
    if (files.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无面板图`)
    }
    return this._renderList(e, roleName, files, 'main')
  }

  /** 屏蔽列表（屏蔽图库 + 各源 .bak） */
  async blockedList (e) {
    if (!(await guardLayout(e))) return true

    let roleName = e.msg.replace(/^#/, '').replace(/面板图屏蔽列表$/, '').trim()
    if (!roleName) return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    roleName = resolveRoleName(roleName)

    const blocked = getBlockedAggregated(roleName)
    if (blocked.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无屏蔽面板图`)
    }
    return this._renderList(e, roleName, blocked, 'blocked')
  }

  /**
   * 渲染列表的共用逻辑
   * @param {object} e - 消息事件
   * @param {string} roleName - 角色名
   * @param {Array} items - [{ name, displayN, label, filePath }]
   * @param {'main'|'blocked'} mode - 全部图库源还是屏蔽图库
   */
  async _renderList (e, roleName, items, mode) {
    // 合并转发节点数过多会导致发送失败，最多展示 20 张，超量提示可视化
    const MAX_DISPLAY = 20
    const displayItems = items.slice(0, MAX_DISPLAY)
    const overflow = items.length - MAX_DISPLAY

    const forwardItems = []

    // 首段：传统说明
    const action = mode === 'main'
      ? `可输入【#删除${roleName}面板图(序列号)】进行删除（带源名的为第三方图库，需在源仓库中管理）`
      : `可输入【#启用${roleName}面板图(序列号)】进行恢复`
    forwardItems.push({
      message: `当前查看的是${roleName}面板图，共${items.length}张，${action}`
    })

    // 后续：序号（或源名）. 文件名 + 图片
    for (const item of displayItems) {
      const filePath = item.filePath || item.sourceFile
      const title = item.displayN !== null && item.displayN !== undefined
        ? `${item.displayN}. ${item.name}`
        : `[${item.label || '第三方'}] ${item.name}`
      forwardItems.push({
        message: [title, segment.image('file://' + filePath)]
      })
    }

    // 溢出提示：数量过多时引导使用可视化
    if (overflow > 0) {
      forwardItems.push({
        message: `...及其他 ${overflow} 张面板图未展示\n过多请使用 #${roleName}面板图可视化 查看全部`
      })
    }

    try {
      const forwardMsg = e.group?.makeForwardMsg
        ? await e.group.makeForwardMsg(forwardItems)
        : e.friend?.makeForwardMsg
          ? await e.friend.makeForwardMsg(forwardItems)
          : await Bot.makeForwardMsg(forwardItems)
      const sendRes = await e.reply(forwardMsg)
      if (!sendRes) {
        e.reply('[面板图图库管理器]\n消息发送失败，可能是风控，请稍后重试')
      }
    } catch {
      e.reply('[面板图图库管理器]\n消息发送失败，可能是风控，请稍后重试')
    }
    return true
  }
}
