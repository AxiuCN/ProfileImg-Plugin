import { gitExecAsync, getRemoteShaAsync, getLocalSha, fastForwardPullAsync, forceResetAsync, acquireLock, getRepoBranch } from '../model/git.js'
import { checkRepo, checkBlockedGallery } from '../model/gallery.js'
import { notifyMaster, restartHint } from '../components/notify.js'
import { getPluginConfig } from '../components/config.js'
import { BLOCKED_REPO_DIR, getRepoDir, getRepoConfig } from '../components/constants.js'
import { getActiveRepoIds } from '../model/mapJson.js'
import { setRepoVersion } from '../model/repoVersions.js'
import { getThirdPartyRepos } from '../model/galleryConfig.js'
import { syncProfileImgSrc } from '../model/profileSrc.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 多仓库图库更新（手动 + cron 自动，全程异步不阻塞 Bot）
 *
 * 多图库源布局：各图库仓库（主仓库 / 第三方仓库）由 miao 通过 profileImgSrc 直接读取，
 * 更新只做 git pull，不再复制到主仓库、不再维护 junction；
 * 每次更新完成后重新注册图库源（仓库数量 / 结构变化时需重启 Yunzai 生效）。
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

  /** 更新后记录仓库版本（图库源由 syncProfileImgSrc 统一注册） */
  _recordRepoVersion(repoId) {
    const sha = getLocalSha(getRepoDir(repoId))
    if (sha) setRepoVersion(repoId, sha)
  }

  /**
   * 注册 miao 图库源并生成提示（更新后调用，幂等）
   * @returns {string} 追加到回复末尾的提示文本（无可提示内容时为空串）
   */
  _syncSources() {
    const synced = syncProfileImgSrc()
    if (!synced.ok) return `\n⚠️ 注册图库源失败：${synced.error || '未知错误'}`
    const lines = [`\n当前已注册图库源：${synced.list.length} 个（含默认图库）`]
    if (synced.skipped.length) {
      lines.push(`\nℹ️ 另有 ${synced.skipped.length} 个已配置图库未注册（与本次操作无关）：`)
      for (const s of synced.skipped) {
        lines.push(`  · ${s.label}：${s.reason}`)
        lines.push('    修复：确认仓库已完整克隆（可用 #下载第三方图库 <URL> 重新下载，或 #删除第三方图库 <名> 后重下），目录需为 normal-character/{角色}/ 或平铺 {角色}/')
      }
    }
    if (synced.changed) lines.push(restartHint())
    return lines.join('')
  }

  _registerCronTasks() {
    const config = getPluginConfig()
    const autoCfg = config?.gallery?.autoUpdate || {}
    // 所有图库统一一个 cron，按主图库 → 屏蔽图库 → 第三方图库 → 图库源同步顺序执行
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
   * 按主图库 → 屏蔽图库 → 第三方图库 → 图库源同步顺序执行，
   * 每个步骤独立 try/catch，单个失败不中断后续，末尾统一汇总通知。
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
        const branch = getRepoBranch(repoDir)
        const remoteSha = await getRemoteShaAsync(repoDir, branch)
        if (!remoteSha) continue
        const localSha = getLocalSha(repoDir)
        if (remoteSha === localSha) continue
        const result = await fastForwardPullAsync(repoDir, branch)
        this._recordRepoVersion(repo.id)
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
            const blockedBranch = getRepoBranch(BLOCKED_REPO_DIR)
            const remoteSha = await getRemoteShaAsync(BLOCKED_REPO_DIR, blockedBranch)
            if (remoteSha) {
              const localSha = getLocalSha(BLOCKED_REPO_DIR)
              if (remoteSha !== localSha) {
                await gitExecAsync(BLOCKED_REPO_DIR, `pull origin ${blockedBranch} --allow-unrelated-histories`, 60000)
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

    // ③ 第三方图库（逐个，仅 git pull；未配置远程地址的本地只读源跳过）
    if (cfg.thirdPartyUpdate?.enabled !== false) {
      const tps = getThirdPartyRepos().filter(tp => tp.enabled)
      for (const tp of tps) {
        if (!tp.remoteUrl) {
          lines.push(`第三方「${tp.name}」：本地只读源（未配置远程地址），跳过更新`)
          continue
        }
        const check = checkRepo(tp.dir)
        if (!check.ok) { lines.push(`第三方「${tp.name}」：${check.msg}`); continue }

        const lock = acquireLock(`tp-${tp.idx}`, '第三方图库自动更新', 'update')
        if (!lock.ok) continue
        try {
          const branch = getRepoBranch(tp.dir)
          const remoteSha = await getRemoteShaAsync(tp.dir, branch)
          if (!remoteSha) continue
          const localSha = getLocalSha(tp.dir)
          if (remoteSha === localSha) continue
          const result = await fastForwardPullAsync(tp.dir, branch)
          lines.push(`第三方「${tp.name}」：更新${result.updated ? '成功' : '完成'}（${localSha} -> ${remoteSha}）`)
        } catch (err) {
          lines.push(`第三方「${tp.name}」：更新失败 - ${err.message}`)
        } finally {
          lock.release()
        }
      }
    }

    // ④ 图库源同步（仓库数量 / 目录结构变化时写入 miao profileImgSrc）
    try {
      const synced = syncProfileImgSrc()
      if (!synced.ok) {
        lines.push(`图库源同步：失败 - ${synced.error || '未知错误'}`)
      } else {
        if (synced.changed) lines.push('图库源同步：已更新，需重启 Yunzai 后生效')
        if (synced.skipped.length) {
          lines.push(`图库源同步：${synced.skipped.length} 个仓库无法直读（` +
            synced.skipped.map(s => `${s.label}（${s.reason}）`).join('；') + '）')
        }
      }
    } catch (err) {
      lines.push(`图库源同步：失败 - ${err.message}`)
    }

    notifyMaster(`[面板图图库管理器] 自动更新完成\n${lines.length ? lines.join('\n') : '所有图库已是最新'}`)
  }

  // ========== 手动更新命令（全异步） ==========

  /** #更新第三方图库 [图库名] — pull 第三方仓库（可指定单个），不复制图片 */
  async updateThirdParty(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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
      if (!tp.remoteUrl) {
        results.push(`图库「${tp.name}」：本地只读源（未配置远程地址），跳过更新`)
        continue
      }
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
        const result = await fastForwardPullAsync(tp.dir, getRepoBranch(tp.dir))
        results.push(`图库「${tp.name}」：${result.msg}`)
      } catch (err) {
        results.push(`图库「${tp.name}」：更新失败 - ${err.message}`)
      } finally {
        lock.release()
      }
    }
    return e.reply('[面板图图库管理器] 第三方图库更新\n' + results.join('\n') + this._syncSources())
  }

  async updateMain(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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
        const result = await fastForwardPullAsync(repoDir, getRepoBranch(repoDir))
        this._recordRepoVersion(repo.id)
        completed++
        results.push(`仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
        if (total > 1) {
          e.reply(`[面板图图库管理器] 更新进度：${completed}/${total}\n仓库${repo.id}(${repo.name || '默认'})：${result.msg}`)
        }
      } finally {
        lock.release()
      }
    }
    return e.reply('[面板图图库管理器] 主图库更新\n' + results.join('\n') + this._syncSources())
  }

  async forceUpdateMain(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

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
        await forceResetAsync(repoDir, getRepoBranch(repoDir))
        this._recordRepoVersion(repo.id)
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
    return e.reply('[面板图图库管理器] 主图库强制更新\n' + results.join('\n') + this._syncSources())
  }

  async updateBlocked(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)

    const lock = acquireLock('blocked', '更新屏蔽图库', 'update')
    if (!lock.ok) return e.reply(`[面板图图库管理器] ${lock.msg}`)

    try {
      e.reply('[面板图图库管理器] 开始更新屏蔽图库...')
      const result = await fastForwardPullAsync(BLOCKED_REPO_DIR, getRepoBranch(BLOCKED_REPO_DIR))
      return e.reply('[面板图图库管理器] 屏蔽图库更新\n' + result.msg)
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库更新失败\n' + err.message)
    } finally {
      lock.release()
    }
  }

  async forceUpdateBlocked(e) {
    if (!(await guardLayout(e, { allowFresh: true }))) return true

    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)

    const lock = acquireLock('blocked', '强制更新屏蔽图库', 'update')
    if (!lock.ok) return e.reply(`[面板图图库管理器] ${lock.msg}`)

    try {
      e.reply('[面板图图库管理器] 开始强制更新屏蔽图库...')
      await forceResetAsync(BLOCKED_REPO_DIR, getRepoBranch(BLOCKED_REPO_DIR))
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新成功')
    } catch (err) {
      return e.reply('[面板图图库管理器] 屏蔽图库强制更新失败\n' + err.message)
    } finally {
      lock.release()
    }
  }
}
