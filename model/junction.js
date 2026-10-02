import fs from 'node:fs'

/**
 * Junction（目录符号链接）检测与移除
 *
 * 仅保留迁移所需的最小能力：识别 junction、移除 junction（只删链接本身）。
 * 旧布局的创建类 API（createJunction / ensureJunction / 角色级 junction）已随多图库源布局退役。
 */

/**
 * 检测路径是否为 junction
 * 使用 fs.lstatSync 检查，junction 的 mode 包含符号链接标志
 * @param {string} dirPath - 要检查的路径
 * @returns {boolean}
 */
export function isJunction(dirPath) {
  try {
    // 用 lstatSync 直接检测 reparse point，不依赖目标是否可达
    // （broken junction 的 existsSync 为 false，但仍应识别为 junction 以便清理）
    const stat = fs.lstatSync(dirPath)
    // Windows junction: lstat 返回 symbolicLink 但 isSymbolicLink() 为 true
    return stat.isSymbolicLink()
  } catch {
    return false
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
