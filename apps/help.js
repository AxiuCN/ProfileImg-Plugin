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
    e.reply('[面板图图库管理器] 正在生成帮助图片，请稍候...')
    try {
      const helpPath = `${process.cwd()}/plugins/ProfileImg-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

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

      const data = { ...helpCfg, groups }
      const base64 = await render('help', 'index', data, 'png')
      return e.reply(segment.image(`base64://${base64}`))
    } catch (err) {
      logger.error('[面板图图库管理器] 帮助图生成失败:', err)
      return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
    }
  }
}