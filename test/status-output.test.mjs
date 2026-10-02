/**
 * 状态输出安全 + 源体积口径
 *
 * - `#图库状态` 为所有人可用，输出**不得回显服务器绝对路径**（只展示仓库目录名）
 * - 平铺源体积统计必须跳过 `.git` 等版本目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { Status } = await import(mod('apps/status.js'))

const tmp = ensureTmpDir()
const { check, finish } = checker()

const app = new Status()

// ---- 1. 状态行不得泄露绝对路径 ----
const secretDir = path.join('D:', 'secret-server-path', 'gallery', 'ProfileImg', 'miao-plugin-ProfileImg')
const line = app._sourceLine(
  { kind: 'main', label: '主图库', dir: secretDir, level: 'tier' },
  { roles: 3, images: 30 },
  2048
)
check('状态行不含盘符/绝对路径', !line.includes('D:') && !line.includes('secret-server-path'), line.replace(/\n/g, ' / '))
check('状态行含仓库目录名', line.includes('miao-plugin-ProfileImg'))
check('状态行含规模与体积', line.includes('3 角色') && line.includes('30 图片') && line.includes('2.0 KB'))

// ---- 2. 平铺源体积跳过 .git ----
const flatDir = path.join(tmp, 'flat-src')
fs.rmSync(flatDir, { recursive: true, force: true })
fs.mkdirSync(path.join(flatDir, '角色A'), { recursive: true })
fs.mkdirSync(path.join(flatDir, '.git'), { recursive: true })
fs.writeFileSync(path.join(flatDir, '角色A', 'a.webp'), Buffer.alloc(300))
fs.writeFileSync(path.join(flatDir, 'README.md'), Buffer.alloc(100))
fs.writeFileSync(path.join(flatDir, '.git', 'pack.idx'), Buffer.alloc(50000))

const flatSize = app._sourceSize({ kind: 'thirdParty', label: '图库A', dir: flatDir, level: 'flat' })
check('平铺源体积含角色图与根文件、跳过 .git', flatSize === 400, `实际 ${flatSize}`)

// ---- 3. 分层源只统计 normal/super 两层 ----
const tierDir = path.join(tmp, 'tier-src')
fs.rmSync(tierDir, { recursive: true, force: true })
fs.mkdirSync(path.join(tierDir, 'normal-character', '角色B'), { recursive: true })
fs.mkdirSync(path.join(tierDir, 'super-character', '角色B'), { recursive: true })
fs.mkdirSync(path.join(tierDir, '.git'), { recursive: true })
fs.writeFileSync(path.join(tierDir, 'normal-character', '角色B', 'b.webp'), Buffer.alloc(200))
fs.writeFileSync(path.join(tierDir, 'super-character', '角色B', 'c.webp'), Buffer.alloc(300))
fs.writeFileSync(path.join(tierDir, '.git', 'pack.idx'), Buffer.alloc(90000))

const tierSize = app._sourceSize({ kind: 'main', label: '主图库', dir: tierDir, level: 'tier' })
check('分层源体积只计 normal+super', tierSize === 500, `实际 ${tierSize}`)

finish()
