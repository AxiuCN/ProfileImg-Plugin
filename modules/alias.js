import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar } from '../model/mapJson.js'
import { buildRepos, getRepoRoleDir } from '../model/repoRegistry.js'

/** 别名映射表，启动时从 miao-plugin 的 alias.js 构建 */
let ALIAS_MAP = new Map()

export function buildAliasMap() {
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
  logger.info(`[ProfileImg-Plugin] 别名表已加载，共 ${ALIAS_MAP.size} 条记录`)
}

/**
 * 收集所有仓库的 normal-character 目录下的角色名列表（去重）
 * 遍历 buildRepos() 全部仓库（主/迁移/default/第三方），与聚合架构一致
 * @returns {string[]}
 */
function getAllCharDirs() {
  const allDirs = new Set()
  try {
    for (const repo of buildRepos()) {
      const normalDir = path.join(repo.dir, 'normal-character')
      if (!fs.existsSync(normalDir)) continue
      const chars = fs.readdirSync(normalDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
      for (const c of chars) allDirs.add(c)
    }
  } catch (e) {
    logger.warn('[ProfileImg-Plugin] 扫描角色目录失败:', e.message)
  }
  return [...allDirs]
}

/**
 * 判断角色是否有面板图目录（任一仓库存在 normal-character/<角色名>）
 * @param {string} roleName - 角色名
 * @returns {boolean}
 */
function roleDirExists(roleName) {
  const repos = buildRepos()
  return repos.some(repo => fs.existsSync(getRepoRoleDir(repo, 'normal', roleName)))
}

/**
 * 解析角色名，支持别名
 * 四级回退：精确匹配 → 别名 Map → 大小写不敏感 → 模糊匹配
 * @param {string} input - 用户输入的角色名
 * @returns {string} 官方角色名，若解析失败则返回原输入
 */
export function resolveRoleName(input) {
  // 1. 跨所有仓库检查精确匹配
  if (roleDirExists(input)) return input

  // 2. 别名 Map 查找
  const lowerInput = input.toLowerCase()
  if (ALIAS_MAP.has(lowerInput)) {
    const official = ALIAS_MAP.get(lowerInput)
    // 验证官方名确实有目录存在
    if (roleDirExists(official)) return official
  }

  // 3. 大小写不敏感匹配（跨所有仓库扫描）
  try {
    const charDirs = getAllCharDirs()
    const caseMatch = charDirs.find(dir => dir.toLowerCase() === lowerInput)
    if (caseMatch) return caseMatch

    // 4. 模糊匹配（唯一结果才返回）
    const partialMatches = charDirs.filter(dir => dir.includes(input))
    if (partialMatches.length === 1) return partialMatches[0]
  } catch (e) {
    logger.warn('[ProfileImg-Plugin] 目录扫描失败:', e.message)
  }

  logger.warn(`[ProfileImg-Plugin] 角色名解析失败，使用原始输入: "${input}"`)
  return input
}
