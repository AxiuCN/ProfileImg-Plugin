import fs from 'node:fs'
import path from 'node:path'
import { getMainDir, getBlockedDir } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { sortPanelFiles } from '../components/panelUtils.js'

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
    roleName = resolveRoleName(roleName)
    const n = parseInt(match[2]) || 1

    const mainDir = getMainDir(roleName)
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(mainDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)

    const targetFile = this._findByN(mainDir, roleName, n)
    if (!targetFile) {
      const total = fs.readdirSync(mainDir).filter(f => {
        const fp = path.join(mainDir, f)
        return /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(fp).isFile()
      }).length
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${total}张图`)
    }

    const srcFile = path.join(mainDir, targetFile)
    if (!fs.existsSync(blockedDir)) fs.mkdirSync(blockedDir, { recursive: true })
    let destFile = path.join(blockedDir, targetFile)
    if (fs.existsSync(destFile)) {
      const ext = path.extname(targetFile)
      const base = path.basename(targetFile, ext)
      let counter = 1
      while (fs.existsSync(path.join(blockedDir, `${base}_dup${counter}${ext}`))) counter++
      destFile = path.join(blockedDir, `${base}_dup${counter}${ext}`)
    }
    fs.renameSync(srcFile, destFile)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${n}张图移入屏蔽图库(${path.basename(destFile)})`)
  }

  async unblockImg(e) {
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^启用(.+?)(屏蔽)?面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #启用角色名面板图 序号')
    let roleName = match[1].trim()
    roleName = resolveRoleName(roleName)
    const n = parseInt(match[3]) || 1

    const blockedDir = getBlockedDir(roleName)
    const mainDir = getMainDir(roleName)
    if (!fs.existsSync(blockedDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无屏蔽面板图`)

    const targetFile = this._findByN(blockedDir, roleName, n)
    if (!targetFile) {
      const total = fs.readdirSync(blockedDir).filter(f => {
        const fp = path.join(blockedDir, f)
        return /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(fp).isFile()
      }).length
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${total}张屏蔽图`)
    }

    const srcFile = path.join(blockedDir, targetFile)
    let destFile = path.join(mainDir, targetFile)
    if (fs.existsSync(destFile)) {
      const ext = path.extname(targetFile)
      const base = path.basename(targetFile, ext)
      let counter = 1
      while (fs.existsSync(path.join(mainDir, `${base}_dup${counter}${ext}`))) counter++
      destFile = path.join(mainDir, `${base}_dup${counter}${ext}`)
    }
    fs.renameSync(srcFile, destFile)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${n}张屏蔽图移回主图库(${path.basename(destFile)})`)
  }

  /**
   * 按 n 查找文件（n 对应文件名中的序号，非数组下标）
   * @param {string} dir - 目录
   * @param {string} roleName - 角色名
   * @param {number} n - 序号
   * @returns {string|null} 匹配的文件名
   */
  _findByN(dir, roleName, n) {
    const imgNames = fs.readdirSync(dir).filter(f => {
      const fp = path.join(dir, f)
      return /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(fp).isFile()
    })

    const sorted = sortPanelFiles(imgNames, roleName)

    let nonStdIdx = 0
    for (const item of sorted) {
      if (item.parsed.isStandard) {
        if (item.parsed.seq === n) return item.name
      } else {
        if (100001 + nonStdIdx === n) return item.name
        nonStdIdx++
      }
    }
    return null
  }
}
