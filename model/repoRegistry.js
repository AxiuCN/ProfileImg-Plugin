import path from 'node:path'

/**
 * 仓库路径工具
 *
 * 新架构：角色级 junction + 复制聚合。不再有"仓库注册表"概念，
 * 主仓库角色目录由 map.json（角色→仓库编号）唯一路由。
 * 段位常量已移至 components/panelUtils.js。
 */

/**
 * 获取仓库中指定类型的角色目录
 * @param {string} repoDir - 仓库目录
 * @param {'normal'|'super'} type - 角色类型
 * @returns {string}
 */
export function getRepoCharDir(repoDir, type) {
  return path.join(repoDir, `${type}-character`)
}

/**
 * 获取仓库中指定角色的目录
 * @param {string} repoDir - 仓库目录
 * @param {'normal'|'super'} type - 角色类型
 * @param {string} roleName - 角色名
 * @returns {string}
 */
export function getRepoRoleDir(repoDir, type, roleName) {
  return path.join(repoDir, `${type}-character`, roleName)
}
