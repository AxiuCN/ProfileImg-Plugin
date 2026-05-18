import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const configExamplePath = path.join(pluginRoot, 'config', 'config.yaml.example')

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'profileimg-plugin',
      title: '面板图图库管理器',
      description: '管理 miao-plugin 角色面板图库（主图库/屏蔽图库）',
      author: ['阿修Axiu'],
      authorLink: ['https://github.com/AxiuCN'],
      link: 'https://github.com/AxiuCN/ProfileImg-Plugin',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
      icon: 'mdi:image-multiple',
      iconColor: '#d19f56',
      iconPath: path.join(pluginRoot, 'resources/image/icon.jpg'),
    },
    configInfo: {
      schemas: [
        // ==================== 插件自身更新 ====================
        {
          label: '插件自身更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'pluginSelf.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否每天自动检查管理器自身更新',
          component: 'Switch'
        },
        {
          field: 'pluginSelf.cron',
          label: '检查时间 (cron)',
          bottomHelpMessage: 'cron 表达式，默认 0 5 * * * (每天5:00)',
          component: 'Input',
          componentProps: {
            placeholder: '0 5 * * *'
          }
        },
        {
          field: 'pluginSelf.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动下载覆盖',
          component: 'Switch'
        },
        {
          field: 'pluginSelf.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽',
          component: 'Switch'
        },

        // ==================== 主图库更新 ====================
        {
          label: '主图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'mainGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否每天自动检查主图库更新',
          component: 'Switch'
        },
        {
          field: 'mainGallery.cron',
          label: '检查时间 (cron)',
          bottomHelpMessage: 'cron 表达式，默认 20 5 * * * (每天5:20)',
          component: 'Input',
          componentProps: {
            placeholder: '20 5 * * *'
          }
        },
        {
          field: 'mainGallery.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动拉取',
          component: 'Switch'
        },
        {
          field: 'mainGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽',
          component: 'Switch'
        },

        // ==================== 屏蔽图库更新 ====================
        {
          label: '屏蔽图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'blockedGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否每天自动检查屏蔽图库更新',
          component: 'Switch'
        },
        {
          field: 'blockedGallery.cron',
          label: '检查时间 (cron)',
          bottomHelpMessage: 'cron 表达式，默认 40 5 * * * (每天5:40)',
          component: 'Input',
          componentProps: {
            placeholder: '40 5 * * *'
          }
        },
        {
          field: 'blockedGallery.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动拉取',
          component: 'Switch'
        },
        {
          field: 'blockedGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽',
          component: 'Switch'
        },
      ],
      getConfigData() {
        try {
          if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8')
            const full = YAML.parse(raw) || {}
            const update = full.update || {}
            // 平铺字段为 schema 需要的 field 格式
            return {
              'pluginSelf.enabled': update.pluginSelf?.enabled,
              'pluginSelf.cron': update.pluginSelf?.cron,
              'pluginSelf.autoUpdate': update.pluginSelf?.autoUpdate,
              'pluginSelf.autoRestart': update.pluginSelf?.autoRestart,
              'mainGallery.enabled': update.mainGallery?.enabled,
              'mainGallery.cron': update.mainGallery?.cron,
              'mainGallery.autoUpdate': update.mainGallery?.autoUpdate,
              'mainGallery.autoRestart': update.mainGallery?.autoRestart,
              'blockedGallery.enabled': update.blockedGallery?.enabled,
              'blockedGallery.cron': update.blockedGallery?.cron,
              'blockedGallery.autoUpdate': update.blockedGallery?.autoUpdate,
              'blockedGallery.autoRestart': update.blockedGallery?.autoRestart,
            }
          }
        } catch (e) {
          logger.error('[ProfileImg-Plugin] guoba 读取配置失败:', e)
        }
        return {}
      },
      setConfigData(data, { Result }) {
        try {
          // 读取原有配置（保留非 update 部分）
          let full = {}
          if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8')
            full = YAML.parse(raw) || {}
          } else if (fs.existsSync(configExamplePath)) {
            const raw = fs.readFileSync(configExamplePath, 'utf8')
            full = YAML.parse(raw) || {}
          }
          full.update = full.update || {}
          // 将锅巴表单的平铺字段写回嵌套结构
          full.update.pluginSelf = full.update.pluginSelf || {}
          full.update.pluginSelf.enabled = data['pluginSelf.enabled']
          full.update.pluginSelf.cron = data['pluginSelf.cron']
          full.update.pluginSelf.autoUpdate = data['pluginSelf.autoUpdate']
          full.update.pluginSelf.autoRestart = data['pluginSelf.autoRestart']

          full.update.mainGallery = full.update.mainGallery || {}
          full.update.mainGallery.enabled = data['mainGallery.enabled']
          full.update.mainGallery.cron = data['mainGallery.cron']
          full.update.mainGallery.autoUpdate = data['mainGallery.autoUpdate']
          full.update.mainGallery.autoRestart = data['mainGallery.autoRestart']

          full.update.blockedGallery = full.update.blockedGallery || {}
          full.update.blockedGallery.enabled = data['blockedGallery.enabled']
          full.update.blockedGallery.cron = data['blockedGallery.cron']
          full.update.blockedGallery.autoUpdate = data['blockedGallery.autoUpdate']
          full.update.blockedGallery.autoRestart = data['blockedGallery.autoRestart']

          fs.writeFileSync(configPath, YAML.stringify(full), 'utf8')
          return Result.ok({}, '保存成功~')
        } catch (e) {
          logger.error('[ProfileImg-Plugin] guoba 保存配置失败:', e)
          return Result.error(e.message || '保存失败')
        }
      }
    }
  }
}