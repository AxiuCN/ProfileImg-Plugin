import fs from 'node:fs'
import path from 'node:path'
import { BLOCKED_REPO_DIR } from '../components/constants.js'
import { getRepoForChar } from './mapJson.js'
import { getRepoDir } from '../components/constants.js'
import { getDirSize } from '../components/format.js'
import { sortPanelFiles, listRoleFiles, resolveNRange, parseFilename } from '../components/panelUtils.js'
import { normalizeRoleName } from '../modules/proMap.js'

/** 非标准文件在屏蔽列表中的 display n 兜底池（不与任何段位冲突） */
export const BAK_DISPLAY_BASE = 9999999

/**
 * 屏蔽图库统计 + 角色面板图查询
 *
 * 新架构：聚合层为角色级 junction，直接读主仓库角色目录，
 * 不再遍历多仓库注册表。
 */

/**
 * 获取屏蔽图库统计信息
 * @returns {{ charCount: number, totalSize: number, imageCount: number }}
 */
export function getBlockedInfo() {
  let charCount = 0, totalSize = 0, imageCount = 0
  if (!fs.existsSync(BLOCKED_REPO_DIR)) return { charCount, totalSize, imageCount }
  const charDirs = fs.readdirSync(BLOCKED_REPO_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.git')
  for (const charDir of charDirs) {
    const charPath = path.join(BLOCKED_REPO_DIR, charDir.name)
    totalSize += getDirSize(charPath)
    charCount++
    const files = fs.readdirSync(charPath, { withFileTypes: true })
    imageCount += files.filter(f => f.isFile() && /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name)).length
  }
  return { charCount, totalSize, imageCount }
}

/**
 * 获取角色的面板图列表（直接读主仓库角色目录）
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type - 图库类型，默认 'normal'
 * @returns {Array} listRoleFiles 结果（含 name/displayN/source/filePath）
 */
export function getRoleFiles(roleName, type = 'normal') {
  // Pro 角色归一到基础角色目录（共享图库）
  const dirName = normalizeRoleName(roleName)
  const repoId = getRepoForChar(dirName)
  const repoDir = getRepoDir(repoId)
  const roleDir = path.join(repoDir, `${type}-character`, dirName)
  return listRoleFiles(roleDir, dirName)
}

/**
 * 获取角色屏蔽图库路径
 * @param {string} roleName - 角色名
 * @returns {string}
 */
export function getBlockedDir(roleName) {
  return path.join(BLOCKED_REPO_DIR, roleName)
}

/**
 * 获取角色的屏蔽聚合列表（供屏蔽列表显示 / 启用）
 * 包含两类：
 *   blocked-character 目录文件（主图库屏蔽移入）→ displayN = 文件内 n（1~9999）
 *   主仓库角色目录 .bak 文件（default/第三方 屏蔽）→ displayN = 真实 n（10001+）
 * @param {string} roleName - 角色名
 * @returns {Array<{ name: string, displayN: number, isBak: boolean, source: string, filePath: string }>}
 */
export function getBlockedAggregated(roleName) {
  const result = []

  // 1. blocked-character 目录
  const blockedDir = getBlockedDir(roleName)
  if (fs.existsSync(blockedDir)) {
    const imgs = fs.readdirSync(blockedDir)
      .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(path.join(blockedDir, f)).isFile())
    const sorted = sortPanelFiles(imgs, roleName)
    for (const item of sorted) {
      result.push({
        name: item.name,
        displayN: item.parsed.isStandard ? item.parsed.seq : (BAK_DISPLAY_BASE + result.length),
        isBak: false,
        source: item.parsed.isStandard ? resolveNRange(item.parsed.seq).source : 'unknown',
        filePath: path.join(blockedDir, item.name)
      })
    }
  }

  // 2. 主仓库角色目录 .bak 文件（default / 第三方 屏蔽）
  const repoId = getRepoForChar(roleName)
  const repoDir = getRepoDir(repoId)
  const mainRoleDir = path.join(repoDir, 'normal-character', roleName)
  if (fs.existsSync(mainRoleDir)) {
    const baks = fs.readdirSync(mainRoleDir)
      .filter(f => f.endsWith('.bak'))
      .sort()
    for (const f of baks) {
      const bareName = f.slice(0, -4)
      const parsed = parseFilename(bareName, roleName)
      result.push({
        name: bareName,
        displayN: parsed.isStandard ? parsed.seq : (BAK_DISPLAY_BASE + result.length),
        isBak: true,
        source: parsed.isStandard ? resolveNRange(parsed.seq).source : 'unknown',
        filePath: path.join(mainRoleDir, f)
      })
    }
  }

  return result
}
