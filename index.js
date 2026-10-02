import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

import { buildAliasMap, watchCustomAliasFiles } from './modules/alias.js'
import { buildProMap } from './modules/proMap.js'
import { initMap } from './model/mapJson.js'
import { GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR } from './components/constants.js'
import { ensureGalleryConfigFile, ensureManagerConfigFile } from './components/config.js'
import { getLayoutState } from './model/migrateMultiSrc.js'
import { syncProfileImgSrc } from './model/profileSrc.js'

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
// 5. 布局检测（多图库源布局）
//    ready  — 已注册图库源，启动时同步源列表（幂等，变更需重启 miao 生效）
//    legacy — 旧 junction 聚合布局，提示 #迁移图库
//    fresh  — 未初始化，提示 #图库初始化
// ============================================================
const layoutState = getLayoutState()
if (layoutState === 'ready') {
  const synced = syncProfileImgSrc()
  if (!synced.ok) {
    logger.warn('[ProfileImg-Plugin] 图库源列表同步失败:', synced.error)
  } else if (synced.changed) {
    logger.info('[ProfileImg-Plugin] 已更新 miao 图库源列表（profileImgSrc），重启 Yunzai 后生效')
  } else {
    logger.info(`[ProfileImg-Plugin] 图库源列表正常，共 ${synced.list.length} 个源`)
  }
} else if (layoutState === 'legacy') {
  logger.warn('[ProfileImg-Plugin] 检测到旧版图库布局（junction 聚合），发送 #迁移图库 升级到多图库源布局')
} else {
  logger.info('[ProfileImg-Plugin] 图库未初始化，发送 #图库初始化 进行初始化')
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
