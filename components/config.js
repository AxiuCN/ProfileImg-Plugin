import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { GALLERY_CONFIG_PATH, GALLERY_CONFIG_EXAMPLE_PATH, GALLERY_CONFIG_TEMPLATE_PATH, MANAGER_CONFIG_PATH, MANAGER_CONFIG_EXAMPLE_PATH } from './constants.js'

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
 * 读取图库配置（默认 config/gallery_config.yaml）
 * 文件不存在时回退读取 .example；两者均不可用返回空对象
 * @param {string} [file] - 指定配置文件（套件用）
 * @returns {object}
 */
export function getGalleryConfig(file) {
  const candidates = file ? [file] : [GALLERY_CONFIG_PATH, GALLERY_CONFIG_EXAMPLE_PATH]
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
 * 用模板渲染列表配置（保留模板中的注释与使用说明）
 * @param {string} templatePath - defSet 下的模板路径
 * @param {string} varName - 模板变量名（不含 ${}）
 * @param {Array} list - 列表数据，空列表渲染为 []
 * @returns {string} 渲染后的配置文本
 */
function renderListConfig (templatePath, varName, list) {  const template = fs.readFileSync(templatePath, 'utf8')
  // 片段缩进 2 空格（与模板中 "key:" 的下一级对齐），空列表用 [] 流式写法
  const fragment = (Array.isArray(list) && list.length > 0)
    ? YAML.stringify(list, { indent: 2 }).trim().split('\n').map(line => '  ' + line).join('\n')
    : '  []'
  return template.replace('${' + varName + '}', fragment)
}

/**
 * 写入图库配置（默认覆盖 config/gallery_config.yaml）
 *
 * 按 defSet/gallery_config.yaml 模板渲染，**保留注释与使用说明**（该文件是用户维护第三方图库的主要手段）；
 * 模板缺失时退化为纯 YAML 写入。目前 gallery_config 只承载 thirdParty 列表
 * @param {{ thirdParty?: Array }} config - 图库配置对象
 * @param {string} [file] - 指定配置文件（套件用）
 * @returns {{ ok: boolean, error?: string }}
 */
export function writeGalleryConfig(config, file) {
  const target = file || GALLERY_CONFIG_PATH
  try {
    const list = Array.isArray(config?.thirdParty) ? config.thirdParty : []
    const content = fs.existsSync(GALLERY_CONFIG_TEMPLATE_PATH)
      ? renderListConfig(GALLERY_CONFIG_TEMPLATE_PATH, 'gallery_thirdParty', list)
      : YAML.stringify({ thirdParty: list }, { indent: 2 })
    const dir = path.dirname(target)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
    return { ok: true }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 写入图库配置失败:', e)
    return { ok: false, error: e.message }
  }
}

/**
 * 刷新图库配置文件的注释结构（模板升级后同步给存量用户）
 *
 * 运行时 config/gallery_config.yaml 只在文件不存在时从模板复制，老用户的注释会一直停留在旧版本；
 * 此处按当前 defSet 模板重新渲染并比对，仅在内容确实不同时写回。
 * 安全约束：配置里出现 `thirdParty` 以外的键（用户自行扩展）时跳过，避免覆盖用户内容。
 * @param {object} [opts]
 * @param {string} [opts.file] - 指定配置文件（套件用）
 * @returns {{ ok: boolean, refreshed: boolean, reason?: string, error?: string }}
 */
export function refreshGalleryConfigFile(opts = {}) {
  const target = opts.file || GALLERY_CONFIG_PATH
  try {
    if (!fs.existsSync(target)) return { ok: true, refreshed: false, reason: '配置文件不存在' }
    if (!fs.existsSync(GALLERY_CONFIG_TEMPLATE_PATH)) return { ok: true, refreshed: false, reason: '模板缺失' }

    const raw = fs.readFileSync(target, 'utf8')
    const cfg = YAML.parse(raw) || {}
    const extraKeys = Object.keys(cfg).filter(k => k !== 'thirdParty')
    if (extraKeys.length) {
      return { ok: true, refreshed: false, reason: `含自定义键 ${extraKeys.join('、')}，跳过` }
    }

    const expected = renderListConfig(GALLERY_CONFIG_TEMPLATE_PATH, 'gallery_thirdParty', cfg.thirdParty || [])
    if (expected === raw) return { ok: true, refreshed: false }
    fs.writeFileSync(target, expected, 'utf8')
    return { ok: true, refreshed: true }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 刷新图库配置注释失败:', e)
    return { ok: false, refreshed: false, error: e.message }
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

/** 成员未配置 repos 时的默认允许图库（default 图库） */
const DEFAULT_MANAGER_REPOS = ['default']

/**
 * 查询用户的成员配置记录
 * @param {number|string} userId - 用户 QQ 号
 * @returns {{ qq: number, repos?: Array|string }|null} 非授权成员返回 null
 */
function getManagerForUser(userId) {
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
function getManagerRepos(userId) {
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