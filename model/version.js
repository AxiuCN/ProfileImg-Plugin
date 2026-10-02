import { getLocalSha, getLastCommitDate } from './git.js'

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
