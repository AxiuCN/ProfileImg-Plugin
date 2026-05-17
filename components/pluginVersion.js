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
let yunzaiVersion = 'TRSS-Yunzai'
try {
  if (fs.existsSync(yunzaiPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(yunzaiPkgPath, 'utf8'))
    yunzaiVersion = pkg.version || 'TRSS-Yunzai'
  }
} catch (e) { /* 忽略 */ }

const isV3 = yunzaiVersion[0] * 1 > 2

export { currentVersion, yunzaiVersion, isV3 }