import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { buildRepos } from '../model/repoRegistry.js'
import { findByDisplayN } from '../components/panelUtils.js'
import { removePanelLink, hidePanelLink } from '../model/linkAggregator.js'

/**
 * 删除面板图 — 接管 miao-plugin 的 #删除xxx面板图N
 * 优先级 1，高于 miao-plugin 默认优先级
 * 序号 N 为聚合层 display n（主图库真实 n / 第三方虚拟 n）
 *
 * 删除逻辑：
 *   主图库 → 删源文件 + 删聚合链接
 *   第三方/default/迁移 → 聚合链接改 .bak（隐藏，源文件不动）
 */
export class DelProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]删除',
      dsc: '删除面板图',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?\s*(?:移除|清除|删除)(.+)(?:面板图)(\d+)\s*$/, fnc: 'delete' }
      ]
    })
  }

  async delete(e) {
    // 从 regex 捕获组直接取角色名和序号（不再用 replace 盲删数字，避免破坏含数字的角色名）
    const match = e.msg.match(/^#?\s*(?:移除|清除|删除)(.+?)(?:面板图)(\d+)\s*$/)
    if (!match) return true

    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[2], 10)

    const repos = buildRepos()
    const target = findByDisplayN(roleName, n, 'normal', repos)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n序号无效，角色${roleName}没有第${n}张图`)
    }

    try {
      if (target.repo.type === 'main') {
        // 主图库：删源文件 + 删聚合链接
        fs.unlinkSync(target.sourceFile)
        removePanelLink(target.name, 'normal', roleName)
        return e.reply(`[面板图图库管理器]\n已删除${roleName}第${n}张面板图(${target.name})`)
      }
      // 非主图库：聚合链接改 .bak 隐藏
      hidePanelLink(target.name, 'normal', roleName)
      return e.reply(`[面板图图库管理器]\n已隐藏${roleName}第${n}张面板图(${target.name})`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除面板图失败:', err)
      return e.reply('[面板图图库管理器] 删除失败: ' + err.message)
    }
  }
}
