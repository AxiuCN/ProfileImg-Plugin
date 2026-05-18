import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const configExamplePath = path.join(pluginRoot, 'config', 'config.yaml.example')

// ==================== 配置管理器 ====================
class Config {
  getConfig() {
    try {
      if (!fs.existsSync(configPath)) {
        return this.getDefault()
      }
      return YAML.parse(fs.readFileSync(configPath, 'utf8')) || this.getDefault()
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 读取配置失败:', e)
      return this.getDefault()
    }
  }

  getDefault() {
    if (fs.existsSync(configExamplePath)) {
      try {
        return YAML.parse(fs.readFileSync(configExamplePath, 'utf8')) || {}
      } catch (e) {
        logger.error('[ProfileImg-Plugin] 读取默认配置失败:', e)
      }
    }
    return {
      update: {
        pluginSelf: { enabled: true, cron: '0 5 * * *', autoUpdate: true, autoRestart: true },
        mainGallery: { enabled: true, cron: '20 5 * * *', autoUpdate: true, autoRestart: false },
        blockedGallery: { enabled: true, cron: '40 5 * * *', autoUpdate: true, autoRestart: false }
      }
    }
  }

  setConfig(data) {
    try {
      const dirPath = path.dirname(configPath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      const merged = this.getConfig()
      merged.update = merged.update || {}

      for (const module of ['pluginSelf', 'mainGallery', 'blockedGallery']) {
        merged.update[module] = merged.update[module] || {}
        merged.update[module].enabled = data[`${module}.enabled`]
        merged.update[module].cron = data[`${module}.cron`]
        merged.update[module].autoUpdate = data[`${module}.autoUpdate`]
        merged.update[module].autoRestart = data[`${module}.autoRestart`]
      }

      // 生成带注释的配置文件
      const u = merged.update
      const content = `# ProfileImg-Plugin 配置文件
# 修改后保存即可，无需重启机器人

update:
  # ---------- 插件自身更新设置 ----------
  pluginSelf:
    enabled: ${u.pluginSelf.enabled}
    cron: "${u.pluginSelf.cron}"
    autoUpdate: ${u.pluginSelf.autoUpdate}
    autoRestart: ${u.pluginSelf.autoRestart}

  # ---------- 主图库更新设置 ----------
  mainGallery:
    enabled: ${u.mainGallery.enabled}
    cron: "${u.mainGallery.cron}"
    autoUpdate: ${u.mainGallery.autoUpdate}
    autoRestart: ${u.mainGallery.autoRestart}

  # ---------- 屏蔽图库更新设置 ----------
  blockedGallery:
    enabled: ${u.blockedGallery.enabled}
    cron: "${u.blockedGallery.cron}"
    autoUpdate: ${u.blockedGallery.autoUpdate}
    autoRestart: ${u.blockedGallery.autoRestart}
`
      fs.writeFileSync(configPath, content, 'utf8')
      return true
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 保存配置失败:', e)
      return false
    }
  }
}

const config = new Config()

// ==================== 锅巴支持模块 ====================
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
      iconPath: path.join(pluginRoot, 'resources/images/icon.jpg'),
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
          label: '检查时间',
          helpMessage: '使用可视化界面配置 cron 表达式，默认每天 5:00',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '0 5 * * *',
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
          label: '检查时间',
          helpMessage: '使用可视化界面配置 cron 表达式，默认每天 5:20',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '20 5 * * *',
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
          label: '检查时间',
          helpMessage: '使用可视化界面配置 cron 表达式，默认每天 5:40',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '40 5 * * *',
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
        const cfg = config.getConfig()
        const update = cfg.update || {}
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
      },
      setConfigData(data, { Result }) {
        const success = config.setConfig(data)
        if (success) {
          return Result.ok({}, '保存成功~')
        }
        return Result.error('保存失败')
      }
    }
  }
}