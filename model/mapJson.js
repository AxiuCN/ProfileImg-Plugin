import fs from 'node:fs'
import path from 'node:path'

/**
 * map.json 角色→仓库映射表管理
 *
 * map.json 记录每个角色归属的仓库编号。格式：
 * {
 *   "version": 1,
 *   "mapping": { "琴": 0, "胡桃": 1, ... }
 * }
 *
 * 仓库 0 = 默认主仓库（miao-plugin-ProfileImg）
 * 同一个角色的 normal-character 和 super-character 必须在同一仓库
 */

/** map.json 完整路径 */
const MAP_JSON_PATH = path.join(process.cwd(), 'plugins/ProfileImg-Plugin/resources/gallery/map.json')

/** 默认仓库编号（角色不在映射表中时使用） */
const DEFAULT_REPO = 0

/**
 * 加载 map.json
 * @returns {{ version: number, mapping: Record<string, number> }}
 */
export function loadMap() {
  try {
    if (!fs.existsSync(MAP_JSON_PATH)) {
      return { version: 1, mapping: {} }
    }
    const raw = fs.readFileSync(MAP_JSON_PATH, 'utf8')
    const data = JSON.parse(raw)
    return {
      version: data.version || 1,
      mapping: data.mapping || {}
    }
  } catch (e) {
    logger?.error('[ProfileImg-Plugin] 读取 map.json 失败:', e)
    return { version: 1, mapping: {} }
  }
}

/**
 * 保存 map.json
 * @param {{ version: number, mapping: Record<string, number> }} data
 */
export function saveMap(data) {
  try {
    const dir = path.dirname(MAP_JSON_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(MAP_JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    logger?.error('[ProfileImg-Plugin] 写入 map.json 失败:', e)
  }
}

/**
 * 查询角色归属的仓库编号
 * @param {string} charName - 角色名（官方名）
 * @returns {number} 仓库编号，不在表中时返回 DEFAULT_REPO
 */
export function getRepoForChar(charName) {
  const map = loadMap()
  if (charName in map.mapping) {
    return map.mapping[charName]
  }
  return DEFAULT_REPO
}

/**
 * 设置角色归属的仓库编号
 * @param {string} charName - 角色名
 * @param {number} repoId - 仓库编号（>= 0）
 */
export function setRepoForChar(charName, repoId) {
  const map = loadMap()
  map.mapping[charName] = repoId
  saveMap(map)
}

/**
 * 批量设置角色仓库映射（用于迁移时一次性写入多个角色）
 * @param {Record<string, number>} charMap - { 角色名: 仓库编号 }
 * @param {boolean} overwrite - 是否覆盖已有记录（默认 false，不覆盖）
 */
export function setRepoForChars(charMap, overwrite = false) {
  const map = loadMap()
  for (const [name, repoId] of Object.entries(charMap)) {
    if (overwrite || !(name in map.mapping)) {
      map.mapping[name] = repoId
    }
  }
  saveMap(map)
}

/**
 * 从映射表中移除角色
 * @param {string} charName - 角色名
 */
export function removeChar(charName) {
  const map = loadMap()
  delete map.mapping[charName]
  saveMap(map)
}

/**
 * 初始化空的 map.json（若不存在则创建）
 */
export function initMap() {
  if (!fs.existsSync(MAP_JSON_PATH)) {
    saveMap({ version: 1, mapping: {} })
  }
}

/**
 * 获取映射表中的所有角色名
 * @returns {string[]}
 */
export function getAllChars() {
  const map = loadMap()
  return Object.keys(map.mapping)
}

/**
 * 获取属于指定仓库的所有角色
 * @param {number} repoId - 仓库编号
 * @returns {string[]}
 */
export function getCharsInRepo(repoId) {
  const map = loadMap()
  return Object.entries(map.mapping)
    .filter(([, id]) => id === repoId)
    .map(([name]) => name)
}
