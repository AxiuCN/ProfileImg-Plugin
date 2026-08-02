import { pathToFileURL } from 'node:url'
import { getRoleFiles } from '../model/blockedInfo.js'
import { resolveRoleName } from '../modules/alias.js'
import { render } from '../components/render.js'

/** 每页展示的图片数（5 列 × 4 行） */
const PAGE_SIZE = 20

/**
 * #角色名面板图可视化 — HTML 网格浏览角色全部面板图
 * 列表（#角色名面板图列表）超过 20 张时提示使用本命令
 */
export class Visualize extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]面板图可视化',
      dsc: 'HTML 可视化浏览面板图',
      event: 'message',
      priority: 5,
      rule: [
        { reg: /^#?\s*(.+)(?:面板图可视化)\s*$/, fnc: 'visualize' }
      ]
    })
  }

  async visualize(e) {
    const roleName = resolveRoleName(
      e.msg.replace(/#|面板图可视化/g, '').trim()
    )

    if (!roleName) {
      return e.reply('[面板图图库管理器]\n请输入正确的角色名')
    }

    const files = getRoleFiles(roleName, 'normal')
    if (files.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色「${roleName}」暂无面板图`)
    }

    const totalPages = Math.ceil(files.length / PAGE_SIZE)
    try {
      // 分页渲染，逐页发送（每页 20 张，5 列 × 4 行网格）
      for (let p = 0; p < totalPages; p++) {
        const images = files.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map(f => ({
          displayN: f.displayN,
          name: f.name,
          isStandard: !!(f.parsed && f.parsed.isStandard),
          fileUrl: pathToFileURL(f.filePath).href
        }))

        const data = {
          roleName,
          totalCount: files.length,
          page: p + 1,
          totalPages,
          images
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
