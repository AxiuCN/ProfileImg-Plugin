import { gitExec, gitExecAt } from './git.js'

/** 获取主图库本地版本 */
export function getLocalVersion() {
  try {
    const sha = gitExec('git rev-parse --short HEAD')
    const date = gitExec('git log -1 --format=%ci')
    return { sha, date }
  } catch (e) { return null }
}

/** 获取指定目录的本地版本 */
export function getLocalVersionAt(dir) {
  try {
    const sha = gitExecAt(dir, 'git rev-parse --short HEAD')
    const date = gitExecAt(dir, 'git log -1 --format=%ci')
    return { sha, date }
  } catch (e) { return null }
}