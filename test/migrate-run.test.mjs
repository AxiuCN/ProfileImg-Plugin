/**
 * 旧布局迁移实跑（沙箱）：junction 聚合 → 多图库源
 *
 * 本套件真的执行 `migrateToMultiSrc()`（删 junction、搬 default、清理副本、注册源）。
 * 生产代码的路径常量全部基于 `process.cwd()`，因此把插件源码复制到
 * `test/.test-tmp/migrate-run/plugins/ProfileImg-Plugin` 并 chdir 过去，
 * 就能在完全隔离的沙箱里跑真实迁移，**不触碰真实图库与 miao 配置**。
 *
 * 重点覆盖：
 * - 第三方副本 `.bak` 屏蔽状态迁移到第三方源（含一层分组：真正位置在分组子源里）
 * - 第三方图库名含 `_` 时按最长匹配认出来源（旧编码 `_第三方图库_<名>_`）
 * - 源内找不到对应文件时必须告警，不能静默丢弃屏蔽状态
 * - 迁移后 miao profileImgSrc 写入各分组子源
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginRoot, ensureTmpDir, checker, installFrameworkStubs, skip } from './_helper.mjs'

installFrameworkStubs()

const sandbox = path.join(ensureTmpDir(), 'migrate-run')
fs.rmSync(sandbox, { recursive: true, force: true })
const fakePlugin = path.join(sandbox, 'plugins/ProfileImg-Plugin')

// ---- 1. 复制源码到沙箱（只复制代码与模板，不带运行时配置 / 图库）----
fs.mkdirSync(sandbox, { recursive: true })
process.chdir(sandbox)
for (const dir of ['model', 'components', 'modules', 'defSet']) {
  fs.cpSync(path.join(pluginRoot, dir), path.join(fakePlugin, dir), { recursive: true })
}
fs.mkdirSync(path.join(fakePlugin, 'config'), { recursive: true })
fs.copyFileSync(path.join(pluginRoot, 'config/config.yaml.example'), path.join(fakePlugin, 'config/config.yaml.example'))
fs.copyFileSync(path.join(pluginRoot, 'package.json'), path.join(fakePlugin, 'package.json'))

// ---- 2. 搭旧布局（junction 聚合 + 复制聚合）----
const GALLERY = path.join(fakePlugin, 'resources/gallery')
const aggDir = path.join(GALLERY, 'profile')                       // 旧聚合目录
const legacyDefault = path.join(GALLERY, 'ProfileImg/default')     // 旧 default 图库
const mainRepo = path.join(GALLERY, 'ProfileImg/miao-plugin-ProfileImg')
const miaoRes = path.join(sandbox, 'plugins/miao-plugin/resources')
const miaoCfg = path.join(sandbox, 'plugins/miao-plugin/config')

/** 写文件（自动建目录） */
function put (file, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

// default 图库内容
put(path.join(legacyDefault, 'normal-character/琴/琴_1_张三_米游社.webp'))
// 主仓库：一张正图 + 三张第三方副本（其中两张 .bak = 曾被屏蔽）
put(path.join(mainRepo, 'normal-character/琴/琴_1_张三_米游社.webp'))
put(path.join(mainRepo, 'normal-character/琴/琴_1001_第三方图库_MBT_gs原图.webp.bak'))
put(path.join(mainRepo, 'normal-character/琴/琴_1002_第三方图库_米游社_原图_fan.webp.bak'))
put(path.join(mainRepo, 'normal-character/琴/琴_1003_第三方图库_幽灵图库_丢失.webp.bak'))
// 旧聚合目录结构（角色级 junction 指向主仓库）
fs.mkdirSync(path.join(aggDir, 'normal-character'), { recursive: true })

// 第三方源：一层分组 / 平铺（名称含 `_`）/ 平铺但缺文件
const tpRoot = path.join(sandbox, 'thirdparty')
const tpMbt = path.join(tpRoot, 'MBT')
put(path.join(tpMbt, 'gs-character/琴/gs原图.webp'))
put(path.join(tpMbt, 'gs-character/胡桃/胡.webp'))
put(path.join(tpMbt, 'sr-character/三月七/b.png'))
const tpUnder = path.join(tpRoot, '米游社_原图')
put(path.join(tpUnder, '琴/fan.webp'))
const tpGhost = path.join(tpRoot, '幽灵图库')
put(path.join(tpGhost, '琴/其他.webp'))

// miao 配置：profile_default.js 含 profileImgSrc（能力门槛）
put(path.join(miaoCfg, 'profile_default.js'), "export const profileImgSrc = ['profile']\n")

// gallery_config.yaml（第三方登记，dir 为绝对路径）
put(path.join(fakePlugin, 'config/gallery_config.yaml'), [
  'thirdParty:',
  '  - name: MBT',
  `    dir: ${tpMbt.split(path.sep).join('/')}`,
  `    remoteUrl: ''`,
  '    enabled: true',
  '  - name: 米游社_原图',
  `    dir: ${tpUnder.split(path.sep).join('/')}`,
  `    remoteUrl: ''`,
  '    enabled: true',
  '  - name: 幽灵图库',
  `    dir: ${tpGhost.split(path.sep).join('/')}`,
  `    remoteUrl: ''`,
  '    enabled: true',
  ''
].join('\n'))
put(path.join(GALLERY, 'map.json'), JSON.stringify({ version: 1, mapping: { 琴: 0 } }, null, 2))

// junction：miao/resources/profile → 聚合目录；聚合目录内角色级 junction → 主仓库
let canJunction = true
try {
  fs.mkdirSync(miaoRes, { recursive: true })
  fs.symlinkSync(aggDir, path.join(miaoRes, 'profile'), 'junction')
  fs.symlinkSync(path.join(mainRepo, 'normal-character/琴'), path.join(aggDir, 'normal-character/琴'), 'junction')
} catch (e) {
  canJunction = false
}
if (!canJunction) {
  process.chdir(pluginRoot)
  fs.rmSync(sandbox, { recursive: true, force: true })
  skip('当前平台 / 权限无法创建 junction')
}

// ---- 3. 跑真实迁移 ----
const { getLayoutState, migrateToMultiSrc } = await import(pathToFileURL(path.join(fakePlugin, 'model/migrateMultiSrc.js')).href)
const { readProfileImgSrc } = await import(pathToFileURL(path.join(fakePlugin, 'model/profileSrc.js')).href)

const { check, finish } = checker()
check('迁移前状态为 legacy', getLayoutState() === 'legacy', getLayoutState())

const report = migrateToMultiSrc()
const detail = JSON.stringify({ err: report.error, steps: report.steps, warnings: report.warnings })

check('迁移成功', report.ok === true && !report.already, detail)
check('第三方屏蔽状态恢复 2 张（含名称含 _ 的图库）', report.thirdBlockedKept === 2, String(report.thirdBlockedKept))
check('源内缺失文件的屏蔽未恢复并计数', report.thirdBlockedMissed === 1, String(report.thirdBlockedMissed))
check('未恢复的图库出现在告警里',
  report.warnings.some(w => w.includes('幽灵图库') && w.includes('丢失.webp')),
  JSON.stringify(report.warnings))

// 一层分组：真正位置必须落到分组子源，而不是仓库根
check('分组子源内的原图被改为 .bak',
  fs.existsSync(path.join(tpMbt, 'gs-character/琴/gs原图.webp.bak')))
check('分组子源内原文件已不可见', !fs.existsSync(path.join(tpMbt, 'gs-character/琴/gs原图.webp')))
check('未被屏蔽的分组子源文件保持原样', fs.existsSync(path.join(tpMbt, 'sr-character/三月七/b.png')))
check('名称含 _ 的平铺源内文件被改为 .bak',
  fs.existsSync(path.join(tpUnder, '琴/fan.webp.bak')))
check('主仓库中的第三方副本已清理',
  fs.readdirSync(path.join(mainRepo, 'normal-character/琴')).every(f => !f.includes('_第三方图库_')),
  fs.readdirSync(path.join(mainRepo, 'normal-character/琴')).join(','))

// 默认图库：junction 移除后搬迁内容，并按 default 段位重命名（原名进「」备注段）
check('resources/profile 不再是 junction（已搬迁为真实目录）',
  !fs.lstatSync(path.join(miaoRes, 'profile')).isSymbolicLink())
const defaultRoleDir = path.join(miaoRes, 'profile/normal-character/琴')
check('default 内容搬迁到真实默认图库并规范为 default 段位',
  fs.existsSync(defaultRoleDir) && fs.readdirSync(defaultRoleDir).some(f => f.startsWith('琴_10001_')),
  fs.existsSync(defaultRoleDir) ? fs.readdirSync(defaultRoleDir).join(',') : '目录不存在')

// 源列表：分组子源各自注册
const src = readProfileImgSrc()
check('miao profileImgSrc 写入成功', src.ok && src.hasDecl, JSON.stringify(src))
check('分组子源分别注册为源',
  src.list.some(v => v.endsWith('gs-character')) && src.list.some(v => v.endsWith('sr-character')),
  JSON.stringify(src.list))
// 源内唯一可见图片被屏蔽后，该源不再可直读（不注册）——被屏蔽的图本来就读不到，不影响屏蔽效果
check('源内唯一图片被屏蔽后该源不再注册，且计入 skipped',
  !src.list.some(v => v.includes('米游社_原图')) && report.srcSkipped.some(s => s.label === '米游社_原图'),
  JSON.stringify(report.srcSkipped.map(s => s.label)))

process.chdir(pluginRoot)
fs.rmSync(sandbox, { recursive: true, force: true })
finish()
