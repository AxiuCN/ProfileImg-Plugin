import fs from 'node:fs'
import path from 'node:path'
import { isJunction, ensureJunction } from '../model/junction.js'
import { initMap } from '../model/mapJson.js'
import {
  GALLERY_ROOT, PROFILE_DIR, MIAO_PROFILE_LINK, PROFILE_IMG_DIR,
} from '../components/constants.js'

/**
 * #图库初始化 — 三步交互式初始化
 *
 * 1. 检查是否已初始化（junction 存在且有效）
 * 2. 若 miao-plugin/resources/profile 为真实目录 → 提示用户备份/确认
 * 3. 确认后：删除旧目录 → 创建 junction → 初始化 map.json
 * 4. 完成后提示用户执行 #下载主图库 / #下载屏蔽图库
 */
export class InitGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]初始化',
      dsc: '初始化图库（创建 junction）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库初始化$', fnc: 'init', permission: 'master' },
        { reg: '^#确认$', fnc: 'confirm', permission: 'master' },
        { reg: '^#取消$', fnc: 'cancel', permission: 'master' }
      ]
    })
    Bot._initPendingConfirm = Bot._initPendingConfirm || new Map()
  }

  /** 第一步：检查状态，提示用户 */
  async init(e) {
    if (!e) return // 避免与 loader 生命周期 init 冲突（加载时无参调用）
    if (isJunction(MIAO_PROFILE_LINK)) {
      const verify = fs.existsSync(PROFILE_DIR)
      if (verify) {
        return e.reply('[面板图图库管理器] 图库已初始化，无需重复操作。')
      }
      return e.reply('[面板图图库管理器] 图库 junction 存在但目标目录异常，请手动检查。')
    }

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
      return this._doInit(e)
    }

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

  /** 执行实际的初始化操作（只创建 junction，不下载仓库） */
  async _doInit(e) {
    e.reply('[面板图图库管理器] 开始图库初始化，请稍候...')

    try {
      // 1. 确保 gallery 目录结构存在
      if (!fs.existsSync(GALLERY_ROOT)) fs.mkdirSync(GALLERY_ROOT, { recursive: true })
      if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })
      if (!fs.existsSync(PROFILE_IMG_DIR)) fs.mkdirSync(PROFILE_IMG_DIR, { recursive: true })

      // 2. 建立 miao-plugin/resources/profile 的连接
      if (fs.existsSync(MIAO_PROFILE_LINK) && !isJunction(MIAO_PROFILE_LINK)) {
        for (const sub of ['normal-character', 'super-character']) {
          const subPath = path.join(MIAO_PROFILE_LINK, sub)
          const target = path.join(PROFILE_DIR, sub)
          if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true })
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
        const jResult = ensureJunction(PROFILE_DIR, MIAO_PROFILE_LINK)
        if (!jResult.ok) {
          return e.reply('[面板图图库管理器] 创建 profile junction 失败: ' + (jResult.error || '未知错误'))
        }
      }

      // 3. 初始化 map.json
      initMap()

      return e.reply([
        '[面板图图库管理器] 图库初始化已完成\n',
        '请发送 #下载主图库 下载主图库图片，\n',
        '发送 #下载屏蔽图库 下载屏蔽图库。'
      ].join(''))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 图库初始化失败:', err)
      return e.reply('[面板图图库管理器] 图库初始化失败: ' + err.message)
    }
  }
}
