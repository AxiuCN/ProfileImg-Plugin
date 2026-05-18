import { render } from '../components/render.js'

/**
 * 帮助图插件
 * 响应 #图库帮助 指令，生成并发送面板图图库管理器的帮助图片
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
      const helpGroup = []
      for (const group of helpList) {

        // 如果分组标记为仅主人可见，且当前用户不是主人，则跳过该分组
        if (group.auth === 'master' && !e.isMaster) continue

        const list = []
        for (const item of group.list) {

          // 计算图标的 CSS background-position（每个图标 50px，按行列定位）
          // 如果没有 icon 字段，则隐藏图标
          let css = 'display:none'
          if (item.icon) {
            const x = (item.icon - 1) % 10
            const y = Math.floor((item.icon - 1) / 10)
            css = `background-position:-${x * 50}px -${y * 50}px`
          }

          list.push({
            title: item.title,   // 指令名称（如 #图库状态）
            desc: item.desc,     // 指令说明
            css                  // 图标样式
          })
        }
        helpGroup.push({
          group: group.group,   // 分组名称（如 "图库状态"）
          list                   // 该分组下的指令列表
        })
      }

      // 组装渲染数据，适配逍遥版模板的数据结构
      const data = {
        helpCfg: {
          title: helpCfg.title || '面板图图库管理器',
          subTitle: helpCfg.subTitle || 'ProfileImg-Plugin 帮助'
        },
        helpGroup
      }

      // 调用通用渲染组件，使用 help/index.html 模板生成帮助图
      // render() 返回的是 puppeteer 模块已封装好的消息段，可直接发送
      const img = await render('help', 'index', data, 'png')
      if (!img) return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
      return e.reply(img)

    } catch (err) {
      logger.error('[面板图图库管理器] 帮助图生成失败:', err)
      return e.reply('[面板图图库管理器] 帮助图生成失败，请重试。')
    }
  }
}