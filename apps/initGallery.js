import fs from 'node:fs'
import path from 'node:path'
import { isJunction, ensureJunction } from '../model/junction.js'
import { initMap } from '../model/mapJson.js'
import { ensureGalleryConfigFile } from '../components/config.js'
import { ensureAllCharJunctions } from '../model/copier.js'
import {
  GALLERY_ROOT, PROFILE_DIR, MIAO_PROFILE_LINK, PROFILE_IMG_DIR,
} from '../components/constants.js'

/**
 * #图库初始化 — 两步交互式初始化
 *
 * 1. 检查是否已初始化（junction 存在且有效）
 * 2. 若 miao-plugin/resources/profile 为真实目录 → setContext 等待确认
 * 3. 确认后：建第一层 junction + 类型目录（真实） + 角色级 junction
 * 4. 完成后提示用户执行 #下载主图库 / #下载屏蔽图库
 *
 * 确认机制使用框架内置 setContext，无需全局变量和全局 #确认/#取消 命令
 */
export class InitGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]初始化',
      dsc: '初始化图库（创建 junction）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库初始化$', fnc: 'init', permission: 'master' }
      ]
    })
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
        this.setContext('confirmInit')
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

  /** 由 setContext 在用户确认后自动调用，检查消息内容决定是否执行 */
  async confirmInit() {
    const msg = this.e?.msg?.replace(/^#/, '') || ''
    if (msg.startsWith('确认')) {
      this.finish('confirmInit')
      return this._doInit(this.e)
    }
    if (msg.startsWith('取消')) {
      this.finish('confirmInit')
      return this.e.reply('[面板图图库管理器] 图库初始化已取消')
    }
    // 不匹配确认/取消时放行，不阻塞其他插件
    return 'continue'
  }

  /** 确保聚合类型目录为真实目录（junction 的宿主，非 junction 本身） */
  _ensureTypeDir(type) {
    const typeDir = path.join(PROFILE_DIR, `${type}-character`)
    if (isJunction(typeDir)) {
      try { fs.rmSync(typeDir, { recursive: false }) } catch { /* ignore */ }
    }
    if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true })
    return typeDir
  }

  /** 扫描所有活跃主仓库，为每个已有角色创建角色级 junction */
  _ensureCharJunctions() {
    return ensureAllCharJunctions()
  }

  /** 执行实际的初始化操作（只创建 junction，不下载仓库） */
  async _doInit(e) {
    e.reply('[面板图图库管理器] 开始图库初始化，请稍候...')

    try {
      // 1. 确保 gallery 目录结构存在
      if (!fs.existsSync(GALLERY_ROOT)) fs.mkdirSync(GALLERY_ROOT, { recursive: true })
      if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })
      if (!fs.existsSync(PROFILE_IMG_DIR)) fs.mkdirSync(PROFILE_IMG_DIR, { recursive: true })

      // 2. 聚合类型目录（normal-character / super-character）为真实目录（junction 宿主）
      this._ensureTypeDir('normal')
      this._ensureTypeDir('super')

      // 3. 建立 miao-plugin/resources/profile 的连接（第一层 junction）
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

      // 4. 初始化 map.json + gallery_config.yaml
      initMap()
      ensureGalleryConfigFile()

      // 5. 为已下载主仓库的角色创建角色级 junction
      const junctionCount = this._ensureCharJunctions()

      // 延迟 2s 再发完成消息，避免"已完成"比"请稍候"先到
      await new Promise(r => setTimeout(r, 2000))
      return e.reply([
        `[面板图图库管理器] 图库初始化已完成\n`,
        `角色级 junction 数量：${junctionCount}\n`,
        '请发送 #下载主图库 下载主图库图片，\n',
        '发送 #下载屏蔽图库 下载屏蔽图库。'
      ].join(''))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 图库初始化失败:', err)
      return e.reply('[面板图图库管理器] 图库初始化失败: ' + err.message)
    }
  }
}
