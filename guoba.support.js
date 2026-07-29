import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

/** 默认值映射（模板变量名 → 默认值） */
const defaultValues = {
  gallery_repos_0_enabled: true,
  gallery_repos_0_cron: '0 20 5 * * *',
  gallery_repos_0_autoUpdate: true,
  gallery_repos_0_autoRestart: false,
  gallery_blocked_enabled: true,
  gallery_blocked_cron: '0 40 5 * * *',
  gallery_blocked_autoUpdate: true,
  gallery_blocked_autoRestart: false,
  upload_enabled: false,
  upload_format: 'webp',
  upload_maxSize: 500
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
  // 将点分隔的字段名转换为下划线变量名
  for (const [key, val] of Object.entries(data)) {
    const varName = key.replace(/\./g, '_')
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
      description: '管理 miao-plugin 角色面板图库（主图库/屏蔽图库），支持多仓库、版权归属',
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
        // ==================== 主图库更新 ====================
        {
          label: '主图库更新（仓库 0）',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'gallery.repos.0.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用主图库的自动检查更新',
          component: 'Switch'
        },
        {
          field: 'gallery.repos.0.cron',
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
          field: 'gallery.repos.0.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动执行 git pull',
          component: 'Switch'
        },
        {
          field: 'gallery.repos.0.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（图库更新一般无需重启）',
          component: 'Switch'
        },
        // ==================== 屏蔽图库更新 ====================
        {
          label: '屏蔽图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'gallery.blocked.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用屏蔽图库的自动检查更新',
          component: 'Switch'
        },
        {
          field: 'gallery.blocked.cron',
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
          field: 'gallery.blocked.autoUpdate',
          label: '自动更新',
          bottomHelpMessage: '检测到更新后是否自动执行 git pull',
          component: 'Switch'
        },
        {
          field: 'gallery.blocked.autoRestart',
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
        {
          field: 'upload.maxSize',
          label: '目标大小（KB）',
          bottomHelpMessage: '原图超过此大小时触发压缩，默认 500KB',
          component: 'InputNumber',
          componentProps: {
            min: 1,
            max: 10240,
            defaultValue: 500,
            placeholder: '500'
          }
        },
      ],
      getConfigData() {
        const userConfig = parseCurrentConfig()
        const gallery = userConfig.gallery || {}
        const repos = gallery.repos || []
        const repo0 = repos[0] || {}
        const blocked = gallery.blocked || {}
        const upload = userConfig.upload || {}

        return {
          'gallery.repos.0.enabled': repo0.enabled ?? defaultValues.gallery_repos_0_enabled,
          'gallery.repos.0.cron': repo0.cron ?? defaultValues.gallery_repos_0_cron,
          'gallery.repos.0.autoUpdate': repo0.autoUpdate ?? defaultValues.gallery_repos_0_autoUpdate,
          'gallery.repos.0.autoRestart': repo0.autoRestart ?? defaultValues.gallery_repos_0_autoRestart,
          'gallery.blocked.enabled': blocked.enabled ?? defaultValues.gallery_blocked_enabled,
          'gallery.blocked.cron': blocked.cron ?? defaultValues.gallery_blocked_cron,
          'gallery.blocked.autoUpdate': blocked.autoUpdate ?? defaultValues.gallery_blocked_autoUpdate,
          'gallery.blocked.autoRestart': blocked.autoRestart ?? defaultValues.gallery_blocked_autoRestart,
          'upload.enabled': upload.enabled ?? defaultValues.upload_enabled,
          'upload.format': upload.format ?? defaultValues.upload_format,
          'upload.maxSize': upload.maxSize ?? defaultValues.upload_maxSize,
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
