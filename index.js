import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

import { buildAliasMap, watchCustomAliasFiles } from './modules/alias.js'
import { buildProMap } from './modules/proMap.js'
import { initMap } from './model/mapJson.js'
import { GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR, MIAO_PROFILE_LINK } from './components/constants.js'
import { isJunction, ensureJunction } from './model/junction.js'
import { checkProfileJunction } from './model/gallery.js'
import { ensureGalleryConfigFile, ensureManagerConfigFile } from './components/config.js'
import { ensureAllCharJunctions } from './model/copier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const configDir = path.join(__dirname, 'config')
const configFile = path.join(configDir, 'config.yaml')
const exampleFile = path.join(configDir, 'config.yaml.example')

// ============================================================
// 1. 配置初始化
// ============================================================
if (!fs.existsSync(configFile) && fs.existsSync(exampleFile)) {
  fs.copyFileSync(exampleFile, configFile)
  logger.info('[ProfileImg-Plugin] 已从 config.yaml.example 创建配置文件')
}

// ============================================================
// 2. 构建角色别名映射表 + Pro 角色映射（必须在加载 apps 之前）
// ============================================================
buildAliasMap()
buildProMap()
// 监听 miao-plugin 自定义别名 cfg，变更自动重建别名表（热更新）
watchCustomAliasFiles()

// ============================================================
// 3. 确保图库基础目录结构存在
// ============================================================
if (!fs.existsSync(GALLERY_ROOT)) fs.mkdirSync(GALLERY_ROOT, { recursive: true })
if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })
if (!fs.existsSync(PROFILE_IMG_DIR)) fs.mkdirSync(PROFILE_IMG_DIR, { recursive: true })

// ============================================================
// 4. 初始化 map.json + gallery_config.yaml + manager_config.yaml
//    （若不存在则创建）
// ============================================================
initMap()
ensureGalleryConfigFile()
ensureManagerConfigFile()

// ============================================================
// 5. Junction 完整性检查（若已初始化则验证并修复）+ 角色级 junction
//    模式 A：MIAO_PROFILE_LINK 本身为 junction（标准架构）
//    模式 B：MIAO_PROFILE_LINK 为真实目录，normal/super-character 子目录为 junction（升级兼容）
// ============================================================
const jState = checkProfileJunction()
if (isJunction(MIAO_PROFILE_LINK)) {
  logger.info('[ProfileImg-Plugin] 检测到 profile junction，验证中...')
  const jResult = ensureJunction(PROFILE_DIR, MIAO_PROFILE_LINK)
  if (!jResult.ok) {
    logger.warn('[ProfileImg-Plugin] profile junction 异常:', jResult.error)
  } else if (jResult.created) {
    logger.info('[ProfileImg-Plugin] profile junction 已重新创建')
  } else {
    logger.info('[ProfileImg-Plugin] profile junction 正常')
  }
} else if (fs.existsSync(MIAO_PROFILE_LINK)) {
  if (jState.ok) {
    logger.info('[ProfileImg-Plugin] profile 为真实目录 + 子目录 junction（模式 B），聚合层正常')
  } else {
    logger.info('[ProfileImg-Plugin] profile 目录为真实目录（未初始化），发送 #图库初始化 进行初始化')
  }
} else {
  logger.info('[ProfileImg-Plugin] profile 目录不存在，发送 #图库初始化 进行初始化')
}

// 已初始化（模式 A / B）时确保所有活跃主仓库的角色级 junction 存在
if (jState.ok) {
  const charCount = ensureAllCharJunctions()
  logger.info(`[ProfileImg-Plugin] 角色级 junction 检查完成，共 ${charCount} 个`)
}

// ============================================================
// 6. 动态加载 apps
// ============================================================
const readdir = promisify(fs.readdir)

logger.info('----ProfileImg-Plugin----')
logger.info('ProfileImg-Plugin 初始化中...')

const files = await readdir('./plugins/ProfileImg-Plugin/apps').catch(err => {
  logger.error('[ProfileImg-Plugin] 读取 apps 目录失败:', err)
  return []
})

let ret = []
if (files) {
  files.forEach(file => {
    if (file.endsWith('.js')) {
      ret.push(import(`./apps/${file}`))
    }
  })
}

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  const name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.info('ProfileImg-Plugin 载入成功 owo')
logger.info('----ProfileImg-Plugin----')

export { apps }
