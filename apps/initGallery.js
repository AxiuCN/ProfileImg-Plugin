import fs from 'node:fs'
import path from 'node:path'
import { initMap } from '../model/mapJson.js'
import { ensureGalleryConfigFile, ensureManagerConfigFile } from '../components/config.js'
import {
  GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR, MIAO_PROFILE_LINK,
} from '../components/constants.js'
import { getLayoutState } from '../model/migrateMultiSrc.js'
import { syncProfileImgSrc, supportsMultiSrc } from '../model/profileSrc.js'

/**
 * #图库初始化 — 多图库源布局初始化
 *
 * 1. 检查布局状态（ready 已初始化 / legacy 需先 #迁移图库 / fresh 待初始化）
 * 2. 建目录结构（gallery/ + 默认图库 resources/profile 及其类型目录）
 * 3. 初始化 map.json / gallery_config.yaml / manager_config.yaml
 * 4. 生成 miao config/profile.js 并写入 profileImgSrc 源列表（需重启 miao 生效）
 * 5. 提示后续执行 #下载主图库 / #下载屏蔽图库
 *
 * 不再创建任何 junction：默认图库为真实目录，各图库仓库作为独立源。
 */
export class InitGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]初始化',
      dsc: '初始化图库（多图库源布局）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库初始化$', fnc: 'init', permission: 'master' }
      ]
    })
  }

  /** 检查状态并执行初始化 */
  async init (e) {
    if (!e) return // 避免与 loader 生命周期 init 冲突（加载时无参调用）
    const state = getLayoutState()
    if (state === 'legacy') {
      return e.reply([
        '[面板图图库管理器]\n',
        '检测到旧版图库布局（junction 聚合），初始化不适用于旧布局。\n',
        '请发送 #迁移图库 升级到多图库源布局（升级后需重启 Yunzai）。'
      ].join(''))
    }
    if (state === 'ready') {
      return e.reply([
        '[面板图图库管理器] 图库已初始化，无需重复操作。\n',
        '如需下载图库请发送 #下载主图库 / #下载屏蔽图库。'
      ].join(''))
    }
    return this._doInit(e)
  }

  /** 执行初始化：建目录 + 初始化配置 + 注册图库源 */
  async _doInit (e) {
    e.reply('[面板图图库管理器] 开始图库初始化，请稍候...')

    try {
      if (!supportsMultiSrc()) {
        return e.reply([
          '[面板图图库管理器] 初始化失败\n',
          'miao-plugin 不支持多图库源（profileImgSrc），请先升级 miao-plugin 到 2.5.20 及以上。'
        ].join(''))
      }

      // 1. 插件图库目录结构
      for (const dir of [GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      }

      // 2. 默认图库目录（miao-plugin/resources/profile）及其类型目录（真实目录，非 junction）
      fs.mkdirSync(MIAO_PROFILE_LINK, { recursive: true })
      for (const type of ['normal-character', 'super-character']) {
        fs.mkdirSync(path.join(MIAO_PROFILE_LINK, type), { recursive: true })
      }

      // 3. 初始化 map.json + gallery_config.yaml + manager_config.yaml
      initMap()
      ensureGalleryConfigFile()
      ensureManagerConfigFile()

      // 4. 生成 miao config/profile.js 并写入图库源列表
      const synced = syncProfileImgSrc()
      if (!synced.ok) {
        return e.reply('[面板图图库管理器] 注册图库源失败：' + (synced.error || '未知错误'))
      }

      // 延迟 1.5s 再发完成消息，避免"已完成"比"请稍候"先到
      await new Promise(r => setTimeout(r, 1500))
      const lines = [
        '[面板图图库管理器] 图库初始化已完成\n',
        `图库源列表（${synced.list.length} 个）：\n`,
        synced.list.map((v, i) => `  ${i + 1}. ${v}`).join('\n') + '\n',
        '请发送 #下载主图库 下载主图库图片，发送 #下载屏蔽图库 下载屏蔽图库。'
      ]
      if (synced.skipped.length) {
        lines.push(`\n⚠️ ${synced.skipped.length} 个图库仓库无法直读，未注册：` +
          synced.skipped.map(s => `${s.label}（${s.reason}）`).join('；'))
      }
      if (synced.changed) lines.push('\n⚠️ 请重启 Yunzai 使图库源配置生效。')
      return e.reply(lines.join(''))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 图库初始化失败:', err)
      return e.reply('[面板图图库管理器] 图库初始化失败: ' + err.message)
    }
  }
}
