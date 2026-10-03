/**
 * Git 调用的参数安全：外部值不得拼进 shell，分支名 / 地址必须过白名单
 *
 * - 参数以 argv 传入（execFile），元字符按字面参数交给 Git，不经 shell 解释
 * - 分支名白名单：Git 引用名允许 `&` `;` `|` 等 shell 元字符，也允许以 `-` 开头
 *   触发参数注入（如 `fetch --upload-pack`），故一律拒绝
 * - 仓库地址白名单：拒绝以 `-` 开头的值，避免被当作 Git 选项
 * 夹具全部建在 test/.test-tmp/，只读探测，不联网
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { mod, ensureTmpDir, checker, installFrameworkStubs, skip } from './_helper.mjs'

installFrameworkStubs()

// 前置：git 可执行（本套件验证的是 Git 参数传递，缺 git 无意义）
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
} catch {
  skip('未找到 git 可执行文件')
}

const { installRepoAsync, fastForwardPullAsync, forceResetAsync, getRepoBranch, detectRemoteBranchAsync } =
  await import(mod('model/git.js'))

const { check, finish } = checker()
const root = path.join(ensureTmpDir(), 'git-args')
fs.rmSync(root, { recursive: true, force: true })
const dirtyDir = path.join(root, 'dirty')
fs.mkdirSync(dirtyDir, { recursive: true })
fs.writeFileSync(path.join(dirtyDir, 'local.webp'), Buffer.alloc(16))

// ---- 1. 分支名白名单 ----
const badRef = await installRepoAsync('https://example.invalid/x.git', dirtyDir, 'a&calc')
check('分支名含 shell 元字符 → 拒绝', badRef.ok === false && badRef.msg.includes('分支名不合法'), badRef.msg)
const badRef2 = await installRepoAsync('https://example.invalid/x.git', dirtyDir, '--upload-pack=calc')
check('分支名以 - 开头（参数注入）→ 拒绝', badRef2.ok === false && badRef2.msg.includes('分支名不合法'), badRef2.msg)
check('拒绝时不改动目标目录', fs.readdirSync(dirtyDir).join(',') === 'local.webp')

const pullBad = await fastForwardPullAsync(dirtyDir, 'a&calc')
check('fastForwardPullAsync 分支名不合法 → ok:false 且不抛', pullBad.ok === false, JSON.stringify(pullBad))

let forceThrew = false
try {
  await forceResetAsync(dirtyDir, 'a&calc')
} catch {
  forceThrew = true
}
check('forceResetAsync 分支名不合法 → 抛错（调用方按失败处理）', forceThrew)

// ---- 2. 仓库地址白名单 ----
const badUrl = await installRepoAsync('--upload-pack=calc', dirtyDir, 'main')
check('地址以 - 开头 → 拒绝', badUrl.ok === false && badUrl.msg.includes('仓库地址不合法'), badUrl.msg)
const badUrl2 = await installRepoAsync('', dirtyDir, 'main')
check('空地址 → 拒绝', badUrl2.ok === false)
check('非法地址未启动 Git（目录未被 init）', !fs.existsSync(path.join(dirtyDir, '.git')))

// ---- 3. 合法值不误伤：仍走原有的「目录非空非 Git → 拒绝覆盖」分支 ----
const okPath = await installRepoAsync('https://example.invalid/x.git', dirtyDir, 'main', { refuseHint: '场景提示' })
check('合法地址 / 分支未被白名单拦下（走到目录检查）',
  okPath.ok === false && okPath.msg.includes('场景提示'), okPath.msg)
const okFeature = await installRepoAsync('https://example.invalid/x.git', dirtyDir, 'feature/x')
check('多级分支名（feature/x）合法', okFeature.ok === false && okFeature.msg.includes('拒绝下载以免覆盖'))
const okScp = await installRepoAsync('git@github.com:user/repo.git', dirtyDir, 'master')
check('scp 形式地址合法', okScp.ok === false && okScp.msg.includes('拒绝下载以免覆盖'))

// ---- 4. 默认分支探测：不安全地址 / 不可达地址一律回退 main ----
check('地址不合法 → 探测回退 main', (await detectRemoteBranchAsync('--upload-pack=calc')) === 'main')
check('不可达地址 → 探测回退 main', (await detectRemoteBranchAsync('https://example.invalid/x.git')) === 'main')

// ---- 5. 本地仓库 HEAD 分支名同样过白名单 ----
const weirdRepo = path.join(root, 'weird-head')
fs.mkdirSync(weirdRepo, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: weirdRepo, stdio: 'ignore' })
execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/a&calc'], { cwd: weirdRepo, stdio: 'ignore' })
check('本地 HEAD 指向非法分支名 → 回退 main', getRepoBranch(weirdRepo) === 'main', getRepoBranch(weirdRepo))
const plainRepo = path.join(root, 'plain-head')
fs.mkdirSync(plainRepo, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: plainRepo, stdio: 'ignore' })
execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/feature/y'], { cwd: plainRepo, stdio: 'ignore' })
check('本地 HEAD 合法分支名原样返回', getRepoBranch(plainRepo) === 'feature/y', getRepoBranch(plainRepo))
check('非 Git 目录回退 main', getRepoBranch(path.join(root, 'nope')) === 'main')

fs.rmSync(root, { recursive: true, force: true })
finish()
