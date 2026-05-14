import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import {
  checkGallery,
  checkBlockedGallery,
  gitExec,
  gitExecBlocked,
  getRemoteSha,
  getRemoteShaBlocked,
  forceResetToRemote,
  forceResetBlocked,
  notifyMaster,
  getPluginConfig
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

    // 插件自身自动更新（5:00）
    const selfCfg = updateCfg.pluginSelf || {}
    if (selfCfg.enabled !== false) {
      tasks.push({
        name: '管理器自身自动更新',
        cron: selfCfg.cron || '0 5 * * *',
        fnc: this.autoCheckSelf.bind(this),
        log: false
      })
    }

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
      const pluginDir = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
      // 强制重置到远程 main 分支（丢弃本地修改）
      execSync('git fetch --all && git reset --hard @{u}', {
        cwd: pluginDir,
        encoding: 'utf8',
        timeout: 30000
      })
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
      const pluginDir = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')

      // 获取本地当前 HEAD 短哈希
      let localSha = ''
      try {
        localSha = execSync('git rev-parse --short HEAD', {
          cwd: pluginDir,
          encoding: 'utf8',
          timeout: 10000
        }).trim()
      } catch (e) {}

      // 获取远程 master 分支最新短哈希
      let remoteSha = ''
      try {
        execSync('git fetch origin master', {
          cwd: pluginDir,
          encoding: 'utf8',
          timeout: 30000
        })
        remoteSha = execSync('git rev-parse --short origin/master', {
          cwd: pluginDir,
          encoding: 'utf8',
          timeout: 10000
        }).trim()
      } catch (e) {}

      // 版本一致则无需更新
      if (localSha && remoteSha && localSha === remoteSha) {
        if (isManual) this.e?.reply('[面板图图库管理器] 管理器自身已是最新版本')
        logger.info('[面板图图库管理器] 自身已是最新版本')
        return
      }

      // 执行更新
      if (selfCfg.autoUpdate !== false || isManual) {
        execSync('git pull origin master', {
          cwd: pluginDir,
          encoding: 'utf8',
          timeout: 30000
        })
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

  // ==================== 主图库更新 ====================

  async updateMain(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      // 忽略子模块，避免 blocked-character 状态干扰
      const result = gitExec('git -c submodule.recurse=false pull --no-recurse-submodules', 30000)
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