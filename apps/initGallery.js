import fs from 'node:fs'
import path from 'node:path'
import { installRepoAsync, installRepo } from '../model/git.js'
import { isJunction, ensureJunction, createCharJunction } from '../model/junction.js'
import { initMap, loadMap, getActiveRepoIds } from '../model/mapJson.js'
import { getPluginConfig } from '../components/config.js'
import { notifyMaster } from '../components/notify.js'
import {
  GALLERY_ROOT, PROFILE_DIR, MIAO_PROFILE_LINK, PROFILE_IMG_DIR,
  BLOCKED_REPO_DIR, BLOCKED_REPO_URL, getRepoDir, getRepoConfig
} from '../components/constants.js'

/**
 * #图库初始化 — 三步交互式初始化
 *
 * 1. 检查是否已初始化（junction 存在且有效）
 * 2. 若 miao-plugin/resources/profile 为真实目录 → 提示用户备份/确认
 * 3. 确认后：删除旧目录 → 创建 junction → 异步下载所有仓库 → 创建角色 junction
 */
export class InitGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]初始化',
      dsc: '初始化图库（创建 junction + 下载仓库）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库初始化$', fnc: 'init', permission: 'master' },
        { reg: '^#确认$', fnc: 'confirm', permission: 'master' },
        { reg: '^#取消$', fnc: 'cancel', permission: 'master' }
      ]
    })
    // 简单的状态机：记录等待确认的用户
    Bot._initPendingConfirm = Bot._initPendingConfirm || new Map()
  }

  /** 第一步：检查状态，提示用户 */
  async init(e) {
    if (!e) return // 避免与 loader 生命周期 init 冲突（加载时无参调用）
    // 已经初始化过了
    if (isJunction(MIAO_PROFILE_LINK)) {
      const verify = fs.existsSync(PROFILE_DIR)
      if (verify) {
        return e.reply('[面板图图库管理器] 图库已初始化，无需重复操作。')
      }
      // junction 存在但目标不存在 → 异常状态
      return e.reply('[面板图图库管理器] 图库 junction 存在但目标目录异常，请手动检查。')
    }

    // miao-plugin/resources/profile 存在且为真实目录
    if (fs.existsSync(MIAO_PROFILE_LINK)) {
      const hasContent = fs.readdirSync(MIAO_PROFILE_LINK).length > 0
      if (hasContent) {
        Bot._initPendingConfirm.set(e.user_id, { step: 'confirming' })
        return e.reply([
          '图库初始化会将 plugin/miao-plugin/resources/profile 文件夹删除。\n',
          '若是想保留该目录下的面板图，请发送【#取消】后发送【#备份图库】；\n',
          '若是不想保留或是迁移完毕，请发送【#确认】开始图库初始化。'
        ].join(''))
      }
      // 空目录，直接开始
      return this._doInit(e)
    }

    // profile 目录不存在，直接开始
    return this._doInit(e)
  }

  /** #确认 — 执行初始化 */
  async confirm(e) {
    const pending = Bot._initPendingConfirm.get(e.user_id)
    if (pending?.step !== 'confirming') {
      return e.reply('[面板图图库管理器] 没有待确认的初始化操作。')
    }
    Bot._initPendingConfirm.delete(e.user_id)
    return this._doInit(e)
  }

  /** #取消 — 取消初始化 */
  async cancel(e) {
    const pending = Bot._initPendingConfirm.get(e.user_id)
    if (pending?.step === 'confirming') {
      Bot._initPendingConfirm.delete(e.user_id)
      return e.reply('[面板图图库管理器] 图库初始化失败')
    }
    return e.reply('[面板图图库管理器] 没有待取消的初始化操作。')
  }

  /** 执行实际的初始化操作 */
  async _doInit(e) {
    e.reply('[面板图图库管理器] 开始图库初始化，请稍候...')

    try {
      // 1. 确保 gallery 目录结构存在
      if (!fs.existsSync(GALLERY_ROOT)) fs.mkdirSync(GALLERY_ROOT, { recursive: true })
      if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })
      if (!fs.existsSync(PROFILE_IMG_DIR)) fs.mkdirSync(PROFILE_IMG_DIR, { recursive: true })

      // 2. 建立 miao-plugin/resources/profile 的连接
      //    真实目录被 Yunzai 占用无法删除 → 只清理子目录，建子级 junction
      if (fs.existsSync(MIAO_PROFILE_LINK) && !isJunction(MIAO_PROFILE_LINK)) {
        for (const sub of ['normal-character', 'super-character']) {
          const subPath = path.join(MIAO_PROFILE_LINK, sub)
          const target = path.join(PROFILE_DIR, sub)
          if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true })
          // 子目录若是真实目录则删/移，否则直接建 junction
          if (fs.existsSync(subPath)) {
            if (!isJunction(subPath)) {
              try {
                fs.rmSync(subPath, { recursive: true, force: true })
              } catch {
                const oldSub = subPath + '.old.' + Date.now()
                fs.renameSync(subPath, oldSub)
                setTimeout(() => {
                  try { fs.rmSync(oldSub, { recursive: true, force: true }) } catch { /* ignore */ }
                }, 3000)
              }
            }
          }
          ensureJunction(target, subPath)
        }
      } else if (!isJunction(MIAO_PROFILE_LINK)) {
        // profile 目录不存在：直接创建顶层 junction
        const jResult = ensureJunction(PROFILE_DIR, MIAO_PROFILE_LINK)
        if (!jResult.ok) {
          return e.reply('[面板图图库管理器] 创建 profile junction 失败: ' + (jResult.error || '未知错误'))
        }
      }

      // 3. 初始化 map.json
      initMap()

      // 5. 下载所有活跃仓库（由 map.json 决定有哪些仓库，从 config 读取各仓库 URL）
      const activeIds = getActiveRepoIds()
      const config = getPluginConfig()

      let dlMsg = ''
      for (const repoId of activeIds) {
        const repo = getRepoConfig(repoId)
        const repoDir = getRepoDir(repoId)
        const result = installRepo(repo.remoteUrl, repoDir)
        dlMsg += `仓库${repoId}(${repo.name || '默认'})：${result.msg}\n`
        if (!result.ok) {
          return e.reply(`[面板图图库管理器] 图库初始化失败\n${dlMsg}`)
        }
      }

      // 6. 下载屏蔽图库
      const blockedUrl = config?.gallery?.blocked?.remoteUrl || BLOCKED_REPO_URL
      {
        // 确保 blocked-character 目录下的子目录存在
        const blockedNormal = path.join(PROFILE_DIR, 'normal-character')
        const blockedSuper = path.join(PROFILE_DIR, 'super-character')
        if (!fs.existsSync(blockedNormal)) fs.mkdirSync(blockedNormal, { recursive: true })
        if (!fs.existsSync(blockedSuper)) fs.mkdirSync(blockedSuper, { recursive: true })

        installRepo(blockedUrl, BLOCKED_REPO_DIR)
        dlMsg += '屏蔽图库：安装完成\n'
      }

      // 7. 读取 map.json，为已有角色创建 junction
      const map = loadMap()
      let junctionCount = 0
      for (const [charName, repoId] of Object.entries(map.mapping)) {
        const repoDir = getRepoDir(repoId)
        const nResult = createCharJunction(charName, 'normal', repoDir, PROFILE_DIR)
        const sResult = createCharJunction(charName, 'super', repoDir, PROFILE_DIR)
        if (nResult.ok || sResult.ok) junctionCount++
      }

      // 8. 扫描所有活跃仓库实际存在的角色目录（map.json 中可能没有，保底）
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

      notifyMaster('[面板图图库管理器] 图库初始化已完成\n' + dlMsg + `junction 数量：${junctionCount}`)
      return e.reply('[面板图图库管理器] 图库初始化已完成')
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 图库初始化失败:', err)
      return e.reply('[面板图图库管理器] 图库初始化失败: ' + err.message)
    }
  }
}
