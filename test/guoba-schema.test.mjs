/**
 * 锅巴 schema 与配置模板一致性
 *
 * 护栏目标（本次曾出现的问题）：
 * - 锅巴仍引导用户填写新布局已不使用的字段（normalPath / superPath）
 * - defSet 模板里的 ${变量} 在 guoba defaultValues 中找不到对应项（保存时渲染成空值）
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, pluginRoot, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { writeGalleryConfig, getGalleryConfig } = await import(mod('components/config.js'))
const guobaDir = path.join(pluginRoot, 'guoba')
const { check, finish } = checker()

// ---- 1. 各 schema 文件可加载且 getSchema() 返回数组 ----
const files = fs.readdirSync(guobaDir).filter(f => f.endsWith('.js') && f !== 'index.js')
check('guoba 目录含 schema 文件', files.length > 0, `${files.length} 个`)

const schemas = {}
for (const f of files) {
  try {
    const m = await import(mod(path.posix.join('guoba', f)))
    const fn = m.getSchema || m.default
    schemas[f] = typeof fn === 'function' ? fn() : null
    check(`guoba/${f}：getSchema() 返回数组`, Array.isArray(schemas[f]))
  } catch (e) {
    check(`guoba/${f} 可加载`, false, e.message)
  }
}

// ---- 2. 第三方图库 schema：不得再出现退役字段 ----
const tpFields = []
const collect = (arr) => {
  for (const item of arr || []) {
    if (item?.field) tpFields.push(item.field)
    if (item?.componentProps?.schemas) collect(item.componentProps.schemas)
  }
}
collect(schemas['thirdParty.js'])
check('thirdParty schema 不含退役字段 normalPath', !tpFields.includes('normalPath'), tpFields.join(','))
check('thirdParty schema 不含退役字段 superPath', !tpFields.includes('superPath'))
check('thirdParty schema 保留 name/dir/remoteUrl/enabled',
  ['name', 'dir', 'remoteUrl', 'enabled'].every(f => tpFields.includes(f)), tpFields.join(','))

// ---- 3. defSet/config.yaml 的 ${变量} 必须都能在 guoba defaultValues 找到 ----
const indexSrc = fs.readFileSync(path.join(guobaDir, 'index.js'), 'utf8')
const cfgTpl = path.join(pluginRoot, 'defSet', 'config.yaml')
const vars = [...fs.readFileSync(cfgTpl, 'utf8').matchAll(/\$\{(\w+)\}/g)].map(m => m[1])
const missing = vars.filter(v => !indexSrc.includes(v))
check('defSet/config.yaml 模板变量均有对应项', missing.length === 0, missing.join(', '))

// ---- 4. 列表类模板变量由渲染器处理 ----
const cfgSrc = fs.readFileSync(path.join(pluginRoot, 'components', 'config.js'), 'utf8')
for (const [file, variable, owner, ownerName] of [
  ['gallery_config.yaml', 'gallery_thirdParty', cfgSrc, 'components/config.js'],
  ['manager_config.yaml', 'managers_list', indexSrc, 'guoba/index.js']
]) {
  const p = path.join(pluginRoot, 'defSet', file)
  if (!fs.existsSync(p)) continue
  const content = fs.readFileSync(p, 'utf8')
  check(`defSet/${file} 含 \${${variable}}`, content.includes(`\${${variable}}`))
  check(`${ownerName} 处理 ${variable}`, owner.includes(variable))
}

// ---- 5. 写入配置：保留模板注释 + 可往返解析 ----
const tmp = ensureTmpDir()
const tmpCfg = path.join(tmp, 'cfg-write', 'gallery_config.yaml')
fs.rmSync(path.dirname(tmpCfg), { recursive: true, force: true })
const entry = { name: '测试图库', dir: 'E:/fan-repo', remoteUrl: '', enabled: true }
check('写入图库配置成功', writeGalleryConfig({ thirdParty: [entry] }, tmpCfg).ok === true)
const written = fs.readFileSync(tmpCfg, 'utf8')
check('写入保留模板注释（说明未被抹掉）', written.includes('登记要求'))
check('写入后可解析回原列表',
  JSON.stringify(getGalleryConfig(tmpCfg).thirdParty) === JSON.stringify([entry]))
writeGalleryConfig({ thirdParty: [] }, tmpCfg)
check('空列表写入仍为合法 YAML', JSON.stringify(getGalleryConfig(tmpCfg).thirdParty) === '[]')

finish()
