import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 仓库版本追踪 — data/repo-versions.json
 *
 * 每次下载/更新后记录各仓库 HEAD SHA，用于 #图库状态 对比展示
 * 与 git log 对比检测仓库是否有更新（第三方图库只读，无本地 git 也可用）
 */

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'data'
)
const VERSIONS_FILE = path.join(DATA_DIR, 'repo-versions.json')

/** 读取全部仓库版本记录 */
export function loadRepoVersions() {
  try {
    if (!fs.existsSync(VERSIONS_FILE)) return {}
    return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

/** 记录单个仓库版本 */
export function setRepoVersion(repoId, sha) {
  const versions = loadRepoVersions()
  versions[repoId] = sha
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2), 'utf8')
  } catch (e) {
    logger?.error('[ProfileImg-Plugin] 写入 repo-versions.json 失败:', e)
  }
}

/** 读取单个仓库记录版本 */
export function getRepoVersion(repoId) {
  return loadRepoVersions()[repoId] || null
}
