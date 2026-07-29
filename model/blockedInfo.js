import fs from 'node:fs'
import path from 'node:path'
import { BLOCKED_REPO_DIR, getRepoCharDir } from '../components/constants.js'
import { getRepoForChar } from './mapJson.js'
import { getDirSize } from '../components/format.js'

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
 * 获取角色在主图库中的目录（根据 map.json 路由到对应仓库）
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type - 图库类型，默认 'normal'
 * @returns {string} 角色目录路径
 */
export function getMainDir(roleName, type = 'normal') {
  const repoId = getRepoForChar(roleName)
  return path.join(getRepoCharDir(repoId, type), roleName)
}

/**
 * 获取角色屏蔽图库路径
 * @param {string} roleName - 角色名
 * @returns {string}
 */
export function getBlockedDir(roleName) {
  return path.join(BLOCKED_REPO_DIR, roleName)
}
