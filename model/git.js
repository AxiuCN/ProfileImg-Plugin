import { execSync, exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_REPO_DIR, BLOCKED_REPO_DIR } from '../components/constants.js'

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
  const lockFile = path.join(LOCK_DIR, `${id}.lock`)

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
        // 锁文件损坏，接管
      }
    }
  }

  fs.writeFileSync(lockFile, JSON.stringify({
    id,
    operation,
    startTime: new Date().toISOString(),
    pid: process.pid
  }))

  return {
    ok: true,
    release: () => {
      try { fs.unlinkSync(lockFile) } catch {}
    }
  }
}

/**
 * 强制释放锁（用于异常恢复）
 * @param {string} id - 仓库标识
 */
export function releaseLock(id) {
  const lockFile = path.join(LOCK_DIR, `${id}.lock`)
  try { fs.unlinkSync(lockFile) } catch {}
}

/* ==========================================================================
   同步 Git 操作（仅用于快速查询）
   ========================================================================== */

/**
 * 在指定目录执行 Git 命令（同步）
 * @param {string} gitDir - Git 仓库目录
 * @param {string} command - Git 命令（不含 'git' 前缀）
 * @param {number} timeout - 超时毫秒
 * @returns {string} 命令输出（已 trim）
 */
export function gitExec(gitDir, command, timeout = 10000) {
  return execSync(`git ${command}`, { cwd: gitDir, encoding: 'utf8', timeout }).trim()
}

/**
 * 在指定目录执行 Git 命令（异步），不阻塞 Bot 主线程
 * timeout=0 时不设超时（用于长时间下载）
 * @param {string} gitDir - Git 仓库目录
 * @param {string} command - Git 命令（不含 'git' 前缀）
 * @param {number} timeout - 超时毫秒，0 = 不限时
 * @returns {Promise<{ ok: boolean, stdout?: string, stderr?: string, error?: string }>}
 */
export function gitExecAsync(gitDir, command, timeout = 120000) {
  return new Promise((resolve) => {
    const opts = { cwd: gitDir, encoding: 'utf8' }
    if (timeout > 0) opts.timeout = timeout
    // timeout=0 → exec 不设 timeout，不限时等待

    const child = exec(`git ${command}`, opts,
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
 * 安装（克隆/初始化）一个 Git 仓库到指定目录（同步，仅用于简单检查场景）
 * 长时间下载请用 installRepoAsync
 */
export function installRepo(repoUrl, targetDir, branch = 'main') {
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    try {
      gitExec(targetDir, 'rev-parse HEAD', 5000)
      return { ok: true, msg: '仓库已安装', existed: true }
    } catch {
      // HEAD 无效，续传
    }
  }
  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true })
    }
    fs.mkdirSync(targetDir, { recursive: true })
    gitExec(targetDir, `init --initial-branch=${branch}`)
    gitExec(targetDir, `remote add origin ${repoUrl}`)
    gitExec(targetDir, `fetch origin ${branch} --depth 1`, 60000)
    gitExec(targetDir, `reset --hard origin/${branch}`)
    return { ok: true, msg: '安装成功', existed: false }
  } catch (e) {
    return { ok: false, msg: `安装失败: ${e.message}`, existed: false }
  }
}

/**
 * 异步安装仓库 — 不阻塞 Bot，不限时等待（适配大仓库/慢网络）
 * 支持断点续装：.git 存在但 HEAD 无效时自动续传 fetch+reset
 * @param {string} repoUrl - 远程仓库 URL
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名，默认 'main'
 * @returns {Promise<{ ok: boolean, msg: string, existed: boolean }>}
 */
export async function installRepoAsync(repoUrl, targetDir, branch = 'main') {
  const hasGit = fs.existsSync(path.join(targetDir, '.git'))

  if (hasGit) {
    try {
      gitExec(targetDir, 'rev-parse HEAD', 5000)
      return { ok: true, msg: '仓库已安装', existed: true }
    } catch {
      // .git 存在但 HEAD 无效 → 上次安装被中断，续传
    }
  }

  const existed = hasGit

  try {
    if (!existed) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true })
      }
      fs.mkdirSync(targetDir, { recursive: true })

      let r = await gitExecAsync(targetDir, `init --initial-branch=${branch}`)
      if (!r.ok) throw new Error(r.error)
      r = await gitExecAsync(targetDir, `remote add origin ${repoUrl}`)
      if (!r.ok) throw new Error(r.error)
    }

    // fetch 不设超时 — 大仓库可能下载数小时
    let r = await gitExecAsync(targetDir, `fetch origin ${branch} --depth 1`, 0)
    if (!r.ok) throw new Error(r.error)
    r = await gitExecAsync(targetDir, `reset --hard origin/${branch}`)
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

export function getRemoteSha(gitDir, branch = 'main') {
  try {
    gitExec(gitDir, `fetch origin ${branch}`, 30000)
    return gitExec(gitDir, `rev-parse --short origin/${branch}`)
  } catch (e) { return null }
}

export function getLocalSha(gitDir) {
  try {
    return gitExec(gitDir, 'rev-parse --short HEAD')
  } catch (e) { return null }
}

export function getLastCommitDate(gitDir) {
  try {
    return gitExec(gitDir, 'log -1 --format=%ci')
  } catch (e) { return null }
}

/** 异步获取远程 SHA */
export async function getRemoteShaAsync(gitDir, branch = 'main') {
  try {
    let r = await gitExecAsync(gitDir, `fetch origin ${branch}`, 60000)
    if (!r.ok) return null
    r = await gitExecAsync(gitDir, `rev-parse --short origin/${branch}`)
    return r.ok ? r.stdout : null
  } catch (e) { return null }
}

/* ==========================================================================
   更新操作
   ========================================================================== */

export function fastForwardPull(gitDir, branch = 'main') {
  try {
    const before = getLocalSha(gitDir)
    gitExec(gitDir, `pull origin ${branch} --ff-only`, 30000)
    const after = getLocalSha(gitDir)
    return { ok: true, updated: before !== after, msg: before !== after ? '已更新' : '已是最新' }
  } catch (e) {
    return { ok: false, updated: false, msg: e.message }
  }
}

export function forceReset(gitDir, branch = 'main') {
  gitExec(gitDir, `fetch origin ${branch}`, 30000)
  gitExec(gitDir, `reset --hard origin/${branch}`, 30000)
}

/** 异步 fast-forward 拉取 */
export async function fastForwardPullAsync(gitDir, branch = 'main') {
  try {
    const before = getLocalSha(gitDir)
    const r = await gitExecAsync(gitDir, `pull origin ${branch} --ff-only`, 60000)
    if (!r.ok) throw new Error(r.error)
    const after = getLocalSha(gitDir)
    return { ok: true, updated: before !== after, msg: before !== after ? '已更新' : '已是最新' }
  } catch (e) {
    return { ok: false, updated: false, msg: e.message }
  }
}

/** 异步强制重置到远程 */
export async function forceResetAsync(gitDir, branch = 'main') {
  let r = await gitExecAsync(gitDir, `fetch origin ${branch}`, 60000)
  if (!r.ok) throw new Error(r.error)
  r = await gitExecAsync(gitDir, `reset --hard origin/${branch}`)
  if (!r.ok) throw new Error(r.error)
}

/* ==========================================================================
   兼容性包装
   ========================================================================== */

/** @deprecated 使用 gitExec(dir, command) 替代 */
export function gitExecBlocked(command, timeout = 10000) {
  return gitExec(BLOCKED_REPO_DIR, command, timeout)
}

/** @deprecated 使用 gitExec(dir, command) 替代 */
export function gitExecAt(dir, command, timeout = 10000) {
  return gitExec(dir, command, timeout)
}

/** @deprecated 使用 getRemoteSha(gitDir) 替代 */
export function getRemoteShaBlocked(branch = 'main') {
  return getRemoteSha(BLOCKED_REPO_DIR, branch)
}

/** @deprecated 使用 forceReset(gitDir) 替代 */
export function forceResetToRemote(branch = 'main') {
  return forceReset(DEFAULT_REPO_DIR, branch)
}

/** @deprecated 使用 forceReset(gitDir) 替代 */
export function forceResetBlocked(branch = 'main') {
  return forceReset(BLOCKED_REPO_DIR, branch)
}
