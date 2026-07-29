import { installRepo } from '../model/git.js'
import { getPluginConfig } from '../components/config.js'
import { DEFAULT_REPO_DIR, DEFAULT_REPO_URL, BLOCKED_REPO_DIR, BLOCKED_REPO_URL, getRepoDir } from '../components/constants.js'
import { checkProfileJunction } from '../model/gallery.js'
import { notifyMaster } from '../components/notify.js'

/**
 * 强制重新下载图库
 * #强制下载主图库 — 删除现有仓库后重新 clone
 */
export class Download extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]强制下载',
      dsc: '强制重新下载图库',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#强制下载主图库$', fnc: 'forceDownload', permission: 'master' },
        { reg: '^#强制下载屏蔽图库$', fnc: 'forceDownloadBlocked', permission: 'master' }
      ]
    })
  }

  async forceDownload(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

    const config = getPluginConfig()
    const repos = config?.gallery?.repos || [{ id: 0, remoteUrl: DEFAULT_REPO_URL, enabled: true }]

    e.reply('[面板图图库管理器] 开始强制重新下载主图库，请稍候...')

    const results = []
    for (const repo of repos) {
      if (repo.enabled === false) continue
      const repoDir = getRepoDir(repo.id)
      const result = installRepo(repo.remoteUrl || DEFAULT_REPO_URL, repoDir)
      results.push(`仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
    }

    const summary = results.join('\n')
    notifyMaster('[面板图图库管理器] 主图库强制下载完成\n' + summary)
    return e.reply('[面板图图库管理器] 主图库强制下载完成\n' + summary)
  }

  async forceDownloadBlocked(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

    e.reply('[面板图图库管理器] 开始强制重新下载屏蔽图库，请稍候...')
    const result = installRepo(BLOCKED_REPO_URL, BLOCKED_REPO_DIR)
    return e.reply('[面板图图库管理器] 屏蔽图库强制下载\n' + result.msg)
  }
}
