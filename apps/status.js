import fs from 'node:fs'
import { GALLERY_PATH, BLOCKED_GALLERY_PATH } from '../components/constants.js'
import { checkGallery, checkBlockedGallery } from '../components/gallery.js'
import { formatSize, getDirSize, countImages } from '../components/format.js'
import { getLocalVersion, getLocalVersionAt } from '../components/version.js'
import { getBlockedInfo } from '../components/blockedInfo.js'

export class Status extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]状态',
      dsc: '查看图库状态',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库状态$', fnc: 'status' },
        { reg: '^#屏蔽图库状态$', fnc: 'blockedStatus' },
        { reg: '^#图库状态$', fnc: 'overallStatus' }
      ]
    })
  }

  async status(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    const files = fs.readdirSync(GALLERY_PATH, { withFileTypes: true })
    const charCount = files.filter(f => f.isDirectory() && f.name !== '.git').length
    const imageCount = countImages(GALLERY_PATH)
    const totalSize = getDirSize(GALLERY_PATH)
    const version = getLocalVersion()
    let msg = '[面板图图库管理器] 主图库\n'
    msg += '角色数：' + charCount + '\n'
    msg += '图片数：' + imageCount + '\n'
    msg += '总大小：' + formatSize(totalSize) + '\n'
    if (version) {
      msg += '版本：' + version.sha + '\n'
      msg += '时间：' + version.date + '\n'
    } else {
      msg += '无法获取版本信息\n'
    }
    return e.reply(msg)
  }

  async blockedStatus(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)
    const { charCount, totalSize, imageCount } = getBlockedInfo()
    const version = getLocalVersionAt(BLOCKED_GALLERY_PATH)
    let msg = '[面板图图库管理器] 屏蔽图库\n'
    msg += '屏蔽角色数：' + charCount + '\n'
    msg += '屏蔽图片数：' + imageCount + '\n'
    msg += '总大小：' + formatSize(totalSize) + '\n'
    if (version) {
      msg += '版本：' + version.sha + '\n'
      msg += '时间：' + version.date + '\n'
    } else {
      msg += '无法获取版本信息\n'
    }
    return e.reply(msg)
  }

  async overallStatus(e) {
    const mainCheck = checkGallery()
    const blockedCheck = checkBlockedGallery()
    let msg = '[面板图图库管理器] 总览\n'
    if (mainCheck.ok) {
      const files = fs.readdirSync(GALLERY_PATH, { withFileTypes: true })
      const mainCharCount = files.filter(f => f.isDirectory() && f.name !== '.git').length
      const imageCount = countImages(GALLERY_PATH)
      const mainSize = getDirSize(GALLERY_PATH)
      const mainVer = getLocalVersion()
      msg += '\n主图库：\n'
      msg += '  角色数：' + mainCharCount + '\n'
      msg += '  图片数：' + imageCount + '\n'
      msg += '  大小：' + formatSize(mainSize) + '\n'
      msg += mainVer ? '  版本：' + mainVer.sha + '\n' : '  版本：未知\n'
    } else {
      msg += '\n主图库：未安装\n'
    }
    if (blockedCheck.ok) {
      const { charCount, totalSize, imageCount } = getBlockedInfo()
      const blockedVer = getLocalVersionAt(BLOCKED_GALLERY_PATH)
      msg += '\n屏蔽图库：\n'
      msg += '  屏蔽角色数：' + charCount + '\n'
      msg += '  屏蔽图片数：' + imageCount + '\n'
      msg += '  大小：' + formatSize(totalSize) + '\n'
      msg += blockedVer ? '  版本：' + blockedVer.sha + '\n' : '  版本：未知\n'
    } else {
      msg += '\n屏蔽图库：未安装\n'
    }
    return e.reply(msg)
  }
}