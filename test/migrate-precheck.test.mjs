/**
 * 迁移预检：布局状态判定、报告结构完整性，且**预检必须只读**（不写盘、不改 miao 配置）
 */
import fs from 'node:fs'
import { mod, checker, installFrameworkStubs, requireMiaoPlugin } from './_helper.mjs'

installFrameworkStubs()
requireMiaoPlugin()

const { getLayoutState, precheckMultiSrc, formatSrcList } = await import(mod('model/migrateMultiSrc.js'))
const { PROFILE_CONFIG_PATH, MIAO_CONFIG_DIR } = await import(mod('model/profileSrc.js'))

/** 文件签名（大小 + mtime），用于验证「未被改动」 */
const sig = (f) => {
  try {
    const s = fs.statSync(f)
    return `${s.size}:${s.mtimeMs}`
  } catch {
    return 'absent'
  }
}

const { check, finish } = checker()

// 记录改动前状态
const beforeCfg = sig(PROFILE_CONFIG_PATH)
const beforeDir = (() => {
  try {
    return fs.readdirSync(MIAO_CONFIG_DIR).sort().join(',')
  } catch {
    return 'absent'
  }
})()

const state = getLayoutState()
check('布局状态为三态之一', ['legacy', 'ready', 'fresh'].includes(state), `实际 ${state}`)

const pre = precheckMultiSrc()
check('supported 为布尔', typeof pre.supported === 'boolean')
check('ok 与 supported 一致', pre.ok === pre.supported)
check('state 与 getLayoutState 一致', pre.state === state, `实际 ${pre.state}`)
check('defaultStat 含 normal/super', !!pre.defaultStat?.normal && !!pre.defaultStat?.super)
check('repos 数组元素含 id 与 images', Array.isArray(pre.repos) && pre.repos.every(r => typeof r.id === 'number' && r.images))
check('thirdParty 为数组', Array.isArray(pre.thirdParty))
check('actions 为写操作清单（非空）', Array.isArray(pre.actions) && pre.actions.length > 0)
check('srcList 首项为默认图库', Array.isArray(pre.srcList) && (pre.srcList.length === 0 || pre.srcList[0] === 'profile'), `实际 ${JSON.stringify(pre.srcList)}`)
check('srcSkipped 为数组', Array.isArray(pre.srcSkipped))

// 只读校验：预检不得改动 miao 配置目录
check('预检未改动 miao profile.js', sig(PROFILE_CONFIG_PATH) === beforeCfg)
check('预检未改动 miao config 目录', (() => {
  try {
    return fs.readdirSync(MIAO_CONFIG_DIR).sort().join(',')
  } catch {
    return 'absent'
  }
})() === beforeDir)

check('formatSrcList 输出编号列表', formatSrcList(['profile', 'D:/x']) === '1. profile\n2. D:/x', `实际 ${JSON.stringify(formatSrcList(['profile', 'D:/x']))}`)
check('formatSrcList 空列表返回空串', formatSrcList([]) === '')

finish()
