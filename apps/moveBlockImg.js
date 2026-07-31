import fs from 'node:fs'
import path from 'node:path'
import { getBlockedDir, getBlockedAggregated } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { buildRepos } from '../model/repoRegistry.js'
import { findByDisplayN, escapeRegExp } from '../components/panelUtils.js'
import { hidePanelLink, showPanelLink, createPanelLink } from '../model/linkAggregator.js'
import { getRepoForChar } from '../model/mapJson.js'

/**
 * 屏蔽/启用面板图
 *
 * 分两类屏蔽：
 *   主图库 → 源文件移入 blocked-character（可 push），移入/移出时按空位重排 n
 *   第三方/default/迁移 → 聚合链接改 .bak（隐藏，源文件不动）
 */
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

    const repos = buildRepos()
    const target = findByDisplayN(roleName, n, 'normal', repos)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n序号无效，角色${roleName}没有第${n}张图`)
    }

    if (target.repo.type === 'main') {
      return this._blockMain(e, roleName, target)
    }
    // 非主图库：聚合链接改 .bak
    const r = hidePanelLink(target.name, 'normal', roleName)
    if (!r.ok) return e.reply(`[面板图图库管理器] 屏蔽失败: ${r.error}`)
    return e.reply(`[面板图图库管理器]\n已隐藏${roleName}第${n}张图(${target.name})`)
  }

  /** 主图库屏蔽：移入 blocked-character，按空位重排 n */
  _blockMain(e, roleName, target) {
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(blockedDir)) fs.mkdirSync(blockedDir, { recursive: true })

    // 提取原文件名中"角色名_序号"之后的部分（版权信息 / 扩展名）
    const suffix = this._extractSuffix(target.name, roleName)
    const gapN = this._findFirstGap(blockedDir, roleName)
    const newName = `${roleName}_${gapN}${suffix}`

    const srcFile = target.sourceFile
    const destFile = path.join(blockedDir, newName)
    fs.renameSync(srcFile, destFile)
    // 删除聚合链接（源文件已移走，链接指向的 inode 数据仍在聚合目录，需手动移除）
    removePanelLink(target.name, 'normal', roleName)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的第${target.displayN}张图移入屏蔽图库(${newName})`)
  }

  async unblockImg(e) {
    const rawMsg = e.msg.replace(/^#/, '')
    const match = rawMsg.match(/^启用(.+?)(屏蔽)?面板图\s*(\d*)$/)
    if (!match) return e.reply('[面板图图库管理器]指令格式错误，请使用 #启用角色名面板图 序号')
    let roleName = match[1].trim()
    roleName = resolveRoleName(roleName)
    const n = parseInt(match[3]) || 1

    // 与屏蔽列表 getBlockedAggregated 的 displayN 对应
    const blockedList = getBlockedAggregated(roleName)
    const target = blockedList.find(item => item.displayN === n)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${blockedList.length}张屏蔽面板图`)
    }

    if (target.isBak) {
      // 非主图库：.bak 改回原名
      const r = showPanelLink(target.name + '.bak', 'normal', roleName)
      if (!r.ok) return e.reply(`[面板图图库管理器] 启用失败: ${r.error}`)
      return e.reply(`[面板图图库管理器]\n已恢复${roleName}第${n}张隐藏图(${target.name})`)
    }
    return this._unblockMain(e, roleName, target)
  }

  /** 主图库启用：从 blocked-character 移回主图库，按空位重排 n */
  _unblockMain(e, roleName, target) {
    const blockedDir = getBlockedDir(roleName)
    if (!fs.existsSync(blockedDir)) return e.reply(`[面板图图库管理器]\n角色${roleName}暂无屏蔽面板图`)

    const suffix = this._extractSuffix(target.name, roleName)
    const mainRepos = buildRepos().filter(r => r.type === 'main')
    if (mainRepos.length === 0) return e.reply('[面板图图库管理器] 主图库未配置')

    // 主图库角色目录（map.json 路由，fallback 仓库 0）
    const repoId = getRepoForChar(roleName)
    const mainRepo = mainRepos.find(r => r.repoId === repoId) || mainRepos[0]
    const mainDir = path.join(mainRepo.dir, 'normal-character', roleName)
    if (!fs.existsSync(mainDir)) fs.mkdirSync(mainDir, { recursive: true })

    const gapN = this._findFirstGap(mainDir, roleName)
    const newName = `${roleName}_${gapN}${suffix}`

    fs.renameSync(path.join(blockedDir, target.name), path.join(mainDir, newName))
    createPanelLink(path.join(mainDir, newName), newName, 'normal', roleName)
    return e.reply(`[面板图图库管理器]\n已将${roleName}的屏蔽图移回主图库(${newName})`)
  }

  /**
   * 提取文件名中"角色名_序号"之后的部分（版权信息 / 扩展名）
   * 琴_3_张三_米游社.webp → _张三_米游社.webp；琴_3.webp → .webp
   * @param {string} filename
   * @param {string} roleName
   * @returns {string}
   */
  _extractSuffix(filename, roleName) {
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
  _findFirstGap(dir, roleName) {
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
