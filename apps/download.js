import fs from 'node:fs'
import path from 'node:path'
import { installRepoAsync, acquireLock } from '../model/git.js'
import { createCharJunction } from '../model/junction.js'
import { loadMap, getActiveRepoIds } from '../model/mapJson.js'
import { getPluginConfig } from '../components/config.js'
import { notifyMaster } from '../components/notify.js'
import { checkProfileJunction } from '../model/gallery.js'
import {
  PROFILE_DIR, BLOCKED_REPO_DIR, BLOCKED_REPO_URL, getRepoDir, getRepoConfig
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
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
      }
    }

    const jCount = this._rebuildCharJunctions(activeIds)

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库下载完成\n${summary}\njunction 数量：${jCount}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 首次下载屏蔽图库 */
  async downloadBlocked(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

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
        completed++
        results.push(`仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 强制下载进度：${completed}/${total}\n仓库${repoId}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
      }
    }

    const jCount = this._rebuildCharJunctions(activeIds)

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库强制下载完成\n${summary}\njunction 数量：${jCount}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 强制重新下载屏蔽图库 */
  async forceDownloadBlocked(e) {
    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请发送 #图库初始化')
    }

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
   * 重建所有角色 junction（下载完成后调用）
   */
  _rebuildCharJunctions(activeIds) {
    let junctionCount = 0

    const map = loadMap()
    for (const [charName, repoId] of Object.entries(map.mapping)) {
      const repoDir = getRepoDir(repoId)
      const nResult = createCharJunction(charName, 'normal', repoDir, PROFILE_DIR)
      const sResult = createCharJunction(charName, 'super', repoDir, PROFILE_DIR)
      if (nResult.ok || sResult.ok) junctionCount++
    }

    for (const repoId of activeIds) {
      const repoDir = getRepoDir(repoId)
      try {
        const repoNormal = path.join(repoDir, 'normal-character')
        if (fs.existsSync(repoNormal)) {
          const chars = fs.readdirSync(repoNormal, { withFileTypes: true })
            .filter(d => d.isDirectory())
          for (const c of chars) {
            createCharJunction(c.name, 'normal', repoDir, PROFILE_DIR)
          }
        }
        const repoSuper = path.join(repoDir, 'super-character')
        if (fs.existsSync(repoSuper)) {
          const chars = fs.readdirSync(repoSuper, { withFileTypes: true })
            .filter(d => d.isDirectory())
          for (const c of chars) {
            createCharJunction(c.name, 'super', repoDir, PROFILE_DIR)
          }
        }
      } catch (scanErr) {
        logger.warn(`[ProfileImg-Plugin] 扫描仓库${repoId}角色目录失败:`, scanErr)
      }
    }

    return junctionCount
  }
}
