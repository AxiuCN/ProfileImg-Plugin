import { ensureAllCharJunctions, syncThirdPartyRepo, syncDefaultToMain } from '../model/copier.js'
import { getThirdPartyRepos } from '../model/galleryConfig.js'
import { getActiveRepoIds } from '../model/mapJson.js'

/**
 * 刷新图库副本
 * #刷新图库副本          — 检查全部：主仓库角色级 junction + default 图库副本 + 所有第三方图库副本
 * #刷新图库副本 default  — 只检查 default 图库副本
 * #刷新图库副本 <图库名>  — 检查指定第三方图库副本
 *
 * 修复遗漏：缺失的角色级 junction 重建、default/第三方新图复制到主图库、孤儿副本清理
 */
export class RefreshCopies extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]刷新副本',
      dsc: '检查并修复图库副本',
      event: 'message',
      priority: 5,
      rule: [
        { reg: /^#刷新图库副本(?:\s+(.+))?$/, fnc: 'refresh', permission: 'master' }
      ]
    })
  }

  async refresh(e) {
    const match = e.msg.match(/^#刷新图库副本(?:\s+(.+))?$/)
    const arg = match?.[1]?.trim() || ''

    const lines = []

    // 无后缀：先修复主图库角色级 junction，再同步 default + 第三方副本
    if (!arg) {
      const jCount = this._refreshJunctions()
      lines.push(`角色级 junction：${jCount} 个已确保`)
    }

    // default 副本：无后缀或后缀为 default 时同步
    if (!arg || arg.toLowerCase() === 'default') {
      const def = syncDefaultToMain()
      const status = def.ok ? '完成' : `失败：${def.error || '未知错误'}`
      lines.push(`default 图库：${status}（复制 ${def.copied}，跳过 ${def.skipped}，清理 ${def.removed}）`)
      if (arg && arg.toLowerCase() === 'default') {
        return e.reply('[面板图图库管理器] 刷新图库副本\n' + lines.join('\n'))
      }
    }

    // 第三方副本：无后缀 = 全部启用，有后缀 = 指定图库
    let tps = getThirdPartyRepos().filter(tp => tp.enabled)
    if (arg) {
      tps = tps.filter(tp => tp.name === arg)
      if (tps.length === 0) {
        return e.reply(`[面板图图库管理器] 未找到启用的第三方图库「${arg}」`)
      }
    }
    if (tps.length === 0) {
      lines.push('未配置第三方图库')
    }

    for (const tp of tps) {
      const sync = syncThirdPartyRepo(tp, tp.idx)
      const status = sync.ok ? '完成' : `失败：${sync.error || '未知错误'}`
      lines.push(`「${tp.name}」：${status}（复制 ${sync.copied}，跳过 ${sync.skipped}，清理 ${sync.removed}）`)
    }

    return e.reply('[面板图图库管理器] 刷新图库副本\n' + lines.join('\n'))
  }

  /** 确保所有活跃主仓库的角色级 junction 存在 */
  _refreshJunctions() {
    return ensureAllCharJunctions(getActiveRepoIds())
  }
}
