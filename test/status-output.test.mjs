/**
 * 状态输出安全 + 源规模统计口径
 *
 * - `#图库状态` 为所有人可用，输出**不得回显服务器绝对路径**（只展示仓库目录名）
 * - 源规模统计：平铺源跳过 `.git` 等版本目录；分层源只统计 normal/super 两层
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { Status } = await import(mod('apps/status.js'))
const { statSource } = await import(mod('model/galleryIndex.js'))

const tmp = ensureTmpDir()
const { check, finish } = checker()

const app = new Status()

// ---- 1. 状态行不得泄露绝对路径 ----
const secretDir = path.join('D:', 'secret-server-path', 'gallery', 'ProfileImg', 'miao-plugin-ProfileImg')
const line = app._sourceLine(
  { kind: 'main', label: '主图库', dir: secretDir, level: 'tier' },
  { roles: 3, images: 30, size: 2048 }
)
check('状态行不含盘符/绝对路径', !line.includes('D:') && !line.includes('secret-server-path'), line.replace(/\n/g, ' / '))
check('状态行含仓库目录名', line.includes('miao-plugin-ProfileImg'))
check('状态行含规模与体积', line.includes('3 角色') && line.includes('30 图片') && line.includes('2.0 KB'))

// ---- 2. 平铺源：跳过 .git，根文件与角色目录都计入体积 ----
const flatDir = path.join(tmp, 'flat-src')
fs.rmSync(flatDir, { recursive: true, force: true })
fs.mkdirSync(path.join(flatDir, '角色A'), { recursive: true })
fs.mkdirSync(path.join(flatDir, '.git'), { recursive: true })
fs.writeFileSync(path.join(flatDir, '角色A', 'a.webp'), Buffer.alloc(300))
fs.writeFileSync(path.join(flatDir, 'README.md'), Buffer.alloc(100))
fs.writeFileSync(path.join(flatDir, '.git', 'pack.idx'), Buffer.alloc(50000))

const flat = statSource({ kind: 'thirdParty', label: '图库A', dir: flatDir, level: 'flat' })
check('平铺源体积含角色图与根文件、跳过 .git', flat.size === 400, `实际 ${flat.size}`)
check('平铺源角色数 / 图片数', flat.roles === 1 && flat.images === 1, JSON.stringify(flat))

// ---- 3. 分层源：只统计 normal/super 两层 ----
const tierDir = path.join(tmp, 'tier-src')
fs.rmSync(tierDir, { recursive: true, force: true })
fs.mkdirSync(path.join(tierDir, 'normal-character', '角色B'), { recursive: true })
fs.mkdirSync(path.join(tierDir, 'super-character', '角色B'), { recursive: true })
fs.mkdirSync(path.join(tierDir, '.git'), { recursive: true })
fs.writeFileSync(path.join(tierDir, 'normal-character', '角色B', 'b.webp'), Buffer.alloc(200))
fs.writeFileSync(path.join(tierDir, 'super-character', '角色B', 'c.webp'), Buffer.alloc(300))
fs.writeFileSync(path.join(tierDir, '.git', 'pack.idx'), Buffer.alloc(90000))

const tier = statSource({ kind: 'main', label: '主图库', dir: tierDir, level: 'tier' })
check('分层源体积只计 normal+super', tier.size === 500, `实际 ${tier.size}`)
check('分层源角色数 / 图片数', tier.roles === 2 && tier.images === 2, JSON.stringify(tier))

// ---- 4. 目录不存在时归零 ----
const empty = statSource({ kind: 'main', label: '空仓库', dir: path.join(tmp, 'nope'), level: 'tier' })
check('目录不存在 → 全零', empty.roles === 0 && empty.images === 0 && empty.size === 0)

finish()
