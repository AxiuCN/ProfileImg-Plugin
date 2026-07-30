import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getMainDir } from '../model/blockedInfo.js'
import { escapeRegExp } from '../components/panelUtils.js'

/**
 * #重命名角色名N 作者 来源 [二改情况]
 * 修改面板图的版权归属信息（重命名文件），N 为文件名中的序号
 */
export class RenameProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]重命名',
      dsc: '重命名面板图（更新版权信息）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: /^#?\s*重命名(.+?)(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/, fnc: 'rename', permission: 'master' }
      ]
    })
  }

  async rename(e) {
    // 非贪婪 (.+?) 捕获角色名，(\d+) 捕获序号 N
    const match = e.msg.match(/^#?\s*重命名(.+?)(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
    if (!match) return true

    const rawRole = match[1].trim()
    const seqNum = parseInt(match[2], 10)
    const author = match[3].trim()
    const source = match[4].trim()
    const modifications = (match[5] || '').trim()

    const roleName = resolveRoleName(rawRole)
    const charDir = getMainDir(roleName)

    if (!fs.existsSync(charDir)) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    }

    // 扫描角色目录，匹配标准含版权格式：角色名_n_作者_来源[_二改].扩展名
    const pattern = new RegExp(`^${escapeRegExp(roleName)}_(\\d+)_.+\\.(webp|png|jpg|jpeg|gif)$`, 'i')
    const files = fs.readdirSync(charDir).filter(f => pattern.test(f))

    if (files.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无标准格式的面板图可重命名`)
    }

    // 按 n 查找目标文件
    const oldFile = files.find(f => {
      const m = f.match(pattern)
      return m && parseInt(m[1], 10) === seqNum
    })

    if (!oldFile) {
      return e.reply(`[面板图图库管理器]\n未找到序号为${seqNum}的面板图，当前有${files.length}张标准格式图`)
    }

    const oldExt = path.extname(oldFile)
    const modsPart = modifications ? `_${modifications}` : ''
    const newFile = `${roleName}_${seqNum}_${author}_${source}${modsPart}${oldExt}`

    if (oldFile === newFile) {
      return e.reply(`[面板图图库管理器]\n${roleName}序号${seqNum}版权信息未变化，无需重命名`)
    }

    try {
      fs.renameSync(path.join(charDir, oldFile), path.join(charDir, newFile))
      return e.reply(`[面板图图库管理器]\n已将${roleName}序号${seqNum}重命名\n原文件：${oldFile}\n新文件：${newFile}`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 重命名失败:', err)
      return e.reply('[面板图图库管理器] 重命名失败: ' + err.message)
    }
  }
}
