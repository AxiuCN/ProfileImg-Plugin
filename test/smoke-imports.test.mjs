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

const syncedChanged = { ok: true, changed: true, list: ['profile', 'E:/fan'], skipped: [] }
const syncedSame = { ok: true, changed: false, list: ['profile'], skipped: [] }
const report = notify.buildSyncReport(syncedChanged)
check('buildSyncReport 报告源数量并在有变更时带重启提示',
  report.includes('2 个') && report.includes('请重启 Yunzai'))
check('buildSyncReport 未变更时不提示重启', !notify.buildSyncReport(syncedSame).includes('请重启'))
check('buildSyncReport 失败时给出原因', notify.buildSyncReport({ ok: false, error: '写入失败' }).includes('写入失败'))
check('buildSyncReport 报告未注册图库',
  notify.buildSyncReport({ ok: true, changed: false, list: ['profile'], skipped: [{ label: 'X', reason: '目录不存在' }] })
    .includes('X：目录不存在'))
check('四个命令模块复用统一文案来源',
  ['download.js', 'update.js', 'initGallery.js', 'migrateGallery.js']
    .every(f => /restartHint|buildSyncReport/.test(fs.readFileSync(path.join(pluginRoot, 'apps', f), 'utf8'))))

// ---- Git 调用一律 argv（execFile），不得再拼 shell 命令字符串 ----
const gitSrc = fs.readFileSync(path.join(pluginRoot, 'model/git.js'), 'utf8')
check('git.js 不再用 exec/execSync 拼命令', !/\bexec(Sync)?\s*\(/.test(gitSrc.replace(/execFile(Sync)?/g, '')))
check('git.js 使用 execFile/execFileSync', gitSrc.includes('execFileSync(') && gitSrc.includes('execFile('))
check('git.js 每个调用点都传数组参数',
  (gitSrc.match(/gitExec(Async)?\(\s*[^,]+,\s*\[/g) || []).length === (gitSrc.match(/gitExec(Async)?\(/g) || []).length - 2,
  `数组 ${(gitSrc.match(/gitExec(Async)?\(\s*[^,]+,\s*\[/g) || []).length} / 调用 ${(gitSrc.match(/gitExec(Async)?\(/g) || []).length - 2}`)

// ---- 第三方图库三类操作共用同一把锁（此前分别是 tp-dl-* / tp-del-* / tp-<idx>）----
const dlSrc = fs.readFileSync(path.join(pluginRoot, 'apps/download.js'), 'utf8')
const upSrc = fs.readFileSync(path.join(pluginRoot, 'apps/update.js'), 'utf8')
check('第三方锁 id 统一走 thirdPartyLockId', (dlSrc.match(/thirdPartyLockId\(/g) || []).length === 2 &&
  (upSrc.match(/thirdPartyLockId\(/g) || []).length === 2)
check('不存在旧的三方各自为政的锁 id', !/tp-dl-|tp-del-/.test(dlSrc) && !/acquireLock\(`tp-\$\{/.test(upSrc))

// ---- 更新失败必须如实上报（fastForwardPullAsync 不抛错，只返回 ok:false）----
check('自动更新链逐处判断 result.ok', (upSrc.match(/if \(!result\.ok\)/g) || []).length >= 2)
check('失败时不记录仓库版本', /if \(result\.ok\) this\._recordRepoVersion/.test(upSrc))
check('屏蔽图库 pull 的返回值被检查', /const r = await gitExecAsync\(BLOCKED_REPO_DIR/.test(upSrc) && /if \(r\.ok\)/.test(upSrc))

// ---- 主图库下载也要探测默认分支（不再硬编码 main）----
check('主图库安装使用探测到的分支',
  (dlSrc.match(/detectRemoteBranchAsync\(/g) || []).length >= 4, String((dlSrc.match(/detectRemoteBranchAsync\(/g) || []).length))

// ---- 上传序号：取号与写盘之间不得有 await（否则并发上传会撞号）----
const upUpload = fs.readFileSync(path.join(pluginRoot, 'apps/upload.js'), 'utf8')
const numAt = upUpload.indexOf('this._getNextSeq(')
const writeAt = upUpload.indexOf('fs.writeFileSync(filePath')
check('上传取号在写盘之前', numAt > 0 && writeAt > numAt)
check('取号与写盘之间没有 await（压缩已前置）',
  !/await/.test(upUpload.slice(numAt, writeAt)), upUpload.slice(numAt, writeAt).match(/await[^\n]*/)?.[0] || '')

// ---- 文件操作与 Git 更新共用源级锁 ----
for (const f of ['upload.js', 'delProfileImg.js', 'moveBlockImg.js', 'renameProfileImg.js']) {
  const src = fs.readFileSync(path.join(pluginRoot, 'apps', f), 'utf8')
  check(`${f} 改动主仓库文件前取锁`, /mainRepoLockIdForPath\(/.test(src) && /acquireLocks\(/.test(src))
}

// ---- 替换 / 预览命令 ----
check('上传模块含 3 条规则（含版权添加 / 无版权添加 / 替换）',
  (upUpload.match(/fnc: '/g) || []).length === 3, String((upUpload.match(/fnc: '/g) || []).length))
check('替换与上传共用格式规整（扩展名与字节一致）',
  /_toTargetFormat\(/.test(upUpload) && /convertToFormat\(/.test(upUpload))

const previewSrc = fs.readFileSync(path.join(pluginRoot, 'apps/previewProfileImg.js'), 'utf8')
check('预览命令已注册', /fnc: 'preview'/.test(previewSrc))
check('预览不 import miao 内部模块（自绘，不依赖 miao 面板数据）', !/miao-plugin/.test(previewSrc))
check('预览走本插件渲染管线 render(\'preview\', \'index\')', /render\('preview', 'index'/.test(previewSrc))
check('预览模板存在', fs.existsSync(path.join(pluginRoot, 'resources/preview/index.html')))

finish()
