import fs from 'node:fs'
import path from 'node:path'
import { getMainDir, getBlockedDir } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { sortPanelFiles } from '../components/panelUtils.js'

/**
 * 面板图列表 — 接管 miao-plugin 的 #xxx面板图列表 + 屏蔽列表
 * 优先级 1（主列表接管 miao-plugin）+ 5（屏蔽列表）
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

  /** 主图库列表 */
  async mainList(e) {
    const roleName = resolveRoleName(
      e.msg.replace(/#|面板图列表/g, '').trim()
    )

    if (!roleName) {
      return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    }

    const charDir = getMainDir(roleName)
    return this._renderList(e, charDir, roleName, 'main')
  }

  /** 屏蔽图库列表 */
  async blockedList(e) {
    let roleName = e.msg.replace(/^#/, '').replace(/面板图屏蔽列表$/, '').trim()
    if (!roleName) return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    roleName = resolveRoleName(roleName)
    const charDir = getBlockedDir(roleName)
    return this._renderList(e, charDir, roleName, 'blocked')
  }

  /**
   * 渲染列表的共用逻辑
   * @param {'main'|'blocked'} mode - 主图库还是屏蔽图库
   */
  async _renderList(e, charDir, roleName, mode) {
    if (!fs.existsSync(charDir)) {
      const hint = mode === 'main'
        ? `角色「${roleName}」暂无面板图`
        : `角色「${roleName}」暂无屏蔽面板图`
      return e.reply(`[面板图图库管理器]\n${hint}`)
    }

    const imgFiles = fs.readdirSync(charDir)
      .filter(f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f))

    if (imgFiles.length === 0) {
      const hint = mode === 'main'
        ? `角色「${roleName}」暂无面板图`
        : `角色「${roleName}」的屏蔽文件夹为空`
      return e.reply(`[面板图图库管理器]\n${hint}`)
    }

    // 排序：标准文件按 n 升序，非标准按字母序
    const sorted = sortPanelFiles(imgFiles, roleName)

    // 构建合并转发消息
    const forwardItems = []

    // 首段：传统说明
    const action = mode === 'main'
      ? `可输入【#删除${roleName}面板图(序列号)】进行删除`
      : `可输入【#启用${roleName}面板图(序列号)】进行恢复`
    forwardItems.push({
      message: `当前查看的是${roleName}面板图，共${sorted.length}张，${action}`
    })

    // 后续：n. 文件名 + 图片
    let nonStdIdx = 0
    for (const item of sorted) {
      let displayN
      if (item.parsed.isStandard) {
        displayN = item.parsed.seq
      } else {
        displayN = 100001 + nonStdIdx
        nonStdIdx++
      }
      const filePath = path.join(charDir, item.name)
      forwardItems.push({
        message: `${displayN}. ${item.name}` + segment.image('file://' + filePath)
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
