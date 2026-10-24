import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { listRoleImages } from '../model/galleryIndex.js'
import { getBlockedAggregated } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { render } from '../components/render.js'
import { formatSize, getDirSize } from '../components/format.js'
import { guardLayout } from '../model/layoutGuard.js'

/*
 * 命令解析（放行框架归一后的 `#星铁` 前缀）
 *
 * 屏蔽写法必须**排在普通写法之前**，否则角色名会吃进「屏蔽」二字：
 *   #遐蝶屏蔽面板图可视化 → 普通规则 (.+?)面板图可视化 ⇒ 角色名「遐蝶屏蔽」
 *   #屏蔽可视化遐蝶       → 普通规则 可视化(.+?)      ⇒ 角色名「屏蔽遐蝶」
 */
/** 屏蔽可视化：#<角色>面板图屏蔽可视化 / #<角色>屏蔽面板图可视化 / #屏蔽可视化<角色> */
const RE_BLOCKED = [
  /^#?\s*(?:星铁)?\s*(.+?)面板图屏蔽可视化\s*$/,
  /^#?\s*(?:星铁)?\s*(.+?)屏蔽面板图可视化\s*$/,
  /^#?\s*(?:星铁)?\s*屏蔽可视化(.+?)\s*$/
]
/** 普通可视化：#<角色>面板图可视化 / #可视化<角色> */
const RE_NORMAL = [
  /^#?\s*(?:星铁)?\s*(.+?)面板图可视化\s*$/,
  /^#?\s*(?:星铁)?\s*可视化(.+?)\s*$/
]

/** 每页展示的图片数（4 列网格 × 5 行） */
const PAGE_SIZE = 20

/** 非标准文件的 display n 兜底池（与 blockedInfo 的 BAK_DISPLAY_BASE 对应） */
const N_POOL_BASE = 9999999

/**
 * #角色名面板图可视化 — HTML 网格浏览角色全部面板图（多图库源）
 * 支持四种写法（见上方正则），屏蔽写法出屏蔽专用页（标题 + 「已屏蔽」徽标）
 * 默认图库 / 主仓库图片按段位序号标注；第三方图库图片标源名（不参与序号）
 */
export class Visualize extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图可视化',
      dsc: 'HTML 可视化浏览面板图',
      event: 'message',
      priority: 5,
      rule: [
        { reg: RE_BLOCKED[0], fnc: 'visualizeBlocked' },
        { reg: RE_BLOCKED[1], fnc: 'visualizeBlocked' },
        { reg: RE_BLOCKED[2], fnc: 'visualizeBlocked' },
        { reg: RE_NORMAL[0], fnc: 'visualize' },
        { reg: RE_NORMAL[1], fnc: 'visualize' }
      ]
    })
  }

  /**
   * 解析命令（与 rule 共用同一组正则，屏蔽优先）
   * @param {string} msg - 消息文本
   * @returns {{ roleName: string, blocked: boolean }|null}
   */
  _parse(msg) {
    for (const re of RE_BLOCKED) {
      const m = String(msg || '').match(re)
      if (m) return { roleName: m[1].trim(), blocked: true }
    }
    for (const re of RE_NORMAL) {
      const m = String(msg || '').match(re)
      if (m) return { roleName: m[1].trim(), blocked: false }
    }
    return null
  }

  /** #角色面板图可视化 / #可视化角色 */
  async visualize(e) {
    return this._render(e)
  }

  /** 屏蔽可视化：#角色面板图屏蔽可视化 / #角色屏蔽面板图可视化 / #屏蔽可视化角色 */
  async visualizeBlocked(e) {
    return this._render(e)
  }

  /**
   * 渲染并发送网格页（每页 20 张，逐页发送）
   */
  async _render(e) {
    if (!(await guardLayout(e))) return true

    const cmd = this._parse(e.msg)
    if (!cmd) return true

    const roleName = resolveRoleName(cmd.roleName, e.game)
    if (!roleName) {
      return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    }

    // 普通 = 各源 normal 层；屏蔽 = 屏蔽图库 + 各源 .bak
    const files = cmd.blocked ? getBlockedAggregated(roleName) : listRoleImages(roleName, 'normal')
    if (files.length === 0) {
      return e.reply(cmd.blocked
        ? `[面板图图库管理器]\n角色「${roleName}」暂无屏蔽面板图`
        : `[面板图图库管理器]\n角色「${roleName}」暂无面板图`)
    }

    // 各源目录大小合计（header 文件体积徽章），失败时留空隐藏徽章
    let folderSize = ''
    try {
      const dirs = [...new Set(files.map(f => path.dirname(f.filePath)))]
      let total = 0
      for (const dir of dirs) total += getDirSize(dir)
      folderSize = formatSize(total)
    } catch { /* 目录不可读时不显示 */ }

    const totalPages = Math.ceil(files.length / PAGE_SIZE)
    const images = files.map((f) => {
      const base = f.name.replace(/\.[^.]+$/, '')
      // 第三方源与屏蔽图库里的非标准名：displayN 落在兜底池 → 用源标签占位
      const hasN = typeof f.displayN === 'number' && f.displayN < N_POOL_BASE
      return {
        fileName: hasN ? `${f.displayN}. ${base}` : `[${f.label || '屏蔽图库'}] ${base}`,
        fileUrl: pathToFileURL(f.filePath).href
      }
    })

    try {
      for (let p = 0; p < totalPages; p++) {
        const data = {
          title: cmd.blocked ? `${roleName} 屏蔽面板图可视化` : `${roleName} 面板图可视化`,
          roleName,
          blocked: cmd.blocked,
          totalCount: files.length,
          page: p + 1,
          totalPages,
          folderSize,
          images: images.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)
        }

        const img = await render('visualize', 'index', data, 'jpeg')
        if (!img) {
          return e.reply('[面板图图库管理器] 可视化图生成失败，请重试。')
        }
        await e.reply(img)
      }
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 可视化失败:', err)
      return e.reply('[面板图图库管理器] 可视化失败: ' + err.message)
    }
    return true
  }
}
