/**
 * 仓库默认分支探测（getRepoBranch）
 *
 * 背景：pull / fetch / reset 曾硬编码 main，master 默认分支的仓库会更新失败；
 * 现改为先探测 origin/HEAD → 当前 HEAD → 'main'
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mod, checker, installFrameworkStubs, ensureTmpDir, skip } from './_helper.mjs'

installFrameworkStubs()

const { getRepoBranch } = await import(mod('model/git.js'))

const tmp = ensureTmpDir()
const { check, finish } = checker()

// git 可用性前置
const version = spawnSync('git', ['--version'], { encoding: 'utf8' })
if (version.status !== 0) skip('环境缺少 git 可执行文件')

/** 在临时目录建一个指定初始分支的仓库 */
function makeRepo (name, branch) {
  const dir = path.join(tmp, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const r = spawnSync('git', ['init', '-b', branch], { cwd: dir, encoding: 'utf8' })
  return { dir, ok: r.status === 0 }
}

const mainRepo = makeRepo('branch-main', 'main')
check('git init -b main 成功', mainRepo.ok)
check('探测 main 仓库 → main', getRepoBranch(mainRepo.dir) === 'main', `实际 ${getRepoBranch(mainRepo.dir)}`)

const masterRepo = makeRepo('branch-master', 'master')
check('探测 master 仓库 → master', getRepoBranch(masterRepo.dir) === 'master', `实际 ${getRepoBranch(masterRepo.dir)}`)

const customRepo = makeRepo('branch-release', 'release-2026')
check('探测自定义分支 → release-2026', getRepoBranch(customRepo.dir) === 'release-2026', `实际 ${getRepoBranch(customRepo.dir)}`)

// 非仓库目录 → 回退 'main'
// 必须放在 bot 仓库之外：仓库内部目录会因 git 向上查找命中父仓库，读到的不是本目录状态
const sysDir = path.join(os.tmpdir(), `profileimg-notrepo-${Date.now()}`)
fs.mkdirSync(sysDir, { recursive: true })
try {
  check('非仓库目录回退 main', getRepoBranch(sysDir) === 'main', `实际 ${getRepoBranch(sysDir)}`)
} finally {
  fs.rmSync(sysDir, { recursive: true, force: true })
}

// 目录不存在 → 回退 'main'
check('目录不存在回退 main', getRepoBranch(path.join(tmp, 'no-such-dir')) === 'main')

finish()
