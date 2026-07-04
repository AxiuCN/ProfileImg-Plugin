import { checkGallery, checkBlockedGallery } from '../model/gallery.js'
import { gitExec, gitExecBlocked, getRemoteSha, getRemoteShaBlocked, forceResetToRemote, forceResetBlocked } from '../model/git.js'
import { notifyMaster } from '../components/notify.js'
import { getPluginConfig } from '../components/config.js'

export class Update extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]更新',
      dsc: '管理面板图图库的更新',
      event: 'message',
      priority: 5,
      rule: [
        // 主图库更新
        { reg: '^#主图库更新$', fnc: 'updateMain', permission: 'master' },
        { reg: '^#主图库强制更新$', fnc: 'forceUpdateMain', permission: 'master' },
        // 屏蔽图库更新
        { reg: '^#屏蔽图库更新$', fnc: 'updateBlocked', permission: 'master' },
        { reg: '^#屏蔽图库强制更新$', fnc: 'forceUpdateBlocked', permission: 'master' }
      ]
    })

    this._registerCronTasks()
  }

  _registerCronTasks() {
    const config = getPluginConfig()
    const updateCfg = config?.update || {}
    const tasks = []

    // 主图库自动更新（5:20）
    const mainCfg = updateCfg.mainGallery || {}
    if (mainCfg.enabled !== false) {
      tasks.push({
        name: '主图库自动检查更新',
        cron: mainCfg.cron || '20 5 * * *',
        fnc: this.autoCheckMain.bind(this),
        log: true
      })
    }

    // 屏蔽图库自动更新（5:40）
    const blockedCfg = updateCfg.blockedGallery || {}
    if (blockedCfg.enabled !== false) {
      tasks.push({
        name: '屏蔽图库自动检查更新',
        cron: blockedCfg.cron || '40 5 * * *',
        fnc: this.autoCheckBlocked.bind(this),
        log: true
      })
    }

    if (tasks.length > 0) this.task = tasks
  }

  // ==================== 主图库更新 ====================

  async updateMain(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      const result = gitExec('git pull', 30000)
      return e.reply('[面板图图库管理器] 主图库更新成功\n' + (result || 'Already up to date.'))
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 主图库更新失败，请尝试使用 #主图库强制更新\n错误信息：' + errorMsg)
    }
  }

  async forceUpdateMain(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      getRemoteSha()
      forceResetToRemote()
      return e.reply('[面板图图库管理器] 主图库强制更新成功')
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 主图库强制更新失败\n' + errorMsg + '\n请检查网络或手动执行安装命令')
    }
  }

  async autoCheckMain() {
    const config = getPluginConfig()
    const mainCfg = config?.update?.mainGallery || {}
    if (mainCfg.enabled === false) return

    const check = checkGallery()
    if (!check.ok) return
    try {
      const remoteSha = getRemoteSha()
      if (!remoteSha) return
      const localSha = gitExec('git pull')
      if (remoteSha === localSha) return

      if (mainCfg.autoUpdate !== false) {
        try {
          gitExec('git -c submodule.recurse=false pull origin main --no-recurse-submodules --allow-unrelated-histories', 30000)
          const msg = '[面板图图库管理器] 主图库自动更新成功\n' + localSha + ' -> ' + remoteSha
          notifyMaster(msg)
          logger.info('[面板图图库管理器] 主图库自动更新成功: ' + localSha + ' -> ' + remoteSha)

          if (mainCfg.autoRestart) {
            notifyMaster('[面板图图库管理器] 主图库更新后需要重启，即将执行重启...')
            Bot.restart()
          }
        } catch (pullErr) {
          const errorMsg = pullErr.stderr || pullErr.stdout || pullErr.message || '未知错误'
          const msg = '[面板图图库管理器] 主图库自动更新失败\n检测到新版本 ' + remoteSha + '\n错误信息：' + errorMsg + '\n请手动执行 #主图库强制更新'
          notifyMaster(msg)
          logger.error('[面板图图库管理器] 主图库自动更新失败:', pullErr)
        }
      } else {
        notifyMaster('[面板图图库管理器] 主图库有新版本，但自动更新已关闭，请手动更新\n' + localSha + ' -> ' + remoteSha)
      }
    } catch (err) {
      logger.error('[面板图图库管理器] 主图库自动检查更新失败:', err)
    }
  }

  // ==================== 屏蔽图库更新 ====================

  async updateBlocked(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      const result = gitExecBlocked('git pull', 30000)
      return e.reply('[面板图图库管理器] 屏蔽图库更新成功\n' + (result || 'Already up to date.'))
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 屏蔽图库更新失败，请尝试使用 #屏蔽图库强制更新\n错误信息：' + errorMsg)
    }
  }

  async forceUpdateBlocked(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      getRemoteShaBlocked()
      forceResetBlocked()
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新成功')
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新失败\n' + errorMsg + '\n请检查网络或手动执行安装命令')
    }
  }

  async autoCheckBlocked() {
    const config = getPluginConfig()
    const blockedCfg = config?.update?.blockedGallery || {}
    if (blockedCfg.enabled === false) return

    const check = checkBlockedGallery()
    if (!check.ok) return
    try {
      const remoteSha = getRemoteShaBlocked()
      if (!remoteSha) return
      const localSha = gitExecBlocked('git rev-parse --short HEAD')
      if (remoteSha === localSha) return

      if (blockedCfg.autoUpdate !== false) {
        try {
          gitExecBlocked('git pull origin main --allow-unrelated-histories', 30000)
          const msg = '[面板图图库管理器] 屏蔽图库自动更新成功\n' + localSha + ' -> ' + remoteSha
          notifyMaster(msg)
          logger.info('[面板图图库管理器] 屏蔽图库自动更新成功: ' + localSha + ' -> ' + remoteSha)

          if (blockedCfg.autoRestart) {
            notifyMaster('[面板图图库管理器] 屏蔽图库更新后需要重启，即将执行重启...')
            Bot.restart()
          }
        } catch (pullErr) {
          const errorMsg = pullErr.stderr || pullErr.stdout || pullErr.message || '未知错误'
          const msg = '[面板图图库管理器] 屏蔽图库自动更新失败\n检测到新版本 ' + remoteSha + '\n错误信息：' + errorMsg + '\n请手动执行 #屏蔽图库强制更新'
          notifyMaster(msg)
          logger.error('[面板图图库管理器] 屏蔽图库自动更新失败:', pullErr)
        }
      } else {
        notifyMaster('[面板图图库管理器] 屏蔽图库有新版本，但自动更新已关闭，请手动更新\n' + localSha + ' -> ' + remoteSha)
      }
    } catch (err) {
      logger.error('[面板图图库管理器] 屏蔽图库自动检查更新失败:', err)
    }
  }
}