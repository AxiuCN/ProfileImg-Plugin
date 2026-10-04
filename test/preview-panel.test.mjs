/**
 * 面板图预览：虚拟面板构造 / 渲染数据组装 / 立绘定位与路径转换 / 失败分支
 *
 * 预览已改为「本插件内用虚拟数据渲染 miao 面板模板」，因此套件直接测数据层：
 *   - `buildVirtualProfile()` 能否在**不发请求、不落账号数据**的前提下造出可用面板；
 *   - `buildPanelRenderData()` 是否给齐 miao 模板的必需字段（缺字段模板会抛错）；
 *   - `findSplash()` / `toTemplatePath()` 的序号定位与图片路径规则。
 * 真实截图（puppeteer）不在此覆盖，渲染失败会由命令侧兜底提示。
 *
 * 夹具建在默认图库（真实目录）下的临时角色目录，套件结束时清理。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, appRoot, checker, installFrameworkStubs, requireMiaoPlugin, skip } from './_helper.mjs'

installFrameworkStubs()
requireMiaoPlugin()

const { loadMiao, MIAO_RES_DIR } = await import(mod('modules/preview/miao.js'))
const { buildVirtualProfile, FAKE_UID } = await import(mod('modules/preview/virtual.js'))
const { buildPanelRenderData, buildPanelDmgCalc } = await import(mod('modules/preview/renderData.js'))
const { findSplash, toTemplatePath } = await import(mod('modules/preview/splash.js'))
const { renderPanelPreview } = await import(mod('modules/preview/index.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const miao = await loadMiao()
if (!miao) skip('miao-plugin 内部模块或面板模板不可用')

const { check, finish } = checker()

// ---- 1. 虚拟面板构造（原神 / 星铁）----
const gsChar = miao.Character.get('琴')
const gsProfile = buildVirtualProfile({ miao, char: gsChar })
check('原神：虚拟面板构造成功（isProfile）', !!gsProfile?.isProfile, String(!!gsProfile?.isProfile))
check('原神：不落账号数据（未生成 PlayerData 文件）',
  !fs.existsSync(path.join(appRoot, 'data', 'PlayerData', 'gs', `${FAKE_UID}.json`)))
check('原神：等级 90 且属性已算出', gsProfile?.level === 90 && gsProfile?.attr?.atk > 0,
  `level=${gsProfile?.level} atk=${Math.round(gsProfile?.attr?.atk || 0)}`)
check('原神：天赋为伪造等级 a9/e9/q9',
  gsProfile?.talent?.a?.level === 9 && gsProfile?.talent?.e?.level === 9 && gsProfile?.talent?.q?.level === 9)
check('原神：伪造圣遗物生效（魔女套）',
  JSON.stringify(gsProfile?.artis?.sets || {}).includes('炽烈的炎之魔女'),
  JSON.stringify(gsProfile?.artis?.sets))
check('原神：武器可用（西风系兜底）', !!gsProfile?.weapon?.name, String(gsProfile?.weapon?.name))

const srChar = miao.Character.get('遐蝶')
const srProfile = buildVirtualProfile({ miao, char: srChar })
check('星铁：虚拟面板构造成功', !!srProfile?.isProfile)
check('星铁：等级 80、promote 不越界', srProfile?.level === 80 && srProfile?.promote === 6,
  `level=${srProfile?.level} promote=${srProfile?.promote}`)
check('星铁：伪造圣遗物 6 件（遗器 4 + 位面饰品 2）',
  Object.keys(srProfile?.artis?.artis || {}).length === 6 && JSON.stringify(srProfile?.artis?.sets || {}).includes('过客'),
  JSON.stringify(srProfile?.artis?.sets))
check('星铁：默认光锥按命途取到', !!srProfile?.weapon?.name, String(srProfile?.weapon?.name))

// ---- 2. 渲染数据组装（miao 模板的必需字段）----
const splash = 'profile/normal-character/%E7%90%B4/x.webp'
const gsData = buildPanelRenderData({
  miao, char: gsChar, profile: gsProfile, splash, dmgCalc: {}, changeProfile: '测试横幅'
})
check('模板必需字段齐备（data/talent/attr/artisDetail/artisKeyTitle/dmgCalc）',
  !!(gsData.data && gsData.data.talent && gsData.attr && gsData.artisDetail && gsData.artisKeyTitle && gsData.dmgCalc))
check('属性带 Base / Plus（模板按 key 取值）',
  typeof gsData.attr.hp === 'string' && gsData.attr.hpBase !== undefined && gsData.attr.cpctPlus !== undefined)
check('圣遗物评分可算', typeof gsData.artisDetail.mark === 'string' && !!gsData.artisDetail.charWeight)
check('立绘被替换为该序号的面板图', gsData.data.costumeSplash === splash, String(gsData.data.costumeSplash))
check('数据源与横幅标注为虚拟数据', gsData.data.dataSource === '虚拟预览' && gsData.changeProfile === '测试横幅')
check('UID 为伪造值 / 模式为 profile',
  gsData.uid === FAKE_UID && gsData.mode === 'profile' && gsData.game === 'gs')

const gsDmg = await buildPanelDmgCalc(miao, gsProfile, gsChar)
check('虚拟面板伤害计算可用', Array.isArray(gsDmg.dmgData) && gsDmg.dmgData.length > 0,
  `dmgData=${gsDmg.dmgData?.length}`)
check('无伤害规则时安全跳过（不抛错、返回空对象）',
  JSON.stringify(await buildPanelDmgCalc(miao, { hasDmg: false }, gsChar)) === '{}')

const srData = buildPanelRenderData({
  miao, char: srChar, profile: srProfile, splash, dmgCalc: {}, changeProfile: '测试横幅'
})
check('星铁：行迹矩阵为 9 格', Array.isArray(srData.data.treeData) && srData.data.treeData.length === 9,
  String(srData.data.treeData?.length))
check('星铁：属性按星铁口径（含 speed）', srData.attr.speed !== undefined && srData.attr.mastery === undefined)

// ---- 3. 立绘定位与路径转换 ----
const roleDir = path.join(MIAO_PROFILE_LINK, 'normal-character', '测试预览角色Z')
try {
  fs.mkdirSync(roleDir, { recursive: true })
  fs.writeFileSync(path.join(roleDir, '测试预览角色Z_10001_甲_乙.webp'), 'x')

  check('立绘定位：命中序号返回该图',
    findSplash('测试预览角色Z', 10001)?.name === '测试预览角色Z_10001_甲_乙.webp',
    String(findSplash('测试预览角色Z', 10001)?.name))
  check('立绘定位：序号不存在返回 null（避免回退随机图）', findSplash('测试预览角色Z', 99999) === null)
} finally {
  fs.rmSync(roleDir, { recursive: true, force: true })
}

const sameDrive = toTemplatePath(path.join(MIAO_RES_DIR, 'profile', 'normal-character', '琴', '琴_1_甲_乙.webp'))
check('同盘：转成相对 miao resources 的路径并编码文件名',
  sameDrive.startsWith('profile/normal-character/') && sameDrive.includes('%E7%90%B4_1_'),
  sameDrive)
if (process.platform === 'win32') {
  const cross = toTemplatePath('D:/gallery/琴/琴_1_甲_乙.webp', 'C:/other')
  check('跨盘：转成 file:// URL（相对路径算不出来时）', cross.startsWith('file://'), cross)
}

// ---- 4. 失败分支：明确提示，不渲染、不改写消息 ----
const noRole = await renderPanelPreview({ e: null, roleName: '不存在的角色ZZZ', n: 1 })
check('角色不存在 → 明确提示且不渲染',
  noRole.ok === false && noRole.msg.includes('不存在的角色ZZZ'), String(noRole.msg))
const badN = await renderPanelPreview({ e: null, roleName: '琴', n: 99999 })
check('序号不存在 → 明确提示（不交给 miao 随机取图）',
  badN.ok === false && badN.msg.includes('99999'), String(badN.msg))

finish()
