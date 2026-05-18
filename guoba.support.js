import fs from 'node:fs'
import path from 'node:path'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const configExamplePath = path.join(pluginRoot, 'config', 'config.yaml.example')

// ==================== 配置管理器 ====================
class Config {
  /**
   * 读取配置（合并默认值与用户值）
   */
  getConfig() {
    try {
      if (!fs.existsSync(configPath)) {
        return this.getDefault()
      }
      const content = fs.readFileSync(configPath, 'utf8')
      return this._parseYaml(content)
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 读取配置失败:', e)
      return this.getDefault()
    }
  }

  /**
   * 从 config.yaml.example 读取默认配置
   */
  getDefault() {
    if (fs.existsSync(configExamplePath)) {
      try {
        const content = fs.readFileSync(configExamplePath, 'utf8')
        return this._parseYaml(content)
      } catch (e) {
        logger.error('[ProfileImg-Plugin] 读取默认配置失败:', e)
      }
    }
    // 硬编码兜底
    return {
      update: {
        pluginSelf: { enabled: true, cron: '0 0 5 * * *', autoUpdate: true, autoRestart: true },
        mainGallery: { enabled: true, cron: '0 20 5 * * *', autoUpdate: true, autoRestart: false },
        blockedGallery: { enabled: true, cron: '0 40 5 * * *', autoUpdate: true, autoRestart: false }
      }
    }
  }

  /**
   * 简易 YAML 解析（仅支持我们模板中的扁平嵌套结构）
   */
  _parseYaml(content) {
    const result = {}
    let currentModule = ''
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // 检测模块名（如 pluginSelf:）
      const moduleMatch = trimmed.match(/^(\w+):\s*$/)
      if (moduleMatch && !trimmed.startsWith(' ') && !trimmed.startsWith('\t')) {
        currentModule = moduleMatch[1]
        if (!result[currentModule]) result[currentModule] = {}
        continue
      }

      // 检测字段值（如 enabled: true）
      if (currentModule) {
        const fieldMatch = trimmed.match(/^(\w+):\s*(.+)$/)
        if (fieldMatch) {
          const key = fieldMatch[1]
          let value = fieldMatch[2].trim()
          // 去除引号
          value = value.replace(/^["']|["']$/g, '')
          // 转换布尔值
          if (value === 'true') value = true
          else if (value === 'false') value = false
          result[currentModule][key] = value
        }
      }
    }
    return result
  }

  /**
   * 保存配置（基于模板替换，保留注释）
   */
  setConfig(data) {
    try {
      const dirPath = path.dirname(configPath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      // 读取模板文件
      let template = fs.readFileSync(configExamplePath, 'utf8')

      // 定义替换规则：正则精确匹配模板中的值行，只替换值部分
      const replacements = [
        // ========== pluginSelf ==========
        // enabled: true/false
        { regex: /(pluginSelf:\n\s*#.*\n\s*enabled:\s*)(true|false)/, value: data['pluginSelf.enabled'] },
        // cron: "..."（注意值带引号）
        { regex: /(pluginSelf:[\s\S]*?cron:\s*)"[^"]*"/, value: `"${data['pluginSelf.cron']}"` },
        // autoUpdate: true/false
        { regex: /(pluginSelf:[\s\S]*?autoUpdate:\s*)(true|false)/, value: data['pluginSelf.autoUpdate'] },
        // autoRestart: true/false
        { regex: /(pluginSelf:[\s\S]*?autoRestart:\s*)(true|false)/, value: data['pluginSelf.autoRestart'] },

        // ========== mainGallery ==========
        { regex: /(mainGallery:\n\s*#.*\n\s*enabled:\s*)(true|false)/, value: data['mainGallery.enabled'] },
        { regex: /(mainGallery:[\s\S]*?cron:\s*)"[^"]*"/, value: `"${data['mainGallery.cron']}"` },
        { regex: /(mainGallery:[\s\S]*?autoUpdate:\s*)(true|false)/, value: data['mainGallery.autoUpdate'] },
        { regex: /(mainGallery:[\s\S]*?autoRestart:\s*)(true|false)/, value: data['mainGallery.autoRestart'] },

        // ========== blockedGallery ==========
        { regex: /(blockedGallery:\n\s*#.*\n\s*enabled:\s*)(true|false)/, value: data['blockedGallery.enabled'] },
        { regex: /(blockedGallery:[\s\S]*?cron:\s*)"[^"]*"/, value: `"${data['blockedGallery.cron']}"` },
        { regex: /(blockedGallery:[\s\S]*?autoUpdate:\s*)(true|false)/, value: data['blockedGallery.autoUpdate'] },
        { regex: /(blockedGallery:[\s\S]*?autoRestart:\s*)(true|false)/, value: data['blockedGallery.autoRestart'] },
      ]

      for (const rep of replacements) {
        template = template.replace(rep.regex, `$1${rep.value}`)
      }

      fs.writeFileSync(configPath, template, 'utf8')
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
          bottomHelpMessage: '是否启用插件自身的自动检查更新',
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'pluginSelf.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:00）',
          bottomHelpMessage: '使用可视化界面配置，也可手动输入',
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
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'pluginSelf.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（代码更新后需重启生效）',
          component: 'Switch',
          defaultValue: true
        },

        // ==================== 主图库更新 ====================
        {
          label: '主图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'mainGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用主图库的自动检查更新',
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'mainGallery.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:20）',
          bottomHelpMessage: '使用可视化界面配置，也可手动输入',
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
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'mainGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（主图库更新一般无需重启）',
          component: 'Switch',
          defaultValue: false
        },

        // ==================== 屏蔽图库更新 ====================
        {
          label: '屏蔽图库更新',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'blockedGallery.enabled',
          label: '启用自动检查',
          bottomHelpMessage: '是否启用屏蔽图库的自动检查更新',
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'blockedGallery.cron',
          label: '检查时间',
          helpMessage: '自动检查更新的 cron 表达式（默认每天 5:40）',
          bottomHelpMessage: '使用可视化界面配置，也可手动输入',
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
          component: 'Switch',
          defaultValue: true
        },
        {
          field: 'blockedGallery.autoRestart',
          label: '自动重启',
          bottomHelpMessage: '自动更新后是否重启云崽（屏蔽图库更新无需重启）',
          component: 'Switch',
          defaultValue: false
        },
      ],
      getConfigData() {
        const defaults = config.getDefault().update || {}
        const userConfig = config.getConfig().update || {}
        return {
          'pluginSelf.enabled': userConfig.pluginSelf?.enabled ?? defaults.pluginSelf?.enabled ?? true,
          'pluginSelf.cron': userConfig.pluginSelf?.cron ?? defaults.pluginSelf?.cron ?? '0 0 5 * * *',
          'pluginSelf.autoUpdate': userConfig.pluginSelf?.autoUpdate ?? defaults.pluginSelf?.autoUpdate ?? true,
          'pluginSelf.autoRestart': userConfig.pluginSelf?.autoRestart ?? defaults.pluginSelf?.autoRestart ?? true,
          'mainGallery.enabled': userConfig.mainGallery?.enabled ?? defaults.mainGallery?.enabled ?? true,
          'mainGallery.cron': userConfig.mainGallery?.cron ?? defaults.mainGallery?.cron ?? '0 20 5 * * *',
          'mainGallery.autoUpdate': userConfig.mainGallery?.autoUpdate ?? defaults.mainGallery?.autoUpdate ?? true,
          'mainGallery.autoRestart': userConfig.mainGallery?.autoRestart ?? defaults.mainGallery?.autoRestart ?? false,
          'blockedGallery.enabled': userConfig.blockedGallery?.enabled ?? defaults.blockedGallery?.enabled ?? true,
          'blockedGallery.cron': userConfig.blockedGallery?.cron ?? defaults.blockedGallery?.cron ?? '0 40 5 * * *',
          'blockedGallery.autoUpdate': userConfig.blockedGallery?.autoUpdate ?? defaults.blockedGallery?.autoUpdate ?? true,
          'blockedGallery.autoRestart': userConfig.blockedGallery?.autoRestart ?? defaults.blockedGallery?.autoRestart ?? false,
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