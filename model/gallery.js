import fs from 'node:fs'
import path from 'node:path'
import { PROFILE_DIR, DEFAULT_REPO_DIR, BLOCKED_REPO_DIR, MIAO_PROFILE_LINK } from '../components/constants.js'
import { isJunction } from './junction.js'

/**
 * 检查 profile junction 是否就绪
 * 验证 miao-plugin/resources/profile → ProfileImg-Plugin/resources/gallery/profile 的 junction 链
 * @returns {{ ok: boolean, msg?: string }}
 */
export function checkProfileJunction() {
  if (!fs.existsSync(MIAO_PROFILE_LINK)) {
    return { ok: false, msg: '[面板图图库管理器] profile 目录不存在，请发送 #图库初始化' }
  }
  if (!isJunction(MIAO_PROFILE_LINK)) {
    return { ok: false, msg: '[面板图图库管理器] profile 目录不是 junction，请发送 #图库初始化 重新设置' }
  }
  if (!fs.existsSync(PROFILE_DIR)) {
    return { ok: false, msg: '[面板图图库管理器] 图库目录不存在，请发送 #图库初始化' }
  }
  return { ok: true }
}

/**
 * 检查默认主图库（仓库 0）是否就绪
 * @returns {{ ok: boolean, msg?: string }}
 */
export function checkGallery() {
  if (!fs.existsSync(path.join(DEFAULT_REPO_DIR, 'normal-character'))) {
    return { ok: false, msg: '[面板图图库管理器] 图库目录不存在，请先安装图库' }
  }
  if (!fs.existsSync(path.join(DEFAULT_REPO_DIR, '.git'))) {
    return { ok: false, msg: '[面板图图库管理器] 图库未初始化 Git，请重新安装图库' }
  }
  return { ok: true }
}

/**
 * 检查指定仓库是否就绪
 * @param {string} gitDir - 仓库 git 目录
 * @returns {{ ok: boolean, msg?: string }}
 */
export function checkRepo(gitDir) {
  if (!fs.existsSync(gitDir)) {
    return { ok: false, msg: `[面板图图库管理器] 仓库目录不存在: ${gitDir}` }
  }
  if (!fs.existsSync(path.join(gitDir, '.git'))) {
    return { ok: false, msg: `[面板图图库管理器] 仓库未初始化 Git: ${gitDir}` }
  }
  return { ok: true }
}

/**
 * 检查屏蔽图库是否就绪
 * @returns {{ ok: boolean, msg?: string }}
 */
export function checkBlockedGallery() {
  if (!fs.existsSync(BLOCKED_REPO_DIR)) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库目录不存在，请先安装屏蔽图库' }
  }
  if (!fs.existsSync(path.join(BLOCKED_REPO_DIR, '.git'))) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库未初始化 Git，请重新安装屏蔽图库' }
  }
  return { ok: true }
}
