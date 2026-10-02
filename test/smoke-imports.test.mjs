/**
 * 冒烟：全部 apps / model / modules / components 模块可加载、导出面齐全
 * 不依赖图鉴数据与网络，是改造期的「import 断裂」守卫
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, pluginRoot, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { check, finish } = checker()

/** 列出目录下的 .js 文件 */
function listJs (relDir) {
  const dir = path.join(pluginRoot, relDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
}

/**
 * 逐个 import 目录下所有模块
 * @param {string} relDir - 相对插件根目录
 * @param {string} label
 */
async function importAll (relDir, label) {
  const files = listJs(relDir)
  check(`${label}：目录非空`, files.length > 0, `实际 ${files.length} 个`)
  for (const f of files) {
    try {
      const m = await import(mod(path.posix.join(relDir, f)))
      check(`${label}/${f} 可加载且导出非空`, Object.keys(m).length > 0)
    } catch (e) {
      check(`${label}/${f} 可加载`, false, e.message)
    }
  }
}

await importAll('apps', 'apps')
await importAll('model', 'model')
await importAll('modules', 'modules')
await importAll('components', 'components')

// 关键契约（导出面细节由各主题套件覆盖，这里只留跨模块的硬约定）
const profileSrc = await import(mod('model/profileSrc.js'))
check('profileSrc 暴露源列表同步入口', typeof profileSrc.syncProfileImgSrc === 'function' && typeof profileSrc.buildSrcList === 'function')

const gcfg = await import(mod('model/galleryConfig.js'))
const gconst = await import(mod('components/constants.js'))
check('getDefaultDir 指向默认图库（miao resources/profile）', gcfg.getDefaultDir() === gconst.MIAO_PROFILE_LINK, `实际 ${gcfg.getDefaultDir()}`)
check('LEGACY_DEFAULT_DIR 指向旧 default 图库源', gconst.LEGACY_DEFAULT_DIR.endsWith(path.join('ProfileImg', 'default')))

// ---- 仓库配置不得再出现退役字段（仓库级 cron / autoRestart 已废除）----
const repo0 = gconst.getRepoConfig(0)
check('仓库配置不含退役字段 cron / autoRestart', !('cron' in repo0) && !('autoRestart' in repo0), JSON.stringify(repo0))

// ---- 重启提示统一走 components/notify.js（且不含具体重启方式）----
const notify = await import(mod('components/notify.js'))
const hint = notify.restartHint()
check('restartHint 提示重启 Yunzai', hint.includes('重启 Yunzai'))
check('restartHint 不含具体重启方式', !/pm2|node \.|systemctl|service |bat|脚本/.test(hint), hint.trim())
check('四个命令模块统一复用 restartHint()',
  ['download.js', 'update.js', 'initGallery.js', 'migrateGallery.js']
    .every(f => fs.readFileSync(path.join(pluginRoot, 'apps', f), 'utf8').includes('restartHint')))

finish()
