import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar, getActiveRepoIds } from '../model/mapJson.js'
import { getRepoDir } from '../components/constants.js'
import { getDefaultDir } from '../model/galleryConfig.js'
import { normalizeRoleName } from './proMap.js'

/**
 * 角色别名解析 —— 来源优先级：Atlas 门面 → 本地兜底
 *
 * **别名来源已移交 Atlas-Plugin**（门面 `Atlas-Plugin/modules/aliasApi.js`，契约版本 `ALIAS_API_VERSION`）：
 * - 主路径：`Atlas-Plugin/modules/aliasApi.js` 的 `resolveAlias(name, gameId)`（契约版本 1，永不抛错）
 *   Atlas 表 3077 键，含武器/圣遗物/ZZZ、多值、六种间隔号归一；本插件只取「对侧候选名」并用
 *   自己的**图库目录存在性**裁决最终角色名（门面不提供也不该提供目录语义）。
 * - 兜底路径：`resolveRoleNameLocal()` —— 本文件的本地实现（解析 miao `meta-{gs,sr}/character/alias.js`
 *   与两个自定义 cfg），**保留、不改语义、不再维护**，仅当 Atlas 未安装 / 门面缺失 / 别名表为空时启用。
 * - **watcher 二选一**：Atlas 可用时不调用 `watchCustomAliasFiles()`（Atlas 首次 `loadAliasMap()` 自己挂），
 *   否则才启用本地那套，避免同一批 cfg 被监听两次。
 *
 * 两条路径**不等价**（降级的固有代价）：兜底表只有角色名（1895 条）、键只 `toLowerCase`；
 * Atlas 路径对 `•` / `·` / 无分隔号三种写法等价，且命中面更大。详见 `docs/模块-别名.md`。
 */

/**
 * Atlas 别名门面（动态 import：Atlas 未装 / 被禁用时静态 import 会让本插件整个加载失败，兜底就没机会）
 * `AliasLoader` 模块顶层无副作用，import 本身安全；真正建表与挂 watcher 发生在首次 `loadAliasMap()`
 */
let atlas = null
try {
  atlas = await import('../../Atlas-Plugin/modules/aliasApi.js')
} catch (e) {
  atlas = null
}

/** 本插件的游戏标识（miao 口径）→ Atlas gameId */
const ATLAS_GAME = { gs: 'gi', sr: 'hsr' }

/**
 * 别名来源摘要（启动日志与排障用）
 * @returns {{ kind: 'atlas'|'local', version?: number, keys?: number }}
 */
export function getAliasSource() {
  if (!atlas) return { kind: 'local' }
  try {
    const status = atlas.getAliasStatus()
    return { kind: 'atlas', version: status.version, keys: status.keys }
  } catch (e) {
    return { kind: 'local' }
  }
}

/** 别名映射表（本地兜底用），启动时从 miao-plugin 的 alias.js + 自定义别名 cfg 构建 */
let ALIAS_MAP = new Map()

// 自定义别名配置文件（miao-plugin config/，数据单一来源：增删走 #喵喵别名* 命令，本插件只读）
const CUSTOM_ALIAS_FILES = [
  'plugins/miao-plugin/config/alias_gs.cfg',
  'plugins/miao-plugin/config/alias_sr.cfg'
]

// 热更新防抖时间（ms），与 miao-plugin CustomAlias 一致
const RELOAD_DEBOUNCE = 500
// watchFile 轮询间隔（ms）
const WATCH_INTERVAL = 1000

/**
 * 解析自定义别名单行：「标准名：别名1，别名2」
 * 兼容中英文冒号/逗号，坏行返回 null（与 miao-plugin parseLine 同语义）
 * @param {string} line
 * @returns {{name: string, aliases: string[]}|null}
 */
function parseCustomAliasLine (line) {
  if (!line) return null
  const ret = /^([^：:]+)[：:](.*)$/.exec(line.trim())
  if (!ret) return null
  const name = ret[1].trim()
  const aliases = ret[2].split(/[,，]/).map((t) => t.trim()).filter((t) => !!t)
  if (!name || aliases.length === 0) return null
  return { name, aliases }
}

export function buildAliasMap() {
  // 整体重建：热更新重复调用时清空上一轮结果，避免残留（删除 cfg 后旧别名仍命中）
  ALIAS_MAP = new Map()
  const aliasFiles = [
    path.join(process.cwd(), 'plugins/miao-plugin/resources/meta-gs/character/alias.js'),
    path.join(process.cwd(), 'plugins/miao-plugin/resources/meta-sr/character/alias.js')
  ]
  for (const file of aliasFiles) {
    if (!fs.existsSync(file)) continue
    try {
      const content = fs.readFileSync(file, 'utf8')
      const match = content.match(/export const alias = \{([^}]+)\}/s)
      if (!match) continue
      const aliasBlock = match[1]
      const lines = aliasBlock.split('\n')
      for (const line of lines) {
        const kv = line.match(/^\s*'?(.+?)'?\s*:\s*'([^']+)',?\s*$/)
        if (!kv) continue
        const officialName = kv[1].trim()
        const aliasStr = kv[2].trim()
        ALIAS_MAP.set(officialName.toLowerCase(), officialName)
        for (const alias of aliasStr.split(',')) {
          ALIAS_MAP.set(alias.trim().toLowerCase(), officialName)
        }
      }
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 解析别名文件失败:', file, e.message)
    }
  }
  // 自定义别名合并（覆盖层：后写覆盖预设，与 miao-plugin 语义一致；单行/单文件失败不影响其他）
  let customCount = 0
  for (const rel of CUSTOM_ALIAS_FILES) {
    const file = path.join(process.cwd(), rel)
    if (!fs.existsSync(file)) continue
    try {
      const content = fs.readFileSync(file, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        let entry = null
        try {
          entry = parseCustomAliasLine(line)
        } catch (e) {
          logger.warn('[ProfileImg-Plugin] 解析自定义别名单行失败，已跳过:', e.message)
          continue
        }
        if (!entry) continue
        // 行首为标准角色名或预设别名：解析为官方名入表；未知名按原样（图库可能含 miao 未收录角色）
        const official = ALIAS_MAP.get(entry.name.toLowerCase()) || entry.name
        for (const alias of entry.aliases) {
          ALIAS_MAP.set(alias.toLowerCase(), official)
          customCount++
        }
      }
    } catch (e) {
      logger.warn('[ProfileImg-Plugin] 读取自定义别名文件失败，已跳过:', file, e.message)
    }
  }
  logger.info(`[ProfileImg-Plugin] 别名表已加载，共 ${ALIAS_MAP.size} 条记录（含自定义别名 ${customCount} 条）`)
}

/**
 * 收集所有主仓库 + default 图库的 normal-character 角色名列表（去重）
 * @returns {string[]}
 */
function getAllCharDirs() {
  const allDirs = new Set()
  try {
    for (const repoId of getActiveRepoIds()) {
      const normalDir = path.join(getRepoDir(repoId), 'normal-character')
      if (!fs.existsSync(normalDir)) continue
      const chars = fs.readdirSync(normalDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
      for (const c of chars) allDirs.add(c)
    }
    const defaultDir = getDefaultDir()
    if (defaultDir) {
      const normalDir = path.join(defaultDir, 'normal-character')
      if (fs.existsSync(normalDir)) {
        const chars = fs.readdirSync(normalDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
        for (const c of chars) allDirs.add(c)
      }
    }
  } catch (e) {
    logger.warn('[ProfileImg-Plugin] 扫描角色目录失败:', e.message)
  }
  return [...allDirs]
}

/**
 * 判断角色是否有面板图目录（主仓库按 map.json 路由 / default 图库）
 * Pro 角色归一到基础角色目录判断（共享图库，基础目录存在即视为存在）
 * @param {string} roleName - 角色名
 * @returns {boolean}
 */
function roleDirExists(roleName) {
  const dirName = normalizeRoleName(roleName)
  const repoId = getRepoForChar(dirName)
  if (fs.existsSync(path.join(getRepoDir(repoId), 'normal-character', dirName))) return true
  const defaultDir = getDefaultDir()
  if (defaultDir && fs.existsSync(path.join(defaultDir, 'normal-character', dirName))) return true
  return false
}

/**
 * 解析角色名（本地兜底实现，**已冻结**：别名来源移交 Atlas 后仅作降级路径，不再维护）
 *
 * 四级回退：别名 Map → 精确匹配 → 大小写不敏感 → 模糊匹配
 * 别名优先：别名表权威性高于图库目录名，防止「别名与目录撞名」时残留/空目录屏蔽别名（如 晴歌 → 知更鸟•晴歌）
 * @param {string} input - 用户输入的角色名
 * @returns {string} 官方角色名，若解析失败则返回原输入
 */
export function resolveRoleNameLocal(input) {
  let result = input
  const lowerInput = input.toLowerCase()

  // 1. 别名 Map 查找优先（命中且目标官方名目录存在时直接采用）
  if (ALIAS_MAP.has(lowerInput)) {
    const official = ALIAS_MAP.get(lowerInput)
    // 验证官方名确实有目录存在
    if (roleDirExists(official)) result = official
  }

  // 2. 跨所有仓库检查精确匹配（别名未命中或目标目录缺失时）
  if (result === input && roleDirExists(input)) {
    result = input
  }

  // 3. 大小写不敏感匹配 + 4. 模糊匹配（尚未命中时）
  if (result === input) {
    try {
      const charDirs = getAllCharDirs()
      const caseMatch = charDirs.find(dir => dir.toLowerCase() === lowerInput)
      if (caseMatch) {
        result = caseMatch
      } else {
        const partialMatches = charDirs.filter(dir => dir.includes(input))
        if (partialMatches.length === 1) result = partialMatches[0]
      }
    } catch (e) {
      logger.warn('[ProfileImg-Plugin] 目录扫描失败:', e.message)
    }
  }

  if (result === input) {
    logger.warn(`[ProfileImg-Plugin] 角色名解析失败，使用原始输入: "${input}"`)
  }

  // Pro 角色归一到基础角色（共享图库）
  return normalizeRoleName(result)
}

/**
 * 解析角色名，支持别名（对外唯一入口）
 *
 * 顺序：Atlas 门面（对侧候选 → 图库目录存在性裁决）→ 本地四级回退
 * @param {string} input - 用户输入的角色名
 * @param {'gs'|'sr'} [game] - 已知游戏时传入（`#预览` 的 `*` / `#星铁` 前缀、`e.game`）；缺省不按游戏过滤
 * @returns {string} 官方角色名，若解析失败则返回原输入
 */
export function resolveRoleName(input, game) {
  const name = String(input ?? '').trim()
  if (!name) return ''

  // 1. Atlas 门面：candidates 是「对侧候选名」（表双向、不含方向），逐个用图库目录存在性裁决
  if (atlas) {
    try {
      const { candidates } = atlas.resolveAlias(name, ATLAS_GAME[game])
      for (const candidate of candidates) {
        if (candidate && candidate !== name && roleDirExists(candidate)) {
          return normalizeRoleName(candidate)
        }
      }
    } catch (e) {
      logger.warn('[ProfileImg-Plugin] Atlas 别名门面调用异常，改用本地兜底:', e.message)
    }
  }

  // 2. 本地兜底（Atlas 不可用 / 别名表为空 / 未命中）
  return resolveRoleNameLocal(name)
}

// ---- 自定义别名热更新（miao-plugin cfg 文件变更后重建别名表）----
// 注意：Atlas 可用时不启用本监听（watcher 二选一，见文件头）

let reloadTimer = null
let cfgDirWatcher = null

/**
 * 防抖重建别名表：0.5s 内多次文件事件合并为一次重建
 */
function scheduleReload () {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    try {
      buildAliasMap()
      logger.info('[ProfileImg-Plugin] 自定义别名配置已热更新')
    } catch (e) {
      logger.error('[ProfileImg-Plugin] 自定义别名热更新失败，等待下次变更重试:', e.message)
    }
  }, RELOAD_DEBOUNCE)
}

/**
 * 监听 miao-plugin 自定义别名 cfg 文件，变更时自动重建别名表（**仅本地兜底路径使用**）
 * 双监听：目录级 fs.watch（主监听，感知文件首次创建）+ 文件级 fs.watchFile（兜底）
 * 任一监听失败均降级/跳过，不影响插件其余功能
 */
export function watchCustomAliasFiles () {
  // 目录级主监听：文件从「不存在」到「创建」也能感知（参考 miao-plugin 双监听设计）
  const cfgDir = path.join(process.cwd(), 'plugins/miao-plugin/config')
  try {
    if (!fs.existsSync(cfgDir)) {
      logger.warn('[ProfileImg-Plugin] miao-plugin config 目录不存在，跳过目录级监听')
    } else if (!cfgDirWatcher) {
      cfgDirWatcher = fs.watch(cfgDir, { persistent: true }, (event, filename) => {
        if (!filename) return
        const name = filename.toString()
        // 原子写的 .tmp 最终 rename 到目标名，无需特判
        if (name.endsWith('alias_gs.cfg') || name.endsWith('alias_sr.cfg')) scheduleReload()
      })
      cfgDirWatcher.on('error', (e) => {
        logger.warn('[ProfileImg-Plugin] 监听 miao config 目录失败，回退文件级监听:', e.message)
        try {
          cfgDirWatcher.close()
        } catch (err) {
          // 忽略关闭异常
        }
        cfgDirWatcher = null
      })
    }
  } catch (e) {
    logger.warn('[ProfileImg-Plugin] 启动 miao config 目录监听失败，回退文件级监听:', e.message)
  }
  // 文件级兜底：即使目录监听失效也能感知文件变更
  for (const rel of CUSTOM_ALIAS_FILES) {
    const file = path.join(process.cwd(), rel)
    try {
      fs.watchFile(file, { interval: WATCH_INTERVAL }, () => scheduleReload())
    } catch (e) {
      logger.warn('[ProfileImg-Plugin] 监听自定义别名文件失败，已跳过:', file, e.message)
    }
  }
  logger.info('[ProfileImg-Plugin] 自定义别名热更新监听已启动（miao-plugin alias_gs/alias_sr.cfg）')
}
