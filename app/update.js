import fs from 'node:fs'
import path from 'node:path'
import {
  checkGallery, gitExec, getRemoteSha, forceResetToRemote, notifyMaster
} from './utils.js'

export class Update extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]更新',
      dsc: '更新主图库',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库更新$', fnc: 'update', permission: 'master' },
        { reg: '^#主图库强制更新$', fnc: 'forceUpdate', permission: 'master' }
      ]
    })

    this.task = [
      { name: '主图库自动检查更新', cron: '0 30 6 * * *', fnc: this.autoCheck.bind(this), log: true },
      { name: '管理器自身自动更新', cron: '50 5 * * *', fnc: this.selfUpdate.bind(this), log: false }
    ]
  }

  async update(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      const result = gitExec('git pull', 30000)
      return e.reply('[面板图图库管理器] 图库更新成功\n' + (result || 'Already up to date.'))
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 图库自动更新失败，请尝试使用 #强制更新图库\n错误信息：' + errorMsg)
    }
  }

  async forceUpdate(e) {
    const check = checkGallery()
    if (!check.ok) return e.reply(check.msg)
    try {
      getRemoteSha()
      forceResetToRemote()
      return e.reply('[面板图图库管理器] 强制更新成功')
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 强制更新失败\n' + errorMsg + '\n请检查网络或手动执行安装命令')
    }
  }

  async autoCheck() {
    const check = checkGallery()
    if (!check.ok) return
    try {
      const remoteSha = getRemoteSha()
      if (!remoteSha) return
      const localSha = gitExec('git rev-parse --short HEAD')
      if (remoteSha === localSha) return
      try {
        gitExec('git pull origin main --allow-unrelated-histories', 30000)
        const msg = '[面板图图库管理器] 自动更新成功\n' + localSha + ' -> ' + remoteSha
        notifyMaster(msg)
        logger.info('[面板图图库管理器] 自动更新成功: ' + localSha + ' -> ' + remoteSha)
      } catch (pullErr) {
        const errorMsg = pullErr.stderr || pullErr.stdout || pullErr.message || '未知错误'
        const msg = '[面板图图库管理器] 自动更新失败\n检测到新版本 ' + remoteSha + '\n错误信息：' + errorMsg + '\n请手动执行 #强制更新图库'
        notifyMaster(msg)
        logger.error('[面板图图库管理器] 自动更新失败:', pullErr)
      }
    } catch (err) {
      logger.error('[面板图图库管理器] 自动检查更新失败:', err)
    }
  }

  async selfUpdate() {
    try {
      const remoteUrl = 'https://raw.githubusercontent.com/AxiuCN/Yunzai_JS_Plugins/main/%E9%9D%A2%E6%9D%BF%E5%9B%BE%E5%9B%BE%E5%BA%93%E7%AE%A1%E7%90%86%E5%99%A8.js'
      const localPath = path.join(process.cwd(), 'plugins/example/面板图图库管理器.js')
      const res = await fetch(remoteUrl)
      if (!res.ok) throw new Error('下载失败，HTTP ' + res.status)
      const remoteCode = await res.text()
      const localCode = fs.readFileSync(localPath, 'utf8')
      if (remoteCode.trim() === localCode.trim()) {
        logger.info('[面板图图库管理器] 自身已是最新版本')
        return
      }
      fs.writeFileSync(localPath, remoteCode, 'utf8')
      notifyMaster('[面板图图库管理器] 自身已自动更新至最新版本')
      logger.info('[面板图图库管理器] 自身更新成功')
    } catch (err) {
      logger.error('[面板图图库管理器] 自身更新失败:', err)
      notifyMaster('[面板图图库管理器] 自身更新失败: ' + (err.message || '未知错误'))
    }
  }
}