import fs from 'node:fs'
import path from 'node:path'
import {
  checkGallery, checkBlockedGallery,
  gitExec, gitExecBlocked,
  getRemoteSha, getRemoteShaBlocked,
  forceResetToRemote, forceResetBlocked,
  notifyMaster, getPluginConfig
} from './utils.js'

export class Update extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]更新',
      dsc: '管理面板图图库的更新',
      event: 'message',
      priority: 5,
      rule: [
        // 管理器自身更新
        { reg: '^#管理器更新$', fnc: 'updateSelf', permission: 'master' },
        { reg: '^#管理器强制更新$', fnc: 'forceUpdateSelf', permission: 'master' },
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

    const mainCfg = updateCfg.mainGallery || {}
    if (mainCfg.enabled !== false) {
      tasks.push({
        name: '主图库自动检查更新',
        cron: mainCfg.cron || '0 30 6 * * *',
        fnc: this.autoCheckMain.bind(this),
        log: true
      })
    }

    const blockedCfg = updateCfg.blockedGallery || {}
    if (blockedCfg.enabled !== false) {
      tasks.push({
        name: '屏蔽图库自动检查更新',
        cron: blockedCfg.cron || '0 0 8 * * *',
        fnc: this.autoCheckBlocked.bind(this),
        log: true
      })
    }

    const selfCfg = updateCfg.pluginSelf || {}
    if (selfCfg.enabled !== false) {
      tasks.push({
        name: '管理器自身自动更新',
        cron: selfCfg.cron || '50 5 * * *',
        fnc: this.autoCheckSelf.bind(this),
        log: false
      })
    }

    if (tasks.length > 0) this.task = tasks
  }

  // ==================== 管理器自身更新 ====================

  async updateSelf(e) {
    e.reply('[面板图图库管理器] 开始检查管理器自身更新，请稍候...')
    try {
      await this._selfUpdateCheck(true)
    } catch (err) {
      return e.reply('[面板图图库管理器] 管理器自身更新失败: ' + (err.message || '未知错误'))
    }
  }

  async forceUpdateSelf(e) {
    e.reply('[面板图图库管理器] 开始强制更新管理器自身...')
    try {
      const remoteUrl = this._getPluginRemoteUrl()
      const localPath = path.join(process.cwd(), 'plugins/example/面板图图库管理器.js')
      const res = await fetch(remoteUrl)
      if (!res.ok) throw new Error('下载失败，HTTP ' + res.status)
      const remoteCode = await res.text()
      fs.writeFileSync(localPath, remoteCode, 'utf8')
      e.reply('[面板图图库管理器] 管理器自身已更新到最新版本')

      const config = getPluginConfig()
      const selfCfg = config?.update?.pluginSelf || {}
      if (selfCfg.autoRestart !== false) {
        e.reply('[面板图图库管理器] 正在重启以应用更新...')
        Bot.restart()
      }
    } catch (err) {
      return e.reply('[面板图图库管理器] 管理器自身强制更新失败: ' + (err.message || '未知错误'))
    }
  }

  async autoCheckSelf() {
    await this._selfUpdateCheck(false)
  }

  async _selfUpdateCheck(isManual) {
    const config = getPluginConfig()
    const selfCfg = config?.update?.pluginSelf || {}
    if (!isManual && selfCfg.enabled === false) return

    try {
      const remoteUrl = this._getPluginRemoteUrl()
      const localPath = path.join(process.cwd(), 'plugins/example/面板图图库管理器.js')
      const res = await fetch(remoteUrl)
      if (!res.ok) throw new Error('下载失败，HTTP ' + res.status)
      const remoteCode = await res.text()

      let localCode = ''
      if (fs.existsSync(localPath)) {
        localCode = fs.readFileSync(localPath, 'utf8')
      }

      if (remoteCode.trim() === localCode.trim()) {
        if (isManual) this.e?.reply('[面板图图库管理器] 管理器自身已是最新版本')
        logger.info('[面板图图库管理器] 自身已是最新版本')
        return
      }

      if (selfCfg.autoUpdate !== false || isManual) {
        fs.writeFileSync(localPath, remoteCode, 'utf8')
        if (isManual) this.e?.reply('[面板图图库管理器] 管理器自身已更新到最新版本')
        else notifyMaster('[面板图图库管理器] 管理器自身已自动更新至最新版本')
        logger.info('[面板图图库管理器] 自身更新成功')

        if (selfCfg.autoRestart !== false) {
          if (isManual) this.e?.reply('[面板图图库管理器] 正在重启以应用更新...')
          else notifyMaster('[面板图图库管理器] 插件更新后需要重启，即将执行重启...')
          Bot.restart()
        }
      } else {
        if (isManual) this.e?.reply('[面板图图库管理器] 检测到新版本，但自动更新已关闭，请使用 #管理器强制更新')
        else notifyMaster('[面板图图库管理器] 检测到管理器自身有新版本，但自动更新已关闭，请手动更新')
      }
    } catch (err) {
      logger.error('[面板图图库管理器] 自身更新失败:', err)
      if (isManual) throw err
      else notifyMaster('[面板图图库管理器] 自身更新失败: ' + (err.message || '未知错误'))
    }
  }

  _getPluginRemoteUrl() {
    return 'https://raw.githubusercontent.com/AxiuCN/Yunzai_JS_Plugins/main/%E9%9D%A2%E6%9D%BF%E5%9B%BE%E5%9B%BE%E5%BA%93%E7%AE%A1%E7%90%86%E5%99%A8.js'
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
      const localSha = gitExec('git rev-parse --short HEAD')
      if (remoteSha === localSha) return

      if (mainCfg.autoUpdate !== false) {
        try {
          gitExec('git pull origin main --allow-unrelated-histories', 30000)
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