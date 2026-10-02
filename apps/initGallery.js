import fs from 'node:fs'
import path from 'node:path'
import { initMap } from '../model/mapJson.js'
import { ensureGalleryConfigFile, ensureManagerConfigFile, refreshGalleryConfigFile } from '../components/config.js'
import { autoRegisterUnregisteredRepos, listUnregisteredRepos } from '../model/galleryConfig.js'
import { restartHint } from '../components/notify.js'
import {
  GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR, MIAO_PROFILE_LINK,
} from '../components/constants.js'
import { getLayoutState } from '../model/migrateMultiSrc.js'
import { syncProfileImgSrc, supportsMultiSrc } from '../model/profileSrc.js'

/**
 * #图库初始化 — 初始化项检查与补齐（幂等，可随时重跑）
 *
 * 启动时已自动完成这些工作，本命令用于手动确认与修复：
 * 1. 布局状态：legacy 旧布局 → 引导 #迁移图库
 * 2. 建齐目录（gallery/ 与默认图库 resources/profile 的类型目录）
 * 3. 补齐 map.json / gallery_config.yaml / manager_config.yaml，并刷新配置注释
 * 4. 补登记 gallery/ProfileImg 下未登记的图库目录
 * 5. 从 gallery_config.yaml 注册 miao 图库源并报告结果（有变更需重启）
 *
 * 不再创建任何 junction：默认图库为真实目录，各图库仓库作为独立源。
 */
export class InitGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]初始化',
      dsc: '检查并补齐图库初始化项（多图库源布局）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库初始化$', fnc: 'init', permission: 'master' }
      ]
    })
  }

  /** 检查并补齐初始化项 */
  async init (e) {
    if (!e) return // 避免与 loader 生命周期 init 冲突（加载时无参调用）
    if (getLayoutState() === 'legacy') {
      return e.reply([
        '[面板图图库管理器]\n',
        '检测到旧版图库布局（junction 聚合），无法在此布局下补初始化项。\n',
        '请发送 #迁移图库 升级到多图库源布局（升级后需重启 Yunzai）。'
      ].join(''))
    }
    if (!supportsMultiSrc()) {
      return e.reply([
        '[面板图图库管理器] 无法注册图库源\n',
        'miao-plugin 不支持多图库源（profileImgSrc），请先升级 miao-plugin 到 2.5.20 及以上。'
      ].join(''))
    }
    return this._checkAndRepair(e)
  }

  /** 建齐目录 / 配置 / 登记并注册图库源，最后报告结果 */
  async _checkAndRepair (e) {
    e.reply('[面板图图库管理器] 正在检查图库初始化项...')

    try {
      // 1. 插件图库目录结构 + 默认图库目录（真实目录，非 junction）
      for (const dir of [GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR, MIAO_PROFILE_LINK]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      }
      for (const type of ['normal-character', 'super-character']) {
        fs.mkdirSync(path.join(MIAO_PROFILE_LINK, type), { recursive: true })
      }

      // 2. map.json + 两份配置（不存在则创建），并刷新配置注释
      initMap()
      ensureGalleryConfigFile()
      ensureManagerConfigFile()
      refreshGalleryConfigFile()

      // 3. 补登记未登记的图库目录 → 4. 从配置注册 miao 图库源
      const autoReg = autoRegisterUnregisteredRepos()
      const synced = syncProfileImgSrc()
      if (!synced.ok) {
        return e.reply('[面板图图库管理器] 注册图库源失败：' + (synced.error || '未知错误'))
      }

      // 延迟 1.5s 再发完成消息，避免"检查中"比结果先到
      await new Promise(r => setTimeout(r, 1500))

      const lines = [
        '[面板图图库管理器] 初始化项检查完成\n',
        `布局状态：${getLayoutState() === 'ready' ? '多图库源布局（正常）' : '尚未注册任何自有图库源'}\n`,
        `图库源列表（${synced.list.length} 个）：\n`,
        synced.list.map((v, i) => `  ${i + 1}. ${v}`).join('\n') + '\n'
      ]
      if (autoReg.added.length) {
        lines.push(`\n已补充登记：${autoReg.added.map(a => a.name).join('、')}`)
      }
      if (autoReg.failed.length) {
        lines.push(`\n⚠️ 登记失败：${autoReg.failed.map(f => `${f.name}（${f.error}）`).join('；')}`)
      }
      const pending = listUnregisteredRepos()
      if (pending.length) {
        lines.push(`\n⚠️ 仍有 ${pending.length} 个目录未登记：` + pending.map(p => p.name).join('、'))
      }
      if (synced.skipped.length) {
        lines.push(`\n⚠️ ${synced.skipped.length} 个已配置图库无法直读，未注册：` +
          synced.skipped.map(s => `${s.label}（${s.reason}）`).join('；'))
      }
      if (synced.changed) lines.push(restartHint())
      if (synced.list.length <= 1) {
        lines.push('\n提示：尚未注册自有图库，请发送 #下载主图库 或 #下载第三方图库 <URL>。')
      }
      return e.reply(lines.join(''))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 图库初始化检查失败:', err)
      return e.reply('[面板图图库管理器] 初始化检查失败: ' + err.message)
    }
  }
}
