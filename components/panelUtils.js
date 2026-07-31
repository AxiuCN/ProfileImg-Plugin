/**
 * 面板图文件名解析与排序工具
 * 统一管理面板图命名规范的解析逻辑
 *
 * 标准命名格式：
 *   含版权：角色名_n_作者_来源[_二改].扩展名
 *   无版权：角色名_n.扩展名（迁移图库生成，n >= 10001）
 */

import fs from 'node:fs'
import path from 'node:path'
import { SEGMENTS, THIRD_PARTY_SLOT } from '../model/repoRegistry.js'

/** 非标准文件在 main/old/default 仓库内的 display n 兜底池（不与真实 n 冲突） */
const NON_STANDARD_POOL = 900000

/**
 * 转义正则特殊字符（用于角色名可能含有的 . ( ) [ ] 等字符）
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 解析单个文件名，返回结构化信息
 * @param {string} filename - 文件名（不含路径）
 * @param {string} roleName - 角色名
 * @returns {{ seq: number, isStandard: boolean, hasCopyright: boolean }}
 */
export function parseFilename(filename, roleName) {
  const esc = escapeRegExp(roleName)

  // 标准含版权：角色名_n_作者_来源[_二改].扩展名
  const withCopyright = new RegExp(`^${esc}_(\\d+)_.+\\.[^.]+$`, 'i')
  let m = filename.match(withCopyright)
  if (m) {
    return { seq: parseInt(m[1], 10), isStandard: true, hasCopyright: true }
  }

  // 标准无版权（迁移文件）：角色名_n.扩展名
  const noCopyright = new RegExp(`^${esc}_(\\d+)\\.[^.]+$`, 'i')
  m = filename.match(noCopyright)
  if (m) {
    return { seq: parseInt(m[1], 10), isStandard: true, hasCopyright: false }
  }

  // 非标准命名
  return { seq: Infinity, isStandard: false, hasCopyright: false }
}

/**
 * 对面板图文件列表排序
 * 标准文件按 seq 升序排列在前，非标准按文件名字母序排列在后
 *（保证同一文件集下非标准文件的 100001+ 临时序号分配稳定）
 *
 * @param {string[]} files - 文件名数组
 * @param {string} roleName - 角色名
 * @returns {{ name: string, parsed: { seq: number, isStandard: boolean, hasCopyright: boolean } }[]}
 */
export function sortPanelFiles(files, roleName) {
  const parsed = files.map(name => ({ name, parsed: parseFilename(name, roleName) }))
  parsed.sort((a, b) => {
    if (a.parsed.isStandard !== b.parsed.isStandard) {
      return a.parsed.isStandard ? -1 : 1
    }
    if (a.parsed.isStandard) {
      return a.parsed.seq - b.parsed.seq
    }
    return a.name.localeCompare(b.name)
  })
  return parsed
}

/**
 * 解析文件名中的版权归属信息
 * @param {string} filename - 文件名
 * @param {string} roleName - 角色名
 * @returns {string|null} 中文版权描述，非标准命名返回 null
 */
export function parseAttribution(filename, roleName) {
  const esc = escapeRegExp(roleName)
  const match = filename.match(new RegExp(`^${esc}_(\\d+)_(.+?)_(.+?)(?:_(.+?))?\\.`, 'i'))
  if (!match) return null
  const author = match[2]
  const source = match[3]
  const mods = match[4]
  return `作者：${author} / 来源：${source}${mods ? ` / 二改：${mods}` : ''}`
}

/* ==========================================================================
   多仓库聚合遍历（display n 分段）
   ========================================================================== */

/**
 * 计算单个仓库内文件的 display n
 * @param {object} repo - 仓库对象
 * @param {Array} sorted - sortPanelFiles 结果
 * @param {Array} thirdPartyRepos - 全部第三方仓库（用于定位 tp 序号）
 * @returns {Array<{ name: string, parsed: object, displayN: number }>}
 */
function assignDisplayN(repo, sorted, thirdPartyRepos) {
  let nonStdIdx = 0
  return sorted.map(item => {
    let displayN
    if (item.parsed.isStandard) {
      displayN = item.parsed.seq
    } else if (repo.type === 'third-party') {
      // 第三方：虚拟 n = base + 仓库序号×slot + 排序位置（从 1 起）
      const tpIdx = thirdPartyRepos.indexOf(repo)
      displayN = SEGMENTS.thirdBase + tpIdx * THIRD_PARTY_SLOT + nonStdIdx + 1
      nonStdIdx++
    } else {
      // main/old/default 的非标准文件：兜底池（不与真实 n 冲突）
      displayN = NON_STANDARD_POOL + nonStdIdx
      nonStdIdx++
    }
    return { name: item.name, parsed: item.parsed, displayN }
  })
}

/**
 * 获取聚合目录下角色的所有源映射
 * 遍历所有仓库中该角色的目录，分配全局 display n
 * @param {string} roleName - 角色名
 * @param {'normal'|'super'} type - 类型
 * @param {Array} repos - 仓库注册表（buildRepos 产物）
 * @returns {Array<{ name: string, repo: object, displayN: number, sourceFile: string, parsed: object }>}
 */
export function getAggregatedFiles(roleName, type, repos) {
  const thirdPartyRepos = repos.filter(r => r.type === 'third-party')
  const result = []

  for (const repo of repos) {
    const roleDir = path.join(repo.dir, `${type}-character`, roleName)
    if (!fs.existsSync(roleDir)) continue

    const imgNames = fs.readdirSync(roleDir)
      .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f) && fs.statSync(path.join(roleDir, f)).isFile())
    if (imgNames.length === 0) continue

    const sorted = sortPanelFiles(imgNames, roleName)
    for (const item of assignDisplayN(repo, sorted, thirdPartyRepos)) {
      result.push({
        name: item.name,
        repo,
        displayN: item.displayN,
        sourceFile: path.join(roleDir, item.name),
        parsed: item.parsed
      })
    }
  }

  // 按 display n 全局排序
  result.sort((a, b) => a.displayN - b.displayN)
  return result
}

/**
 * 按 display n 在聚合层查找
 * @param {string} roleName - 角色名
 * @param {number} n - display n
 * @param {'normal'|'super'} type
 * @param {Array} repos - 仓库注册表
 * @returns {object|null} 匹配的聚合条目，找不到返回 null
 */
export function findByDisplayN(roleName, n, type, repos) {
  const agg = getAggregatedFiles(roleName, type, repos)
  return agg.find(f => f.displayN === n) || null
}

/**
 * display n → 仓库 + 仓库内排序位置的换算（与 miao-plugin 删除一致）
 * @param {number} n - display n
 * @param {Array} repos - 仓库注册表
 * @returns {{ repo: object|null, offset: number, segment: string }}
 */
export function resolveVirtualN(n, repos) {
  if (n >= SEGMENTS.thirdBase) {
    const tpIdx = Math.floor((n - SEGMENTS.thirdBase) / THIRD_PARTY_SLOT)
    const offset = (n - SEGMENTS.thirdBase) % THIRD_PARTY_SLOT - 1 // 转 0 基
    const tpRepos = repos.filter(r => r.type === 'third-party')
    return { repo: tpRepos[tpIdx] || null, offset: offset < 0 ? 0 : offset, segment: 'third-party' }
  }
  if (n >= SEGMENTS.default.start) {
    return { repo: repos.find(r => r.type === 'default') || null, offset: 0, segment: 'default' }
  }
  if (n >= SEGMENTS.old.start) {
    return { repo: repos.find(r => r.type === 'old') || null, offset: 0, segment: 'old' }
  }
  return { repo: repos.find(r => r.type === 'main') || null, offset: 0, segment: 'main' }
}
