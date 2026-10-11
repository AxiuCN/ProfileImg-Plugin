import { render } from '../components/render.js'

/**
 * 帮助图插件
 * 响应 #图库帮助 指令，生成并发送面板图图库管理器的帮助图片
 * UI 基调见 resources/common/ui.css（与面板图可视化同一套视觉）
 */
export class Help extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]帮助',
      dsc: '查看帮助图',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#图库帮助$', fnc: 'help' }
      ]
    })
  }

  async help(e) {
    try {
      // 动态读取帮助图配置文件（使用 file:// 协议 + 时间戳参数绕过模块缓存，实现热更新）
      const helpPath = `${process.cwd()}/plugins/ProfileImg-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      // 遍历指令分组，过滤权限，构建渲染数据
      const groups = []
      let commandCount = 0
      for (const group of helpList) {
        // 仅主人可见的分组：非主人直接不出现在帮助图里
        if (group.auth === 'master' && !e.isMaster) continue

        const list = group.list.map(item => ({
          title: item.title,   // 指令名称（如 #图库状态）
          desc: item.desc      // 指令说明
        }))
        commandCount += list.length
        groups.push({
          group: group.group,      // 分组名称（如 "图库状态"）
          auth: group.auth || '',  // 分组权限（master 时显示「仅主人」徽标）
          count: list.length,
          list
        })
      }

      const data = {
        title: helpCfg.title || '图库帮助',
        subTitle: helpCfg.subTitle || 'ProfileImg-Plugin 帮助',
        groupCount: groups.length,
        commandCount,
        groups
      }

      // render() 返回的是 puppeteer 模块已封装好的消息段，可直接发送
      const img = await render('help', 'index', data, 'jpeg')
      if (!img) return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
      return e.reply(img)

    } catch (err) {
      logger.error('[面板图图库管理器] 帮助图生成失败:', err)
      return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
    }
  }
}
