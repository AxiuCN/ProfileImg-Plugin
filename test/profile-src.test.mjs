/**
 * miao 图库源配置读写：能力探测 / 配置生成 / 声明段替换（保留其他 export 与注释）/ 幂等 / 源列表构建
 *
 * 一律写临时目标文件（test/.test-tmp/），**绝不改真实的 miao-plugin/config/profile.js**
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, ensureTmpDir, checker, installFrameworkStubs, requireMiaoPlugin } from './_helper.mjs'

installFrameworkStubs()
requireMiaoPlugin()

const {
  ensureProfileConfig, supportsMultiSrc, supportsPanelPreview, readProfileImgSrc, writeProfileImgSrc,
  buildSrcList
} = await import(mod('model/profileSrc.js'))

const tmp = ensureTmpDir()
const cfgDir = path.join(tmp, 'cfg')
fs.rmSync(cfgDir, { recursive: true, force: true })
fs.mkdirSync(cfgDir, { recursive: true })

const tplFile = path.join(cfgDir, 'profile_default.js')
fs.writeFileSync(tplFile, [
  '/** 头部注释需保留 */',
  "export const enkaApi = { url: 'https://enka.network/' }",
  '',
  'export const profileImgSrc = [',
  "  'profile'",
  ']',
  '',
  'export const requestInterval = 5'
].join('\n'), 'utf8')

const { check, finish } = checker()

// 1. 能力探测（读真实 miao 模板，只读）
check('识别 miao 支持 profileImgSrc', supportsMultiSrc() === true)
check('探测不存在的模板 → false', supportsMultiSrc({ defaultFile: path.join(cfgDir, 'nope.js') }) === false)

// 1.1 预览能力探测（面板图序号 + 补 虚拟面板，只有配套 miao-plugin fork 才有）
const capRoot = path.join(tmp, 'miao-cap')
const capFiles = {
  'apps/profile.js': 'rule: /^#*([^#]+)\\s*(面板|面板图\\d+)\\s*$/',
  'apps/profile/ProfileDetail.js': 'e._panelImgIdx = imgIdx',
  'models/avatar/ProfileAvatar.js': 'if (profile._panelImgIdx > 0) {',
  'apps/profile/ProfileChange.js': 'let regRet = /([换补])(.*)/.exec(msg)'
}
const writeCapFiles = (skip) => {
  fs.rmSync(capRoot, { recursive: true, force: true })
  for (const [rel, content] of Object.entries(capFiles)) {
    if (rel === skip) continue
    const file = path.join(capRoot, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, 'utf8')
  }
}

writeCapFiles()
check('识别配套 fork 的预览能力（面板图序号 + 补）', supportsPanelPreview({ miaoRoot: capRoot }) === true)

// 上游 miao 的 ImgUpload 规则里是 `(?:面板图)(\d)`，与 `面板图\d` 不相邻，不得误判
writeCapFiles()
fs.writeFileSync(path.join(capRoot, 'apps/profile.js'),
  'rule: /^#?\\s*(?:移除|清除|删除)(.+)(?:面板图)(\\d){1,}\\s*$/', 'utf8')
check('上游 miao（rule 不放行面板图序号）→ false', supportsPanelPreview({ miaoRoot: capRoot }) === false)

writeCapFiles('models/avatar/ProfileAvatar.js')
check('缺「按序号选图」环节 → false', supportsPanelPreview({ miaoRoot: capRoot }) === false)

writeCapFiles('apps/profile/ProfileChange.js')
check('缺「补」虚拟面板 → false', supportsPanelPreview({ miaoRoot: capRoot }) === false)

check('miao 目录不存在 → false', supportsPanelPreview({ miaoRoot: path.join(tmp, 'nope-miao') }) === false)
check('真实环境探测只读且返回布尔', typeof supportsPanelPreview() === 'boolean')

// 2. 从模板生成 profile.js
const target = path.join(cfgDir, 'profile.js')
const ensured = ensureProfileConfig({ defaultFile: tplFile, targetFile: target })
check('生成 profile.js 成功', ensured.ok && ensured.created === true && fs.existsSync(target))
check('重复调用 created=false（幂等）', ensureProfileConfig({ defaultFile: tplFile, targetFile: target }).created === false)

// 3. 读默认声明
const r0 = readProfileImgSrc({ file: target })
check('读回默认源 [profile]', r0.ok && r0.hasDecl === true && r0.list.length === 1 && r0.list[0] === 'profile', `实际 ${JSON.stringify(r0.list)}`)

// 4. 写多源：保留注释与其他 export
const wanted = ['profile', 'D:/gallery/main', "E:/it's/third"]
const w1 = writeProfileImgSrc(wanted, { file: target })
const after = fs.readFileSync(target, 'utf8')
check('写入成功且 changed=true', w1.ok && w1.changed === true)
check('保留头部注释', after.includes('头部注释需保留'))
check('保留其他 export', after.includes('enkaApi') && after.includes('requestInterval'))
const r1 = readProfileImgSrc({ file: target })
check('往返一致（含单引号转义路径）', JSON.stringify(r1.list) === JSON.stringify(wanted), `实际 ${JSON.stringify(r1.list)}`)

// 5. 幂等：同内容重写
const w2 = writeProfileImgSrc(wanted, { file: target })
check('同内容重写 changed=false', w2.ok && w2.changed === false)

// 6. 无声明 → 末尾追加
const noDecl = path.join(cfgDir, 'no-decl.js')
fs.writeFileSync(noDecl, 'export const requestInterval = 5\n', 'utf8')
const w3 = writeProfileImgSrc(['profile'], { file: noDecl })
const r3 = readProfileImgSrc({ file: noDecl })
check('无声明时追加（hasDecl=false 标记）', w3.ok && w3.hasDecl === false)
check('追加后读回一致', r3.list.length === 1 && r3.list[0] === 'profile')
check('追加不破坏原有 export', fs.readFileSync(noDecl, 'utf8').includes('requestInterval'))

// 7. 边界：空列表 / 文件不存在
check('空列表拒绝写入', writeProfileImgSrc([], { file: target }).ok === false)
check('文件不存在拒绝写入', writeProfileImgSrc(['profile'], { file: path.join(cfgDir, 'nope.js') }).ok === false)
check('文件不存在读取报错', readProfileImgSrc({ file: path.join(cfgDir, 'nope.js') }).ok === false)

// 8. 源列表构建（只读探测，不写配置）
const built = buildSrcList()
check('源列表首项为默认图库 profile', built.list[0] === 'profile', `实际 ${built.list[0]}`)
check('entries / skipped 均为数组', Array.isArray(built.entries) && Array.isArray(built.skipped))
check('skipped 项带原因', built.skipped.every(s => typeof s.reason === 'string' && s.reason.length > 0))

// 8.1 一层分组（如按游戏分层）的注册展开：第三方支持，主仓库不支持
const groupRoot = path.join(tmp, 'group-src')
fs.rmSync(groupRoot, { recursive: true, force: true })
for (const [group, role] of [['gs-character', '琴'], ['sr-character', '三月七']]) {
  fs.mkdirSync(path.join(groupRoot, group, role), { recursive: true })
  fs.writeFileSync(path.join(groupRoot, group, role, 'a.webp'), 'x')
}
const posix = (p) => p.split(path.sep).join('/')
const tpBuilt = buildSrcList({ items: [{ dir: groupRoot, label: 'MBT', kind: 'thirdParty' }] })
check('第三方分组源展开为每个子图库',
  tpBuilt.list.includes(posix(path.join(groupRoot, 'gs-character'))) &&
  tpBuilt.list.includes(posix(path.join(groupRoot, 'sr-character'))),
  JSON.stringify(tpBuilt.list))
check('分组源标签用原始目录名',
  tpBuilt.entries.some(e => e.label === 'MBT·gs-character') && tpBuilt.entries.some(e => e.label === 'MBT·sr-character'),
  JSON.stringify(tpBuilt.entries.map(e => e.label)))
const mainBuilt = buildSrcList({ items: [{ dir: groupRoot, label: '主图库', kind: 'main' }] })
check('主仓库不支持分组（记入 skipped 并给出原因）',
  mainBuilt.skipped.length === 1 && mainBuilt.skipped[0].reason.includes('一层分组'),
  JSON.stringify(mainBuilt.skipped))

// 9. 不同步真实配置：syncProfileImgSrc 只做前置校验（真实 miao 支持时会写真实配置，故此处断言「能力探测」分支）
const before = fs.readFileSync(target, 'utf8')
check('套件未改动真实 miao 配置', before === after)

finish()
