import fs from 'node:fs'
import path from 'node:path'
import { PROFILE_DIR } from '../components/constants.js'
import { isJunction } from './junction.js'

/**
 * 聚合层符号链接管理
 *
 * 架构：gallery/profile/{normal,super}-character/角色/ 是真实目录，
 * 目录内每个文件是指向各来源仓库源文件的 Windows 文件符号链接（mklink）。
 *
 * miao-plugin 通过 junction 读到 gallery/profile/，再读到聚合目录内的符号链接，
 * 从而看到所有仓库的面板图（同一角色可横跨多个仓库）。
 *
 * 符号链接指向"路径"而非 inode：git 更新源文件（临时文件+rename）后自动跟随新内容，
 * 不会像硬链接那样因 inode 替换而残留为孤儿复制。
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
 * 创建单张图的聚合符号链接（mklink）
 * 存量兼容：聚合目录中已存在的旧硬链接 / git 更新后残留的孤立复制会被删除重建
 * @param {string} sourceFile - 源文件绝对路径
 * @param {string} linkName - 聚合目录内的链接文件名
 * @param {'normal'|'super'} type - 类型
 * @param {string} roleName - 角色名
 * @returns {{ ok: boolean, error?: string }}
 */
export function createPanelLink(sourceFile, linkName, type, roleName) {
  try {
    const sourceAbs = path.resolve(sourceFile)
    if (!fs.existsSync(sourceAbs)) return { ok: false, error: '源文件不存在' }
    const linkDir = ensureRealRoleDir(type, roleName)
    const linkPath = path.join(linkDir, linkName)

    // lstatSync 不跟随链接，能识别悬空符号链接（existsSync 对悬空链接返回 false）
    const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
    if (existing) {
      // 已是符号链接 → 保持（git 更新源文件后自动指向新内容，天然自愈）
      if (existing.isSymbolicLink()) return { ok: true }
      // 旧硬链接 / git pull 残留的孤立复制 → 删除后重建为符号链接
      fs.unlinkSync(linkPath)
    }

    fs.symlinkSync(sourceAbs, linkPath, 'file')
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
    // lstatSync 判断（符号链接可能悬空，existsSync 会误判为不存在而漏删）
    if (!fs.lstatSync(linkPath, { throwIfNoEntry: false })) return { ok: true }
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
    // lstatSync 判断（悬空符号链接也能被改名屏蔽）
    if (!fs.lstatSync(src, { throwIfNoEntry: false })) return { ok: false, error: '链接不存在' }
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
    if (!fs.lstatSync(src, { throwIfNoEntry: false })) return { ok: false, error: '链接不存在' }
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
 * 修复多仓库误删：不再清空整个聚合角色目录，只处理属于当前仓库的条目
 * ① 清理指向当前仓库但源已不存在的聚合链接（悬空/失效，含 .bak 屏蔽条目）
 * ② 对当前仓库每个源文件确保链接（createPanelLink 内部自愈存量硬链接/孤立复制）
 * @param {object} repo - 仓库对象（buildRepos 产物）
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type
 * @returns {{ ok: boolean, count: number, error?: string }}
 */
export function rebuildLinks(repo, roleName, type) {
  try {
    const sourceDir = path.join(repo.dir, `${type}-character`, roleName)
    if (!fs.existsSync(sourceDir)) return { ok: true, count: 0 }

    const linkDir = ensureRealRoleDir(type, roleName)
    const repoRoot = path.resolve(repo.dir).toLowerCase()
    const currentFiles = new Set(
      fs.readdirSync(sourceDir).filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
    )

    // ① 清理当前仓库遗留的失效链接（其他仓库的条目不动）
    for (const f of fs.readdirSync(linkDir)) {
      // .bak 屏蔽条目按原名判断（源仍存在则保留）
      const bareName = f.endsWith('.bak') ? f.slice(0, -4) : f
      if (currentFiles.has(bareName)) continue
      try {
        const linkPath = path.join(linkDir, f)
        const st = fs.lstatSync(linkPath)
        if (!st.isSymbolicLink()) continue // 非符号链接条目不主动删（避免误判其他仓库硬链接）
        const target = path.resolve(fs.readlinkSync(linkPath)).toLowerCase()
        if (!target.startsWith(repoRoot + path.sep)) continue // 属于其他仓库，跳过
        fs.unlinkSync(linkPath)
      } catch { /* lstat/readlink 失败忽略 */ }
    }

    // ② 为当前仓库每个源文件确保链接（已是符号链接则跳过）
    let count = 0
    for (const f of currentFiles) {
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
