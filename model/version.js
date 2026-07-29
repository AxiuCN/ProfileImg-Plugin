import { gitExec, getLocalSha, getLastCommitDate } from './git.js'
import { DEFAULT_REPO_DIR } from '../components/constants.js'

/**
 * 获取默认主图库（仓库 0）本地版本
 * @returns {{ sha: string, date: string }|null}
 */
export function getLocalVersion() {
  try {
    const sha = getLocalSha(DEFAULT_REPO_DIR)
    const date = getLastCommitDate(DEFAULT_REPO_DIR)
    return { sha, date }
  } catch (e) { return null }
}

/**
 * 获取指定目录的本地版本
 * @param {string} gitDir - Git 仓库目录
 * @returns {{ sha: string, date: string }|null}
 */
export function getLocalVersionAt(gitDir) {
  try {
    const sha = getLocalSha(gitDir)
    const date = getLastCommitDate(gitDir)
    return { sha, date }
  } catch (e) { return null }
}
