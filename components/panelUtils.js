/**
 * 面板图文件名解析与排序工具
 * 统一管理面板图命名规范的解析逻辑
 *
 * 标准命名格式：
 *   含版权：角色名_n_作者_来源[_二改].扩展名
 *   无版权：角色名_n.扩展名（迁移图库生成，n >= 10001）
 */

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
