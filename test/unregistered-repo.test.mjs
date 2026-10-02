/**
 * 未登记图库的发现与补登记（契约：gallery_config.yaml 是唯一凭证）
 *
 * - `listUnregisteredRepos`：发现 gallery/ProfileImg 下未登记的图库目录
 *   （含 .git 的仓库，或结构可直读 tier/平铺的目录；排除主仓库保留名 / 已登记 / 非图库 / 隐藏目录）
 * - `addThirdPartyRepo`：登记进 gallery_config.yaml，dir 一律绝对路径，按路径幂等
 * - `autoRegisterUnregisteredRepos`：扫描 → 先登记配置（供调用方再由配置注册 miao）
 * 全部在 test/.test-tmp 的临时目录/临时配置内进行，不触碰真实配置与图库目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { listUnregisteredRepos, addThirdPartyRepo, autoRegisterUnregisteredRepos, resolveThirdPartyDir } =
  await import(mod('model/galleryConfig.js'))

const tmp = ensureTmpDir()
const root = path.join(tmp, 'unregistered-repo')
const baseDir = path.join(root, 'ProfileImg')
const cfgFile = path.join(root, 'gallery_config.yaml')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })
fs.writeFileSync(cfgFile, 'thirdParty: []\n', 'utf8')

/** 建目录（可选带 .git 标记 / tier 结构）*/
function mkdir (rel, { git = false, gitAsFile = false, tier = false, flat = false } = {}) {
  const dir = path.join(baseDir, rel)
  fs.mkdirSync(dir, { recursive: true })
  if (git) {
    if (gitAsFile) fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../.git/modules/x\n', 'utf8')
    else fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  }
  if (tier) {
    fs.mkdirSync(path.join(dir, 'normal-character', '测试角色'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'normal-character', '测试角色', '测试角色_1.webp'), Buffer.alloc(32))
  }
  if (flat) {
    fs.mkdirSync(path.join(dir, '测试角色'), { recursive: true })
    fs.writeFileSync(path.join(dir, '测试角色', '测试角色_2.webp'), Buffer.alloc(32))
  }
  return dir
}

mkdir('miao-plugin-ProfileImg', { git: true })            // 主仓库保留名
mkdir('miao-plugin-ProfileImg-1', { git: true })          // 扩展主仓库保留名
mkdir('fan-registered', { git: true })                    // 已登记
mkdir('fan-git', { git: true })                           // 未登记：Git 仓库（.git 目录）
mkdir('fan-worktree', { git: true, gitAsFile: true })     // 未登记：worktree（.git 文件）
mkdir('fan-local-tier', { tier: true })                   // 未登记：非 git 但结构可直读
mkdir('fan-local-flat', { flat: true })                   // 未登记：非 git 平铺
mkdir('docs', {})                                         // 非图库目录
mkdir('.cache', { git: true })                            // 隐藏目录

const { check, finish } = checker()
const registered = [{ dir: path.join(baseDir, 'fan-registered') }]

// ---- 1. 候选识别 ----
const found = listUnregisteredRepos({ baseDir, registered, withRemote: false })
const names = found.map(f => f.name).sort()
check('Git 仓库 + 结构可直读目录都算候选',
  JSON.stringify(names) === JSON.stringify(['fan-git', 'fan-local-flat', 'fan-local-tier', 'fan-worktree']),
  JSON.stringify(names))
check('返回绝对路径', found.every(f => path.isAbsolute(f.dir)))
check('主仓库保留名被排除', !names.includes('miao-plugin-ProfileImg') && !names.includes('miao-plugin-ProfileImg-1'))
check('已登记目录被排除', !names.includes('fan-registered'))
check('非图库目录被排除', !names.includes('docs'))
check('隐藏目录被排除', !names.includes('.cache'))
check('目录不存在 → 空数组',
  listUnregisteredRepos({ baseDir: path.join(root, 'not-exist'), registered: [] }).length === 0)

// ---- 2. 补登记：先写配置（绝对路径），幂等 ----
const target = path.join(baseDir, 'fan-local-tier')
const added = addThirdPartyRepo({ name: 'fan-local-tier', dir: target }, { file: cfgFile })
check('登记成功', added.ok === true && added.added === true)
const cfgText = fs.readFileSync(cfgFile, 'utf8')
check('配置里写的是绝对路径', cfgText.includes(resolveThirdPartyDir(target).split(path.sep).join('/')) || cfgText.includes(resolveThirdPartyDir(target)))
check('同路径重复登记不重复写入', addThirdPartyRepo({ name: 'x', dir: target }, { file: cfgFile }).added === false)
check('按解析后的绝对路径判重（相对名写法命中）',
  addThirdPartyRepo({ name: 'y', dir: path.relative(process.cwd(), target) }, { file: cfgFile }).ok === true)

// ---- 3. 自动补登记：扫描 → 登记进配置 ----
fs.writeFileSync(cfgFile, 'thirdParty: []\n', 'utf8')
const auto = autoRegisterUnregisteredRepos({ baseDir, registered, withRemote: false, file: cfgFile })
check('自动登记全部候选', auto.added.length === 4 && auto.failed.length === 0,
  JSON.stringify(auto.added.map(a => a.name)))
const afterText = fs.readFileSync(cfgFile, 'utf8')
check('配置里含全部已登记目录',
  ['fan-git', 'fan-worktree', 'fan-local-tier', 'fan-local-flat'].every(n => afterText.includes(n)))
check('再次自动登记为空（幂等）',
  autoRegisterUnregisteredRepos({ baseDir, registered, withRemote: false, file: cfgFile }).added.length === 0)

fs.rmSync(root, { recursive: true, force: true })
finish()
