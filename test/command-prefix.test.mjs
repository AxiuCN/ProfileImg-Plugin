/**
 * 命令前缀兼容：**只认框架归一后的写法**
 *
 * 框架 `lib/plugins/loader.js:41` 的 srReg 会把开头的 `*` 与各种星铁写法
 * （星轨 / 穹轨 / 星穹 / 崩铁 / 星穹铁道 / 崩坏星穹铁道 / 铁道）统一改写成 `#星铁`，
 * 所以插件只需要认 `星铁` 一个词 —— 把那一堆写法抄进正则会让日常对话里的普通句子
 * 也可能命中命令（原神 / 崩铁 / 星穹 都是日常词汇），这里同时用**负例**把这条钉住。
 *
 * 另外：`*遐蝶面板图列表` 这类命令被改写成 `#星铁遐蝶面板图列表` 后，角色名捕获组
 * 必须只拿「遐蝶」——旧写法用 `(.+)` 会吃成「星铁遐蝶」，删除 / 屏蔽 / 添加 / 替换 /
 * 重命名 / 可视化则因为动词前多了「星铁」整条不匹配。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()

const { check, finish } = checker()

const ROLE = '测试前缀角色'

/** 每个角色类命令：文件、规则下标、角色名捕获组下标、正面样例（%s = 角色名） */
const CASES = [
  { file: 'delProfileImg.js', rule: 0, role: 1, cmds: ['#删除%s面板图2', '#星铁删除%s面板图2'] },
  { file: 'profileImgList.js', rule: 0, role: 1, cmds: ['#%s面板图列表', '#星铁%s面板图列表'] },
  { file: 'profileImgList.js', rule: 1, role: 1, cmds: ['#%s面板图屏蔽列表', '#星铁%s面板图屏蔽列表'] },
  { file: 'upload.js', rule: 0, role: 1, cmds: ['#添加%s面板图 张三 米游社', '#星铁添加%s面板图 张三 米游社'] },
  { file: 'upload.js', rule: 1, role: 1, cmds: ['#添加%s面板图', '#星铁添加%s面板图'] },
  { file: 'upload.js', rule: 2, role: 1, cmds: ['#替换%s面板图2'] },
  { file: 'moveBlockImg.js', rule: 0, role: 1, cmds: ['#屏蔽%s面板图 2', '#星铁屏蔽%s面板图 2', '#星铁屏蔽%s面板图'] },
  { file: 'moveBlockImg.js', rule: 1, role: 1, cmds: ['#启用%s面板图 2', '#星铁启用%s面板图 2', '#星铁启用%s屏蔽面板图 2'] },
  { file: 'renameProfileImg.js', rule: 0, role: 1, cmds: ['#重命名%s面板图2 张三 米游社', '#星铁重命名%s面板图2 张三 米游社'] },
  { file: 'visualize.js', rule: 0, role: 1, cmds: ['#%s面板图可视化', '#星铁%s面板图可视化'] }
]

const rules = {}

for (const { file, rule, role, cmds } of CASES) {
  const mods = await import(mod(`apps/${file}`))
  const AppClass = Object.values(mods).find(v => typeof v === 'function' && v.prototype)
  const reg = new AppClass().rule?.[rule]?.reg
  rules[`${file}#${rule}`] = reg
  if (!(reg instanceof RegExp)) {
    check(`${file} 规则 ${rule} 是正则`, false, String(reg))
    continue
  }
  for (const tpl of cmds) {
    const msg = tpl.replace('%s', ROLE)
    const got = msg.match(reg)?.[role]?.trim()
    check(`${file}#${rule} 放行 #/*/星铁 且角色名干净：${msg}`, got === ROLE, `捕获=${got}`)
  }
}

// 负例：非归一写法不得命中（动词紧跟前缀的命令最能说明问题）
const deleteReg = rules['delProfileImg.js#0']
const replaceReg = rules['upload.js#2']
const NEGATIVES = [
  ['#原神删除%s面板图2', '原神 前缀（框架不归一它）', deleteReg],
  ['#星穹铁道删除%s面板图2', '星穹铁道（框架已归一，命令层不该再认）', deleteReg],
  ['#崩铁删除%s面板图2', '崩铁 前缀', deleteReg],
  ['#铁道替换%s面板图2', '铁道 前缀', replaceReg]
]
for (const [tpl, why, reg] of NEGATIVES) {
  const msg = tpl.replace('%s', ROLE)
  check(`不误吃 ${why}：${msg}`, !reg.test(msg))
}

// 替换命令保持原样（不看游戏前缀）：星铁角色直接用不带前缀的写法
check('替换命令保持原样：`#星铁替换…` 不匹配（走 `#替换…`）',
  !replaceReg.test(`#星铁替换${ROLE}面板图2`))

// 列表 / 可视化是泛捕获命令（角色名交给别名解析兜底），这里只钉「不把前缀词从角色名里剥掉」
const listHit = `#星穹铁道${ROLE}面板图列表`.match(rules['profileImgList.js#0'])
check('列表命令：非归一前缀词留在角色名里（不会静默吞掉）',
  listHit?.[1]?.trim() === `星穹铁道${ROLE}`, `捕获=${listHit?.[1]?.trim()}`)

// 预览命令（rule 与解析共用同一个正则）
const { PREVIEW_CMD_RE, parsePreviewCommand } = await import(mod('modules/preview/index.js'))
check('预览规则：普通 / * / #星铁 都放行',
  PREVIEW_CMD_RE.test('#预览测试前缀角色面板图2') &&
  PREVIEW_CMD_RE.test('*预览测试前缀角色面板图2') &&
  PREVIEW_CMD_RE.test('#星铁预览测试前缀角色面板图2'))
check('预览规则不吃「星穹铁道」这类非归一写法', !PREVIEW_CMD_RE.test('#星穹铁道预览测试前缀角色面板图2'))
check('预览解析：* → 星铁', parsePreviewCommand('*预览测试前缀角色面板图2')?.game === 'sr')
check('预览解析：#星铁 → 星铁', parsePreviewCommand('#星铁预览测试前缀角色面板图2')?.game === 'sr')
check('预览解析：#原神 → 原神', parsePreviewCommand('#原神预览测试前缀角色面板图2')?.game === 'gs')
check('预览解析：裸 # → 原神',
  parsePreviewCommand('#预览测试前缀角色面板图2')?.game === 'gs' &&
  parsePreviewCommand('#预览测试前缀角色面板图2')?.roleName === ROLE)

finish()
