import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getMainDir } from '../model/blockedInfo.js'

/**
 * 面板图列表 — 接管 miao-plugin 的 #xxx面板图列表
 * 优先级 1，显示版权归属信息
 */
export class ProfileImgListV2 extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图列表',
      dsc: '列出面板图（含版权信息）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?\s*(.+)(?:面板图列表)\s*$/, fnc: 'list' }
      ]
    })
  }

  async list(e) {
    const roleName = resolveRoleName(
      e.msg.replace(/#|面板图列表/g, '').trim()
    )

    if (!roleName) {
      return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    }

    const charDir = getMainDir(roleName)
    if (!fs.existsSync(charDir)) {
      return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无面板图`)
    }

    const imgs = fs.readdirSync(charDir)
      .filter(f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f))

    if (imgs.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无面板图`)
    }

    // 尝试按序号排序（新命名格式）
    const sorted = imgs.sort((a, b) => {
      const numA = parseInt(a.match(new RegExp(`^${this._escapeRegExp(roleName)}(\\d+)`))?.[1] || '0')
      const numB = parseInt(b.match(new RegExp(`^${this._escapeRegExp(roleName)}(\\d+)`))?.[1] || '0')
      return numA - numB
    })

    // 构建合并转发消息
    const forwardItems = []
    // 第一段：摘要
    const partsList = sorted.map((f, i) => {
      const info = this._parseAttribution(f, roleName)
      return `${i + 1}. ${f}${info ? ` — ${info}` : ''}`
    })
    forwardItems.push({
      message: `当前查看的是${roleName}面板图，共${sorted.length}张\n` +
        `可输入【#删除${roleName}面板图(序列号)】进行移除\n\n` +
        partsList.join('\n')
    })

    // 后续：图片预览
    for (let i = 0; i < sorted.length; i++) {
      const filePath = path.join(charDir, sorted[i])
      forwardItems.push({
        message: `${i + 1}. ` + segment.image('file://' + filePath)
      })
    }

    try {
      const forwardMsg = await e.group?.makeForwardMsg?.(forwardItems)
        || await Bot.makeForwardMsg?.(forwardItems)
      if (forwardMsg) {
        return e.reply(forwardMsg)
      }
      // 回退到纯文本
      return e.reply(partsList.join('\n'))
    } catch {
      return e.reply('[面板图图库管理器]\n消息发送失败，可能是风控，请稍后重试')
    }
  }

  /**
   * 解析文件名的版权归属信息
   * 格式：<角色名><序号>_<原作者>_<来源>[_<二改>]
   */
  _parseAttribution(filename, roleName) {
    const escaped = this._escapeRegExp(roleName)
    const match = filename.match(new RegExp(`^${escaped}\\d+_(.+?)_(.+?)(?:_(.+?))?\\.`))
    if (!match) return null
    const author = match[1]
    const source = match[2]
    const mods = match[3]
    return `作者：${author} / 来源：${source}${mods ? ` / 二改：${mods}` : ''}`
  }

  _escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
