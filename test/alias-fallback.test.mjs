/**
 * 别名兜底（本地实现）
 *
 * 背景：别名来源优先走 Atlas-Plugin 门面（`Atlas-Plugin/modules/aliasApi.js`，见
 * `docs/模块-别名.md`），本地实现只在 Atlas 不可用 / 表为空 / 未命中时启用，
 * 同时承担「已知标准名」判定。这里钉住兜底的既有行为，**不依赖 Atlas**：
 * 表非空与预设别名、精确、大小写不敏感、模糊、未知输入原样返回、cfg 覆盖预设与坏行跳过。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, skip, pluginRoot, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { resolveRoleName, resolveRoleNameLocal, buildAliasMap, getAliasSource } = await import(mod('modules/alias.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()

// 图库目录夹具：本地兜底的别名分支要求「目标官方名目录存在」
const FIXTURE_ROLES = ['胡桃', '琴', 'TestCharZ']
const createdDirs = []
for (const role of FIXTURE_ROLES) {
  const dir = path.join(MIAO_PROFILE_LINK, 'normal-character', role)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    createdDirs.push(dir)
  }
}

try {
  buildAliasMap()

  // ---- 1. 预设别名 / 精确 / 大小写 / 模糊 / 未知 ----
  check('预设别名可解析（堂主 → 胡桃）', resolveRoleNameLocal('堂主') === '胡桃', resolveRoleNameLocal('堂主'))
  check('预设别名可解析（团长 → 琴）', resolveRoleNameLocal('团长') === '琴', resolveRoleNameLocal('团长'))
  check('精确匹配保持原名', resolveRoleNameLocal('胡桃') === '胡桃', resolveRoleNameLocal('胡桃'))
  check('大小写不敏感', resolveRoleNameLocal('testcharz') === 'TestCharZ', resolveRoleNameLocal('testcharz'))
  check('模糊匹配唯一命中', resolveRoleNameLocal('TestChar') === 'TestCharZ', resolveRoleNameLocal('TestChar'))
  check('未知且无目录时原样返回',
    resolveRoleNameLocal('不存在的角色ZZ') === '不存在的角色ZZ', resolveRoleNameLocal('不存在的角色ZZ'))

  // ---- 2. 对外入口（Atlas 与兜底都应给出同一答案）----
  check('对外入口：空输入返回空串', resolveRoleName('') === '' && resolveRoleName(undefined) === '')
  check('对外入口：父目录名被拒绝',
    resolveRoleName('..') === '' && resolveRoleName('./胡桃') === '', `${resolveRoleName('..')}|${resolveRoleName('./胡桃')}`)
  check('对外入口：含路径分隔符被拒绝',
    resolveRoleName('a/b') === '' && resolveRoleName('a\\b') === '', `${resolveRoleName('a/b')}|${resolveRoleName('a\\b')}`)
  check('对外入口：预设别名（传 game）', resolveRoleName('堂主', 'gs') === '胡桃', String(resolveRoleName('堂主', 'gs')))

  const source = getAliasSource()
  check('别名来源摘要可用',
    ['atlas', 'local'].includes(source.kind) && (source.kind === 'local' || Number.isFinite(source.keys)),
    JSON.stringify(source))

  // ---- 3. cfg 覆盖预设 / 坏行跳过（仅当 miao 的自定义 cfg 原本不存在）----
  const cfgFile = path.join(process.cwd(), 'plugins/miao-plugin/config/alias_gs.cfg')
  if (fs.existsSync(cfgFile)) {
    skip('miao 自定义别名 cfg 已存在，跳过 cfg 夹具断言（不改用户文件）')
  } else {
    try {
      fs.writeFileSync(cfgFile, ['琴：堂主', '这行没有冒号', '坏行::'].join('\n') + '\n', 'utf8')
      buildAliasMap() // 坏行只跳过，不抛出
      check('cfg 覆盖预设（堂主 → 琴）', resolveRoleNameLocal('堂主') === '琴', resolveRoleNameLocal('堂主'))
      check('坏行跳过后其余别名仍可用', resolveRoleNameLocal('团长') === '琴', resolveRoleNameLocal('团长'))
    } finally {
      fs.rmSync(cfgFile, { force: true })
      buildAliasMap()
      check('删除 cfg 后回到预设（堂主 → 胡桃）', resolveRoleNameLocal('堂主') === '胡桃', resolveRoleNameLocal('堂主'))
    }
  }

  // ---- 4. 第三方源里的角色也参与裁决（仅当运行时的 gallery_config.yaml 不存在）----
  // 图库配置是运行数据，绝不改写：缺失时才临时补一份夹具，测完删除
  const galleryCfg = path.join(pluginRoot, 'config/gallery_config.yaml')
  const tpRoot = path.join(ensureTmpDir(), 'alias-third-party')
  if (fs.existsSync(galleryCfg)) {
    console.log('  ⤵ 略过：运行中的 gallery_config.yaml 已存在，第三方源断言不写用户配置')
  } else {
    // 别名要指向「只在第三方源存在」的角色：该分支必须靠图库目录存在性裁决，模糊扫描救不了
    const aliasCfg = path.join(process.cwd(), 'plugins/miao-plugin/config/alias_gs.cfg')
    const tpRole = '仅第三方角色Z'
    try {
      fs.mkdirSync(path.join(tpRoot, tpRole), { recursive: true })
      fs.writeFileSync(path.join(tpRoot, tpRole, 'a.webp'), 'x')
      fs.writeFileSync(galleryCfg, JSON.stringify({ thirdParty: [{ name: '夹具第三方', dir: tpRoot, enabled: true }] }))
      if (!fs.existsSync(aliasCfg)) {
        fs.writeFileSync(aliasCfg, `${tpRole}：别名Z\n`)
        buildAliasMap()
      }
      check('第三方源内的角色可经别名解析（别名Z → 仅第三方角色Z）',
        resolveRoleNameLocal('别名Z') === tpRole, resolveRoleNameLocal('别名Z'))
      check('第三方源内角色参与模糊扫描',
        resolveRoleNameLocal('第三方角色') === tpRole, resolveRoleNameLocal('第三方角色'))
      fs.writeFileSync(galleryCfg, JSON.stringify({ thirdParty: [{ name: '夹具第三方', dir: tpRoot, enabled: false }] }))
      check('disabled 的第三方源不参与裁决',
        resolveRoleNameLocal('别名Z') === '别名Z', resolveRoleNameLocal('别名Z'))
    } finally {
      fs.rmSync(galleryCfg, { force: true })
      fs.rmSync(aliasCfg, { force: true })
      fs.rmSync(tpRoot, { recursive: true, force: true })
      buildAliasMap()
    }
  }
} finally {
  for (const dir of createdDirs.reverse()) fs.rmSync(dir, { recursive: true, force: true })
}

finish()
