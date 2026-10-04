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

// ---- apps 模块必须能被 index.js 的注册逻辑选出插件 class ----
// 曾经踩过：index.js 用 `Object.keys(mod)[0]` 取导出，而 ESM 命名空间对象的 key 按名字排序，
// 模块里多导出一个常量（大写字母在前）就会顶掉 class，注册被静默跳过 → 该命令整条规则不存在
/** 与 index.js 相同的判定：class 的 prototype 属性不可写 */
const isPluginClass = (v) => typeof v === 'function' &&
  Object.getOwnPropertyDescriptor(v, 'prototype')?.writable === false

for (const f of listJs('apps')) {
  const m = await import(mod(path.posix.join('apps', f)))
  const classes = Object.values(m).filter(isPluginClass)
  const AppClass = classes[0]
  check(`apps/${f} 能选出插件 class`, !!AppClass, Object.keys(m).join(','))
  check(`apps/${f} 选出的 class 继承 plugin`, !!AppClass && Object.getPrototypeOf(AppClass) === globalThis.plugin)
  check(`apps/${f} 只有一个 class 导出（避免注册歧义）`, classes.length === 1, `实际 ${classes.length} 个`)
  const rules = AppClass ? new AppClass().rule : null
  check(`apps/${f} 的 class 带非空 rule`, Array.isArray(rules) && rules.length > 0,
    `${Array.isArray(rules) ? rules.length : typeof rules} 条`)
}

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
check('预览不再改写消息交给 miao（改为本插件内渲染）',
  !/e\.msg\s*=/.test(previewSrc) && !/e\.original_msg\s*=/.test(previewSrc) && !/return false/.test(previewSrc))
check('预览先自行校验序号（避免 miao 取不到图时随机回退）', /findImageByN\(/.test(previewSrc))
check('预览渲染委托 modules/preview',
  /renderPanelPreview/.test(previewSrc) && /modules\/preview\/index\.js/.test(previewSrc))
check('预览渲染异常有兜底提示', /预览渲染失败/.test(previewSrc))

const previewMiaoSrc = fs.readFileSync(path.join(pluginRoot, 'modules/preview/miao.js'), 'utf8')
check('预览用相对路径 import miao（#miao 别名对别的插件不可用）',
  /import\('\.\.\/\.\.\/\.\.\/miao-plugin\//.test(previewMiaoSrc) && !/from '#miao/.test(previewMiaoSrc) && !/import\('#miao/.test(previewMiaoSrc))
const previewVirtualSrc = fs.readFileSync(path.join(pluginRoot, 'modules/preview/virtual.js'), 'utf8')
check('预览不落账号数据（不用 miao 的 Player / ProfileChange）',
  !/ProfileChange/.test(previewMiaoSrc + previewVirtualSrc) && /new miao\.Avatar/.test(previewVirtualSrc))
check('预览复用 miao 面板模板渲染',
  /character\/profile-detail/.test(fs.readFileSync(path.join(pluginRoot, 'modules/preview/index.js'), 'utf8')))

// ---- index.js 的 app 注册写法（本次事故的核心：注册被静默跳过）----
const indexSrc = fs.readFileSync(path.join(pluginRoot, 'index.js'), 'utf8')
check('index.js 不再用 Object.keys(mod)[0] 取插件类',
  !/Object\.keys\(ret\[i\]\.value\)\[0\]/.test(indexSrc))
check('index.js 的 import 与命名遍历同源（appFiles 过滤一次）',
  /appFiles\.map\(file => import/.test(indexSrc) && /for \(let i = 0; i < appFiles\.length/.test(indexSrc))
check('index.js 逐条记录 app 注册结果（便于发现漏注册）', /载入: \$\{name\}/.test(indexSrc))
check('index.js 图库源初始化不阻塞 apps 注册',
  /initGallerySources\(\)\.catch/.test(indexSrc) && !/await initGallerySources\(\)/.test(indexSrc))

finish()
