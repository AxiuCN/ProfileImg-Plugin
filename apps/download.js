import fs from 'node:fs'
import path from 'node:path'
import { installRepoAsync, getLocalSha, acquireLock, gitExecAsync } from '../model/git.js'
import { getActiveRepoIds } from '../model/mapJson.js'
import { getPluginConfig, getGalleryConfig, writeGalleryConfig } from '../components/config.js'
import { notifyMaster } from '../components/notify.js'
import { checkProfileJunction, checkRepo } from '../model/gallery.js'
import { setRepoVersion } from '../model/repoVersions.js'
import { ensureAllCharJunctions, syncThirdPartyRepo } from '../model/copier.js'
import { getThirdPartyRepos } from '../model/galleryConfig.js'
import {
  BLOCKED_REPO_DIR, BLOCKED_REPO_URL, getRepoDir, getRepoConfig, PROFILE_IMG_DIR
} from '../components/constants.js'

/**
 * 图库下载管理（全程异步，不阻塞 Bot）
 * #下载主图库 / #下载屏蔽图库 — 首次下载
 * #强制下载主图库 / #强制下载屏蔽图库 — 重新下载
 */
export class Download extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]下载',
      dsc: '下载/强制下载图库',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#下载主图库$', fnc: 'downloadMain', permission: 'master' },
        { reg: '^#下载屏蔽图库$', fnc: 'downloadBlocked', permission: 'master' },
        { reg: '^#下载第三方图库\\s+(.+)$', fnc: 'downloadThirdParty', permission: 'master' },
        { reg: '^#强制下载主图库$', fnc: 'forceDownload', permission: 'master' },
        { reg: '^#强制下载屏蔽图库$', fnc: 'forceDownloadBlocked', permission: 'master' }
      ]
    })
  }

  /** 首次下载主图库 */
  async downloadMain(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

    const activeIds = getActiveRepoIds()
    const total = activeIds.length
    e.reply(`[面板图图库管理器] 开始下载主图库（${total} 个仓库，逐个通知进度）...`)

    const results = []
    let completed = 0
    for (const repoId of activeIds) {
      const repo = getRepoConfig(repoId)
      const repoDir = getRepoDir(repoId)

      const lock = acquireLock(String(repoId), '下载主图库', 'download')
      if (!lock.ok) {
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${lock.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${lock.msg}`)
        }
        continue
      }

      try {
        const result = await installRepoAsync(repo.remoteUrl, repoDir)
        if (result.ok) {
          const sha = getLocalSha(repoDir)
          if (sha) setRepoVersion(repoId, sha)
        }
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
      }
    }

    const jCount = this._ensureJunctions(activeIds)

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库下载完成\n${summary}\n角色 junction 数量：${jCount}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 首次下载屏蔽图库 */
  async downloadBlocked(e) {
    const config = getPluginConfig()
    const blockedUrl = config?.gallery?.blocked?.remoteUrl || BLOCKED_REPO_URL

    const lock = acquireLock('blocked', '下载屏蔽图库', 'download')
    if (!lock.ok) {
      return e.reply(`[面板图图库管理器] ${lock.msg}`)
    }

    try {
      e.reply('[面板图图库管理器] 开始下载屏蔽图库（后台执行）...')
      const result = await installRepoAsync(blockedUrl, BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库下载\n' + result.msg)
    } finally {
      lock.release()
    }
  }

  /**
   * 检测远程仓库默认分支名（main / master / 其他）
   * @param {string} url - 远程仓库 URL
   * @returns {Promise<string>} 分支名，检测失败返回 'main'
   */
  async _detectRemoteBranch(url) {
    try {
      const r = await gitExecAsync(process.cwd(), `ls-remote --symref ${url} HEAD`, 30000)
      if (!r.ok) return 'main'
      const m = (r.stdout || '').match(/ref:\s*refs\/heads\/(\S+)\s+HEAD/)
      return m ? m[1] : 'main'
    } catch {
      return 'main'
    }
  }

  /**
   * 下载第三方图库
   * 支持两种参数：
   *   #下载第三方图库 <Git仓库URL>        — clone 到 PROFILE_IMG_DIR 并注册到 gallery_config.yaml
   *   #下载第三方图库 <已配置图库名>       — 按名称匹配已有配置，clone 到其 dir
   * 下载完成后同步复制图片到主图库
   */
  async downloadThirdParty(e) {
    const arg = e.msg.replace(/^#下载第三方图库\s+/, '').trim()
    if (!arg) {
      return e.reply('[面板图图库管理器] 用法：\n#下载第三方图库 <Git仓库URL>\n#下载第三方图库 <已配置图库名>')
    }

    const isUrl = /^https?:\/\/\S+/i.test(arg)
    let repoName, remoteUrl, targetDir, existingTp

    if (isUrl) {
      remoteUrl = arg
      repoName = arg.replace(/\.git$/, '').split('/').pop().trim()
      if (!repoName) {
        return e.reply('[面板图图库管理器] 无法从 URL 提取仓库名')
      }
      targetDir = path.join(PROFILE_IMG_DIR, repoName)
      existingTp = getThirdPartyRepos().find(tp => tp.dir === targetDir || tp.name === repoName)
    } else {
      existingTp = getThirdPartyRepos().find(tp => tp.name === arg)
      if (!existingTp) {
        return e.reply(`[面板图图库管理器] 未找到名为「${arg}」的第三方图库配置\n请先用 #下载第三方图库 <URL> 或锅巴配置`)
      }
      repoName = existingTp.name
      remoteUrl = existingTp.remoteUrl
      targetDir = existingTp.dir
      if (!remoteUrl) {
        return e.reply(`[面板图图库管理器] 图库「${repoName}」未配置远程地址，无法下载`)
      }
    }

    // 目录冲突检查：不与主图库重名
    if (targetDir === getRepoDir(0)) {
      return e.reply('[面板图图库管理器] 目录名与主图库冲突，请更换')
    }

    const lock = acquireLock(`tp-dl-${repoName}`, '下载第三方图库', 'download')
    if (!lock.ok) {
      return e.reply(`[面板图图库管理器] ${lock.msg}`)
    }

    try {
      e.reply(`[面板图图库管理器] 开始下载第三方图库「${repoName}」...`)
      const branch = await this._detectRemoteBranch(remoteUrl)
      const result = await installRepoAsync(remoteUrl, targetDir, branch)
      if (!result.ok) {
        return e.reply(`[面板图图库管理器] 第三方图库「${repoName}」下载失败\n${result.msg}`)
      }

      // URL 模式且未注册：追加到 gallery_config.yaml
      if (isUrl && !existingTp) {
        const cfg = getGalleryConfig()
        const list = Array.isArray(cfg.thirdParty) ? cfg.thirdParty : []
        list.push({
          name: repoName,
          dir: repoName,
          remoteUrl,
          normalPath: 'normal-character',
          superPath: 'super-character',
          enabled: true
        })
        cfg.thirdParty = list
        const w = writeGalleryConfig(cfg)
        if (!w.ok) {
          return e.reply(`[面板图图库管理器] 下载成功但写入配置失败：${w.error}`)
        }
      }

      // 同步复制到主图库
      const tp = getThirdPartyRepos().find(t => t.dir === targetDir)
      let syncMsg = ''
      if (tp) {
        const sync = syncThirdPartyRepo(tp, tp.idx)
        syncMsg = `\n复制 ${sync.copied}，跳过 ${sync.skipped}，清理 ${sync.removed}`
      }

      return e.reply(`[面板图图库管理器] 第三方图库「${repoName}」下载完成\n${result.msg}${syncMsg}`)
    } catch (err) {
      return e.reply(`[面板图图库管理器] 第三方图库「${repoName}」下载异常\n${err.message}`)
    } finally {
      lock.release()
    }
  }

  /** 强制重新下载主图库 */
  async forceDownload(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

    const activeIds = getActiveRepoIds()
    const total = activeIds.length
    e.reply(`[面板图图库管理器] 开始强制重新下载主图库（${total} 个仓库）...`)

    const results = []
    let completed = 0
    for (const repoId of activeIds) {
      const repo = getRepoConfig(repoId)
      const repoDir = getRepoDir(repoId)

      const lock = acquireLock(String(repoId), '强制下载主图库', 'download')
      if (!lock.ok) {
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${lock.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 强制下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${lock.msg}`)
        }
        continue
      }

      try {
        if (fs.existsSync(repoDir)) {
          fs.rmSync(repoDir, { recursive: true, force: true })
        }
        const result = await installRepoAsync(repo.remoteUrl, repoDir)
        if (result.ok) {
          const sha = getLocalSha(repoDir)
          if (sha) setRepoVersion(repoId, sha)
        }
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 强制下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
      }
    }

    const jCount = this._ensureJunctions(activeIds)

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库强制下载完成\n${summary}\n角色 junction 数量：${jCount}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 强制重新下载屏蔽图库 */
  async forceDownloadBlocked(e) {
    const config = getPluginConfig()
    const blockedUrl = config?.gallery?.blocked?.remoteUrl || BLOCKED_REPO_URL

    const lock = acquireLock('blocked', '强制下载屏蔽图库', 'download')
    if (!lock.ok) {
      return e.reply(`[面板图图库管理器] ${lock.msg}`)
    }

    try {
      e.reply('[面板图图库管理器] 开始强制重新下载屏蔽图库（后台执行）...')
      if (fs.existsSync(BLOCKED_REPO_DIR)) {
        fs.rmSync(BLOCKED_REPO_DIR, { recursive: true, force: true })
      }
      const result = await installRepoAsync(blockedUrl, BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库强制下载\n' + result.msg)
    } finally {
      lock.release()
    }
  }

  /**
   * 确保所有仓库的角色级 junction 存在（下载完成后调用）
   * @param {number[]} activeIds - 下载的仓库编号
   * @returns {number} 角色级 junction 数量
   */
  _ensureJunctions(activeIds) {
    return ensureAllCharJunctions(activeIds)
  }
}
