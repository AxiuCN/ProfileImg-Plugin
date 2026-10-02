import fs from 'node:fs'
import path from 'node:path'
import { getBlockedDir, getBlockedAggregated } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { findImageByN, findBlockedByN } from '../model/galleryIndex.js'
import { resolveNRange, escapeRegExp, resolveGalleryKey } from '../components/panelUtils.js'
import { getRepoForChar } from '../model/mapJson.js'
import { getRepoDir } from '../components/constants.js'
import { isManager, canAccessGallery } from '../components/config.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 屏蔽/启用面板图（多图库源布局）
 *
 * 段位决定屏蔽方式：
 *   main(1~9999)         → 源文件移入 blocked-character 屏蔽图库（可 push），按空位重排 n
 *   default(10001~99999) → 默认图库内文件改 .bak（miao 只认 4 种后缀，天然不可见）
 * 第三方图库源不参与段位寻址，需在源仓库中自行管理
 */
export class MoveBlockImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]迁移',
      dsc: '屏蔽/启用面板图',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#屏蔽(.+)面板图\\s*(\\d*)$', fnc: 'blockImg' },
        { reg: '^#启用(.+?)(屏蔽)?面板图\\s*(\\d*)$', fnc: 'unblockImg' }
      ]
    })
  }

  async blockImg (e) {
    if (!(await guardLayout(e))) return true
    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^屏蔽(.+)面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #屏蔽角色名面板图 序号')
    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[2]) || 1

    const target = findImageByN(roleName, 'normal', n)
    if (!target) {
      return e.reply([
        `[面板图图库管理器]\n序号无效：角色${roleName}没有第${n}张图\n`,
        '（第三方图库的图片不参与序号，请在源仓库中管理）'
      ].join(''))
    }

    // 成员图库边界：目标图所属图库须被允许
    if (!e.isMaster) {
      const gkey = resolveGalleryKey(target.name, roleName, n)
      if (!gkey || !canAccessGallery(e.user_id, gkey)) {
        return e.reply(`[面板图图库管理器]\n你未被授权操作「${gkey || '未知'}」图库的面板图`)
      }
    }

    const { source } = resolveNRange(n)
    if (source === 'main') {
      return this._blockMain(e, roleName, target)
    }
    if (source === 'default') {
      // 默认图库：源文件改 .bak
      fs.renameSync(target.filePath, target.filePath + '.bak')
      return e.reply(`[面板图图库管理器]\n已屏蔽默认图库中${roleName}第${n}张图(${target.name})`)
    }
    return e.reply('[面板图图库管理器]\n该文件不符合命名规范，无法屏蔽')
  }

  async unblockImg (e) {
    if (!(await guardLayout(e))) return true
    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^启用(.+?)(屏蔽)?面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #启用角色名面板图 序号')
    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[3]) || 1

    // ① 默认图库内的 .bak（段位 10001+ 保留原序号）
    const bakFile = findBlockedByN(roleName, 'normal', n)
    if (bakFile) {
      if (!e.isMaster) {
        const gkey = resolveGalleryKey(bakFile.baseName, roleName, n)
        if (!gkey || !canAccessGallery(e.user_id, gkey)) {
          return e.reply(`[面板图图库管理器]\n你未被授权操作「${gkey || '未知'}」图库的面板图`)
        }
      }
      fs.renameSync(bakFile.filePath, bakFile.filePath.slice(0, -4))
      return e.reply(`[面板图图库管理器]\n已恢复${roleName}第${n}张图(${bakFile.baseName})`)
    }

    // ② 屏蔽图库（主图库移入的图，displayN 为屏蔽图库内重排序号）
    const blockedList = getBlockedAggregated(roleName)
    const target = blockedList.find(item => item.displayN === n)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n序号无效：当前有 ${blockedList.length} 张屏蔽面板图（第三方图库的图片不参与序号）`)
    }
    if (!e.isMaster) {
      const gkey = resolveGalleryKey(target.name, roleName, n)
      if (!gkey || !canAccessGallery(e.user_id, gkey)) {
        return e.reply(`[面板图图库管理器]\n你未被授权操作「${gkey || '未知'}」图库的面板图`)
      }
    }
    return this._unblockMain(e, roleName, target)
  }

  /** 主图库屏蔽：移入 blocked-character，按空位重排 n */
  _blockMain (e, roleName, target) {
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(blockedDir)) fs.mkdirSync(blockedDir, { recursive: true })

    // 提取原文件名中"角色名_序号"之后的部分（版权信息 / 扩展名）
    const suffix = this._extractSuffix(target.name, roleName)
    const gapN = this._findFirstGap(blockedDir, roleName)
    const newName = `${roleName}_${gapN}${suffix}`

    fs.renameSync(target.filePath, path.join(blockedDir, newName))
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${target.displayN}张图移入屏蔽图库(${newName})`)
  }

  /** 主图库启用：从 blocked-character 移回主图库，按空位重排 n */
  _unblockMain (e, roleName, target) {
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(blockedDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无屏蔽面板图`)

    const suffix = this._extractSuffix(target.name, roleName)

    // 主图库角色目录（map.json 路由）
    const repoId = getRepoForChar(roleName)
    const mainDir = path.join(getRepoDir(repoId), 'normal-character', roleName)
    if (!fs.existsSync(mainDir)) fs.mkdirSync(mainDir, { recursive: true })

    const gapN = this._findFirstGap(mainDir, roleName)
    const newName = `${roleName}_${gapN}${suffix}`

    fs.renameSync(path.join(blockedDir, target.name), path.join(mainDir, newName))
    return e.reply(`[面板图图库管理器]\n已将${roleName}的屏蔽图移回主图库(${newName})`)
  }

  /**
   * 提取文件名中"角色名_序号"之后的部分（版权信息 / 扩展名）
   * 琴_3_张三_米游社.webp → _张三_米游社.webp；琴_3.webp → .webp
   * @param {string} filename
   * @param {string} roleName
   * @returns {string}
   */
  _extractSuffix (filename, roleName) {
    const esc = escapeRegExp(roleName)
    const m = filename.match(new RegExp(`^${esc}_(\\d+)`))
    if (m) return filename.slice(m[0].length)
    return path.extname(filename)
  }

  /**
   * 找目录内的最小空 n（从小到大第一个未被占用的序号）
   * @param {string} dir - 目录
   * @param {string} roleName - 角色名
   * @returns {number}
   */
  _findFirstGap (dir, roleName) {
    if (!fs.existsSync(dir)) return 1
    const files = fs.readdirSync(dir)
      .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
    const esc = escapeRegExp(roleName)
    const used = new Set()
    for (const f of files) {
      const m = f.match(new RegExp(`^${esc}_(\\d+)(?:_|\\.)`))
      if (m) used.add(parseInt(m[1], 10))
    }
    let n = 1
    while (used.has(n)) n++
    return n
  }
}
