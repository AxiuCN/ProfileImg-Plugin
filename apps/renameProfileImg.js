import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { resolveNRange, escapeRegExp } from '../components/panelUtils.js'
import { guardLayout } from '../model/layoutGuard.js'
import { mainRepoLockIdForPath } from '../model/galleryConfig.js'
import { acquireLocks } from '../model/git.js'

/**
 * #重命名角色名面板图N 作者 来源 [备注]
 * 修改面板图的版权归属信息（重命名文件）
 *
 * 多图库源布局：按段位定位所在源后就地重命名
 *   main(1~9999)         → 主仓库文件
 *   default(10001~99999) → 默认图库文件（保留「原名」备注段）
 * 第三方图库图片不参与序号，不可重命名
 */
export class RenameProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]重命名',
      dsc: '重命名面板图（更新版权信息）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: /^#?\s*重命名(.+?)面板图(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/, fnc: 'rename', permission: 'master' }
      ]
    })
  }

  async rename (e) {
    if (!(await guardLayout(e))) return true

    // 非贪婪 (.+?) 捕获角色名，"面板图"分隔，(\d+) 捕获序号 N
    const match = e.msg.match(/^#?\s*重命名(.+?)面板图(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
    if (!match) return true

    const rawRole = match[1].trim()
    const seqNum = parseInt(match[2], 10)
    const author = match[3].trim()
    const source = match[4].trim()
    const modifications = (match[5] || '').trim()

    const roleName = resolveRoleName(rawRole)

    const target = findImageByN(roleName, 'normal', seqNum)
    if (!target) {
      return e.reply([
        `[面板图图库管理器]\n角色${roleName}没有序号为${seqNum}的面板图\n`,
        '（第三方图库的图片不参与序号，不可重命名）'
      ].join(''))
    }

    const { source: segSource } = resolveNRange(seqNum)
    if (segSource === 'third-party') {
      return e.reply('[面板图图库管理器]\n第三方图库的面板图不可重命名')
    }
    if (segSource === 'unknown') {
      return e.reply(`[面板图图库管理器]\n${target.name} 不是标准命名，无法重命名`)
    }

    // 标准命名即可重命名（含版权 角色_n_作者_来源 / 无版权 角色_n）
    const stdPattern = new RegExp(`^${escapeRegExp(roleName)}_(\\d+)(?:_.+)?\\.(webp|png|jpg|jpeg|gif)$`, 'i')
    if (!stdPattern.test(target.name)) {
      return e.reply(`[面板图图库管理器]\n${target.name} 不是标准命名，无法重命名`)
    }

    // 新文件名非法字符检测（Windows 文件名禁止 < > : " / \ | ? * 及控制字符）
    const ILLEGAL = /[<>:"\/\\|?*]/
    const labels = [author, source, modifications]
    const badLabels = ['作者', '来源', '备注']
    const bad = badLabels.filter((_, i) => labels[i] && ILLEGAL.test(labels[i]))
    if (bad.length) {
      return e.reply(`[面板图图库管理器]\n${target.name} 重命名失败：${bad.join('、')}含非法字符\n（文件名不允许出现 < > : " / \\ | ? * 等字符）`)
    }

    // 下划线是文件名各部分的固定分隔符，含下划线会导致版权解析错乱
    const badUnder = badLabels.filter((_, i) => labels[i] && labels[i].includes('_'))
    if (badUnder.length) {
      return e.reply(`[面板图图库管理器]\n${target.name} 重命名失败：${badUnder.join('、')}不允许包含下划线（_）\n（下划线是文件名各部分的固定分隔符）`)
    }

    const modsPart = modifications ? `_${modifications}` : ''
    // 默认图库文件带「原名」备注段（迁移时保留），重命名时继续保留
    const keptNote = extractOriginalNote(target.name)

    try {
      const oldExt = path.extname(target.name)
      const newFile = `${roleName}_${seqNum}_${author}_${source}${modsPart}${keptNote ? `_${keptNote}` : ''}${oldExt}`
      if (target.name === newFile) {
        return e.reply(`[面板图图库管理器]\n${roleName}序号${seqNum}版权信息未变化，无需重命名`)
      }
      // 主仓库内的文件与 Git 更新共用源级锁（默认图库无需加锁）
      const lockId = mainRepoLockIdForPath(target.dir)
      const galleryLock = acquireLocks(lockId ? [{ id: lockId, operation: '重命名面板图', type: 'update' }] : [])
      if (!galleryLock.ok) return e.reply(`[面板图图库管理器] ${galleryLock.msg}`)
      try {
        fs.renameSync(target.filePath, path.join(path.dirname(target.filePath), newFile))
      } finally {
        galleryLock.release()
      }
      const label = target.source === 'default' ? '默认图库' : target.label
      return e.reply([
        `[面板图图库管理器]\n已将${label}中${roleName}序号${seqNum}重命名`,
        `原文件：${target.name}`,
        `新文件：${newFile}`
      ].join('\n'))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 重命名失败:', err)
      return e.reply('[面板图图库管理器] 重命名失败: ' + err.message)
    }
  }
}

/**
 * 提取文件名中的「原名」备注段（迁移时保留的原文件名）
 * 琴_10001_张三_米游社_「琴_1_张三_米游社」.webp → 「琴_1_张三_米游社」
 * @param {string} filename
 * @returns {string} 含「」的备注段；无则空串
 */
function extractOriginalNote (filename) {
  const m = filename.match(/(「[^」]*」)/)
  return m ? m[1] : ''
}
