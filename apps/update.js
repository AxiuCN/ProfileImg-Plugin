import { gitExecAsync, getRemoteShaAsync, getLocalSha, fastForwardPullAsync, forceResetAsync, acquireLock } from '../model/git.js'
import { checkRepo, checkBlockedGallery, checkProfileJunction } from '../model/gallery.js'
import { notifyMaster } from '../components/notify.js'
import { getPluginConfig } from '../components/config.js'
import { BLOCKED_REPO_DIR, getRepoDir, getRepoConfig } from '../components/constants.js'
import { getActiveRepoIds } from '../model/mapJson.js'
import { setRepoVersion } from '../model/repoVersions.js'
import { getThirdPartyRepos } from '../model/galleryConfig.js'
import { syncThirdPartyRepo, ensureAllCharJunctions, syncDefaultToMain } from '../model/copier.js'

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
        { reg: '^#屏蔽图库强制更新$', fnc: 'forceUpdateBlocked', permission: 'master' },
        { reg: '^#更新第三方图库(?:\s+(.+))?$', fnc: 'updateThirdParty', permission: 'master' }
      ]
    })
    this._registerCronTasks()
  }

  _getActiveRepos() {
    return getActiveRepoIds().map(id => getRepoConfig(id))
  }

  /** 更新后确保该仓库已有角色创建角色级 junction + 记录版本 */
  _syncAfterRepoUpdate(repoId) {
    ensureAllCharJunctions([repoId])
    const sha = getLocalSha(getRepoDir(repoId))
    if (sha) setRepoVersion(repoId, sha)
  }

  _registerCronTasks() {
    const config = getPluginConfig()
    const autoCfg = config?.gallery?.autoUpdate || {}
    // 所有图库统一一个 cron，按主图库 → 屏蔽图库 → 第三方图库 → 刷新副本顺序执行
    if (autoCfg.enabled !== false && autoCfg.cron) {
      this.task = [{
        name: '图库自动更新',
        cron: autoCfg.cron,
        fnc: () => this._autoUpdateAll(),
        log: false
      }]
    }
  }

  /**
   * 统一自动更新链（异步，有锁保护）
   * 按主图库 → 屏蔽图库 → 第三方图库 → 刷新副本顺序执行，
   * 每个图库独立 try/catch，单个失败不中断后续，末尾统一汇总通知。
   */
  async _autoUpdateAll() {
    const cfg = getPluginConfig()?.gallery || {}
    const lines = []

    // ① 主图库（逐仓库）
    for (const repo of this._getActiveRepos()) {
      if (repo.autoUpdate === false) continue
      const repoDir = getRepoDir(repo.id)
      const check = checkRepo(repoDir)
      if (!check.ok) { lines.push(`主图库仓库${repo.id}：${check.msg}`); continue }

      const lock = acquireLock(String(repo.id), '自动更新', 'update')
      if (!lock.ok) continue
      try {
        const remoteSha = await getRemoteShaAsync(repoDir)
        if (!remoteSha) continue
        const localSha = getLocalSha(repoDir)
        if (remoteSha === localSha) continue
        const result = await fastForwardPullAsync(repoDir)
        this._syncAfterRepoUpdate(repo.id)
        lines.push(`主图库仓库${repo.id}：更新${result.updated ? '成功' : '完成'}（${localSha} -> ${remoteSha}）`)
      } catch (err) {
        lines.push(`主图库仓库${repo.id}：更新失败 - ${err.message}`)
      } finally {
        lock.release()
      }
    }

    // ② 屏蔽图库
    if (cfg.blocked?.enabled !== false) {
      const check = checkBlockedGallery()
      if (check.ok) {
        const lock = acquireLock('blocked', '自动更新', 'update')
        if (lock.ok) {
          try {
            const remoteSha = await getRemoteShaAsync(BLOCKED_REPO_DIR)
            if (remoteSha) {
              const localSha = getLocalSha(BLOCKED_REPO_DIR)
              if (remoteSha !== localSha) {
                await gitExecAsync(BLOCKED_REPO_DIR, 'pull origin main --allow-unrelated-histories', 60000)
                lines.push(`屏蔽图库：更新成功（${localSha} -> ${remoteSha}）`)
              }
            }
          } catch (err) {
            lines.push(`屏蔽图库：更新失败 - ${err.message}`)
          } finally {
            lock.release()
          }
        }
      } else {
        lines.push(`屏蔽图库：${check.msg}`)
      }
    }

    // ③ 第三方图库（逐个）
    if (cfg.thirdPartyUpdate?.enabled !== false) {
      const tps = getThirdPartyRepos().filter(tp => tp.enabled)
      for (const tp of tps) {
        const check = checkRepo(tp.dir)
        if (!check.ok) { lines.push(`第三方「${tp.name}」：${check.msg}`); continue }

        const lock = acquireLock(`tp-${tp.idx}`, '第三方图库自动更新', 'update')
        if (!lock.ok) continue
        try {
          const remoteSha = await getRemoteShaAsync(tp.dir)
          if (!remoteSha) continue
          const localSha = getLocalSha(tp.dir)
          if (remoteSha === localSha) continue
          const result = await fastForwardPullAsync(tp.dir)
          const sync = syncThirdPartyRepo(tp, tp.idx)
          lines.push(`第三方「${tp.name}」：更新${result.updated ? '成功' : '完成'}（复制 ${sync.copied}，跳过 ${sync.skipped}，清理 ${sync.removed}）`)
        } catch (err) {
          lines.push(`第三方「${tp.name}」：更新失败 - ${err.message}`)
        } finally {
          lock.release()
        }
      }
    }

    // ④ 刷新副本（junction + default/第三方副本）
    if (cfg.refreshCopies?.enabled !== false) {
      try {
        const jCount = ensureAllCharJunctions(getActiveRepoIds())
        const def = syncDefaultToMain()
        const tpInfo = getThirdPartyRepos().filter(tp => tp.enabled).map(tp => {
          const s = syncThirdPartyRepo(tp, tp.idx)
          return s.ok ? `复制${s.copied}/跳过${s.skipped}/清理${s.removed}` : (s.error || '失败')
        })
        const tpText = tpInfo.length ? `，第三方（${tpInfo.join('；')}）` : ''
        lines.push(`刷新副本：junction ${jCount} 个，default ${def.ok ? `复制${def.copied}/跳过${def.skipped}/清理${def.removed}` : (def.error || '失败')}${tpText}`)
      } catch (err) {
        lines.push(`刷新副本：失败 - ${err.message}`)
      }
    }

    notifyMaster(`[面板图图库管理器] 自动更新完成\n${lines.length ? lines.join('\n') : '所有图库已是最新'}`)
  }

  // ========== 手动更新命令（全异步） ==========

  /** #更新第三方图库 [图库名] — pull 第三方仓库（可指定单个）后复制新图到主图库 */
  async updateThirdParty(e) {
    const match = e.msg.match(/^#更新第三方图库(?:\s+(.+))?$/)
    const arg = match?.[1]?.trim() || ''

    let tps = getThirdPartyRepos().filter(tp => tp.enabled)
    if (arg) {
      tps = tps.filter(tp => tp.name === arg)
      if (tps.length === 0) {
        return e.reply(`[面板图图库管理器] 未找到启用的第三方图库「${arg}」（config/gallery_config.yaml）`)
      }
    }
    if (tps.length === 0) {
      return e.reply('[面板图图库管理器] 未配置启用的第三方图库（config/gallery_config.yaml）')
    }

    e.reply(`[面板图图库管理器] 开始更新 ${arg ? `第三方图库「${arg}」` : `${tps.length} 个第三方图库`}...`)
    const results = []

    for (const tp of tps) {
      const check = checkRepo(tp.dir)
      if (!check.ok) {
        results.push(`图库「${tp.name}」：${check.msg}`)
        continue
      }

      const lock = acquireLock(`tp-${tp.idx}`, '更新第三方图库', 'update')
      if (!lock.ok) {
        results.push(`图库「${tp.name}」：${lock.msg}`)
        continue
      }

      try {
        const result = await fastForwardPullAsync(tp.dir)
        const sync = syncThirdPartyRepo(tp, tp.idx)
        results.push(`图库「${tp.name}」：${result.msg}（复制 ${sync.copied}，跳过 ${sync.skipped}，清理 ${sync.removed}）`)
      } catch (err) {
        results.push(`图库「${tp.name}」：更新失败 - ${err.message}`)
      } finally {
        lock.release()
      }
    }
    return e.reply('[面板图图库管理器] 第三方图库更新\n' + results.join('\n'))
  }

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

      const lock = acquireLock(String(repo.id), '更新主图库', 'update')
      if (!lock.ok) {
        completed++
        results.push(`仓库${repo.id}(${repo.name || '默认'})：${lock.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 更新进度：${completed}/${total}\n仓库${repo.id}(${repo.name || '默认'})：${lock.msg}`)
        }
        continue
      }

      try {
        const result = await fastForwardPullAsync(repoDir)
        this._syncAfterRepoUpdate(repo.id)
        completed++
        results.push(`仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 更新进度：${completed}/${total}\n仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
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

      const lock = acquireLock(String(repo.id), '强制更新主图库', 'update')
      if (!lock.ok) {
        completed++
        results.push(`仓库${repo.id}(${repo.name || '默认'})：${lock.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 强制更新进度：${completed}/${total}\n仓库${repo.id}(${repo.name || '默认'})：${lock.msg}`)
        }
        continue
      }

      try {
        await forceResetAsync(repoDir)
        this._syncAfterRepoUpdate(repo.id)
        completed++
        results.push(`仓库${repo.id}：强制更新成功`)
      } catch (err) {
        completed++
        results.push(`仓库${repo.id}：强制更新失败 - ${err.message}`)
      } finally {
        lock.release()
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

    const lock = acquireLock('blocked', '更新屏蔽图库', 'update')
    if (!lock.ok) return e.reply(`[面板图图库管理器] ${lock.msg}`)

    try {
      e.reply('[面板图图库管理器] 开始更新屏蔽图库...')
      const result = await fastForwardPullAsync(BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库更新\n' + result.msg)
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库更新失败\n' + err.message)
    } finally {
      lock.release()
    }
  }

  async forceUpdateBlocked(e) {
    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)

    const lock = acquireLock('blocked', '强制更新屏蔽图库', 'update')
    if (!lock.ok) return e.reply(`[面板图图库管理器] ${lock.msg}`)

    try {
      e.reply('[面板图图库管理器] 开始强制更新屏蔽图库...')
      await forceResetAsync(BLOCKED_REPO_DIR)
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新成功')
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新失败\n' + err.message)
    } finally {
      lock.release()
    }
  }
}
