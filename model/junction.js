import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar } from './mapJson.js'
import { getRepoDir, PROFILE_DIR } from '../components/constants.js'

/**
 * Junction（目录符号链接）管理工具
 *
 * Windows junction 是 NTFS 原生特性，无需管理员权限（Win 10+ 开发者模式默认启用）。
 * 与普通 symlink 的区别：junction 只能指向目录且必须是绝对路径，但可以跨卷。
 */

/**
 * 创建 Windows junction（目录符号链接）
 * @param {string} target - 链接目标（绝对路径，指向的实际目录）
 * @param {string} link - 链接路径（绝对路径，junction 本身的位置）
 * @returns {{ ok: boolean, error?: string }}
 */
export function createJunction(target, link) {
  try {
    // 确保 link 的父目录存在
    const linkParent = path.dirname(link)
    if (!fs.existsSync(linkParent)) {
      fs.mkdirSync(linkParent, { recursive: true })
    }
    // 已存在则跳过
    if (fs.existsSync(link)) return { ok: true }
    fs.symlinkSync(target, link, 'junction')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 检测路径是否为 junction
 * 使用 fs.lstatSync 检查，junction 的 mode 包含符号链接标志
 * @param {string} dirPath - 要检查的路径
 * @returns {boolean}
 */
export function isJunction(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return false
    const stat = fs.lstatSync(dirPath)
    // Windows junction: lstat 返回 symbolicLink 但 isSymbolicLink() 为 true
    return stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 验证 junction 是否有效（指向的目标目录存在）
 * @param {string} dirPath - junction 路径
 * @returns {{ valid: boolean, target?: string, error?: string }}
 */
export function verifyJunction(dirPath) {
  try {
    if (!isJunction(dirPath)) {
      return { valid: false, error: '不是 junction' }
    }
    const target = fs.readlinkSync(dirPath)
    if (!fs.existsSync(target)) {
      return { valid: false, target, error: 'junction 目标不存在' }
    }
    return { valid: true, target }
  } catch (e) {
    return { valid: false, error: e.message }
  }
}

/**
 * 删除 junction（仅删除链接本身，不影响目标目录）
 * @param {string} dirPath - junction 路径
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeJunction(dirPath) {
  try {
    if (!isJunction(dirPath)) {
      return { ok: false, error: '不是 junction，无法删除' }
    }
    fs.rmSync(dirPath, { recursive: false })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 确保 junction 存在且有效
 * 不存在则创建；无效则删除后重建
 * @param {string} target - 链接目标
 * @param {string} link - 链接路径
 * @returns {{ ok: boolean, created: boolean, error?: string }}
 */
export function ensureJunction(target, link) {
  // 不存在 → 创建
  if (!fs.existsSync(link)) {
    return { ...createJunction(target, link), created: true }
  }
  // 存在且是有效 junction → 跳过
  const verifyResult = verifyJunction(link)
  if (verifyResult.valid) {
    return { ok: true, created: false }
  }
  // 存在但无效 → 删除后重建
  try {
    if (isJunction(link)) {
      fs.rmSync(link, { recursive: false })
    } else {
      // 真实目录，不能简单覆盖（由调用方决定如何处理）
      return { ok: false, error: `路径已存在且为真实目录: ${link}` }
    }
    return { ...createJunction(target, link), created: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 创建角色级别的 junction
 * 将 profile 聚合目录下的角色子目录 junction 到对应仓库的角色目录
 * @param {string} charName - 角色名
 * @param {string} type - 'normal' | 'super'
 * @param {string} repoDataDir - 仓库的 dataDir（如 .../miao-plugin-ProfileImg）
 * @param {string} profileDir - profile 聚合目录
 * @returns {{ ok: boolean, error?: string }}
 */
export function createCharJunction(charName, type, repoDataDir, profileDir) {
  const target = path.join(repoDataDir, `${type}-character`, charName)
  const link = path.join(profileDir, `${type}-character`, charName)

  // 确保目标目录存在
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }

  return ensureJunction(target, link)
}

/**
 * 按 map.json 路由创建角色级 junction（常用便捷封装）
 * @param {string} charName - 角色名
 * @param {'normal'|'super'} type - 'normal' | 'super'
 * @returns {{ ok: boolean, error?: string }}
 */
export function ensureCharJunction(charName, type) {
  const repoId = getRepoForChar(charName)
  const repoDir = getRepoDir(repoId)
  return createCharJunction(charName, type, repoDir, PROFILE_DIR)
}

/**
 * 删除角色级别的 junction 和对应的空目录
 * @param {string} charName - 角色名
 * @param {string} type - 'normal' | 'super'
 * @param {string} profileDir - profile 聚合目录
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeCharJunction(charName, type, profileDir) {
  const link = path.join(profileDir, `${type}-character`, charName)
  if (isJunction(link)) {
    return removeJunction(link)
  }
  return { ok: false, error: '不是 junction' }
}
