import fs from 'node:fs'
import path from 'node:path'
import { BLOCKED_REPO_DIR, PROFILE_DIR } from '../components/constants.js'
import { getDirSize } from '../components/format.js'
import { buildRepos } from './repoRegistry.js'
import { getAggregatedFiles, sortPanelFiles } from '../components/panelUtils.js'

/** .bak 隐藏文件在屏蔽列表中的 displayN 起始（blocked-character 用 1~9999） */
export const BAK_DISPLAY_BASE = 10000

/**
 * 屏蔽图库统计 + 多仓库聚合路由
 *
 * getMainDir 已废弃：聚合层不再有"单一主目录"，
 * 改用 getAggregatedFiles 遍历所有仓库。
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
 * 获取角色的聚合目录列表（遍历所有仓库，分配全局 display n）
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type - 图库类型，默认 'normal'
 * @returns {Array} getAggregatedFiles 结果
 */
export function getRoleAggregated(roleName, type = 'normal') {
  const repos = buildRepos()
  return getAggregatedFiles(roleName, type, repos)
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
 * 获取角色的屏蔽聚合列表（供屏蔽列表显示）
 * 包含两类：
 *   blocked-character 文件（主图库屏蔽移入）→ displayN = 文件内 n（1~9999）
 *   聚合目录 .bak 文件（非主图库隐藏）    → displayN = BAK_DISPLAY_BASE + idx
 * @param {string} roleName - 角色名
 * @returns {Array<{ name: string, displayN: number, isBak: boolean, filePath: string }>}
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
        filePath: path.join(blockedDir, item.name)
      })
    }
  }

  // 2. 聚合目录 .bak 文件
  const aggDir = path.join(PROFILE_DIR, 'normal-character', roleName)
  if (fs.existsSync(aggDir)) {
    const baks = fs.readdirSync(aggDir)
      .filter(f => f.endsWith('.bak'))
      .sort()
    for (const f of baks) {
      result.push({
        name: f.slice(0, -4),
        displayN: BAK_DISPLAY_BASE + result.length,
        isBak: true,
        filePath: path.join(aggDir, f)
      })
    }
  }

  return result
}
