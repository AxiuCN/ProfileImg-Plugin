import path from 'node:path'

const _cwd = process.cwd()

/* ==========================================================================
   图库根目录（所有资源在 ProfileImg-Plugin 自有目录内）
   ========================================================================== */

/** 图库根目录：ProfileImg-Plugin/resources/gallery/ */
export const GALLERY_ROOT = path.join(_cwd, 'plugins/ProfileImg-Plugin/resources/gallery')

/** Profile 聚合目录（junction 目标，miao-plugin 通过 junction 读取） */
export const PROFILE_DIR = path.join(GALLERY_ROOT, 'profile')

/** miao-plugin 侧的 junction 链接路径 */
export const MIAO_PROFILE_LINK = path.join(_cwd, 'plugins/miao-plugin/resources/profile')

/** 面板图仓库目录：gallery/ProfileImg/ */
export const PROFILE_IMG_DIR = path.join(GALLERY_ROOT, 'ProfileImg')

/** 备份目录 */
export const BACKUP_DIR = path.join(GALLERY_ROOT, 'backup')

/** map.json 路径 */
export const MAP_JSON_PATH = path.join(GALLERY_ROOT, 'map.json')

/* ==========================================================================
   仓库路径
   ========================================================================== */

/** 默认主仓库（id=0）目录 */
export const DEFAULT_REPO_DIR = path.join(PROFILE_IMG_DIR, 'miao-plugin-ProfileImg')

/** 屏蔽图库目录（直接位于 profile 下，自带 .git） */
export const BLOCKED_REPO_DIR = path.join(PROFILE_DIR, 'blocked-character')

/** 默认主仓库远程 URL */
export const DEFAULT_REPO_URL = 'https://github.com/AxiuCN/miao-plugin-ProfileImg.git'

/** 屏蔽图库远程 URL */
export const BLOCKED_REPO_URL = 'https://github.com/AxiuCN/miao-plugin-ProfileImg-Blocked.git'

/* ==========================================================================
   辅助函数
   ========================================================================== */

/**
 * 根据仓库编号获取仓库目录
 * @param {number} repoId - 仓库编号（0 = 默认主仓库）
 * @returns {string}
 */
export function getRepoDir(repoId) {
  if (repoId === 0) return DEFAULT_REPO_DIR
  return path.join(PROFILE_IMG_DIR, `miao-plugin-ProfileImg-${repoId}`)
}

/**
 * 获取仓库中指定类型的角色目录
 * @param {number} repoId - 仓库编号
 * @param {'normal'|'super'} type - 角色类型
 * @returns {string}
 */
export function getRepoCharDir(repoId, type) {
  return path.join(getRepoDir(repoId), `${type}-character`)
}

/**
 * 获取 profile 聚合目录中指定类型的角色目录
 * @param {'normal'|'super'|'blocked'} type
 * @returns {string}
 */
export function getProfileTypeDir(type) {
  return path.join(PROFILE_DIR, `${type}-character`)
}

/**
 * 获取仓库名称（按约定）
 * @param {number} repoId - 仓库编号
 * @returns {string}
 */
export function getRepoName(repoId) {
  return repoId === 0 ? 'miao-plugin-ProfileImg' : `miao-plugin-ProfileImg-${repoId}`
}

/* ==========================================================================
   兼容性导出（逐步废弃）
   以下导出仅为减少一次性改动量，新代码应使用上面的函数。
   ========================================================================== */

/**
 * @deprecated 使用 getRepoCharDir(0, 'normal') 替代
 */
export const GALLERY_PATH = path.join(DEFAULT_REPO_DIR, 'normal-character')

/**
 * @deprecated 使用 BLOCKED_REPO_DIR 替代
 */
export const BLOCKED_GALLERY_PATH = BLOCKED_REPO_DIR

/**
 * @deprecated 使用 DEFAULT_REPO_DIR 替代
 */
export const GIT_WORK_DIR = DEFAULT_REPO_DIR

/**
 * @deprecated 使用 BLOCKED_REPO_DIR 替代
 */
export const BLOCKED_GIT_DIR = path.join(BLOCKED_REPO_DIR, '.git')

/**
 * @deprecated 使用 DEFAULT_REPO_URL 替代
 */
export const MAIN_REPO_URL = DEFAULT_REPO_URL
