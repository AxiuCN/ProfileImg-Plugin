import fs from 'node:fs'
import path from 'node:path'
import { GALLERY_PATH } from './constants.js'

// 别名映射表，启动时从 miao-plugin 的 alias.js 构建
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
 * 解析角色名，支持别名
 * @param {string} input 用户输入的角色名
 * @returns {string} 官方角色名，若解析失败则返回原输入
 */
export function resolveRoleName(input) {
  const charDir = path.join(GALLERY_PATH, input)
  if (fs.existsSync(charDir)) return input
  const lowerInput = input.toLowerCase()
  if (ALIAS_MAP.has(lowerInput)) return ALIAS_MAP.get(lowerInput)
  try {
    const charDirs = fs.readdirSync(GALLERY_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name)
    const caseMatch = charDirs.find(dir => dir.toLowerCase() === lowerInput)
    if (caseMatch) return caseMatch
    const partialMatches = charDirs.filter(dir => dir.includes(input))
    if (partialMatches.length === 1) return partialMatches[0]
  } catch (e) {}
  logger.warn(`[ProfileImg-Plugin] 角色名解析失败，使用原始输入: "${input}"`)
  return input
}