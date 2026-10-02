/**
 * 未注册第三方仓库检测（契约：第三方仓库必须在 gallery_config.yaml 中注册才会被读取）
 *
 * - 含 .git 且在 gallery/ProfileImg 下、既非主仓库也未被注册 → 提示
 * - 主仓库目录（miao-plugin-ProfileImg[-N]）/ 已注册目录 / 非 Git 目录 / 隐藏目录 → 不提示
 * 全部在 test/.test-tmp 的临时目录内构造，不触碰真实图库目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { listUnregisteredRepos } = await import(mod('model/galleryConfig.js'))

const tmp = ensureTmpDir()
const baseDir = path.join(tmp, 'unregistered-repo', 'ProfileImg')
fs.rmSync(path.dirname(baseDir), { recursive: true, force: true })

/** 建目录（可选带 .git 标记，文件形式与目录形式都视为 Git 仓库）*/
function mkdir (rel, withGit = false, gitAsFile = false) {
  const dir = path.join(baseDir, rel)
  fs.mkdirSync(dir, { recursive: true })
  if (withGit) {
    if (gitAsFile) fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../.git/modules/x\n', 'utf8')
    else fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  }
  return dir
}

mkdir('miao-plugin-ProfileImg', true)          // 默认主仓库（保留名）
mkdir('miao-plugin-ProfileImg-1', true)        // 扩展主仓库（保留名）
mkdir('fan-registered', true)                  // 已注册第三方
mkdir('fan-unregistered', true)                // 未注册第三方（应提示）
mkdir('fan-worktree', true, true)              // 未注册，# .git 为文件（worktree）
mkdir('docs', false)                           // 非 Git 目录（不提示）
mkdir('.cache', true)                          // 隐藏目录（不提示）

const { check, finish } = checker()

// ---- 1. 检出未注册仓库 ----
const found = listUnregisteredRepos({
  baseDir,
  registered: [{ dir: path.join(baseDir, 'fan-registered') }]
})
const names = found.map(f => f.name).sort()
check('只提示未注册的 Git 仓库目录',
  JSON.stringify(names) === JSON.stringify(['fan-unregistered', 'fan-worktree']),
  JSON.stringify(names))
check('返回绝对路径', found.every(f => path.isAbsolute(f.dir)))

// ---- 2. 保留名 / 已注册 / 非 Git 均被排除 ----
check('主仓库保留名被排除', !names.includes('miao-plugin-ProfileImg') && !names.includes('miao-plugin-ProfileImg-1'))
check('已注册目录被排除', !names.includes('fan-registered'))
check('非 Git 目录被排除', !names.includes('docs'))
check('隐藏目录被排除', !names.includes('.cache'))

// ---- 3. 相对名同样可按绝对路径比对（配置里的相对 dir 已解析）----
const foundByRelative = listUnregisteredRepos({
  baseDir,
  registered: [{ dir: path.resolve(baseDir, 'fan-registered') }]
})
check('注册路径按绝对路径比对', foundByRelative.length === 2)

// ---- 4. 边界 ----
check('目录不存在 → 空数组', listUnregisteredRepos({ baseDir: path.join(tmp, 'not-exist'), registered: [] }).length === 0)
check('全部注册 → 空数组',
  listUnregisteredRepos({
    baseDir,
    registered: ['fan-registered', ...names].map(n => ({ dir: path.join(baseDir, n) }))
  }).length === 0)

fs.rmSync(path.dirname(baseDir), { recursive: true, force: true })
finish()
