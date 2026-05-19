import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

// 默认值映射（模板变量名 → 默认值）
const defaultValues = {
  pluginSelf_enabled: true,
  pluginSelf_cron: '0 0 5 * * *',
  pluginSelf_autoUpdate: true,
  pluginSelf_autoRestart: true,
  mainGallery_enabled: true,
  mainGallery_cron: '0 20 5 * * *',
  mainGallery_autoUpdate: true,
  mainGallery_autoRestart: false,
  blockedGallery_enabled: true,
  blockedGallery_cron: '0 40 5 * * *',
  blockedGallery_autoUpdate: true,
  blockedGallery_autoRestart: false
}

/**
 * 读取默认配置模板
 */
function getTemplate() {
  try {
    if (fs.existsSync(defaultConfigPath)) {
      return fs.readFileSync(defaultConfigPath, 'utf8')
    }
    logger.error('[ProfileImg-Plugin] 默认配置模板不存在:', defaultConfigPath)
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 读取默认配置模板失败:', e)
  }
  return ''
}

/**
 * 根据数据生成最终配置文件内容（变量替换）
 * @param {Object} data 锅巴传来的扁平数据，如 { 'pluginSelf.enabled': true }
 * @returns {string} 替换变量后的配置文本
 */
function generateConfig(data) {
  const values = { ...defaultValues }
  // 将锅巴的扁平 key 转为模板变量名（例如 'pluginSelf.enabled' → 'pluginSelf_enabled'）
  for (const [key, val] of Object.entries(data)) {
    const varName = key.replace('.', '_')
    values[varName] = val
  }
  const template = getTemplate()
  // 替换 ${变量名} 占位符
  return template.replace(/\${(\w+)}/g, (_, name) => (values[name] !== undefined ? values[name] : ''))
}

/**
 * 使用 YAML 库解析当前用户配置
 * @returns {Object} 完整的用户配置对象
 */
function parseCurrentConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8')
      return YAML.parse(content) || {}
    }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 解析当前配置失败:', e)
  }
  return {}
}

// 锅巴支持模块
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
        {
          label: '插件自身更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'pluginSelf.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用插件自身的自动检查更新',
          component: 'Switch'
        },
        {
          field: 'pluginSelf.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:00）',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '0 0 5 * * *',
            placeholder: '0 0 5 * * *'
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
        {
          label: '主图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'mainGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用主图库的自动检查更新',
          component: 'Switch'
        },
        {
          field: 'mainGallery.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:20）',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '0 20 5 * * *',
            placeholder: '0 20 5 * * *'
          }
        },
        {
          field: 'mainGallery.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动执行 git pull',
          component: 'Switch'
        },
        {
          field: 'mainGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（主图库更新一般无需重启）',
          component: 'Switch'
        },
        {
          label: '屏蔽图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'blockedGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用屏蔽图库的自动检查更新',
          component: 'Switch'
        },
        {
          field: 'blockedGallery.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:40）',
          component: 'EasyCron',
          required: true,
          componentProps: {
            defaultValue: '0 40 5 * * *',
            placeholder: '0 40 5 * * *'
          }
        },
        {
          field: 'blockedGallery.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动执行 git pull',
          component: 'Switch'
        },
        {
          field: 'blockedGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（屏蔽图库更新无需重启）',
          component: 'Switch'
        },
      ],
      getConfigData() {
        // 读取当前用户配置，未设置的部分用默认值补齐
        const userConfig = parseCurrentConfig().update || {}
        const defPlugin = defaultValues
        return {
          'pluginSelf.enabled': userConfig.pluginSelf?.enabled ?? defPlugin.pluginSelf_enabled,
          'pluginSelf.cron': userConfig.pluginSelf?.cron ?? defPlugin.pluginSelf_cron,
          'pluginSelf.autoUpdate': userConfig.pluginSelf?.autoUpdate ?? defPlugin.pluginSelf_autoUpdate,
          'pluginSelf.autoRestart': userConfig.pluginSelf?.autoRestart ?? defPlugin.pluginSelf_autoRestart,
          'mainGallery.enabled': userConfig.mainGallery?.enabled ?? defPlugin.mainGallery_enabled,
          'mainGallery.cron': userConfig.mainGallery?.cron ?? defPlugin.mainGallery_cron,
          'mainGallery.autoUpdate': userConfig.mainGallery?.autoUpdate ?? defPlugin.mainGallery_autoUpdate,
          'mainGallery.autoRestart': userConfig.mainGallery?.autoRestart ?? defPlugin.mainGallery_autoRestart,
          'blockedGallery.enabled': userConfig.blockedGallery?.enabled ?? defPlugin.blockedGallery_enabled,
          'blockedGallery.cron': userConfig.blockedGallery?.cron ?? defPlugin.blockedGallery_cron,
          'blockedGallery.autoUpdate': userConfig.blockedGallery?.autoUpdate ?? defPlugin.blockedGallery_autoUpdate,
          'blockedGallery.autoRestart': userConfig.blockedGallery?.autoRestart ?? defPlugin.blockedGallery_autoRestart,
        }
      },
      setConfigData(data, { Result }) {
        try {
          const content = generateConfig(data)
          const dir = path.dirname(configPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(configPath, content, 'utf8')
          return Result.ok({}, '保存成功~')
        } catch (e) {
          logger.error('[ProfileImg-Plugin] 保存配置失败:', e)
          return Result.error('保存失败')
        }
      },
    },
  }
}