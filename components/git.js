import { execSync } from 'node:child_process'
import { GIT_WORK_DIR, BLOCKED_GALLERY_PATH } from './constants.js'

/** 在主图库目录执行 Git 命令 */
export function gitExec(command, timeout = 10000) {
  return execSync(command, { cwd: GIT_WORK_DIR, encoding: 'utf8', timeout }).trim()
}

/** 在屏蔽图库目录执行 Git 命令 */
export function gitExecBlocked(command, timeout = 10000) {
  return execSync(command, { cwd: BLOCKED_GALLERY_PATH, encoding: 'utf8', timeout }).trim()
}

/** 在指定目录执行 Git 命令 */
export function gitExecAt(dir, command, timeout = 10000) {
  return execSync(command, { cwd: dir, encoding: 'utf8', timeout }).trim()
}

/** 获取主图库远程最新 SHA */
export function getRemoteSha() {
  try {
    gitExec('git fetch origin main', 30000)
    return gitExec('git rev-parse --short origin/main')
  } catch (e) { return null }
}

/** 获取屏蔽图库远程最新 SHA */
export function getRemoteShaBlocked() {
  try {
    gitExecBlocked('git fetch origin main', 30000)
    return gitExecBlocked('git rev-parse --short origin/main')
  } catch (e) { return null }
}

/** 强制重置主图库到远程 */
export function forceResetToRemote() {
  gitExec('git reset --hard origin/main', 30000)
}

/** 强制重置屏蔽图库到远程 */
export function forceResetBlocked() {
  gitExecBlocked('git reset --hard origin/main', 30000)
}