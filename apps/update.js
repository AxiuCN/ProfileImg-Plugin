import { gitExecAsync, getRemoteShaAsync, getLocalSha, fastForwardPullAsync, forceResetAsync } from '../model/git.js'
import { checkRepo, checkBlockedGallery, checkProfileJunction } from '../model/gallery.js'
import { notifyMaster } from '../components/notify.js'
import { getPluginConfig } from '../components/config.js'
import { BLOCKED_REPO_DIR, getRepoDir, getRepoConfig } from '../components/constants.js'
import { getActiveRepoIds } from '../model/mapJson.js'

/**
 * 多仓库图库更新（手动 + cron 自动，全程异步不阻塞 Bot）
 */
export class Update extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]更新',
      dsc: '管理面板图图库的更新',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库更新$', fnc: 'updateMain', permission: 'master' },
        { reg: '^#主图库强制更新$', fnc: 'forceUpdateMain', permission: 'master' },
        { reg: '^#屏蔽图库更新$', fnc: 'updateBlocked', permission: 'master' },
        { reg: '^#屏蔽图库强制更新$', fnc: 'forceUpdateBlocked', permission: 'master' }
      ]
    })
    this._registerCronTasks()
  }

  _getActiveRepos() {
    return getActiveRepoIds().map(id => getRepoConfig(id))
  }

  _registerCronTasks() {
    const config = getPluginConfig()
    const repos = this._getActiveRepos()
    const tasks = []

    for (const repo of repos) {
      if (repo.autoUpdate !== false && repo.cron) {
        tasks.push({
          name: `图库仓库${repo.id}自动检查更新`,
          cron: repo.cron,
          fnc: () => this._autoCheckRepo(repo.id),
          log: false
        })
      }
    }

    const blockedCfg = config?.gallery?.blocked
    if (blockedCfg?.enabled !== false && blockedCfg?.cron) {
      tasks.push({
        name: '屏蔽图库自动检查更新',
        cron: blockedCfg.cron,
        fnc: () => this._autoCheckBlocked(),
        log: true
      })
    }

    if (tasks.length > 0) this.task = tasks
  }

  /** 自动检查单个仓库（异步） */
  async _autoCheckRepo(repoId) {
    const repoCfg = getRepoConfig(repoId)
    if (repoCfg.autoUpdate === false) return

    const repoDir = getRepoDir(repoId)
    const check = checkRepo(repoDir)
    if (!check.ok) return

    try {
      const remoteSha = await getRemoteShaAsync(repoDir)
      if (!remoteSha) return
      const localSha = getLocalSha(repoDir)
      if (remoteSha === localSha) return

      if (repoCfg.autoUpdate !== false) {
        try {
          const result = await fastForwardPullAsync(repoDir)
          const msg = `[面板图图库管理器] 仓库${repoId}自动更新${result.updated ? '成功' : '完成'}\n${localSha} -> ${remoteSha}`
          notifyMaster(msg)
          if (repoCfg.autoRestart) {
            notifyMaster(`[面板图图库管理器] 仓库${repoId}更新后需要重启，即将执行重启...`)
            Bot.restart()
          }
        } catch (pullErr) {
          notifyMaster(`[面板图图库管理器] 仓库${repoId}自动更新失败\n检测到新版本 ${remoteSha}\n错误：${pullErr.message}\n请手动执行 #主图库强制更新`)
        }
      } else {
        notifyMaster(`[面板图图库管理器] 仓库${repoId}有新版本，自动更新已关闭\n${localSha} -> ${remoteSha}`)
      }
    } catch (err) {
      logger.error(`[面板图图库管理器] 仓库${repoId}自动检查更新失败:`, err)
    }
  }

  /** 自动检查屏蔽图库（异步） */
  async _autoCheckBlocked() {
    const blockedCfg = getPluginConfig()?.gallery?.blocked || {}
    if (blockedCfg.autoUpdate === false) return

    const check = checkBlockedGallery()
    if (!check.ok) return

    try {
      const remoteSha = await getRemoteShaAsync(BLOCKED_REPO_DIR)
      if (!remoteSha) return
      const localSha = getLocalSha(BLOCKED_REPO_DIR)
      if (remoteSha === localSha) return

      if (blockedCfg.autoUpdate !== false) {
        try {
          await gitExecAsync(BLOCKED_REPO_DIR, 'pull origin main --allow-unrelated-histories', 60000)
          notifyMaster(`[面板图图库管理器] 屏蔽图库自动更新成功\n${localSha} -> ${remoteSha}`)
          if (blockedCfg.autoRestart) {
            notifyMaster('[面板图图库管理器] 屏蔽图库更新后需要重启，即将执行重启...')
            Bot.restart()
          }
        } catch (pullErr) {
          notifyMaster(`[面板图图库管理器] 屏蔽图库自动更新失败\n检测到新版本 ${remoteSha}\n请手动执行 #屏蔽图库强制更新`)
        }
      } else {
        notifyMaster(`[面板图图库管理器] 屏蔽图库有新版本，自动更新已关闭\n${localSha} -> ${remoteSha}`)
      }
    } catch (err) {
      logger.error('[面板图图库管理器] 屏蔽图库自动检查更新失败:', err)
    }
  }

  // ========== 手动更新命令（全异步） ==========

  async updateMain(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) return e.reply(jCheck.msg)

    const repos = this._getActiveRepos()
    const total = repos.length
    e.reply(`[面板图图库管理器] 开始更新主图库（${total} 个仓库）...`)

    const results = []
    let completed = 0
    for (const repo of repos) {
      const repoDir = getRepoDir(repo.id)
      const check = checkRepo(repoDir)
      if (!check.ok) { results.push(`仓库${repo.id}：${check.msg}`); completed++; continue }
      const result = await fastForwardPullAsync(repoDir)
      completed++
      results.push(`仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
      if (total > 1) {
        e.reply(`[面板图图库管理器] 更新进度：${completed}/${total}\n仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
      }
    }
    return e.reply('[面板图图库管理器] 主图库更新\n' + results.join('\n'))
  }

  async forceUpdateMain(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) return e.reply(jCheck.msg)

    const repos = this._getActiveRepos()
    const total = repos.length
    e.reply(`[面板图图库管理器] 开始强制更新主图库（${total} 个仓库）...`)

    const results = []
    let completed = 0
    for (const repo of repos) {
      const repoDir = getRepoDir(repo.id)
      const check = checkRepo(repoDir)
      if (!check.ok) { results.push(`仓库${repo.id}：${check.msg}`); completed++; continue }
      try {
        await forceResetAsync(repoDir)
        completed++
        results.push(`仓库${repo.id}：强制更新成功`)
      } catch (err) {
        completed++
        results.push(`仓库${repo.id}：强制更新失败 - ${err.message}`)
      }
      if (total > 1) {
        e.reply(`[面板图图库管理器] 强制更新进度：${completed}/${total}\n仓库${repo.id}：${results[results.length - 1]}`)
      }
    }
    return e.reply('[面板图图库管理器] 主图库强制更新\n' + results.join('\n'))
  }

  async updateBlocked(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)

    e.reply('[面板图图库管理器] 开始更新屏蔽图库...')

    try {
      const result = await fastForwardPullAsync(BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库更新\n' + result.msg)
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库更新失败\n' + err.message)
    }
  }

  async forceUpdateBlocked(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)

    e.reply('[面板图图库管理器] 开始强制更新屏蔽图库...')

    try {
      await forceResetAsync(BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新成功')
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新失败\n' + err.message)
    }
  }
}
