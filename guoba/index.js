import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import * as mainRepo from './mainRepo.js'
import * as blockedRepo from './blockedRepo.js'
import * as uploadMod from './upload.js'
import * as galleryMod from './gallery.js'
import * as managersMod from './managers.js'
import { getGalleryConfig, writeGalleryConfig, getManagerConfig, writeManagerConfig } from '../components/config.js'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')
const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

/** 默认值映射（模板变量名 → 默认值） */
const defaultValues = {
  gallery_repos_0_enabled: true,
  gallery_repos_0_remoteUrl: 'https://github.com/AxiuCN/miao-plugin-ProfileImg.git',
  gallery_repos_0_cron: '0 20 5 * * *',
  gallery_repos_0_autoUpdate: true,
  gallery_repos_0_autoRestart: false,
  gallery_blocked_enabled: true,
  gallery_blocked_remoteUrl: 'https://github.com/AxiuCN/miao-plugin-ProfileImg-Blocked.git',
  gallery_blocked_cron: '0 40 5 * * *',
  gallery_blocked_autoUpdate: true,
  gallery_blocked_autoRestart: false,
  gallery_defaultDir: '',
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
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const varName = key.replace(/\./g, '_')
      values[varName] = val
    }
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
      description: '管理 miao-plugin 角色面板图库（主图库/屏蔽图库/第三方图库），支持多仓库、版权归属',
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
        ...mainRepo.getSchema(),
        ...blockedRepo.getSchema(),
        ...galleryMod.getSchema(),
        ...managersMod.getSchema(),
        ...uploadMod.getSchema()
      ],

      getConfigData() {
        const userConfig = parseCurrentConfig()
        const gallery = userConfig.gallery || {}
        const repos = gallery.repos || []
        const repo0 = repos[0] || {}
        const blocked = gallery.blocked || {}
        const upload = userConfig.upload || {}
        const galleryCfg = getGalleryConfig()
        const managerCfg = getManagerConfig()

        return {
          'gallery.repos.0.enabled': repo0.enabled ?? defaultValues.gallery_repos_0_enabled,
          'gallery.repos.0.remoteUrl': repo0.remoteUrl ?? defaultValues.gallery_repos_0_remoteUrl,
          'gallery.repos.0.cron': repo0.cron ?? defaultValues.gallery_repos_0_cron,
          'gallery.repos.0.autoUpdate': repo0.autoUpdate ?? defaultValues.gallery_repos_0_autoUpdate,
          'gallery.repos.0.autoRestart': repo0.autoRestart ?? defaultValues.gallery_repos_0_autoRestart,
          'gallery.blocked.enabled': blocked.enabled ?? defaultValues.gallery_blocked_enabled,
          'gallery.blocked.remoteUrl': blocked.remoteUrl ?? defaultValues.gallery_blocked_remoteUrl,
          'gallery.blocked.cron': blocked.cron ?? defaultValues.gallery_blocked_cron,
          'gallery.blocked.autoUpdate': blocked.autoUpdate ?? defaultValues.gallery_blocked_autoUpdate,
          'gallery.blocked.autoRestart': blocked.autoRestart ?? defaultValues.gallery_blocked_autoRestart,
          'gallery.defaultDir': gallery.defaultDir ?? defaultValues.gallery_defaultDir,
          'gallery.thirdParty': galleryCfg.thirdParty ?? [],
          'managers': managerCfg.managers ?? [],
          'upload.enabled': upload.enabled ?? defaultValues.upload_enabled,
          'upload.format': upload.format ?? defaultValues.upload_format,
          'upload.maxSize': upload.maxSize ?? defaultValues.upload_maxSize,
        }
      },

      setConfigData(data, { Result }) {
        try {
          // ① 先写 manager_config.yaml（成员管理权限）— 失败则终止
          const managersData = data['managers']
          if (managersData !== undefined) {
            const mgrCfg = getManagerConfig()
            mgrCfg.managers = Array.isArray(managersData) ? managersData : []
            const wm = writeManagerConfig(mgrCfg)
            if (!wm.ok) return Result.error('保存失败：' + wm.error)
          }

          // ② 再写 gallery_config.yaml（第三方图库列表）— 失败则终止，不污染 config.yaml
          const thirdPartyData = data['gallery.thirdParty']
          if (thirdPartyData !== undefined) {
            const galleryCfg = getGalleryConfig()
            galleryCfg.thirdParty = Array.isArray(thirdPartyData) ? thirdPartyData : []
            const w = writeGalleryConfig(galleryCfg)
            if (!w.ok) return Result.error('保存失败：' + w.error)
          }

          // ③ 最后写 config.yaml（标量字段，模板替换保留注释）
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
