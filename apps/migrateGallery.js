import { precheckMultiSrc, migrateToMultiSrc } from '../model/migrateMultiSrc.js'

/**
 * #迁移图库 — 升级到 miao 多图库源布局（自定义图库路径）
 *
 * 两步交互：
 * 1. 预检报告（只读）：当前布局、default 存量、主仓库副本构成、第三方可直读情况、将执行的动作
 * 2. 发送 #确认 后执行迁移（一次切换），完成后必须重启 Yunzai
 *
 * 确认机制沿用框架内置 setContext（同 #图库初始化）。
 * 旧功能（backup → default → 主仓库）已随多图库源布局退役。
 */
export class MigrateGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]迁移',
      dsc: '迁移到 miao 多图库源布局（自定义图库路径）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#迁移图库$', fnc: 'migrate', permission: 'master' }
      ]
    })
  }

  /** 第一步：预检并提示确认 */
  async migrate (e) {
    if (!e) return // 避免与 loader 生命周期 init 冲突（加载时无参调用）
    const pre = precheckMultiSrc()
    if (!pre.supported) {
      return e.reply([
        '[面板图图库管理器] 无法迁移\n',
        'miao-plugin 不支持多图库源（profileImgSrc），请先升级 miao-plugin 到 2.5.20 及以上。'
      ].join(''))
    }
    if (pre.state === 'ready') {
      return e.reply('[面板图图库管理器] 当前已是多图库源布局，无需迁移。')
    }
    if (pre.state === 'fresh') {
      return e.reply([
        '[面板图图库管理器] 当前没有可迁移的旧图库布局。\n',
        '新装用户请发送 #图库初始化 完成初始化。'
      ].join(''))
    }

    this.setContext('confirmMigrate')
    return e.reply(this._formatPrecheck(pre))
  }

  /** 由 setContext 在用户确认后自动调用 */
  async confirmMigrate () {
    const msg = this.e?.msg?.replace(/^#/, '') || ''
    if (msg.startsWith('取消')) {
      this.finish('confirmMigrate')
      return this.e.reply('[面板图图库管理器] 多图库源迁移已取消')
    }
    if (!msg.startsWith('确认')) {
      // 不匹配确认/取消时放行，不阻塞其他插件
      return 'continue'
    }
    this.finish('confirmMigrate')
    const e = this.e
    await e.reply('[面板图图库管理器] 开始迁移，请稍候（期间请勿操作图库）...')

    const report = migrateToMultiSrc()
    return e.reply(this._formatReport(report))
  }

  /** 预检报告文本 */
  _formatPrecheck (pre) {
    const lines = ['[面板图图库管理器] 多图库源迁移预检', '']
    lines.push(`当前布局：${pre.state === 'legacy' ? '旧版 junction 布局（需迁移）' : '未初始化'}`)
    lines.push(`默认图库存量：${pre.defaultStat.normal.roles + pre.defaultStat.super.roles} 个角色 / ${pre.defaultStat.normal.images + pre.defaultStat.super.images} 张图`)
    for (const repo of pre.repos) {
      if (!repo.exists) {
        lines.push(`仓库 ${repo.id}：目录不存在（跳过）`)
        continue
      }
      lines.push(`仓库 ${repo.id}：主图库 ${repo.images.main} 张 / default 副本 ${repo.images.defaultCopy} 张 / 第三方副本 ${repo.images.thirdCopy} 张`)
    }
    if (pre.thirdParty.length) {
      const tp = pre.thirdParty.map(t => `${t.name}（${t.level === 'unsupported' ? '不可直读：' + t.reason : t.level === 'flat' ? '平铺' : 'tier'}）`)
      lines.push(`第三方图库：${tp.join('；')}`)
    }
    lines.push('', '将执行：')
    pre.actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
    if (pre.srcSkipped.length) {
      lines.push('', `⚠️ ${pre.srcSkipped.length} 个仓库无法直读，迁移后不会被读取：`)
      pre.srcSkipped.forEach(s => lines.push(`  - ${s.label}：${s.reason}`))
    }
    lines.push('', '备份：map.json / miao profile.js / gallery_config.yaml 将存入 gallery/backup/migrate-<时间>')
    lines.push('⚠️ 迁移完成后必须重启 Yunzai，重启前自定义图库的图暂不可见。')
    lines.push('发送【#确认】开始迁移，发送【#取消】放弃。')
    return lines.join('\n')
  }

  /** 执行结果报告文本 */
  _formatReport (r) {
    if (!r.ok) {
      return [
        '[面板图图库管理器] 迁移失败',
        r.error || '未知错误',
        r.steps?.length ? '\n已执行步骤：\n' + r.steps.join('\n') : '',
        r.backupDir ? `\n配置备份：${r.backupDir}` : ''
      ].join('\n')
    }
    if (r.already) {
      return '[面板图图库管理器] 当前已是多图库源布局，无需迁移。'
    }
    const lines = ['[面板图图库管理器] 迁移完成 ✅', '']
    lines.push(`配置备份：${r.backupDir}`)
    lines.push(`搬迁 default：${r.movedRoles} 个角色 / ${r.movedImages} 张图`)
    lines.push(`段位规范化：重命名 ${r.renamedDefaults || 0} 张 / 保持屏蔽 ${r.blockedKept || 0} 张`)
    lines.push(`清理副本：default ${r.removedDefaultCopies} 张 / 第三方 ${r.removedThirdCopies} 张`)
    if (r.thirdBlockedKept) lines.push(`第三方源保持屏蔽：${r.thirdBlockedKept} 张`)
    if (r.keptThirdCopies) lines.push(`保留副本：${r.keptThirdCopies} 张（来源仓库不可直读，避免丢图）`)
    lines.push(`移除 junction：${r.removedJunctions} 个`)
    lines.push('', `图库源列表（${r.srcList?.length || 0} 个）：`)
    for (const [i, v] of (r.srcList || []).entries()) lines.push(`  ${i + 1}. ${v}`)
    if (r.warnings?.length) {
      lines.push('', '⚠️ 提示：')
      r.warnings.forEach(w => lines.push(`  - ${w}`))
    }
    lines.push('', '⚠️ 请立即重启 Yunzai 使源列表生效（重启前自定义图库的图暂不可见）。')
    return lines.join('\n')
  }
}
