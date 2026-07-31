import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { buildRepos } from '../model/repoRegistry.js'
import { findByDisplayN, escapeRegExp } from '../components/panelUtils.js'
import { createPanelLink, removePanelLink } from '../model/linkAggregator.js'

/**
 * #重命名角色名N 作者 来源 [二改情况]
 * 修改面板图的版权归属信息（重命名文件），N 为聚合层 display n
 * 仅作用于主图库文件（可 push），第三方/default/迁移不可重命名
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

    const repos = buildRepos()
    const target = findByDisplayN(roleName, seqNum, 'normal', repos)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}没有序号为${seqNum}的面板图`)
    }
    if (target.repo.type !== 'main') {
      return e.reply('[面板图图库管理器]\n仅主图库的面板图可重命名')
    }

    const oldFile = target.name
    // 仅标准含版权格式可重命名
    const stdPattern = new RegExp(`^${escapeRegExp(roleName)}_(\\d+)_.+\\.(webp|png|jpg|jpeg|gif)$`, 'i')
    if (!stdPattern.test(oldFile)) {
      return e.reply(`[面板图图库管理器]\n${oldFile} 不是标准含版权格式，无法重命名`)
    }

    const oldExt = path.extname(oldFile)
    const modsPart = modifications ? `_${modifications}` : ''
    const newFile = `${roleName}_${seqNum}_${author}_${source}${modsPart}${oldExt}`

    if (oldFile === newFile) {
      return e.reply(`[面板图图库管理器]\n${roleName}序号${seqNum}版权信息未变化，无需重命名`)
    }

    try {
      // 重命名源文件 + 重建聚合链接
      const oldPath = target.sourceFile
      const newPath = path.join(path.dirname(oldPath), newFile)
      fs.renameSync(oldPath, newPath)
      removePanelLink(oldFile, 'normal', roleName)
      createPanelLink(newPath, newFile, 'normal', roleName)
      return e.reply(`[面板图图库管理器]\n已将${roleName}序号${seqNum}重命名\n原文件：${oldFile}\n新文件：${newFile}`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 重命名失败:', err)
      return e.reply('[面板图图库管理器] 重命名失败: ' + err.message)
    }
  }
}
