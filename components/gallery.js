import fs from 'node:fs'
import path from 'node:path'
import { GALLERY_PATH, BLOCKED_GALLERY_PATH, GIT_WORK_DIR, BLOCKED_GIT_DIR } from './constants.js'

/** 检查主图库是否就绪 */
export function checkGallery() {
  if (!fs.existsSync(GALLERY_PATH)) {
    return { ok: false, msg: '[面板图图库管理器] 图库目录不存在，请先安装图库' }
  }
  if (!fs.existsSync(path.join(GIT_WORK_DIR, '.git'))) {
    return { ok: false, msg: '[面板图图库管理器] 图库未初始化 Git，请重新安装图库' }
  }
  return { ok: true }
}

/** 检查屏蔽图库是否就绪 */
export function checkBlockedGallery() {
  if (!fs.existsSync(BLOCKED_GALLERY_PATH)) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库目录不存在，请先安装屏蔽图库' }
  }
  if (!fs.existsSync(BLOCKED_GIT_DIR)) {
    return { ok: false, msg: '[面板图图库管理器] 屏蔽图库未初始化 Git，请重新安装屏蔽图库' }
  }
  return { ok: true }
}