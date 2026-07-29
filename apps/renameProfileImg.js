import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getMainDir } from '../model/blockedInfo.js'

/**
 * #重命名xxx面板图 <序号> <原作者> <来源> [二改情况]
 * 修改面板图的版权归属信息（重命名文件）
 */
export class RenameProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]重命名',
      dsc: '重命名面板图（更新版权信息）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: /^#?\s*重命名(.+)(?:面板图)\s+(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/, fnc: 'rename', permission: 'master' }
      ]
    })
  }

  async rename(e) {
    const match = e.msg.match(/^#?\s*重命名(.+)(?:面板图)\s+(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
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

    // 扫描角色目录，按序号排序（匹配 <角色名><序号>_* 格式）
    const pattern = new RegExp(`^${this._escapeRegExp(roleName)}(\\d+)_.+\\.(webp|png|jpg|jpeg|gif)$`, 'i')
    const files = fs.readdirSync(charDir)
      .filter(f => pattern.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(pattern)?.[1] || '0', 10)
        const nb = parseInt(b.match(pattern)?.[1] || '0', 10)
        return na - nb
      })

    if (seqNum < 1 || seqNum > files.length) {
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${files.length}张图`)
    }

    const oldFile = files[seqNum - 1]
    const oldExt = path.extname(oldFile)
    const modsPart = modifications ? `_${modifications}` : ''
    const newFile = `${roleName}${seqNum}_${author}_${source}${modsPart}${oldExt}`

    if (oldFile === newFile) {
      return e.reply(`[面板图图库管理器]\n${roleName}第${seqNum}张图版权信息未变化，无需重命名`)
    }

    try {
      fs.renameSync(path.join(charDir, oldFile), path.join(charDir, newFile))
      return e.reply(`[面板图图库管理器]\n已将${roleName}第${seqNum}张图重命名\n原文件：${oldFile}\n新文件：${newFile}`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 重命名失败:', err)
      return e.reply('[面板图图库管理器] 重命名失败: ' + err.message)
    }
  }

  _escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
