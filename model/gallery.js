import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_REPO_DIR, BLOCKED_REPO_DIR } from '../components/constants.js'

/**
 * 图库就绪检查
 *
 * 多图库源布局下「源是否可用」由 `model/srcProbe.js` 判断，
 * 此处只回答「目录是否已克隆成 Git 仓库」，供下载/更新/状态命令使用。
 */

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
