import fs from 'node:fs'
import path from 'node:path'

/**
 * Pro 角色映射 — 星铁「某某某Pro」加强版角色复用基础角色图库
 *
 * miao-plugin 中 Pro 角色是独立实体，按角色名查询 profile/{type}-character/某某某Pro。
 * 本映射让聚合层（角色级 junction + 复制聚合）在逻辑层统一归一到基础角色：
 *   - junction link 保持 Pro 名（miao-plugin 查得到），target 指向基础角色主仓库目录
 *   - 复制 / 命令路由统一用基础角色名（序号段位统一、删除/反查一致）
 */

/** Pro 角色 → 基础角色映射表（如 流萤Pro → 流萤），启动时从 miao-plugin alias.js 构建 */
let PRO_MAP = new Map()

/**
 * 从 miao-plugin meta-sr alias.js 提取 Pro 角色映射
 * 规则：alias key 带 "Pro" 后缀，且去掉后缀后的基础名也是 alias key（如 流萤Pro → 流萤）
 */
export function buildProMap() {
  PRO_MAP = new Map()
  const file = path.join(process.cwd(), 'plugins/miao-plugin/resources/meta-sr/character/alias.js')
  if (!fs.existsSync(file)) {
    logger.warn('[ProfileImg-Plugin] miao-plugin 星铁 alias.js 不存在，Pro 映射未加载')
    return
  }
  try {
    const content = fs.readFileSync(file, 'utf8')
    const match = content.match(/export const alias = \{([^}]+)\}/s)
    if (!match) return
    const names = new Set()
    const keys = []
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^\s*'?(.+?)'?\s*:\s*'([^']+)',?\s*$/)
      if (!kv) continue
      const official = kv[1].trim()
      names.add(official)
      keys.push(official)
    }
    for (const name of keys) {
      if (name.endsWith('Pro')) {
        const base = name.slice(0, -3)
        if (names.has(base)) PRO_MAP.set(name, base)
      }
    }
    logger.info(`[ProfileImg-Plugin] Pro 角色映射表已加载，共 ${PRO_MAP.size} 条`)
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 解析 Pro 角色映射失败:', file, e.message)
  }
}

/**
 * 取 Pro 角色的基础角色名（大小写不敏感）；非 Pro 返回 null
 * @param {string} roleName
 * @returns {string|null}
 */
export function getProBase(roleName) {
  if (PRO_MAP.has(roleName)) return PRO_MAP.get(roleName)
  const lower = roleName.toLowerCase()
  for (const [pro, base] of PRO_MAP) {
    if (pro.toLowerCase() === lower) return base
  }
  return null
}

/**
 * 逻辑层角色名归一：Pro → 基础角色名，非 Pro 原样返回
 * @param {string} roleName
 * @returns {string}
 */
export function normalizeRoleName(roleName) {
  return getProBase(roleName) || roleName
}

/**
 * 基础角色的所有 Pro 变体名（用于源目录候选 / junction 遍历）
 * @param {string} baseRole
 * @returns {string[]}
 */
export function getProNames(baseRole) {
  const out = []
  for (const [pro, base] of PRO_MAP) {
    if (base === baseRole) out.push(pro)
  }
  return out
}

/**
 * 全部 Pro 映射条目（供 ensureAllCharJunctions 建 Pro junction）
 * @returns {Array<{pro: string, base: string}>}
 */
export function listProEntries() {
  return [...PRO_MAP].map(([pro, base]) => ({ pro, base }))
}
