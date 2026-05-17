import fs from 'node:fs'
import path from 'node:path'
import { getBlockedDir } from '../components/blockedInfo.js'
import { resolveRoleName } from '../components/alias.js'

export class ProfileImgList extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]列表',
      dsc: '查看屏蔽面板图列表',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#(.+)面板图屏蔽列表$', fnc: 'blockedImgList' }
      ]
    })
  }

  async blockedImgList(e) {
    let roleName = e.msg.replace(/^#/, '').replace(/面板图屏蔽列表$/, '').trim()
    if (!roleName) return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    roleName = resolveRoleName(roleName)
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(blockedDir)) return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无屏蔽面板图`)
    const imgFiles = fs.readdirSync(blockedDir).filter(file => /\.(webp|png|jpg|jpeg|gif)$/i.test(file))
    if (imgFiles.length === 0) return e.reply(`[面板图图库管理器]\n角色「${roleName}」的屏蔽文件夹为空`)
    const msgList = []
    msgList.push({ message: [`当前查看的是${roleName}面板图,共${imgFiles.length}张，可输入【#删除${roleName}面板图(序列号)】进行删除，可输入【#启用${roleName}面板图(序列号)】进行恢复`] })
    imgFiles.forEach((file, idx) => {
      const imgPath = path.join(blockedDir, file)
      msgList.push({ message: [`${idx + 1}.`, segment.image(`file://${imgPath}`)] })
    })
    const forwardMsg = e.group?.makeForwardMsg
      ? await e.group.makeForwardMsg(msgList)
      : e.friend?.makeForwardMsg
        ? await e.friend.makeForwardMsg(msgList)
        : await Bot.makeForwardMsg(msgList)
    const sendRes = await e.reply(forwardMsg)
    if (!sendRes) e.reply('[面板图图库管理器]\n消息发送失败，可能是风控，请稍后重试')
    return true
  }
}