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
      // 动态读取帮助图配置文件，支持热更新（无需重启机器人）
      const helpPath = `${process.cwd()}/plugins/ProfileImg-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      // 遍历指令分组，构建渲染数据
      const groups = []
      for (const group of helpList) {
        // 跳过仅主人可见的分组（如果当前用户不是主人）
        if (group.auth === 'master' && !e.isMaster) continue

        const items = []
        for (const item of group.list) {
          // 计算图标的 CSS background-position（50px 为每个图标的尺寸）
          // 如果没有 icon 字段，则隐藏图标
          let iconCss = 'display:none'
          if (item.icon) {
            const x = (item.icon - 1) % 10      // 列（0~9）
            const y = Math.floor((item.icon - 1) / 10)  // 行（0~N）
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

      // 合并配置数据和分组数据，传给渲染函数
      const data = { ...helpCfg, groups }

      // 调用通用渲染组件生成帮助图
      // render() 返回的是 puppeteer 模块已包装好的 segment.image 消息段
      const img = await render('help', 'index', data, 'png')

      // 如果渲染失败（返回 false 或 null），提示用户重试
      if (!img) return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')

      // 直接发送图片消息段，无需再用 segment.image() 二次包装
      return e.reply(img)
    } catch (err) {
      logger.error('[面板图图库管理器] 帮助图生成失败:', err)
      return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
    }
  }
}