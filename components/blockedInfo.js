import fs from 'node:fs'
import path from 'node:path'
import { BLOCKED_GALLERY_PATH, GALLERY_PATH } from './constants.js'
import { getDirSize } from './format.js'

/** 获取屏蔽图库统计信息 */
export function getBlockedInfo() {
  let charCount = 0, totalSize = 0, imageCount = 0
  if (!fs.existsSync(BLOCKED_GALLERY_PATH)) return { charCount, totalSize, imageCount }
  const charDirs = fs.readdirSync(BLOCKED_GALLERY_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.git')
  for (const charDir of charDirs) {
    const charPath = path.join(BLOCKED_GALLERY_PATH, charDir.name)
    totalSize += getDirSize(charPath)
    charCount++
    const files = fs.readdirSync(charPath, { withFileTypes: true })
    imageCount += files.filter(f => f.isFile() && /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name)).length
  }
  return { charCount, totalSize, imageCount }
}

/** 获取角色主图库路径 */
export function getMainDir(roleName) {
  return path.join(GALLERY_PATH, roleName)
}

/** 获取角色屏蔽图库路径 */
export function getBlockedDir(roleName) {
  return path.join(BLOCKED_GALLERY_PATH, roleName)
}