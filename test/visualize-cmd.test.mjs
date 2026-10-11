/**
 * 可视化 / 屏蔽列表的写法与路由
 *
 * 同一个角色可能同时有普通图与屏蔽图，两套写法的正则极易互相吞词：
 *   `#遐蝶屏蔽面板图可视化` → 普通规则 `(.+?)面板图可视化` 会把角色名吃成「遐蝶屏蔽」
 *   `#屏蔽可视化遐蝶`       → 普通规则 `可视化(.+?)`      会把角色名吃成「屏蔽遐蝶」
 * 所以 rule 里**屏蔽写法必须排在普通写法之前**，且解析与 rule 共用同一组正则。
 * 这里按框架的匹配顺序（第一条命中即执行）逐条断言「命中哪条规则 + 捕获是否干净」，
 * 并校验屏蔽页的数据来源（各源 .bak）能被定位到。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { check, finish } = checker()

/**
 * 取某个 app 的 rule 顺序与对应处理函数
 * @param {string} file - apps 下的文件名
 */
async function rulesOf(file) {
  const mods = await import(mod(`apps/${file}`))
  const App = Object.values(mods).find(v => typeof v === 'function' && v.prototype)
  return new App().rule.map(r => ({ reg: r.reg, fnc: r.fnc }))
}

/**
 * 模拟框架：按 rule 顺序取第一条命中的规则
 * @returns {{ fnc: string, role: string }|null}
 */
function route(rules, msg) {
  for (const r of rules) {
    const m = String(msg).match(r.reg)
    if (m) return { fnc: r.fnc, role: m[1]?.trim() }
  }
  return null
}

// ---- 1. 可视化：普通 / 短写 / 屏蔽三种写法 ----
const vz = await rulesOf('visualize.js')

const VISUALIZE_CASES = [
  ['#遐蝶面板图可视化', 'visualize', '遐蝶'],
  ['#可视化遐蝶', 'visualize', '遐蝶'],
  ['#星铁遐蝶面板图可视化', 'visualize', '遐蝶'],
  ['#遐蝶面板图屏蔽可视化', 'visualizeBlocked', '遐蝶'],
  ['#遐蝶屏蔽面板图可视化', 'visualizeBlocked', '遐蝶'],
  ['#屏蔽可视化遐蝶', 'visualizeBlocked', '遐蝶'],
  ['#星铁遐蝶屏蔽面板图可视化', 'visualizeBlocked', '遐蝶'],
  ['#星铁屏蔽可视化遐蝶', 'visualizeBlocked', '遐蝶']
]
for (const [msg, fnc, role] of VISUALIZE_CASES) {
  const hit = route(vz, msg)
  check(`可视化路由：${msg} → ${fnc}`, hit?.fnc === fnc && hit?.role === role, JSON.stringify(hit))
}

check('可视化不接管列表命令', route(vz, '#遐蝶面板图列表') === null)
check('可视化不吃「面板图屏蔽列表」', route(vz, '#遐蝶面板图屏蔽列表') === null)

// ---- 2. 列表：主列表 / 屏蔽列表两种写法 ----
const list = await rulesOf('profileImgList.js')

const LIST_CASES = [
  ['#遐蝶面板图列表', 'mainList', '遐蝶'],
  ['#遐蝶面板图屏蔽列表', 'blockedList', '遐蝶'],
  ['#遐蝶屏蔽面板图列表', 'blockedList', '遐蝶'],
  ['#星铁遐蝶屏蔽面板图列表', 'blockedList', '遐蝶']
]
for (const [msg, fnc, role] of LIST_CASES) {
  const hit = route(list, msg)
  check(`列表路由：${msg} → ${fnc}`, hit?.fnc === fnc && hit?.role === role, JSON.stringify(hit))
}

// ---- 3. 屏蔽页的数据来源：各源 .bak 能被 getBlockedAggregated 定位 ----
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))
const { getBlockedAggregated } = await import(mod('model/blockedInfo.js'))

const ROLE = '测试可视化角色Z'
const bakName = `${ROLE}_10001_甲_乙.webp.bak`
const roleDir = path.join(MIAO_PROFILE_LINK, 'normal-character', ROLE)

let agg = []
try {
  fs.mkdirSync(roleDir, { recursive: true })
  fs.writeFileSync(path.join(roleDir, bakName), 'x')
  agg = getBlockedAggregated(ROLE)
} finally {
  fs.rmSync(roleDir, { recursive: true, force: true })
}

const hit = agg.find(f => f.name === bakName.replace(/\.bak$/, ''))
check('屏蔽数据：.bak 被聚合进屏蔽列表', !!hit, JSON.stringify(agg))
check('屏蔽数据：带可渲染的文件路径', hit?.filePath?.endsWith(bakName) === true, String(hit?.filePath))
check('屏蔽数据：标记为 .bak 且保留段位序号', hit?.isBak === true && hit?.displayN === 10001, JSON.stringify({ isBak: hit?.isBak, displayN: hit?.displayN }))
check('屏蔽数据：带来源标签（非标准名时页面用它占位）', typeof hit?.label === 'string' && hit.label.length > 0, String(hit?.label))

finish()
