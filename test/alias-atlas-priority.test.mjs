/**
 * 别名解析：Atlas 双向候选下的「已登记标准名优先」
 *
 * 背景：Atlas 门面的别名表是**双向**的（只存对侧候选名、不记方向），给标准名「胡桃」
 * 配上别名「堂主」后，`resolveAlias('胡桃')` 会返回对侧候选「堂主」。图库里两个目录
 * 并存时，先遍历候选会把标准名改查到别名目录（Atlas 接入引入的回归）。这里钉住：
 *   1. 已登记标准名保持自身目录
 *   2. 别名仍解析到标准名（标准名优先不能反过来盖住别名）
 *   3. Atlas 表重建（自定义 cfg 增删）后本地标准名判定随之失效
 *
 * 前置：真实 Atlas-Plugin 且别名表非空，否则跳过；miao 自定义别名 cfg 已存在时
 * 跳过（断言需要临时登记别名，不改用户文件）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mod, checker, installFrameworkStubs, skip, appRoot } from './_helper.mjs'

installFrameworkStubs()

const atlasApiFile = path.join(appRoot, 'plugins/Atlas-Plugin/modules/aliasApi.js')
const atlasLoaderFile = path.join(appRoot, 'plugins/Atlas-Plugin/model/AliasLoader.js')
if (!fs.existsSync(atlasApiFile)) skip('未安装 Atlas-Plugin')
const atlasApi = await import(pathToFileURL(atlasApiFile).href)
let atlasKeys = 0
try {
  atlasKeys = atlasApi.getAliasStatus()?.keys || 0
} catch { /* 门面异常按不可用处理 */ }
if (atlasKeys === 0) skip('Atlas 别名表为空')

const cfgFile = path.join(process.cwd(), 'plugins/miao-plugin/config/alias_gs.cfg')
if (fs.existsSync(cfgFile)) skip('miao 自定义别名 cfg 已存在，跳过（不写用户文件）')

const { resolveRoleName, buildAliasMap, getAliasSource } = await import(mod('modules/alias.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))
const { reloadAliasMap } = await import(pathToFileURL(atlasLoaderFile).href)

const { check, finish } = checker()

// 断言前提：本次确实走 Atlas 路径，否则测的是兜底，结论不成立
const source = getAliasSource()
check('别名来源为 Atlas（否则本套件无意义）', source.kind === 'atlas', JSON.stringify(source))
buildAliasMap() // 与 index.js 启动一致：本地表同时承担标准名判定

// 夹具：标准名 胡桃、别名 堂主、热更新用的 琴，都建在默认图库下
const typeDir = path.join(MIAO_PROFILE_LINK, 'normal-character')
const FIXTURE_ROLES = ['胡桃', '堂主', '琴']
const createdDirs = []
for (const role of FIXTURE_ROLES) {
  const dir = path.join(typeDir, role)
  if (fs.existsSync(dir)) continue
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${role}_10001_甲_乙.webp`), 'x')
  createdDirs.push(dir)
}

try {
  try {
    // 登记「胡桃：堂主」：Atlas 的表随之变成双向，查标准名会拿到对侧候选
    fs.writeFileSync(cfgFile, '胡桃：堂主\n', 'utf8')
    reloadAliasMap()
    const candidates = atlasApi.resolveAlias('胡桃', 'gi').candidates
    check('Atlas 对标准名给出对侧候选（含堂主）', candidates.includes('堂主'), JSON.stringify(candidates))

    // ---- 1. 标准名不被反向候选改查 ----
    check('标准名保持自身目录（胡桃 与 堂主 并存时仍取胡桃）',
      resolveRoleName('胡桃', 'gs') === '胡桃', resolveRoleName('胡桃', 'gs'))
    check('别名仍解析到标准名（堂主 → 胡桃）',
      resolveRoleName('堂主', 'gs') === '胡桃', resolveRoleName('堂主', 'gs'))

    // ---- 2. Atlas 表重建后本地标准名判定要跟着失效 ----
    fs.writeFileSync(cfgFile, '琴：胡桃\n', 'utf8')
    reloadAliasMap()
    check('表重建后标准名改判到 cfg 指定的角色（胡桃 → 琴）',
      resolveRoleName('胡桃', 'gs') === '琴', resolveRoleName('胡桃', 'gs'))
  } finally {
    fs.rmSync(cfgFile, { force: true })
    reloadAliasMap()
  }
  check('删除 cfg 后标准名恢复（胡桃）', resolveRoleName('胡桃', 'gs') === '胡桃', resolveRoleName('胡桃', 'gs'))
} finally {
  for (const dir of createdDirs.reverse()) fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(cfgFile, { force: true })
  // 逆序清理创建出的空目录链（只删空目录）
  for (const d of [typeDir, MIAO_PROFILE_LINK]) {
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d)
    } catch { /* 非空则保留 */ }
  }
}

finish()