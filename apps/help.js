import { render } from '../components/render.js'

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
      // 动态读取帮助图配置文件
      const helpPath = `${process.cwd()}/plugins/ProfileImg-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      // 构建分组数据
      const groups = []
      for (const group of helpList) {
        if (group.auth === 'master' && !e.isMaster) continue
        const items = []
        for (const item of group.list) {
          let iconCss = 'display:none'
          if (item.icon) {
            const x = (item.icon - 1) % 10
            const y = Math.floor((item.icon - 1) / 10)
            iconCss = `background-position:-${x * 50}px -${y * 50}px`
          }
          items.push({
            title: item.title,
            desc: item.desc,
            iconCss
          })
        }
        groups.push({ group: group.group, items })
      }

      // 适配喵喵模板的数据结构
      const data = {
        helpCfg: {
          title: helpCfg.title || '面板图图库管理器',
          subTitle: helpCfg.subTitle || 'ProfileImg-Plugin 帮助'
        },
        groups
      }

      const img = await render('help', 'index', data, 'png')
      if (!img) return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
      return e.reply(img)
    } catch (err) {
      logger.error('[面板图图库管理器] 帮助图生成失败:', err)
      return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
    }
  }
}