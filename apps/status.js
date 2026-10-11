import { render } from '../components/render.js'
import { buildStatusData } from '../modules/statusPanel.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 图库状态（多图库源布局）
 *
 * 面板图由「默认图库 + 各主仓库 + 可直读的第三方仓库」多源提供：
 * 三条命令共用同一套状态图模板（resources/status/index.html），
 * 数据整形见 modules/statusPanel.js（只出仓库目录名，不回显服务器绝对路径）。
 */
export class Status extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]状态',
      dsc: '查看图库状态',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库状态$', fnc: 'status' },
        { reg: '^#屏蔽图库状态$', fnc: 'blockedStatus' },
        { reg: '^#图库状态$', fnc: 'overallStatus' }
      ]
    })
  }

  /**
   * 渲染并发送状态图
   * @param {object} e - 消息事件
   * @param {'overall'|'main'|'blocked'} mode - 状态模式
   */
  async _replyPanel(e, mode) {
    try {
      const img = await render('status', 'index', buildStatusData({ mode }), 'jpeg')
      if (!img) return e.reply('[面板图图库管理器] 状态图生成失败，请重试')
      return e.reply(img)
    } catch (err) {
      logger.error('[面板图图库管理器] 状态图生成失败:', err)
      return e.reply('[面板图图库管理器] 状态图生成失败，请重试')
    }
  }

  /** #主图库状态 — 各主仓库的规模与版本 */
  async status(e) {
    if (!(await guardLayout(e))) return true
    return this._replyPanel(e, 'main')
  }

  /** #屏蔽图库状态 — 屏蔽图库规模与版本 */
  async blockedStatus(e) {
    if (!(await guardLayout(e))) return true
    return this._replyPanel(e, 'blocked')
  }

  /** #图库状态 — 全部图库源总览 + 屏蔽图库 + 未登记图库目录 */
  async overallStatus(e) {
    if (!(await guardLayout(e))) return true
    return this._replyPanel(e, 'overall')
  }
}
