import fs from 'node:fs'
import { checkRepo, checkBlockedGallery, checkProfileJunction } from '../model/gallery.js'
import { formatSize, getDirSize, countImages } from '../components/format.js'
import { getLocalVersionAt } from '../model/version.js'
import { getBlockedInfo } from '../model/blockedInfo.js'
import { getPluginConfig } from '../components/config.js'
import { DEFAULT_REPO_DIR, DEFAULT_REPO_URL, BLOCKED_REPO_DIR, getRepoDir, PROFILE_DIR } from '../components/constants.js'
import { getRepoForChar, getAllChars, getCharsInRepo } from '../model/mapJson.js'

export class Status extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]状态',
      dsc: '查看图库状态',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库状态$', fnc: 'status' },
        { reg: '^#屏蔽图库状态$', fnc: 'blockedStatus' },
        { reg: '^#图库状态$', fnc: 'overallStatus' }
      ]
    })
  }

  /** 获取启用的仓库列表 */
  _getEnabledRepos() {
    const config = getPluginConfig()
    const repos = config?.gallery?.repos
    if (!repos || repos.length === 0) {
      return [{ id: 0, name: '默认主图库', remoteUrl: DEFAULT_REPO_URL }]
    }
    return repos.filter(r => r.enabled !== false)
  }

  /** 统计单个仓库的 info */
  _getRepoStats(repoDir) {
    const normalDir = `${repoDir}/normal-character`
    if (!fs.existsSync(normalDir)) {
      return { charCount: 0, imageCount: 0, totalSize: 0 }
    }
    const charCount = fs.readdirSync(normalDir, { withFileTypes: true })
      .filter(f => f.isDirectory()).length
    const imageCount = countImages(normalDir)
    const totalSize = getDirSize(normalDir)
    return { charCount, imageCount, totalSize }
  }

  /** 统计 super-character */
  _getSuperStats(repoDir) {
    const superDir = `${repoDir}/super-character`
    if (!fs.existsSync(superDir)) return { charCount: 0, imageCount: 0 }
    const charCount = fs.readdirSync(superDir, { withFileTypes: true })
      .filter(f => f.isDirectory()).length
    const imageCount = countImages(superDir)
    return { charCount, imageCount }
  }

  async status(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) return e.reply(jCheck.msg)

    let msg = '[面板图图库管理器] 主图库\n'
    const repos = this._getEnabledRepos()
    let totalChars = 0, totalImgs = 0, totalSize = 0

    for (const repo of repos) {
      const repoDir = getRepoDir(repo.id)
      const check = checkRepo(repoDir)
      if (!check.ok) {
        msg += `\n仓库${repo.id}(${repo.name || '默认'})：${check.msg}\n`
        continue
      }
      const stats = this._getRepoStats(repoDir)
      const superStats = this._getSuperStats(repoDir)
      const charCount = getCharsInRepo(repo.id).length || stats.charCount
      const ver = getLocalVersionAt(repoDir)

      msg += `\n仓库${repo.id}(${repo.name || '默认'})：\n`
      msg += `  角色数：${charCount}（普通${stats.charCount} / 彩蛋${superStats.charCount}）\n`
      msg += `  图片数：${stats.imageCount + superStats.imageCount}\n`
      msg += `  大小：${formatSize(stats.totalSize)}\n`
      msg += ver ? `  版本：${ver.sha} / ${ver.date}\n` : '  版本：未知\n'

      totalChars += charCount
      totalImgs += stats.imageCount + superStats.imageCount
      totalSize += stats.totalSize
    }

    if (repos.length > 1) {
      msg += `\n合计：${totalChars}角色 / ${totalImgs}图片 / ${formatSize(totalSize)}\n`
    }
    return e.reply(msg)
  }

  async blockedStatus(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)
    const { charCount, totalSize, imageCount } = getBlockedInfo()
    const version = getLocalVersionAt(BLOCKED_REPO_DIR)
    let msg = '[面板图图库管理器] 屏蔽图库\n'
    msg += '屏蔽角色数：' + charCount + '\n'
    msg += '屏蔽图片数：' + imageCount + '\n'
    msg += '总大小：' + formatSize(totalSize) + '\n'
    if (version) {
      msg += '版本：' + version.sha + '\n'
      msg += '时间：' + version.date + '\n'
    } else {
      msg += '无法获取版本信息\n'
    }
    return e.reply(msg)
  }

  async overallStatus(e) {
    let msg = '[面板图图库管理器] 总览\n'

    // 主图库
    const jCheck = checkProfileJunction()
    if (jCheck.ok) {
      const repos = this._getEnabledRepos()
      let totalChars = 0, totalImgs = 0, totalSize = 0
      for (const repo of repos) {
        const repoDir = getRepoDir(repo.id)
        const check = checkRepo(repoDir)
        if (!check.ok) continue
        const stats = this._getRepoStats(repoDir)
        const superStats = this._getSuperStats(repoDir)
        totalChars += getCharsInRepo(repo.id).length || stats.charCount
        totalImgs += stats.imageCount + superStats.imageCount
        totalSize += stats.totalSize
      }
      msg += '\n主图库：\n'
      msg += `  仓库数：${repos.length}\n`
      msg += '  角色数：' + totalChars + '\n'
      msg += '  图片数：' + totalImgs + '\n'
      msg += '  大小：' + formatSize(totalSize) + '\n'
    } else {
      msg += '\n主图库：未初始化\n'
    }

    // 屏蔽图库
    const blockedCheck = checkBlockedGallery()
    if (blockedCheck.ok) {
      const { charCount, totalSize, imageCount } = getBlockedInfo()
      const blockedVer = getLocalVersionAt(BLOCKED_REPO_DIR)
      msg += '\n屏蔽图库：\n'
      msg += '  屏蔽角色数：' + charCount + '\n'
      msg += '  屏蔽图片数：' + imageCount + '\n'
      msg += '  大小：' + formatSize(totalSize) + '\n'
      msg += blockedVer ? '  版本：' + blockedVer.sha + '\n' : '  版本：未知\n'
    } else {
      msg += '\n屏蔽图库：未安装\n'
    }
    return e.reply(msg)
  }
}
