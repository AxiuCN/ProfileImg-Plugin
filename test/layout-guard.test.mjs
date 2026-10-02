/**
 * 布局守卫：legacy（旧 junction 布局）一律拦截、fresh（未初始化）默认拦截但 allowFresh 放行、ready 放行
 * 断言按当前实际布局状态分支执行（环境相关，不做跨环境假设）
 */
import { mod, checker, installFrameworkStubs, requireMiaoPlugin } from './_helper.mjs'

installFrameworkStubs()
requireMiaoPlugin()

const { guardLayout } = await import(mod('model/layoutGuard.js'))
const { getLayoutState } = await import(mod('model/migrateMultiSrc.js'))

const { check, finish } = checker()

/** 构造带 reply 记录的消息桩 */
function makeE () {
  const replies = []
  return { replies, reply: async (m) => { replies.push(m); return true } }
}

const state = getLayoutState()
check('布局状态为三态之一', ['legacy', 'ready', 'fresh'].includes(state), `实际 ${state}`)
check('guardLayout 为异步函数', guardLayout.constructor.name === 'AsyncFunction')

if (state === 'ready') {
  const e = makeE()
  check('ready：放行', (await guardLayout(e)) === true)
  check('ready：不回复拦截文案', e.replies.length === 0)
  const e2 = makeE()
  check('ready：allowFresh 同样放行', (await guardLayout(e2, { allowFresh: true })) === true)
} else if (state === 'legacy') {
  const e1 = makeE()
  check('legacy：拦截', (await guardLayout(e1)) === false)
  check('legacy：提示 #迁移图库', String(e1.replies[0] || '').includes('#迁移图库'), `实际 ${e1.replies[0]}`)
  const e2 = makeE()
  check('legacy：allowFresh 也拦截（强制迁移）', (await guardLayout(e2, { allowFresh: true })) === false)
} else {
  const e1 = makeE()
  check('fresh：默认拦截', (await guardLayout(e1)) === false)
  check('fresh：提示 #图库初始化', String(e1.replies[0] || '').includes('#图库初始化'), `实际 ${e1.replies[0]}`)
  const e2 = makeE()
  check('fresh：allowFresh 放行（初始化/下载类命令）', (await guardLayout(e2, { allowFresh: true })) === true)
  check('fresh：allowFresh 不回复', e2.replies.length === 0)
}

finish()
