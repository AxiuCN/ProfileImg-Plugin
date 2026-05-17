import fs from 'node:fs'
import path from 'node:path'

/** 格式化文件大小 */
export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

/** 递归获取目录总大小 */
export function getDirSize(dirPath) {
  let size = 0
  const files = fs.readdirSync(dirPath, { withFileTypes: true })
  files.forEach(file => {
    const filePath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      size += getDirSize(filePath)
    } else {
      size += fs.statSync(filePath).size
    }
  })
  return size
}

/** 递归统计图片数量 */
export function countImages(dirPath) {
  let count = 0
  if (!fs.existsSync(dirPath)) return 0
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.git') {
      count += countImages(path.join(dirPath, entry.name))
    } else if (/\.(webp|png|jpg|jpeg|gif)$/i.test(entry.name)) {
      count++
    }
  }
  return count
}