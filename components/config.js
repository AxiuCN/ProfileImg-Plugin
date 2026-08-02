import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { GALLERY_CONFIG_PATH, GALLERY_CONFIG_EXAMPLE_PATH, MANAGER_CONFIG_PATH, MANAGER_CONFIG_EXAMPLE_PATH } from './constants.js'

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

/* ==========================================================================
   成员管理权限（manager_config.yaml）
   ========================================================================== */

/** 确保 manager_config.yaml 存在（不存在时从 .example 复制） */
export function ensureManagerConfigFile() {
  try {
    if (!fs.existsSync(MANAGER_CONFIG_PATH) && fs.existsSync(MANAGER_CONFIG_EXAMPLE_PATH)) {
      if (!fs.existsSync(path.dirname(MANAGER_CONFIG_PATH))) {
        fs.mkdirSync(path.dirname(MANAGER_CONFIG_PATH), { recursive: true })
      }
      fs.copyFileSync(MANAGER_CONFIG_EXAMPLE_PATH, MANAGER_CONFIG_PATH)
      logger.info('[ProfileImg-Plugin] 已从 manager_config.yaml.example 创建配置文件')
    }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 初始化 manager_config.yaml 失败:', e)
  }
}

/**
 * 读取成员管理权限配置（config/manager_config.yaml）
 * 文件不存在时回退读取 .example；两者均不可用返回空对象
 * @returns {{ managers?: Array<{ qq: number, repoId?: number }> }}
 */
export function getManagerConfig() {
  const candidates = [MANAGER_CONFIG_PATH, MANAGER_CONFIG_EXAMPLE_PATH]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return YAML.parse(fs.readFileSync(p, 'utf8')) || {}
      }
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 读取成员配置失败:', p, e)
    }
  }
  return {}
}

/**
 * 写入成员管理权限配置到 config/manager_config.yaml
 * 覆盖整个对象（含 managers 列表），由锅巴保存时调用
 * @param {object} config - 完整的 manager_config 对象
 * @returns {{ ok: boolean, error?: string }}
 */
export function writeManagerConfig(config) {
  try {
    const dir = path.dirname(MANAGER_CONFIG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(MANAGER_CONFIG_PATH, YAML.stringify(config, { indent: 2 }), 'utf8')
    return { ok: true }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 写入成员配置失败:', e)
    return { ok: false, error: e.message }
  }
}

/** 成员未配置 repos 时的默认允许图库（default 图库） */
export const DEFAULT_MANAGER_REPOS = ['default']

/**
 * 查询用户的成员配置记录
 * @param {number|string} userId - 用户 QQ 号
 * @returns {{ qq: number, repos?: Array|string }|null} 非授权成员返回 null
 */
export function getManagerForUser(userId) {
  const cfg = getManagerConfig()
  const list = Array.isArray(cfg?.managers) ? cfg.managers : []
  return list.find(m => String(m.qq) === String(userId)) || null
}

/**
 * 判断用户是否可执行管理指令（主人恒可，或成员白名单内）
 * @param {object} e - 消息事件（含 e.isMaster / e.user_id）
 * @returns {boolean}
 */
export function isManager(e) {
  if (e?.isMaster) return true
  return !!getManagerForUser(e?.user_id)
}

/**
 * 成员允许操作的图库类型列表
 * 图库类型标识：'main'（主图库，一体）/ 'default'（default 图库）/ 第三方图库名
 * @param {number|string} userId - 用户 QQ 号
 * @returns {string[]|null} 成员返回允许图库列表（未配置默认 ['default']）；非成员返回 null
 */
export function getManagerRepos(userId) {
  const m = getManagerForUser(userId)
  if (!m) return null
  const raw = m.repos
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string') list = raw.split(/[,，\s]+/).filter(Boolean)
  list = list.map(String).map(s => s.trim()).filter(Boolean)
  return list.length ? list : [...DEFAULT_MANAGER_REPOS]
}

/**
 * 校验用户是否有权操作某图库类型的图
 * @param {number|string} userId - 用户 QQ 号
 * @param {string} galleryKey - 图库类型标识（'main'/'default'/第三方图库名）
 * @returns {boolean}
 */
export function canAccessGallery(userId, galleryKey) {
  const repos = getManagerRepos(userId)
  if (!repos) return false
  return repos.includes(galleryKey)
}