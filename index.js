import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

import { buildAliasMap, watchCustomAliasFiles } from './modules/alias.js'
import { buildProMap } from './modules/proMap.js'
import { initMap } from './model/mapJson.js'
import { GALLERY_ROOT, PROFILE_DIR, PROFILE_IMG_DIR } from './components/constants.js'
import { ensureGalleryConfigFile, ensureManagerConfigFile } from './components/config.js'
import { autoRegisterUnregisteredRepos, listUnregisteredRepos } from './model/galleryConfig.js'
import { getLayoutState } from './model/migrateMultiSrc.js'
import { syncProfileImgSrc, buildSrcList } from './model/profileSrc.js'
import { notifyLayout } from './model/layoutNotice.js'

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
// 5. 图库源注册（gallery_config.yaml 是唯一凭证）
//    ① 布局检测：ready / fresh（本地已有可用图库）/ legacy（旧 junction 聚合，需迁移）
//    ② 补登记：gallery/ProfileImg 下发现但未登记的仓库/图库目录 → 先写进 gallery_config.yaml
//       （legacy 下跳过：此时 ProfileImg/default 是旧 default 图库，须由 #迁移图库 处理）
//    ③ 从 gallery_config.yaml 注册 miao 图库源；有变更则私聊主人要求重启
// ============================================================

/**
 * 延迟私聊主人：等插件加载完成与协议适配器连接后再发送（启动早期发送易失败）
 * notifyLayout 内部带 24h 同状态节流，发送成功才记录；失败则下次启动重试
 * @param {'legacy'|'fresh'|'srcPending'} state
 */
function scheduleLayoutNotice (state) {
  setTimeout(() => {
    notifyLayout(state).catch(e => logger?.warn('[ProfileImg-Plugin] 布局提示异常:', e.message))
  }, 45 * 1000)
}

/**
 * 输出图库源诊断日志：已配置但未就绪的图库 / 仍未登记的目录
 * 第三方图库必须登记在 gallery_config.yaml 才会被读取（跨盘仓库只能由用户直接写配置）
 * @param {Array<{label: string, reason: string}>} skipped - syncProfileImgSrc 的 skipped
 */
function logSourceDiagnostics (skipped = []) {
  if (skipped.length) {
    logger.warn('[ProfileImg-Plugin] 已配置但未注册的图库：' +
      skipped.map(s => `${s.label}（${s.reason}）`).join('；'))
  }
  const unregistered = listUnregisteredRepos()
  if (unregistered.length) {
    logger.warn('[ProfileImg-Plugin] 仍未登记的图库目录（下次启动自动登记）：' +
      unregistered.map(u => u.name).join('、'))
  }
}

// ① 布局检测（legacy 下不补登记：此时 ProfileImg/default 是旧 default 图库，须由 #迁移图库 处理）
const layoutState = getLayoutState()

// ② 补登记：扫描结果只用于写入 gallery_config.yaml，绝不直接作为 miao 源
if (layoutState !== 'legacy') {
  const autoReg = autoRegisterUnregisteredRepos()
  if (autoReg.added.length) {
    logger.info('[ProfileImg-Plugin] 已自动登记图库到 gallery_config.yaml：' +
      autoReg.added.map(a => a.name).join('、'))
  }
  if (autoReg.failed.length) {
    logger.warn('[ProfileImg-Plugin] 自动登记失败：' +
      autoReg.failed.map(f => `${f.name}（${f.error}）`).join('；'))
  }
}

// ③ 从 gallery_config.yaml 注册 miao 图库源；有变更则私聊主人要求重启
if (layoutState === 'ready') {
  const synced = syncProfileImgSrc()
  if (!synced.ok) {
    logger.warn('[ProfileImg-Plugin] 图库源列表同步失败:', synced.error)
  } else if (synced.changed) {
    // 写入发生在 miao 加载之后时本次不生效（插件并发加载，顺序不确定），因此一律提示重启
    logger.info('[ProfileImg-Plugin] 已更新 miao 图库源列表（profileImgSrc），重启 Yunzai 后生效')
    scheduleLayoutNotice('srcPending')
  } else {
    logger.info(`[ProfileImg-Plugin] 图库源列表正常，共 ${synced.list.length} 个源`)
  }
  logSourceDiagnostics(synced.ok ? synced.skipped : [])
} else if (layoutState === 'legacy') {
  logger.warn('[ProfileImg-Plugin] 检测到旧版图库布局（junction 聚合），发送 #迁移图库 升级到多图库源布局')
  scheduleLayoutNotice('legacy')
} else {
  // fresh：本地已有可用图库（主仓库 / 第三方）时直接注册，省去「先 #图库初始化 才注册」的一步
  const want = buildSrcList()
  if (want.list.length > 1) {
    const synced = syncProfileImgSrc()
    if (!synced.ok) {
      logger.warn('[ProfileImg-Plugin] 图库源列表同步失败:', synced.error)
    } else {
      logger.info(`[ProfileImg-Plugin] 检测到本地图库源，已注册 ${synced.list.length} 个源，重启 Yunzai 后生效`)
      if (synced.changed) scheduleLayoutNotice('srcPending')
    }
    logSourceDiagnostics(synced.ok ? synced.skipped : [])
  } else {
    logger.info('[ProfileImg-Plugin] 图库未初始化，发送 #图库初始化 进行初始化')
    scheduleLayoutNotice('fresh')
  }
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
