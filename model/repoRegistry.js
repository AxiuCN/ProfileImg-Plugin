import path from 'node:path'
import { getPluginConfig } from '../components/config.js'
import { getActiveRepoIds } from './mapJson.js'
import {
  GALLERY_ROOT, OLD_REPO_DIR, getRepoDir, getRepoConfig, getRepoName
} from '../components/constants.js'

/**
 * 仓库注册表 — 管理所有面板图来源仓库
 *
 * 仓库类型：
 *   main        — 主图库（miao-plugin-ProfileImg[-N]，git 可 push，map.json 路由角色）
 *   old         — 迁移图库（Profile-old，普通目录，无 git）
 *   default     — default 图库（锅巴配置目录，本地可写，无 git）
 *   third-party — 第三方图库（只读 git，pull 同步）
 *
 * 每个仓库携带序号段位信息，用于全局 display n 换算
 */

/** repos.json 路径 */
export const REPOS_JSON_PATH = path.join(GALLERY_ROOT, 'repos.json')

/* ==========================================================================
   段位常量 — display n 全局分段（见计划 §4）
   ========================================================================== */

export const SEGMENTS = {
  main:      { start: 1,            end: 9999 },
  old:       { start: 10001,        end: 19999 },
  default:   { start: 20001,        end: 49999 },
  thirdBase: 500000 // tp-i 虚拟 n = thirdBase + i*100000 + 排序位置
}

/** 每个第三方仓库的虚拟 n 容量 */
export const THIRD_PARTY_SLOT = 100000

/**
 * 构建完整仓库注册表（运行时计算，不落盘）
 * @returns {Array<{ id: string, repoId?: number, type: string, name: string, dir: string, git: boolean, writable: boolean, remoteUrl: string|null }>}
 */
export function buildRepos() {
  const config = getPluginConfig()
  const repos = []

  // main 仓库（数字 id，来自 map.json 活跃仓库 + config 元数据）
  for (const repoId of getActiveRepoIds()) {
    const cfg = getRepoConfig(repoId)
    repos.push({
      id: String(repoId),
      repoId,
      type: 'main',
      name: cfg.name || getRepoName(repoId),
      dir: getRepoDir(repoId),
      git: true,
      writable: true,
      remoteUrl: cfg.remoteUrl || null
    })
  }

  // 迁移图库 Profile-old（普通目录）
  repos.push({
    id: 'old',
    type: 'old',
    name: 'Profile-old',
    dir: OLD_REPO_DIR,
    git: false,
    writable: false,
    remoteUrl: null
  })

  // default 图库（锅巴配置目录）
  const defaultDir = config?.gallery?.defaultDir
  if (defaultDir) {
    repos.push({
      id: 'default',
      type: 'default',
      name: 'default',
      dir: defaultDir,
      git: false,
      writable: true,
      remoteUrl: null
    })
  }

  // 第三方图库（锅巴配置列表，只读）
  const thirdParty = config?.gallery?.thirdParty || []
  thirdParty.forEach((tp, i) => {
    if (!tp?.dir) return
    repos.push({
      id: `tp-${i}`,
      type: 'third-party',
      name: tp.name || `tp-${i}`,
      dir: tp.dir,
      git: true,
      writable: false,
      remoteUrl: tp.remoteUrl || null
    })
  })

  return repos
}

/**
 * 获取仓库的角色目录路径（normal/super）
 * @param {object} repo - 仓库对象（buildRepos 产物）
 * @param {'normal'|'super'} type - 类型
 * @returns {string}
 */
export function getRepoCharDir(repo, type) {
  return path.join(repo.dir, `${type}-character`)
}

/**
 * 获取仓库的角色目录路径（角色级）
 * @param {object} repo - 仓库对象
 * @param {'normal'|'super'} type
 * @param {string} roleName - 角色名
 * @returns {string}
 */
export function getRepoRoleDir(repo, type, roleName) {
  return path.join(repo.dir, `${type}-character`, roleName)
}

/**
 * 按 display n 判断其所属仓库（不依赖具体文件）
 * @param {number} n - display n
 * @param {Array} repos - 仓库注册表
 * @returns {object|null} 仓库对象，找不到返回 null
 */
export function resolveRepoByN(n, repos) {
  if (n >= SEGMENTS.thirdBase) {
    const idx = Math.floor((n - SEGMENTS.thirdBase) / THIRD_PARTY_SLOT)
    const tpRepos = repos.filter(r => r.type === 'third-party')
    return tpRepos[idx] || null
  }
  if (n >= SEGMENTS.default.start) {
    return repos.find(r => r.type === 'default') || null
  }
  if (n >= SEGMENTS.old.start) {
    return repos.find(r => r.type === 'old') || null
  }
  // main 段位
  return repos.find(r => r.type === 'main') || null
}
