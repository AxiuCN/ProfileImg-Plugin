import { execSync, exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_REPO_DIR, BLOCKED_REPO_DIR } from '../components/constants.js'

/* ==========================================================================
   同步 Git 操作
   ========================================================================== */

/**
 * 在指定目录执行 Git 命令（同步）
 * @param {string} gitDir - Git 仓库目录（含 .git 的目录）
 * @param {string} command - Git 命令（不含 'git' 前缀，如 'pull origin main'）
 * @param {number} timeout - 超时毫秒
 * @returns {string} 命令输出（已 trim）
 */
export function gitExec(gitDir, command, timeout = 10000) {
  return execSync(`git ${command}`, { cwd: gitDir, encoding: 'utf8', timeout }).trim()
}

/**
 * 在指定目录执行 Git 命令（异步），不阻塞 Bot 主线程
 * @param {string} gitDir - Git 仓库目录
 * @param {string} command - Git 命令（不含 'git' 前缀）
 * @param {number} timeout - 超时毫秒
 * @returns {Promise<{ ok: boolean, stdout?: string, stderr?: string, error?: string }>}
 */
export function gitExecAsync(gitDir, command, timeout = 120000) {
  return new Promise((resolve) => {
    const child = exec(`git ${command}`, { cwd: gitDir, encoding: 'utf8', timeout },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, stdout: stdout?.trim(), stderr: stderr?.trim(), error: error.message })
        } else {
          resolve({ ok: true, stdout: stdout.trim(), stderr: stderr?.trim() })
        }
      })
    // 额外的安全超时（exec 的 timeout 可能不触发回调）
    const timer = setTimeout(() => { child.kill('SIGTERM') }, timeout + 5000)
    child.on('close', () => clearTimeout(timer))
  })
}

/* ==========================================================================
   仓库初始化
   ========================================================================== */

/**
 * 安装（克隆/初始化）一个 Git 仓库到指定目录
 * git init → remote add → fetch --depth 1 → reset --hard
 * @param {string} repoUrl - 远程仓库 URL
 * @param {string} targetDir - 目标目录
 * @param {string} branch - 分支名，默认 'main'
 * @returns {{ ok: boolean, msg: string, existed: boolean }}
 */
export function installRepo(repoUrl, targetDir, branch = 'main') {
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    return { ok: true, msg: '仓库已安装', existed: true }
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
 * 异步安装仓库（用于 #图库初始化 等场景）
 * @returns {Promise<{ ok: boolean, msg: string, existed: boolean }>}
 */
export async function installRepoAsync(repoUrl, targetDir, branch = 'main') {
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    return { ok: true, msg: '仓库已安装', existed: true }
  }
  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true })
    }
    fs.mkdirSync(targetDir, { recursive: true })

    let r = await gitExecAsync(targetDir, `init --initial-branch=${branch}`)
    if (!r.ok) throw new Error(r.error)
    r = await gitExecAsync(targetDir, `remote add origin ${repoUrl}`)
    if (!r.ok) throw new Error(r.error)
    r = await gitExecAsync(targetDir, `fetch origin ${branch} --depth 1`, 120000)
    if (!r.ok) throw new Error(r.error)
    r = await gitExecAsync(targetDir, `reset --hard origin/${branch}`)
    if (!r.ok) throw new Error(r.error)

    return { ok: true, msg: '安装成功', existed: false }
  } catch (e) {
    return { ok: false, msg: `安装失败: ${e.message}`, existed: false }
  }
}

/* ==========================================================================
   SHA / 版本查询
   ========================================================================== */

/**
 * 获取远程最新 SHA
 * @param {string} gitDir - Git 仓库目录
 * @param {string} branch - 远程分支，默认 'main'
 * @returns {string|null}
 */
export function getRemoteSha(gitDir, branch = 'main') {
  try {
    gitExec(gitDir, `fetch origin ${branch}`, 30000)
    return gitExec(gitDir, `rev-parse --short origin/${branch}`)
  } catch (e) { return null }
}

/**
 * 获取本地最新 SHA
 * @param {string} gitDir - Git 仓库目录
 * @returns {string|null}
 */
export function getLocalSha(gitDir) {
  try {
    return gitExec(gitDir, 'rev-parse --short HEAD')
  } catch (e) { return null }
}

/**
 * 获取最新 commit 日期
 * @param {string} gitDir - Git 仓库目录
 * @returns {string|null}
 */
export function getLastCommitDate(gitDir) {
  try {
    return gitExec(gitDir, 'log -1 --format=%ci')
  } catch (e) { return null }
}

/* ==========================================================================
   更新操作
   ========================================================================== */

/**
 * Fast-forward 拉取更新
 * @param {string} gitDir - Git 仓库目录
 * @param {string} branch - 分支名，默认 'main'
 * @returns {{ ok: boolean, updated: boolean, msg: string }}
 */
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

/**
 * 强制重置到远程
 * @param {string} gitDir - Git 仓库目录
 * @param {string} branch - 分支名，默认 'main'
 */
export function forceReset(gitDir, branch = 'main') {
  gitExec(gitDir, `fetch origin ${branch}`, 30000)
  gitExec(gitDir, `reset --hard origin/${branch}`, 30000)
}

/* ==========================================================================
   兼容性包装（保持旧 API 名称可用）
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
