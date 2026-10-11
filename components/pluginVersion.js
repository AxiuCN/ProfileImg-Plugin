import fs from 'node:fs'
import path from 'node:path'

const pkgPath = path.join(process.cwd(), 'plugins/ProfileImg-Plugin/package.json')
let currentVersion = '1.0.0'
try {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    currentVersion = pkg.version || '1.0.0'
  }
} catch (e) {
  logger.error('[ProfileImg-Plugin] 读取版本号失败:', e)
}

const yunzaiPkgPath = path.join(process.cwd(), 'package.json')

/**
 * 框架显示名与版本号
 * 按 bot 根 package.json 的包名判定：TRSS-Yunzai 为 `trss-yunzai`，原版为 `yunzai-bot`
 */
let yunzaiName = 'Yunzai-Bot'
let yunzaiVersion = ''
try {
  if (fs.existsSync(yunzaiPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(yunzaiPkgPath, 'utf8'))
    yunzaiName = /trss/i.test(pkg.name || '') ? 'TRSS-Yunzai' : 'Yunzai-Bot'
    yunzaiVersion = pkg.version || ''
  }
} catch (e) { /* 忽略 */ }

const isV3 = yunzaiVersion[0] * 1 > 2

/**
 * 出图页脚版权行（模板用 `{{@sys.copyright}}` 注入）
 * 名称与版本号之间必须留空格，否则会渲染成 `Yunzai-Bot3.1.3` 这种贴在一起的形态
 * @returns {string}
 */
export function buildCopyright() {
  const framework = yunzaiVersion
    ? `${yunzaiName} <span class="version">${yunzaiVersion}</span>`
    : yunzaiName
  return `Created By ${framework} & ProfileImg-Plugin <span class="version">${currentVersion}</span>`
}

export { currentVersion, yunzaiName, yunzaiVersion, isV3 }