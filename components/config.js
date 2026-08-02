import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { GALLERY_CONFIG_PATH, GALLERY_CONFIG_EXAMPLE_PATH } from './constants.js'

/** 读取插件配置文件（plugins/ProfileImg-Plugin/config/config.yaml） */
export function getPluginConfig() {
  const configPath = path.join(process.cwd(), 'plugins/ProfileImg-Plugin/config/config.yaml')
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8')
      return YAML.parse(content) || {}
    }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 读取配置文件失败:', e)
  }
  return {}
}

/** 确保 gallery_config.yaml 存在（不存在时从 .example 复制） */
export function ensureGalleryConfigFile() {
  try {
    if (!fs.existsSync(GALLERY_CONFIG_PATH) && fs.existsSync(GALLERY_CONFIG_EXAMPLE_PATH)) {
      if (!fs.existsSync(path.dirname(GALLERY_CONFIG_PATH))) {
        fs.mkdirSync(path.dirname(GALLERY_CONFIG_PATH), { recursive: true })
      }
      fs.copyFileSync(GALLERY_CONFIG_EXAMPLE_PATH, GALLERY_CONFIG_PATH)
      logger.info('[ProfileImg-Plugin] 已从 gallery_config.yaml.example 创建配置文件')
    }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 初始化 gallery_config.yaml 失败:', e)
  }
}

/**
 * 读取图库配置（config/gallery_config.yaml）
 * 文件不存在时回退读取 .example；两者均不可用返回空对象
 * @returns {object}
 */
export function getGalleryConfig() {
  const candidates = [GALLERY_CONFIG_PATH, GALLERY_CONFIG_EXAMPLE_PATH]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8')
        return YAML.parse(content) || {}
      }
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 读取图库配置失败:', p, e)
    }
  }
  return {}
}

/**
 * 写入图库配置到 config/gallery_config.yaml
 * 覆盖整个对象（含 thirdParty 列表），由锅巴保存 / 下载第三方时调用
 * @param {object} config - 完整的 gallery_config 对象
 * @returns {{ ok: boolean, error?: string }}
 */
export function writeGalleryConfig(config) {
  try {
    const dir = path.dirname(GALLERY_CONFIG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(GALLERY_CONFIG_PATH, YAML.stringify(config, { indent: 2 }), 'utf8')
    return { ok: true }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 写入图库配置失败:', e)
    return { ok: false, error: e.message }
  }
}