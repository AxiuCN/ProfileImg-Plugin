import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import YAML from 'yaml'

// ========================= 路径常量 =========================

const GALLERY_PATH = path.join(process.cwd(), 'plugins/miao-plugin/resources/profile/normal-character')
const BLOCKED_GALLERY_PATH = path.join(process.cwd(), 'plugins/miao-plugin/resources/profile/blocked-character')
const GIT_WORK_DIR = path.join(process.cwd(), 'plugins/miao-plugin/resources/profile')
const BLOCKED_GIT_DIR = path.join(BLOCKED_GALLERY_PATH, '.git')
const MAIN_REPO_URL = 'https://github.com/AxiuCN/miao-plugin-ProfileImg.git'
const BLOCKED_REPO_URL = 'https://github.com/AxiuCN/miao-plugin-ProfileImg-Blocked.git'

export {
  GALLERY_PATH,
  BLOCKED_GALLERY_PATH,
  GIT_WORK_DIR,
  BLOCKED_GIT_DIR,
  MAIN_REPO_URL,
  BLOCKED_REPO_URL
}

// ========================= Git 操作 =========================

/** 在主图库目录执行 Git 命令 */
export function gitExec(command, timeout = 10000) {
  return execSync(command, { cwd: GIT_WORK_DIR, encoding: 'utf8', timeout }).trim()
}

/** 在屏蔽图库目录执行 Git 命令 */
export function gitExecBlocked(command, timeout = 10000) {
  return execSync(command, { cwd: BLOCKED_GALLERY_PATH, encoding: 'utf8', timeout }).trim()
}

/** 在指定目录执行 Git 命令 */
export function gitExecAt(dir, command, timeout = 10000) {
  return execSync(command, { cwd: dir, encoding: 'utf8', timeout }).trim()
}

// ========================= 图库检查 =========================

/** 检查主图库是否就绪 */
export function checkGallery() {
  if (!fs.existsSync(GALLERY_PATH)) {
    return { ok: false, msg: '[面板图图库管理器] 图库目录不存在，请先安装图库' }
  }
  if (!fs.existsSync(path.join(GIT_WORK_DIR, '.git'))) {
    return { ok: false, msg: '[面板图图库管理器] 图库未初始化 Git，请重新安装图库' }
  }
  return { ok: true }
}

/** 检查屏蔽图库是否就绪 */
export function checkBlockedGallery() {
  if (!fs.existsSync(BLOCKED_GALLERY_PATH)) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库目录不存在，请先安装屏蔽图库' }
  }
  if (!fs.existsSync(BLOCKED_GIT_DIR)) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库未初始化 Git，请重新安装屏蔽图库' }
  }
  return { ok: true }
}

// ========================= 格式化与统计 =========================

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

// ========================= 角色名解析 =========================

/**
 * 解析角色名，支持别名。利用 miao-plugin 的 Meta 模块进行别名查找。
 * @param {string} input 用户输入的角色名
 * @returns {Promise<string>} 官方角色名，若解析失败则返回原输入
 */
export async function resolveRoleName(input) {
  try {
    // 动态导入 miao-plugin 的 Meta 模块
    const { default: Meta } = await import('#miao.models')

    // 使用 matchGame 方法跨游戏查找角色
    const result = Meta.matchGame('gs', 'character', input)
    if (result && result.data && result.data.name) {
      logger.debug(`[ProfileImg-Plugin] 别名解析: "${input}" → "${result.data.name}" (${result.game})`)
      return result.data.name
    }

    // 如果 matchGame 未找到，尝试直接 getId
    const id = Meta.getId('gs', 'character', input) || Meta.getId('sr', 'character', input)
    if (id) {
      const data = Meta.getData('gs', 'character', id) || Meta.getData('sr', 'character', id)
      if (data && data.name) {
        logger.debug(`[ProfileImg-Plugin] 别名解析: "${input}" → "${data.name}"`)
        return data.name
      }
    }
  } catch (e) {
    logger.warn('[ProfileImg-Plugin] Meta 模块导入失败，回退到目录扫描')
  }

  // 降级：目录模糊匹配
  try {
    const charDirs = fs.readdirSync(GALLERY_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name)

    if (charDirs.includes(input)) return input
    const lowerInput = input.toLowerCase()
    const caseMatch = charDirs.find(dir => dir.toLowerCase() === lowerInput)
    if (caseMatch) return caseMatch
    const partialMatches = charDirs.filter(dir => dir.includes(input))
    if (partialMatches.length === 1) return partialMatches[0]
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 目录扫描失败:', e.message)
  }

  logger.warn(`[ProfileImg-Plugin] 角色名解析失败，使用原始输入: "${input}"`)
  return input
}

// ========================= 版本信息 =========================

/** 获取主图库本地版本 */
export function getLocalVersion() {
  try {
    const sha = gitExec('git rev-parse --short HEAD')
    const date = gitExec('git log -1 --format=%ci')
    return { sha, date }
  } catch (e) { return null }
}

/** 获取指定目录的本地版本 */
export function getLocalVersionAt(dir) {
  try {
    const sha = gitExecAt(dir, 'git rev-parse --short HEAD')
    const date = gitExecAt(dir, 'git log -1 --format=%ci')
    return { sha, date }
  } catch (e) { return null }
}

/** 获取主图库远程最新 SHA */
export function getRemoteSha() {
  try {
    gitExec('git fetch origin main', 30000)
    return gitExec('git rev-parse --short origin/main')
  } catch (e) { return null }
}

/** 获取屏蔽图库远程最新 SHA */
export function getRemoteShaBlocked() {
  try {
    gitExecBlocked('git fetch origin main', 30000)
    return gitExecBlocked('git rev-parse --short origin/main')
  } catch (e) { return null }
}

/** 强制重置主图库到远程 */
export function forceResetToRemote() {
  gitExec('git reset --hard origin/main', 30000)
}

/** 强制重置屏蔽图库到远程 */
export function forceResetBlocked() {
  gitExecBlocked('git reset --hard origin/main', 30000)
}

// ========================= 通知 =========================

/** 私聊通知主人 */
export function notifyMaster(msg) {
  if (Bot.masterQQ && Bot.masterQQ.length > 0) {
    Bot.masterQQ.forEach(qq => Bot.pickFriend(qq).sendMsg(msg))
  }
}

// ========================= 屏蔽图库统计 =========================

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

// ========================= 配置读取 =========================

/** 读取插件配置文件（plugins/ProfileImg-Plugin/config/config.yaml） */
export function getPluginConfig() {
  const configPath = path.join(process.cwd(), 'plugins/ProfileImg-Plugin/config/config.yaml')
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8')
      return YAML.parse(content) || {}
    }
  } catch (e) {
    logger.error('[ProfileImg-Plugin] 读取配置文件失败:', e)
  }
  return {}
}