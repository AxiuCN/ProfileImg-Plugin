import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getRoleFiles } from '../model/blockedInfo.js'
import { resolveNRange, escapeRegExp } from '../components/panelUtils.js'
import { getDefaultDir } from '../model/galleryConfig.js'

/**
 * #重命名角色名面板图N 作者 来源 [备注]
 * 修改面板图的版权归属信息（重命名文件），N 按段位判断来源：
 *   main(1~9999)      → 主仓库直接更名
 *   default(10001~)   → 主仓库副本 + default 源文件同步更名
 *   third-party(≥100001) → 拒绝（第三方不接受重命名）
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

  async rename(e) {
    // 非贪婪 (.+?) 捕获角色名，"面板图"分隔，(\d+) 捕获序号 N
    const match = e.msg.match(/^#?\s*重命名(.+?)面板图(\d+)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
    if (!match) return true

    const rawRole = match[1].trim()
    const seqNum = parseInt(match[2], 10)
    const author = match[3].trim()
    const source = match[4].trim()
    const modifications = (match[5] || '').trim()

    const roleName = resolveRoleName(rawRole)

    const files = getRoleFiles(roleName, 'normal')
    const target = files.find(f => f.displayN === seqNum)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}没有序号为${seqNum}的面板图`)
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
    const badLabels = ['作者', '来源', '备注']
    const bad = badLabels.filter((_, i) => [author, source, modifications][i] && ILLEGAL.test([author, source, modifications][i]))
    if (bad.length) {
      return e.reply(`[面板图图库管理器]\n${target.name} 重命名失败：${bad.join('、')}含非法字符\n（文件名不允许出现 < > : " / \\ | ? * 等字符）`)
    }

    // 下划线是文件名各部分的固定分隔符，含下划线会导致版权解析错乱
    const underscoreLabels = ['作者', '来源', '备注']
    const badUnder = underscoreLabels.filter((_, i) => [author, source, modifications][i] && [author, source, modifications][i].includes('_'))
    if (badUnder.length) {
      return e.reply(`[面板图图库管理器]\n${target.name} 重命名失败：${badUnder.join('、')}不允许包含下划线（_）\n（下划线是文件名各部分的固定分隔符）`)
    }

    const modsPart = modifications ? `_${modifications}` : ''

    try {
      if (segSource === 'main') {
        // 主图库：直接重命名
        const oldExt = path.extname(target.name)
        const newFile = `${roleName}_${seqNum}_${author}_${source}${modsPart}${oldExt}`
        if (target.name === newFile) {
          return e.reply(`[面板图图库管理器]\n${roleName}序号${seqNum}版权信息未变化，无需重命名`)
        }
        fs.renameSync(target.filePath, path.join(path.dirname(target.filePath), newFile))
        return e.reply(`[面板图图库管理器]\n已将${roleName}序号${seqNum}重命名\n原文件：${target.name}\n新文件：${newFile}`)
      }

      // default 复制：主仓库副本 + default 源文件同步更名（保持一致性）
      const origName = extractDefaultOriginal(target.name, roleName)
      if (!origName) {
        return e.reply(`[面板图图库管理器]\n${target.name} 无法解析 default 源文件名`)
      }
      const defaultFile = path.join(getDefaultDir(), 'normal-character', roleName, origName)
      if (!fs.existsSync(defaultFile)) {
        return e.reply(`[面板图图库管理器]\ndefault 源文件未找到（${origName}），无法同步重命名`)
      }

      const dSeq = extractDefaultSeq(origName, roleName)
      const oldExt = path.extname(defaultFile)
      const newDefaultName = `${roleName}_${dSeq}_${author}_${source}${modsPart}${oldExt}`
      const newDefaultPath = path.join(path.dirname(defaultFile), newDefaultName)

      fs.renameSync(defaultFile, newDefaultPath)
      // 主仓库副本原名部分同步更新
      const mainRoleDir = path.dirname(target.filePath)
      const newCopyName = `${roleName}_${seqNum}_本地默认图库_默认_${newDefaultName}`
      fs.renameSync(target.filePath, path.join(mainRoleDir, newCopyName))

      return e.reply([
        `[面板图图库管理器]\n已将${roleName}序号${seqNum}重命名`,
        `主仓库副本：${target.name} → ${newCopyName}`,
        `default 源文件：${origName} → ${newDefaultName}`
      ].join('\n'))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 重命名失败:', err)
      return e.reply('[面板图图库管理器] 重命名失败: ' + err.message)
    }
  }
}

/**
 * 从 default 复制文件名提取 default 图库源文件名
 * 琴_10001_本地默认图库_默认_fav01.webp → fav01.webp
 * @param {string} filename
 * @param {string} roleName
 * @returns {string|null}
 */
function extractDefaultOriginal(filename, roleName) {
  const esc = escapeRegExp(roleName)
  const m = filename.match(new RegExp(`^${esc}_\\d+_本地默认图库_默认_(.+)$`, 'i'))
  return m ? m[1] : null
}

/**
 * 从 default 源文件名提取 default 图库内序号
 * 琴_5_张三_米游社.webp → 5
 * @param {string} origName - default 源文件名
 * @param {string} roleName
 * @returns {number}
 */
function extractDefaultSeq(origName, roleName) {
  const esc = escapeRegExp(roleName)
  const m = origName.match(new RegExp(`^${esc}_(\\d+)`))
  return m ? parseInt(m[1], 10) : 1
}
