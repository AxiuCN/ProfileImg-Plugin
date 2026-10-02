import fs from 'node:fs'
import path from 'node:path'
import { installRepoAsync, getLocalSha, acquireLock, gitExecAsync } from '../model/git.js'
import { getActiveRepoIds } from '../model/mapJson.js'
import { getPluginConfig, getGalleryConfig, writeGalleryConfig } from '../components/config.js'
import { notifyMaster } from '../components/notify.js'
import { setRepoVersion } from '../model/repoVersions.js'
import { getThirdPartyRepos } from '../model/galleryConfig.js'
import { syncProfileImgSrc } from '../model/profileSrc.js'
import { probeRepo } from '../model/srcProbe.js'
import { guardLayout } from '../model/layoutGuard.js'
import {
  BLOCKED_REPO_DIR, BLOCKED_REPO_URL, getRepoDir, getRepoConfig, PROFILE_IMG_DIR
} from '../components/constants.js'

/**
 * 图库下载管理（全程异步，不阻塞 Bot）
 * #下载主图库 / #下载屏蔽图库 — 首次下载
 * #强制下载主图库 / #强制下载屏蔽图库 — 重新下载
 *
 * 多图库源布局：clone 完成后调用 syncProfileImgSrc() 把各仓库注册为 miao 图库源
 * （miao config/profile.js 的 profileImgSrc），不再创建 junction、不再做复制聚合。
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
        { reg: '^#删除第三方图库\\s+(.+)$', fnc: 'deleteThirdParty', permission: 'master' },
        { reg: '^#强制下载主图库$', fnc: 'forceDownload', permission: 'master' },
        { reg: '^#强制下载屏蔽图库$', fnc: 'forceDownloadBlocked', permission: 'master' }
      ]
    })
  }

  /**
   * 注册 miao 图库源并生成提示（clone / 删除后调用，幂等）
   * @returns {string} 追加到回复末尾的提示文本（无可提示内容时为空串）
   */
  _syncSources() {
    const synced = syncProfileImgSrc()
    if (!synced.ok) return `\n⚠️ 注册图库源失败：${synced.error || '未知错误'}`
    const lines = [`\n当前已注册图库源：${synced.list.length} 个（含默认图库）`]
    if (synced.skipped.length) {
      // 「已配置但未就绪」的条目：目录不存在或结构不符；不影响已注册的源
      lines.push(`\nℹ️ 另有 ${synced.skipped.length} 个已配置图库未注册（与本次操作无关）：`)
      for (const s of synced.skipped) {
        lines.push(`  · ${s.label}：${s.reason}`)
        lines.push('    修复：确认仓库已完整克隆（可用 #下载第三方图库 <URL> 重新下载，或 #删除第三方图库 <名> 后重下），目录需为 normal-character/{角色}/ 或平铺 {角色}/')
      }
    }
    if (synced.changed) lines.push('\n⚠️ 请重启 Yunzai 使图库源配置生效。')
    return lines.join('')
  }

  /** 首次下载主图库 */
  async downloadMain(e) {
    // 布局守卫：旧布局（junction 聚合）必须先 #迁移图库；新装用户放行下载
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库下载完成\n${summary}${this._syncSources()}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 首次下载屏蔽图库 */
  async downloadBlocked(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

    const config = getPluginConfig()
    const blockedUrl = config?.gallery?.blocked?.remoteUrl || BLOCKED_REPO_URL

    const lock = acquireLock('blocked', '下载屏蔽图库', 'download')
    if (!lock.ok) {
      return e.reply(`[面板图图库管理器] ${lock.msg}`)
    }

    try {
      e.reply('[面板图图库管理器] 开始下载屏蔽图库（后台执行）...')
      const branch = await this._detectRemoteBranch(blockedUrl)
      const result = await installRepoAsync(blockedUrl, BLOCKED_REPO_DIR, branch)
      return e.reply('[面板图图库管理器] 屏蔽图库下载\n' + result.msg + this._syncSources())
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
   * 下载完成后用 srcProbe 探测目录结构并注册为 miao 图库源（不再复制图片到主图库）
   */
  async downloadThirdParty(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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
      // 目录结构由 srcProbe 自动探测，normalPath/superPath 仅为旧字段兼容而留空
      if (isUrl && !existingTp) {
        const cfg = getGalleryConfig()
        const list = Array.isArray(cfg.thirdParty) ? cfg.thirdParty : []
        list.push({
          name: repoName,
          dir: repoName,
          remoteUrl,
          normalPath: '',
          superPath: '',
          enabled: true
        })
        cfg.thirdParty = list
        const w = writeGalleryConfig(cfg)
        if (!w.ok) {
          return e.reply(`[面板图图库管理器] 下载成功但写入配置失败：${w.error}`)
        }
      }

      // 目录结构探测：可直读则注册为图库源，不可直读则提示整理结构
      const probe = probeRepo(targetDir)
      const probeMsg = this._probeHint(probe)

      return e.reply(`[面板图图库管理器] 第三方图库「${repoName}」下载完成\n${result.msg}${probeMsg}${this._syncSources()}`)
    } catch (err) {
      return e.reply(`[面板图图库管理器] 第三方图库「${repoName}」下载异常\n${err.message}`)
    } finally {
      lock.release()
    }
  }

  /**
   * 生成目录结构探测提示
   * @param {object} probe - probeRepo 结果
   * @returns {string} 提示文本
   */
  _probeHint(probe) {
    if (probe.level === 'unsupported') {
      return [
        `\n⚠️ 目录结构无法直读：${probe.reason}`,
        '\n请整理为以下任一结构后重新执行 #下载第三方图库 或 #更新第三方图库：',
        '\n  · normal-character/{角色}/ 与 super-character/{角色}/（分层）',
        '\n  · {角色}/（平铺，仓库根下不要放 docs 等含图的非角色目录）'
      ].join('')
    }
    return `\n目录结构：${probe.reason}`
  }

  /**
   * 删除第三方图库
   * #删除第三方图库 <图库名> — 移除配置 + 删除仓库目录，并重新注册图库源
   * 不允许删除 default 图库与主图库
   */
  async deleteThirdParty(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

    const arg = e.msg.replace(/^#删除第三方图库\s+/, '').trim()
    if (!arg) {
      return e.reply('[面板图图库管理器] 用法：#删除第三方图库 <图库名>')
    }

    // 保护 default 与主图库
    if (arg === 'default' || /^miao-plugin-ProfileImg(-\d+)?$/i.test(arg)) {
      return e.reply('[面板图图库管理器] 不允许删除 default 图库或主图库')
    }

    const tps = getThirdPartyRepos().filter(tp => tp.name === arg)
    if (tps.length === 0) {
      return e.reply(`[面板图图库管理器] 未找到第三方图库「${arg}」`)
    }

    // 安全校验：只允许删除位于图库目录（gallery/ProfileImg/）内的仓库目录，
    // 防止第三方 dir 被配置成外部绝对路径时误删
    const galleryBase = path.resolve(PROFILE_IMG_DIR)
    for (const tp of tps) {
      const resolved = path.resolve(tp.dir)
      if (!resolved.startsWith(galleryBase + path.sep)) {
        return e.reply(`[面板图图库管理器] 已拒绝删除：图库「${arg}」的目录不在图库目录内（${path.basename(resolved)}）`)
      }
    }

    const lock = acquireLock(`tp-del-${arg}`, '删除第三方图库', 'update')
    if (!lock.ok) {
      return e.reply(`[面板图图库管理器] ${lock.msg}`)
    }

    try {
      // 从 gallery_config.yaml 移除配置
      const cfg = getGalleryConfig()
      if (Array.isArray(cfg.thirdParty)) {
        cfg.thirdParty = cfg.thirdParty.filter(tp => tp.name !== arg)
        const w = writeGalleryConfig(cfg)
        if (!w.ok) {
          return e.reply(`[面板图图库管理器] 写入配置失败：${w.error}`)
        }
      }

      // 删除仓库目录
      let dirMsg = ''
      for (const tp of tps) {
        if (fs.existsSync(tp.dir)) {
          fs.rmSync(tp.dir, { recursive: true, force: true })
          dirMsg += `\n已删除仓库目录：${tp.dir}`
        }
      }

      return e.reply(`[面板图图库管理器] 第三方图库「${arg}」已删除${dirMsg}${this._syncSources()}`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除第三方图库失败:', err)
      return e.reply('[面板图图库管理器] 删除第三方图库失败: ' + err.message)
    } finally {
      lock.release()
    }
  }

  /** 强制重新下载主图库 */
  async forceDownload(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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

    const summary = results.join('\n')
    const msg = `[面板图图库管理器] 主图库强制下载完成\n${summary}${this._syncSources()}`
    notifyMaster(msg)
    return e.reply(msg)
  }

  /** 强制重新下载屏蔽图库 */
  async forceDownloadBlocked(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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
      const branch = await this._detectRemoteBranch(blockedUrl)
      const result = await installRepoAsync(blockedUrl, BLOCKED_REPO_DIR, branch)
      return e.reply('[面板图图库管理器] 屏蔽图库强制下载\n' + result.msg + this._syncSources())
    } finally {
      lock.release()
    }
  }
}
