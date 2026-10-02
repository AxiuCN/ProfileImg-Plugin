/**
 * 多源面板图索引：源列表、跨源读取、段位寻址、.bak 排除
 *
 * 临时夹具建在真实默认图库（miao-plugin/resources/profile）下的测试角色目录，
 * 套件结束按 finally 完全清理（含空目录链）
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, requireMiaoPlugin, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()
requireMiaoPlugin()

const { listRoleImages, listRoleBlocked, findImageByN, getSources, countSourceImages } =
  await import(mod('model/galleryIndex.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()
const tmpDir = ensureTmpDir()

// ---- 只读断言（不依赖夹具）----
const sources = getSources()
check('getSources 含默认图库源（指向 resources/profile）', sources.some(s => s.kind === 'default' && s.dir === MIAO_PROFILE_LINK))
check('默认图库源排在首位', sources[0]?.kind === 'default')
check('源列表元素含 kind/label/dir/level', sources.every(s => s.kind && s.label && s.dir && s.level))
check('未知角色图片列表为空', listRoleImages('不存在的角色xyz').length === 0)
check('未知角色屏蔽列表为空', listRoleBlocked('不存在的角色xyz').length === 0)
check('未知角色按序号查为空', findImageByN('不存在的角色xyz', 'normal', 1) === null)
check('countSourceImages 返回数组', Array.isArray(countSourceImages()))

// ---- 临时夹具：默认图库内一个测试角色目录 ----
const ROLE = '__profileimg_test_role__'
const profileDir = MIAO_PROFILE_LINK
const typeDir = path.join(profileDir, 'normal-character')
const dir = path.join(typeDir, ROLE)

try {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${ROLE}_10001_甲_乙_「${ROLE}_1_甲_乙」.webp`), 'x')
  fs.writeFileSync(path.join(dir, `${ROLE}_10003_丙_丁.webp`), 'x')
  fs.writeFileSync(path.join(dir, `${ROLE}_10002_戊_己.webp.bak`), 'x')
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'x')

  const imgs = listRoleImages(ROLE, 'normal')
  check('夹具：读到 2 张图（.bak 与 txt 被排除）', imgs.length === 2, `实际 ${imgs.length}`)
  check('夹具：按段位升序（10001 → 10003）', imgs.map(i => i.displayN).join(',') === '10001,10003', `实际 ${imgs.map(i => i.displayN).join(',')}`)
  check('夹具：来源标记为默认图库', imgs.every(i => i.source === 'default' && i.label === '默认图库'))
  check('夹具：findImageByN 命中 10001', findImageByN(ROLE, 'normal', 10001)?.name.startsWith(`${ROLE}_10001_`) === true)

  const blocked = listRoleBlocked(ROLE, 'normal')
  check('夹具：屏蔽列表读到 1 个 .bak', blocked.length === 1 && blocked[0].baseName === `${ROLE}_10002_戊_己.webp`, `实际 ${JSON.stringify(blocked.map(b => b.baseName))}`)

  const stat = countSourceImages().find(s => s.kind === 'default')
  check('夹具：统计包含该角色', (stat?.images || 0) >= 2, `实际 images=${stat?.images}`)
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
  // 逆序清理创建出的空目录链（只删空目录，不误删既有内容）
  for (const d of [typeDir, profileDir]) {
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d)
    } catch { /* 非空或有占用则保留 */ }
  }
}

check('夹具已清理（测试角色目录不存在）', !fs.existsSync(dir))

// ---- 一层分组源的读取入口（第三方支持，主仓库不支持）----
const groupRoot = path.join(tmpDir, 'group-index')
fs.rmSync(groupRoot, { recursive: true, force: true })
for (const [group, role] of [['gs-character', '琴'], ['sr-character', '三月七']]) {
  fs.mkdirSync(path.join(groupRoot, group, role), { recursive: true })
  fs.writeFileSync(path.join(groupRoot, group, role, 'a.webp'), 'x')
}
const grouped = getSources({ thirdParty: [{ name: 'MBT', dir: groupRoot, enabled: true }] })
const tpSources = grouped.filter(s => s.kind === 'thirdParty')
check('第三方分组源展开为两个源', tpSources.length === 2, JSON.stringify(tpSources.map(s => s.label)))
check('分组源标签用原始目录名且 level 为 flat',
  tpSources.some(s => s.label === 'MBT·gs-character' && s.level === 'flat') &&
  tpSources.some(s => s.label === 'MBT·sr-character' && s.level === 'flat'),
  JSON.stringify(tpSources.map(s => `${s.label}:${s.level}`)))
check('分组源目录指向子图库',
  tpSources.every(s => path.basename(path.dirname(s.dir)) === 'group-index'),
  JSON.stringify(tpSources.map(s => s.dir)))
const noGroup = getSources({ thirdParty: [{ name: '空', dir: path.join(tmpDir, 'nope'), enabled: true }] })
check('不可直读的第三方源不进源列表', noGroup.every(s => s.kind !== 'thirdParty') || noGroup.some(s => s.label === '空') === false)
fs.rmSync(groupRoot, { recursive: true, force: true })

finish()
