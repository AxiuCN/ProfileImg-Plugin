import fs from 'node:fs'
import path from 'node:path'
import { getMainDir, getBlockedDir, resolveRoleName } from './utils.js'

export class MoveBlockImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]迁移',
      dsc: '屏蔽/启用面板图',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#屏蔽(.+)面板图\\s*(\\d*)$', fnc: 'blockImg', permission: 'master' },
        { reg: '^#启用(.+?)(屏蔽)?面板图\\s*(\\d*)$', fnc: 'unblockImg', permission: 'master' }
      ]
    })
  }

  async blockImg(e) {
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^屏蔽(.+)面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #屏蔽角色名面板图 序号')
    let roleName = match[1].trim()
    roleName = await resolveRoleName(roleName)
    const idx = parseInt(match[2]) || 1
    const mainDir = getMainDir(roleName)
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(mainDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    const mainFiles = fs.readdirSync(mainDir).filter(f => {
      const fullPath = path.join(mainDir, f)
      return /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(fullPath).isFile()
    })
    if (mainFiles.length === 0) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    if (idx < 1 || idx > mainFiles.length) return e.reply(`[面板图图库管理器]\n序号无效，当前有${mainFiles.length}张图`)
    const srcFile = path.join(mainDir, mainFiles[idx - 1])
    if (!fs.existsSync(blockedDir)) fs.mkdirSync(blockedDir, { recursive: true })
    let destFile = path.join(blockedDir, mainFiles[idx - 1])
    if (fs.existsSync(destFile)) {
      const ext = path.extname(mainFiles[idx - 1])
      const base = path.basename(mainFiles[idx - 1], ext)
      let counter = 1
      while (fs.existsSync(path.join(blockedDir, `${base}_${counter}${ext}`))) counter++
      destFile = path.join(blockedDir, `${base}_${counter}${ext}`)
    }
    fs.renameSync(srcFile, destFile)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${idx}张图移入屏蔽图库(${path.basename(destFile)})`)
  }

  async unblockImg(e) {
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^启用(.+?)(屏蔽)?面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #启用角色名面板图 序号')
    let roleName = match[1].trim()
    roleName = await resolveRoleName(roleName)
    const idx = parseInt(match[3]) || 1
    const blockedDir = getBlockedDir(roleName)
    const mainDir = getMainDir(roleName)
    if (!fs.existsSync(blockedDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无屏蔽面板图`)
    const blockedFiles = fs.readdirSync(blockedDir).filter(f => {
      const fullPath = path.join(blockedDir, f)
      return /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(fullPath).isFile()
    })
    if (blockedFiles.length === 0) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无屏蔽面板图`)
    if (idx < 1 || idx > blockedFiles.length) return e.reply(`[面板图图库管理器]\n序号无效，当前有${blockedFiles.length}张屏蔽图`)
    const srcFile = path.join(blockedDir, blockedFiles[idx - 1])
    let destFile = path.join(mainDir, blockedFiles[idx - 1])
    if (fs.existsSync(destFile)) {
      const ext = path.extname(blockedFiles[idx - 1])
      const base = path.basename(blockedFiles[idx - 1], ext)
      let counter = 1
      while (fs.existsSync(path.join(mainDir, `${base}_${counter}${ext}`))) counter++
      destFile = path.join(mainDir, `${base}_${counter}${ext}`)
    }
    fs.renameSync(srcFile, destFile)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${idx}张屏蔽图移回主图库(${path.basename(destFile)})`)
  }
}