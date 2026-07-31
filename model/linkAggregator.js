import fs from 'node:fs'
import path from 'node:path'
import { PROFILE_DIR } from '../components/constants.js'
import { isJunction } from './junction.js'

/**
 * 聚合层硬链接管理
 *
 * 架构：gallery/profile/{normal,super}-character/角色/ 是真实目录，
 * 目录内每个文件是指向各来源仓库源文件的 hard link。
 *
 * miao-plugin 通过 junction 读到 gallery/profile/，再读到聚合目录内的 hard link，
 * 从而看到所有仓库的面板图（同一角色可横跨多个仓库）。
 *
 * 屏蔽（.bak）：将聚合链接改名为 xxx.webp.bak → miao-plugin 正则不匹配 → 不可见。
 */

/** 聚合角色目录路径 */
export function getAggRoleDir(type, roleName) {
  return path.join(PROFILE_DIR, `${type}-character`, roleName)
}

/**
 * 确保聚合类型目录为真实目录（非 junction）
 * 升级兼容：旧版本该目录是角色级 junction，需先删除 junction 再建真实目录
 * @param {'normal'|'super'} type
 * @returns {string}
 */
export function ensureRealTypeDir(type) {
  const typeDir = path.join(PROFILE_DIR, `${type}-character`)
  if (isJunction(typeDir)) {
    try { fs.rmSync(typeDir, { recursive: false }) } catch { /* ignore */ }
  }
  if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true })
  return typeDir
}

/**
 * 确保聚合角色目录为真实目录（非 junction）
 * 升级兼容：旧版本该目录是角色级 junction，需先删除 junction 再建真实目录
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 */
function ensureRealRoleDir(type, roleName) {
  const typeDir = ensureRealTypeDir(type)
  const linkDir = path.join(typeDir, roleName)
  if (isJunction(linkDir)) {
    try { fs.rmSync(linkDir, { recursive: false }) } catch { /* ignore */ }
  }
  if (!fs.existsSync(linkDir)) fs.mkdirSync(linkDir, { recursive: true })
  return linkDir
}

/**
 * 创建单张图的聚合硬链接
 * @param {string} sourceFile - 源文件绝对路径
 * @param {string} linkName - 聚合目录内的链接文件名
 * @param {'normal'|'super'} type - 类型
 * @param {string} roleName - 角色名
 * @returns {{ ok: boolean, error?: string }}
 */
export function createPanelLink(sourceFile, linkName, type, roleName) {
  try {
    if (!fs.existsSync(sourceFile)) return { ok: false, error: '源文件不存在' }
    const linkDir = ensureRealRoleDir(type, roleName)
    const linkPath = path.join(linkDir, linkName)
    if (fs.existsSync(linkPath)) return { ok: true } // 已存在，跳过
    fs.linkSync(sourceFile, linkPath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 删除单张图的聚合链接
 * @param {string} linkName - 聚合目录内的链接文件名
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 * @returns {{ ok: boolean, error?: string }}
 */
export function removePanelLink(linkName, type, roleName) {
  try {
    const linkPath = path.join(getAggRoleDir(type, roleName), linkName)
    if (!fs.existsSync(linkPath)) return { ok: true }
    fs.unlinkSync(linkPath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 屏蔽：聚合链接改名 xxx.ext → xxx.ext.bak（源文件不动，miao-plugin 不可见）
 * @param {string} linkName - 当前链接名
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 * @returns {{ ok: boolean, error?: string }}
 */
export function hidePanelLink(linkName, type, roleName) {
  try {
    const linkDir = ensureRealRoleDir(type, roleName)
    const src = path.join(linkDir, linkName)
    if (!fs.existsSync(src)) return { ok: false, error: '链接不存在' }
    fs.renameSync(src, src + '.bak')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 启用：聚合链接改名 xxx.ext.bak → xxx.ext
 * @param {string} linkName - 当前链接名（含 .bak）
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 * @returns {{ ok: boolean, error?: string }}
 */
export function showPanelLink(linkName, type, roleName) {
  try {
    if (!linkName.endsWith('.bak')) return { ok: false, error: '非屏蔽链接' }
    const linkDir = ensureRealRoleDir(type, roleName)
    const src = path.join(linkDir, linkName)
    if (!fs.existsSync(src)) return { ok: false, error: '链接不存在' }
    fs.renameSync(src, src.slice(0, -4))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 清空聚合角色目录（删除所有文件，用于重建）
 * 若目录为 junction（旧版本遗留），删除 junction 后重建真实目录
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 */
export function clearAggRoleDir(type, roleName) {
  const linkDir = ensureRealRoleDir(type, roleName)
  for (const f of fs.readdirSync(linkDir)) {
    try { fs.unlinkSync(path.join(linkDir, f)) } catch { /* ignore */ }
  }
}

/**
 * 重建单个仓库的角色聚合链接
 * 先清空聚合角色目录，再遍历仓库角色目录建链接
 * @param {object} repo - 仓库对象（buildRepos 产物）
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type
 * @returns {{ ok: boolean, count: number, error?: string }}
 */
export function rebuildLinks(repo, roleName, type) {
  try {
    const sourceDir = path.join(repo.dir, `${type}-character`, roleName)
    if (!fs.existsSync(sourceDir)) return { ok: true, count: 0 }

    clearAggRoleDir(type, roleName)

    const files = fs.readdirSync(sourceDir)
      .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
    let count = 0
    for (const f of files) {
      const r = createPanelLink(path.join(sourceDir, f), f, type, roleName)
      if (r.ok) count++
    }
    return { ok: true, count }
  } catch (e) {
    return { ok: false, count: 0, error: e.message }
  }
}

/**
 * 同步单个仓库全部角色的聚合链接（下载/更新后调用）
 * 遍历仓库所有角色目录，为每个角色重建链接（增量，只处理当前仓库）
 * @param {object} repo - 仓库对象
 * @returns {{ ok: boolean, count: number, error?: string }}
 */
export function syncRepoLinks(repo) {
  try {
    let total = 0
    for (const type of ['normal', 'super']) {
      const typeDir = path.join(repo.dir, `${type}-character`)
      if (!fs.existsSync(typeDir)) continue
      const chars = fs.readdirSync(typeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const c of chars) {
        const r = rebuildLinks(repo, c.name, type)
        if (r.ok) total += r.count
      }
    }
    return { ok: true, count: total }
  } catch (e) {
    return { ok: false, count: 0, error: e.message }
  }
}
