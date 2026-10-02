/**
 * 图库源结构探测：tier / 平铺 / 不安全平铺 / 空仓库 的判定
 * 夹具全部建在 test/.test-tmp/，不触碰真实图库
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, ensureTmpDir, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { probeRepo, resolveSourceDirs } = await import(mod('model/srcProbe.js'))

const tmp = ensureTmpDir()
const root = path.join(tmp, 'probe')
fs.rmSync(root, { recursive: true, force: true })

/** 建目录并写入占位文件 */
function mk (dir, files) {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(dir, f), 'x')
}

const tierRepo = path.join(root, 'tier-repo')
mk(path.join(tierRepo, 'normal-character', '琴'), ['琴_1_甲_米游社.webp'])
mk(path.join(tierRepo, 'super-character', '胡桃'), ['胡桃_1_乙_pixiv.png'])

const flatRepo = path.join(root, 'flat-repo')
mk(path.join(flatRepo, '三月七'), ['01.jpg'])
fs.writeFileSync(path.join(flatRepo, '知更鸟.jpeg'), 'x')

const emptyRepo = path.join(root, 'empty-repo')
mk(emptyRepo, ['README.md'])

const riskyRepo = path.join(root, 'risky-repo')
mk(path.join(riskyRepo, '琴'), ['琴_1.webp'])
mk(path.join(riskyRepo, 'docs'), ['cover.webp'])

const gitOnlyRepo = path.join(root, 'git-only-repo')
mk(path.join(gitOnlyRepo, '角色甲'), ['a.webp'])
mk(path.join(gitOnlyRepo, '.git'), ['HEAD'])

const { check, finish } = checker()

const p1 = probeRepo(tierRepo)
check('tier 仓库判为 tier', p1.level === 'tier', `实际 ${p1.level}`)
check('tier 角色数 normal=1 / super=1', p1.tier.normal === 1 && p1.tier.super === 1, `实际 ${p1.tier.normal}/${p1.tier.super}`)

const p2 = probeRepo(flatRepo)
check('平铺仓库判为 flat', p2.level === 'flat', `实际 ${p2.level}（${p2.reason}）`)
check('平铺角色数含单文件 = 2', p2.flat.roles === 2, `实际 ${p2.flat.roles}`)

const p3 = probeRepo(emptyRepo)
check('无图仓库判为 unsupported', p3.level === 'unsupported', `实际 ${p3.level}`)

const p4 = probeRepo(riskyRepo)
check('平铺含 docs 图片目录 → unsupported', p4.level === 'unsupported', `实际 ${p4.level}`)
check('危险目录被识别为 docs', p4.flat.riskDirs.includes('docs'), `实际 [${p4.flat.riskDirs.join(',')}]`)

// .git 不含图 → 不算危险（miao 读不到图，无害）
const p5 = probeRepo(gitOnlyRepo)
check('.git 无图不影响平铺判定', p5.level === 'flat', `实际 ${p5.level}`)
check('.git 不进危险目录', !p5.flat.riskDirs.includes('.git'), `实际 [${p5.flat.riskDirs.join(',')}]`)

check('目录不存在 → unsupported', probeRepo(path.join(root, 'nope')).level === 'unsupported')
check('传入空值 → unsupported', probeRepo('').level === 'unsupported')

// 后缀口径（miao 只认 webp/png/jpg/jpeg，大小写不敏感）
const extRepo = path.join(root, 'ext-repo')
mk(path.join(extRepo, 'normal-character', '角色乙'), ['a.WEBP', 'b.PNG', 'c.JpEg'])
check('大小写后缀计入（webp/PNG/JpEg）', probeRepo(extRepo).tier.normal === 1, JSON.stringify(probeRepo(extRepo).tier))

const otherExtRepo = path.join(root, 'other-ext-repo')
mk(path.join(otherExtRepo, 'normal-character', '角色丙'), ['d.gif', 'e.txt'])
check('gif/txt 不计入图片 → unsupported', probeRepo(otherExtRepo).level === 'unsupported', `实际 ${probeRepo(otherExtRepo).level}`)

// ---- 一层分组（如按游戏分层：gs-character / sr-character，不依赖命名）----
const groupRepo = path.join(root, 'group-repo')
mk(path.join(groupRepo, 'gs-character', '琴'), ['a.webp'])
mk(path.join(groupRepo, 'sr-character', '三月七'), ['b.png'])
mk(path.join(groupRepo, '原神二队', '钟离'), ['c.jpg'])          // 任意命名同样算
mk(path.join(groupRepo, 'gs-tier', 'normal-character', '胡桃'), ['d.webp']) // 分组内也可以是分层
mk(path.join(groupRepo, 'docs'), ['cover.webp'])                 // 工具目录跳过
mk(path.join(groupRepo, '.git'), ['HEAD'])
fs.writeFileSync(path.join(groupRepo, 'README.md'), 'x')

const pg = probeRepo(groupRepo)
check('根读不通但子目录可直读 → group', pg.level === 'group', `实际 ${pg.level}（${pg.reason}）`)
check('分组不依赖命名（含任意中文名）', pg.group.dirs.some(d => d.name === '原神二队'))
check('工具 / 隐藏目录不算分组',
  !pg.group.dirs.some(d => d.name === 'docs' || d.name === '.git'),
  JSON.stringify(pg.group.dirs.map(d => d.name)))
check('分组内分层结构识别为 tier',
  pg.group.dirs.find(d => d.name === 'gs-tier')?.level === 'tier',
  JSON.stringify(pg.group.dirs.map(d => `${d.name}:${d.level}`)))
check('分组条数 = 4', pg.group.dirs.length === 4, JSON.stringify(pg.group.dirs.map(d => d.name)))

const expanded = resolveSourceDirs(pg, { allowGroup: true })
check('resolveSourceDirs 展开为每个分组一项',
  expanded.length === 4 && expanded.every(d => path.isAbsolute(d.dir) && d.groupName),
  JSON.stringify(expanded.map(d => d.groupName)))
check('resolveSourceDirs 不展开时返回空（主仓库 / 默认图库不支持分组）',
  resolveSourceDirs(pg).length === 0)
check('tier / 平铺源展开为自身一项',
  resolveSourceDirs(probeRepo(tierRepo), { allowGroup: true }).length === 1 &&
  resolveSourceDirs(probeRepo(flatRepo), { allowGroup: true })[0].level === 'flat')

// 分组只按结构判定，标签用原始目录名（不做任何游戏名美化）
check('分组名保留原始目录名',
  pg.group.dirs.map(d => d.name).sort().join(',') === 'gs-character,gs-tier,sr-character,原神二队',
  JSON.stringify(pg.group.dirs.map(d => d.name)))
check('展开项不再附带美化标签',
  expanded.every(d => d.label === undefined && typeof d.groupName === 'string'),
  JSON.stringify(expanded[0]))

// 只有工具目录时不算分组
const toolOnlyRepo = path.join(root, 'tool-only-repo')
mk(path.join(toolOnlyRepo, 'docs', '角色'), ['a.webp'])
check('仅工具目录 → unsupported（不误判为分组）',
  probeRepo(toolOnlyRepo).level === 'unsupported', `实际 ${probeRepo(toolOnlyRepo).level}`)

// 「角色目录里直接放图」的仓库不应被误判为分组（注册后 miao 也读不到角色）
const roleFileRepo = path.join(root, 'role-file-repo')
mk(path.join(roleFileRepo, '琴'), ['琴_1.webp'])
mk(path.join(roleFileRepo, 'docs'), ['cover.webp'])
check('角色目录仅含图片文件 → 仍判 unsupported（不当分组）',
  probeRepo(roleFileRepo).level === 'unsupported', `实际 ${probeRepo(roleFileRepo).level}（${probeRepo(roleFileRepo).reason}）`)

finish()
