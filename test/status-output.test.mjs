/**
 * 状态图数据安全 + 源规模统计口径
 *
 * - `#图库状态` 为所有人可用，渲染数据**不得回显服务器绝对路径**（只给仓库目录名）
 * - 源规模统计：平铺源跳过 `.git` 等版本目录；分层源只统计 normal/super 两层
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { buildStatusData } = await import(mod('modules/statusPanel.js'))
const { statSource } = await import(mod('model/galleryIndex.js'))

const tmp = ensureTmpDir()
const { check, finish } = checker()

// ---- 1. 状态图数据：三种模式都不泄露绝对路径，字段齐备 ----
for (const mode of ['overall', 'main', 'blocked']) {
  const data = buildStatusData({ mode })
  const json = JSON.stringify(data)

  check(`状态数据（${mode}）不含盘符绝对路径`, !/[A-Za-z]:[\\/]/.test(json), json.slice(0, 120))
  check(`状态数据（${mode}）字段齐备`,
    typeof data.title === 'string' && data.title.length > 0 &&
    typeof data.subTitle === 'string' &&
    Array.isArray(data.stats) && data.stats.length >= 3 &&
    Array.isArray(data.sources) && Array.isArray(data.unregistered))
  check(`状态数据（${mode}）目录名只有 basename`,
    data.sources.every(s => s.dirName && !/[\\/:]/.test(s.dirName)),
    JSON.stringify(data.sources.map(s => s.dirName)))
  check(`状态数据（${mode}）未登记目录只给名字`,
    data.unregistered.every(item => item.name && !/[\\/]/.test(item.name)))
  check(`状态数据（${mode}）表头统计与源数量一致`,
    data.stats[0].value === data.sourceCount &&
    data.sourceCount === data.sources.reduce((n, s) => n + (s.children.length || 1), 0),
    `stats[0]=${data.stats[0].value} sourceCount=${data.sourceCount}`)
}

// ---- 2. 模式语义 ----
const overall = buildStatusData({ mode: 'overall' })
check('总览模式带屏蔽图库与未登记目录区块',
  overall.blocked !== null && typeof overall.blocked.installed === 'boolean' && Array.isArray(overall.unregistered))

const mainOnly = buildStatusData({ mode: 'main' })
check('主图库模式只列主仓库', mainOnly.sources.every(s => s.kindLabel === '主仓库'),
  JSON.stringify(mainOnly.sources.map(s => s.kindLabel)))
check('主图库模式不带屏蔽图库区块', mainOnly.blocked === null && mainOnly.unregistered.length === 0)

const blockedOnly = buildStatusData({ mode: 'blocked' })
check('屏蔽图库模式只出屏蔽区块',
  blockedOnly.sources.length === 0 && blockedOnly.blocked !== null &&
  typeof blockedOnly.blocked.installed === 'boolean')
check('未安装屏蔽图库时表头归零',
  blockedOnly.blocked.installed || blockedOnly.stats.every(s => s.value === 0 || s.value === '0 B'),
  JSON.stringify(blockedOnly.stats))

// ---- 3. 平铺源：跳过 .git，根文件与角色目录都计入体积 ----
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

// ---- 4. 分层源：只统计 normal/super 两层 ----
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

// ---- 5. 目录不存在时归零 ----
const empty = statSource({ kind: 'main', label: '空仓库', dir: path.join(tmp, 'nope'), level: 'tier' })
check('目录不存在 → 全零', empty.roles === 0 && empty.images === 0 && empty.size === 0)

// ---- 6. 第三方分组：同仓库子文件夹归到父图库下，父行合计 + 更新时间 ----
const groupDir = path.join(tmp, 'tp-group-src')
fs.rmSync(groupDir, { recursive: true, force: true })
fs.mkdirSync(path.join(groupDir, 'gs-character', '角色A'), { recursive: true })
fs.mkdirSync(path.join(groupDir, 'sr-character', '角色B'), { recursive: true })
fs.writeFileSync(path.join(groupDir, 'gs-character', '角色A', 'a.webp'), Buffer.alloc(100))
fs.writeFileSync(path.join(groupDir, 'sr-character', '角色B', 'b.webp'), Buffer.alloc(300))

// 建 git 仓库并打一个固定时间的提交：验证第三方图库的「更新时间」
const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
if (hasGit) {
  const gitOpt = { cwd: groupDir, encoding: 'utf8' }
  spawnSync('git', ['init'], gitOpt)
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], gitOpt)
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init'], {
    ...gitOpt,
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-01-02T03:04:05+08:00', GIT_COMMITTER_DATE: '2026-01-02T03:04:05+08:00' }
  })
}

const grouped = buildStatusData({ mode: 'overall', thirdParty: [{ name: '测试图库', dir: groupDir, enabled: true }] })
const parent = grouped.sources.find(s => s.label === '测试图库')
check('第三方分组：子文件夹归到父图库条目下',
  parent?.children?.length === 2, JSON.stringify(parent?.children?.map(c => c.label)))
check('第三方分组：父行合计等于子行之和',
  !!parent &&
  parent.roles === parent.children.reduce((n, c) => n + c.roles, 0) &&
  parent.images === parent.children.reduce((n, c) => n + c.images, 0),
  JSON.stringify({ roles: parent?.roles, children: parent?.children?.map(c => c.roles) }))
check('第三方分组：父条目带仓库目录名与两位顺序号',
  parent?.dirName === 'tp-group-src' && /^\d{2}$/.test(String(parent?.order)),
  `${parent?.dirName} / ${parent?.order}`)
check('图库源计数：分组子文件夹各算一个',
  grouped.sourceCount === grouped.sources.reduce((n, s) => n + (s.children.length || 1), 0) &&
  grouped.stats[0].value === grouped.sourceCount,
  `sourceCount=${grouped.sourceCount} stats[0]=${grouped.stats[0].value}`)
check('第三方图库更新时间（截到分钟）',
  !hasGit || parent?.version?.updatedAt === '2026-01-02 03:04', String(parent?.version?.updatedAt))
check('带分组夹具后仍不回显绝对路径',
  !JSON.stringify(grouped).includes('tp-group-src' + path.sep) && !/[A-Za-z]:[\\/]/.test(JSON.stringify(grouped)))

finish()
