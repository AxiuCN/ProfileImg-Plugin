/**
 * 面板图文件名解析与排序工具
 * 统一管理面板图命名规范的解析逻辑
 *
 * 标准命名格式：
 *   含版权：角色名_n_作者_来源[_二改].扩展名
 *   无版权：角色名_n.扩展名
 *   第三方复制：角色名_n_第三方图库_图库名_图原名.扩展名（n 在第三方段位）
 *   default 复制：角色名_n_本地默认图库_默认_图原名.扩展名（n 在 default 段位）
 */

import fs from 'node:fs'
import path from 'node:path'

/* ==========================================================================
   序号段位 — n 编码来源（见计划 §序号段位设计）
   ========================================================================== */

export const SEGMENTS = {
  main:   { start: 1,      end: 9999 },   // 主图库原始文件
  default:{ start: 10001,  end: 99999 },  // default 图库复制文件
  thirdBase: 100000                        // 第三方 tp-i 起始 = thirdBase + i*100000 + 1
}

/** 每个第三方仓库的序号容量 */
export const THIRD_PARTY_SLOT = 100000

/** 非标准文件在列表中的 display n 兜底池（不与任何段位冲突） */
const NON_STANDARD_POOL = 9999999

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

  // 标准含版权：角色名_n_作者_来源[_二改].扩展名（含第三方/default 复制前缀）
  const withCopyright = new RegExp(`^${esc}_(\\d+)_.+\\.[^.]+$`, 'i')
  let m = filename.match(withCopyright)
  if (m) {
    return { seq: parseInt(m[1], 10), isStandard: true, hasCopyright: true }
  }

  // 标准无版权：角色名_n.扩展名
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
   段位工具 — 按 n 判断来源、段位内取下一个可用 n
   ========================================================================== */

/**
 * 按 n 判断其来源段位
 * @param {number} n - 序号
 * @returns {{ source: 'main'|'default'|'third-party'|'unknown', tpIdx?: number }}
 *   third-party 时返回 tpIdx（第几个第三方仓库，0 起）
 */
export function resolveNRange(n) {
  if (n >= SEGMENTS.thirdBase) {
    const tpIdx = Math.floor((n - SEGMENTS.thirdBase) / THIRD_PARTY_SLOT)
    return { source: 'third-party', tpIdx }
  }
  if (n >= SEGMENTS.default.start) return { source: 'default' }
  if (n >= SEGMENTS.main.start) return { source: 'main' }
  return { source: 'unknown' }
}

/**
 * 解析文件所属图库类型标识（用于成员权限校验）
 * 图库类型：'main'（主图库，一体）/ 'default'（default 图库）/ 第三方图库名
 * @param {string} filename - 文件名
 * @param {string} roleName - 角色名
 * @param {number} n - 序号
 * @returns {string|null} 图库类型标识；无法判定返回 null
 */
export function resolveGalleryKey(filename, roleName, n) {
  const { source } = resolveNRange(n)
  if (source === 'main') return 'main'
  if (source === 'default') return 'default'
  if (source === 'third-party') {
    const esc = escapeRegExp(roleName)
    const m = filename.match(new RegExp(`^${esc}_\\d+_第三方图库_([^_]+)_`, 'i'))
    return m ? m[1] : null
  }
  return null
}

/**
 * 在指定段位范围内取下一个可用序号
 * 扫描目录内该角色所有文件（含 .bak 屏蔽文件，避免序号复用）
 * @param {string} dir - 角色目录
 * @param {string} roleName - 角色名
 * @param {number} start - 段位起点（含）
 * @param {number} end - 段位终点（含）
 * @returns {number} 下一个可用序号；段位已满返回 -1
 */
export function getNextSeqInRange(dir, roleName, start, end) {
  const esc = escapeRegExp(roleName)
  // 匹配 角色名_n_... / 角色名_n.扩展名（含 .bak 后缀：屏蔽文件也算占用）
  const pattern = new RegExp(`^${esc}_(\\d+)(?:_|\\.)`, 'i')
  let maxSeq = start - 1
  try {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        const m = file.match(pattern)
        if (m) {
          const seq = parseInt(m[1], 10)
          if (seq >= start && seq <= end && seq > maxSeq) maxSeq = seq
        }
      }
    }
  } catch { /* 忽略读取失败 */ }
  const next = maxSeq + 1
  return next <= end ? next : -1
}

/**
 * 读取角色目录并返回排序后的文件列表
 * 直接读取主仓库角色目录（junction 目标），n 即 display n
 * @param {string} dir - 角色目录绝对路径
 * @param {string} roleName - 角色名
 * @returns {Array<{ name: string, parsed: object, displayN: number, source: string, filePath: string }>}
 */
export function listRoleFiles(dir, roleName) {
  if (!fs.existsSync(dir)) return []
  let imgNames = []
  try {
    imgNames = fs.readdirSync(dir).filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))
  } catch { return [] }

  const sorted = sortPanelFiles(imgNames, roleName)
  let nonStdIdx = 0
  return sorted.map(item => {
    let displayN
    let source = 'unknown'
    if (item.parsed.isStandard) {
      displayN = item.parsed.seq
      source = resolveNRange(displayN).source
    } else {
      // 非标准文件：兜底 display n（命令不可按此 n 操作）
      displayN = NON_STANDARD_POOL + nonStdIdx
      nonStdIdx++
    }
    return {
      name: item.name,
      parsed: item.parsed,
      displayN,
      source,
      filePath: path.join(dir, item.name)
    }
  })
}
