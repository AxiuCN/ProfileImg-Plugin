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
  blockedGallery_autoRestart: false,
  upload_enabled: false,
  upload_format: 'webp'
}

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

function generateConfig(data) {
  const values = { ...defaultValues }
  for (const [key, val] of Object.entries(data)) {
    const varName = key.replace('.', '_')
    values[varName] = val
  }
  const template = getTemplate()
  return template.replace(/\${(\w+)}/g, (_, name) => (values[name] !== undefined ? values[name] : ''))
}

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
        // ==================== 上传压缩设置 ====================
        {
          label: '上传压缩',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'upload.enabled',
          label: '启用压缩',
          bottomHelpMessage: '上传面板图时自动压缩（超过目标大小时生效）',
          component: 'Switch'
        },
        {
          field: 'upload.format',
          label: '压缩格式',
          bottomHelpMessage: '选择压缩后的图片格式，推荐 webp',
          component: 'Select',
          required: true,
          componentProps: {
            options: [
              { label: 'WebP', value: 'webp' },
              { label: 'JPEG', value: 'jpeg' },
              { label: 'PNG', value: 'png' }
            ],
            placeholder: '请选择压缩格式'
          }
        },
      ],
      getConfigData() {
        const userConfig = parseCurrentConfig()
        const update = userConfig.update || {}
        const upload = userConfig.upload || {}
        return {
          'pluginSelf.enabled': update.pluginSelf?.enabled ?? defaultValues.pluginSelf_enabled,
          'pluginSelf.cron': update.pluginSelf?.cron ?? defaultValues.pluginSelf_cron,
          'pluginSelf.autoUpdate': update.pluginSelf?.autoUpdate ?? defaultValues.pluginSelf_autoUpdate,
          'pluginSelf.autoRestart': update.pluginSelf?.autoRestart ?? defaultValues.pluginSelf_autoRestart,
          'mainGallery.enabled': update.mainGallery?.enabled ?? defaultValues.mainGallery_enabled,
          'mainGallery.cron': update.mainGallery?.cron ?? defaultValues.mainGallery_cron,
          'mainGallery.autoUpdate': update.mainGallery?.autoUpdate ?? defaultValues.mainGallery_autoUpdate,
          'mainGallery.autoRestart': update.mainGallery?.autoRestart ?? defaultValues.mainGallery_autoRestart,
          'blockedGallery.enabled': update.blockedGallery?.enabled ?? defaultValues.blockedGallery_enabled,
          'blockedGallery.cron': update.blockedGallery?.cron ?? defaultValues.blockedGallery_cron,
          'blockedGallery.autoUpdate': update.blockedGallery?.autoUpdate ?? defaultValues.blockedGallery_autoUpdate,
          'blockedGallery.autoRestart': update.blockedGallery?.autoRestart ?? defaultValues.blockedGallery_autoRestart,
          'upload.enabled': upload.enabled ?? defaultValues.upload_enabled,
          'upload.format': upload.format ?? defaultValues.upload_format,
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