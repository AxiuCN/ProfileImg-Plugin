/**
 * 图库源结构探测：tier / 平铺 / 不安全平铺 / 空仓库 的判定
 * 夹具全部建在 test/.test-tmp/，不触碰真实图库
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, ensureTmpDir, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { probeRepo } = await import(mod('model/srcProbe.js'))

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

finish()
