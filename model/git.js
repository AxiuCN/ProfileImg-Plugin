import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ==========================================================================
   Git 参数白名单
   ========================================================================== */

/** 引用名（分支）白名单：字母数字开头，允许 . _ - / */
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

/**
 * 分支名是否安全
 * Git 引用名允许 `&` `;` `|` `$` 等 shell 元字符（`git check-ref-format` 通过），
 * 也允许以 `-` 开头触发参数注入（如 fetch 的 `--upload-pack`），故一律白名单放行
 * @param {string} v - 分支名
 * @returns {boolean}
 */
function isSafeRefName (v) {
  if (typeof v !== 'string' || !v || v.length > 200) return false
  if (!REF_RE.test(v)) return false
  // `..`（引用名非法但有历史遗留）、无意义的尾缀
  if (v.includes('..') || v.endsWith('/') || v.endsWith('.')) return false
  return true
}

/**
 * 远程地址是否安全（Git 地址、scp 形式或本地绝对路径）
 * @param {string} v - 仓库地址
 * @returns {boolean}
 */
function isSafeRemote (v) {
  if (typeof v !== 'string' || !v || v.length > 500) return false
  // 以 `-` 开头会被 Git 当选项解析（参数注入）
  if (v.startsWith('-')) return false
  if (/[\u0000-\u001f]/.test(v)) return false
  if (/^(https?|git|ssh|file):\/\//i.test(v)) return true
  if (/^[\w.-]+@[\w.-]+:/.test(v)) return true
  if (/^[A-Za-z]:[\\/]/.test(v) || v.startsWith('/') || v.startsWith('\\\\')) return true
  return false
}

/* ==========================================================================
   操作锁 — 防止下载/更新并发操作同一仓库
   ========================================================================== */

/** 锁文件目录：data/git-locks/ */
const LOCK_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'git-locks'
)

/** 各操作类型的过期阈值（毫秒） */
const STALE_THRESHOLDS = {
  download: 24 * 60 * 60 * 1000,  // 24h，大仓库克隆可能数小时
  update: 10 * 60 * 1000,          // 10min，pull 正常几十秒
  default: 30 * 60 * 1000          // 30min，兜底
}

function _ensureLockDir() {
  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true })
  }
}

/**
 * 获取仓库操作锁（文件锁）
 * @param {string} id - 仓库标识："0" / "1" / "blocked"
 * @param {string} operation - 操作描述，用于日志和冲突提示
 * @param {'download'|'update'|'default'} type - 操作类型，决定过期阈值
 * @returns {{ ok: true, release: () => void } | { ok: false, msg: string }}
 */
export function acquireLock(id, operation, type = 'default') {
  _ensureLockDir()
  // id 会作为锁文件名，`:` `/` 等在 Windows 上非法（`tp:MBT` 会写到子目录），统一消毒
  const safeId = String(id).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  const lockFile = path.join(LOCK_DIR, `${safeId}.lock`)
  const payload = JSON.stringify({
    id,
    operation,
    startTime: new Date().toISOString(),
    pid: process.pid
  })

  if (fs.existsSync(lockFile)) {
    const stat = fs.statSync(lockFile)
    const age = Date.now() - stat.mtimeMs
    const threshold = STALE_THRESHOLDS[type] || STALE_THRESHOLDS.default

    if (age > threshold) {
      logger.warn(`[ProfileImg-Plugin] 仓库${id}的锁文件已过期（${Math.round(age / 60000)}分钟），强制接管`)
    } else {
      try {
        const info = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
        return { ok: false, msg: `仓库${id}正在${info.operation}，请稍后再试` }
      } catch {
        // 锁文件损坏 → 接管（下面用 wx 原子抢占，抢不到说明别人刚建好）
      }
    }
    // 过期 / 损坏的锁先删掉，再原子创建
    try { fs.unlinkSync(lockFile) } catch {}
  }

  // wx = 已存在则失败：避免 existsSync 与写入之间的空档被两个操作同时穿过
  try {
    fs.writeFileSync(lockFile, payload, { flag: 'wx' })
  } catch (e) {
    if (e.code === 'EEXIST') return { ok: false, msg: `仓库${id}正在被其他操作占用，请稍后再试` }
    return { ok: false, msg: `创建锁文件失败：${e.message}` }
  }

  return {
    ok: true,
    release: () => {
      try { fs.unlinkSync(lockFile) } catch {}
    }
  }
}

/**
 * 依次获取多把锁（用于一次操作同时改动多个仓库，如主图库 → 屏蔽图库）
 * 任一失败即释放已获取的并返回失败；调用方拿到的 release 会释放全部
 * @param {Array<{id: string, operation: string, type?: string}>} specs - 锁清单（id 为空的项跳过）
 * @returns {{ ok: true, release: () => void } | { ok: false, msg: string }}
 */
export function acquireLocks(specs = []) {
  const held = []
  for (const spec of specs) {
    if (!spec?.id) continue
    const lock = acquireLock(spec.id, spec.operation, spec.type || 'default')
    if (!lock.ok) {
      held.forEach(l => l.release())
      return lock
    }
    held.push(lock)
  }
  return { ok: true, release: () => held.forEach(l => l.release()) }
}

/* ==========================================================================
   同步 Git 操作（仅用于快速查询）
   ========================================================================== */

/**
 * 在指定目录执行 Git 命令（同步）
 * 参数以 argv 数组传入（execFile，不经 shell），外部值不得拼进命令字符串
 * @param {string} gitDir - Git 仓库目录
 * @param {string[]} args - Git 参数（不含 'git' 本身）
 * @param {number} timeout - 超时毫秒
 * @returns {string} 命令输出（已 trim）
 */
export function gitExec(gitDir, args, timeout = 10000) {
  // stderr 显式捕获：探测类命令（symbolic-ref 等）失败属预期，不应把噪声打到 Bot 日志
  return execFileSync('git', args, {
    cwd: gitDir,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

/**
 * 探测本地仓库的默认分支（origin/HEAD → 符号引用 HEAD → 'main'）
 * 已 clone 的仓库由 origin/HEAD 给出远程默认分支；未 clone 完成 / 空仓库时
 * 用 symbolic-ref 读符号引用（不要求存在 commit）；异常或分支名不合法时回退 'main'，
 * 供 pull / fetch / reset 使用，避免硬编码 main 导致 master 仓库更新失败
 * @param {string} gitDir - Git 仓库目录
 * @returns {string} 分支名
 */
export function getRepoBranch(gitDir) {
  try {
    const out = gitExec(gitDir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], 10000)
    const m = out.match(/^origin\/(.+)$/)
    if (m && isSafeRefName(m[1])) return m[1]
  } catch { /* 回退下一级 */ }
  try {
    const out = gitExec(gitDir, ['symbolic-ref', '--short', 'HEAD'], 10000)
    if (out && out !== 'HEAD' && isSafeRefName(out)) return out
  } catch { /* 回退默认值 */ }
  return 'main'
}

/**
 * 探测远程仓库的默认分支（ls-remote --symref HEAD）
 * 地址不合法或探测失败时回退 'main'
 * @param {string} url - 仓库地址
 * @returns {Promise<string>} 分支名
 */
export async function detectRemoteBranchAsync(url) {
  if (!isSafeRemote(url)) {
    logger?.warn('[ProfileImg-Plugin] 仓库地址不合法，默认分支探测跳过：' + String(url).slice(0, 80))
    return 'main'
  }
  try {
    const r = await gitExecAsync(process.cwd(), ['ls-remote', '--symref', url, 'HEAD'], 30000)
    if (!r.ok) return 'main'
    const m = (r.stdout || '').match(/ref:\s*refs\/heads\/(\S+)\s+HEAD/)
    return m && isSafeRefName(m[1]) ? m[1] : 'main'
  } catch {
    return 'main'
  }
}

/**
 * 读取本地仓库的 origin 地址（补登记已有仓库时用于回填 remoteUrl）
 * @param {string} gitDir - Git 仓库目录
 * @returns {string} 远程地址，非 Git 仓库/未配置时返回空串
 */
export function getRepoRemoteUrl(gitDir) {
  try {
    return gitExec(gitDir, ['remote', 'get-url', 'origin'], 10000)
  } catch {
    return ''
  }
}

/**
 * 在指定目录执行 Git 命令（异步），不阻塞 Bot 主线程
 * 参数以 argv 数组传入（execFile，不经 shell）
 * timeout=0 时不设超时（用于长时间下载）
 * @param {string} gitDir - Git 仓库目录
 * @param {string[]} args - Git 参数（不含 'git' 本身）
 * @param {number} timeout - 超时毫秒，0 = 不限时
 * @returns {Promise<{ ok: boolean, stdout?: string, stderr?: string, error?: string }>}
 */
export function gitExecAsync(gitDir, args, timeout = 120000) {
  return new Promise((resolve) => {
    const opts = { cwd: gitDir, encoding: 'utf8' }
    if (timeout > 0) opts.timeout = timeout
    // timeout=0 → execFile 不设 timeout，不限时等待

    const child = execFile('git', args, opts,
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, stdout: stdout?.trim(), stderr: stderr?.trim(), error: error.message })
        } else {
          resolve({ ok: true, stdout: stdout.trim(), stderr: stderr?.trim() })
        }
      })
    // 只有设置了超时的情况下才加安全定时器
    if (timeout > 0) {
      const timer = setTimeout(() => { child.kill('SIGTERM') }, timeout + 5000)
      child.on('close', () => clearTimeout(timer))
    }
  })
}

/* ==========================================================================
   仓库初始化
   ========================================================================== */

/**
 * 异步安装仓库 — 不阻塞 Bot，不限时等待（适配大仓库/慢网络）
 * 支持断点续装：.git 存在但 HEAD 无效时自动续传 fetch+reset
 *
 * 安全：目标目录已存在、非空且不是 Git 仓库时**拒绝**，避免覆盖用户的本地图库；
 * 仓库地址 / 分支名不合法时直接拒绝，不启动任何 Git 进程
 * @param {string} repoUrl - 远程仓库 URL
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名，默认 'main'
 * @param {object} [opts]
 * @param {string} [opts.refuseHint] - 拒绝覆盖时追加的场景特定提示（主图库 / 屏蔽图库 / 第三方各不相同）
 * @returns {Promise<{ ok: boolean, msg: string, existed: boolean }>}
 */
export async function installRepoAsync(repoUrl, targetDir, branch = 'main', opts = {}) {
  if (!isSafeRemote(repoUrl)) {
    return { ok: false, existed: false, msg: '仓库地址不合法（需为 git 地址或绝对路径），已拒绝下载' }
  }
  if (!isSafeRefName(branch)) {
    return { ok: false, existed: false, msg: '分支名不合法，已拒绝下载' }
  }

  const hasGit = fs.existsSync(path.join(targetDir, '.git'))

  if (hasGit) {
    try {
      gitExec(targetDir, ['rev-parse', 'HEAD'], 5000)
      return { ok: true, msg: '仓库已安装', existed: true }
    } catch {
      // .git 存在但 HEAD 无效 → 上次安装被中断，续传
    }
  }

  const existed = hasGit

  // 目录已存在且非 Git 仓库：可能是用户自己的本地图库，拒绝覆盖
  if (!existed && fs.existsSync(targetDir)) {
    let entries = []
    try {
      entries = fs.readdirSync(targetDir)
    } catch { /* 读不了目录时按不可用处理 */ }
    if (entries.length > 0) {
      return {
        ok: false,
        existed: false,
        msg: '目标目录已存在且不是 Git 仓库，已拒绝下载以免覆盖；' +
          (opts.refuseHint || '请更换目录，或手动处理该目录后重试')
      }
    }
  }

  try {
    if (!existed) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true })
      }
      fs.mkdirSync(targetDir, { recursive: true })

      let r = await gitExecAsync(targetDir, ['init', `--initial-branch=${branch}`])
      if (!r.ok) throw new Error(r.error)
      r = await gitExecAsync(targetDir, ['remote', 'add', 'origin', repoUrl])
      if (!r.ok) throw new Error(r.error)
    }

    // fetch 不设超时 — 大仓库可能下载数小时
    let r = await gitExecAsync(targetDir, ['fetch', 'origin', branch, '--depth', '1'], 0)
    if (!r.ok) throw new Error(r.error)
    r = await gitExecAsync(targetDir, ['reset', '--hard', `origin/${branch}`])
    if (!r.ok) throw new Error(r.error)

    return { ok: true, msg: existed ? '安装续传成功' : '安装成功', existed }
  } catch (e) {
    // 超时/断网但数据可能已部分下载 → 提示重试
    const objectsDir = path.join(targetDir, '.git', 'objects')
    try {
      const hasObjects = fs.existsSync(objectsDir) &&
        fs.readdirSync(objectsDir).filter(d => d !== 'info' && d !== 'pack').length > 0
      if (hasObjects) {
        return { ok: false, msg: '下载中断（数据已部分缓存），请重新执行继续下载', existed: true }
      }
    } catch {}
    return { ok: false, msg: `安装失败: ${e.message}`, existed }
  }
}

/* ==========================================================================
   SHA / 版本查询
   ========================================================================== */

export function getLocalSha(gitDir) {
  try {
    return gitExec(gitDir, ['rev-parse', '--short', 'HEAD'])
  } catch (e) { return null }
}

export function getLastCommitDate(gitDir) {
  try {
    return gitExec(gitDir, ['log', '-1', '--format=%ci'])
  } catch (e) { return null }
}

/** 异步获取远程 SHA */
export async function getRemoteShaAsync(gitDir, branch = 'main') {
  if (!isSafeRefName(branch)) return null
  try {
    let r = await gitExecAsync(gitDir, ['fetch', 'origin', branch], 60000)
    if (!r.ok) return null
    r = await gitExecAsync(gitDir, ['rev-parse', '--short', `origin/${branch}`])
    return r.ok ? r.stdout : null
  } catch (e) { return null }
}

/* ==========================================================================
   更新操作
   ========================================================================== */

/** 异步 fast-forward 拉取 */
export async function fastForwardPullAsync(gitDir, branch = 'main') {
  if (!isSafeRefName(branch)) {
    return { ok: false, updated: false, msg: '分支名不合法，已拒绝执行' }
  }
  try {
    const before = getLocalSha(gitDir)
    const r = await gitExecAsync(gitDir, ['pull', 'origin', branch, '--ff-only'], 60000)
    if (!r.ok) throw new Error(r.error)
    const after = getLocalSha(gitDir)
    return { ok: true, updated: before !== after, msg: before !== after ? '已更新' : '已是最新' }
  } catch (e) {
    return { ok: false, updated: false, msg: e.message }
  }
}

/** 异步强制重置到远程 */
export async function forceResetAsync(gitDir, branch = 'main') {
  if (!isSafeRefName(branch)) throw new Error('分支名不合法，已拒绝执行')
  let r = await gitExecAsync(gitDir, ['fetch', 'origin', branch], 60000)
  if (!r.ok) throw new Error(r.error)
  r = await gitExecAsync(gitDir, ['reset', '--hard', `origin/${branch}`])
  if (!r.ok) throw new Error(r.error)
}
