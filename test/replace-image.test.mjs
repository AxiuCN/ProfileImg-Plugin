/**
 * 替换面板图：只换图片字节，文件名（序号 / 版权）不动
 *
 * 夹具建在默认图库（真实目录）下的临时角色目录，套件结束时清理；
 * 图片来自 data: URL（fetch 支持），不联网。
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { mod, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { UploadWithCompress } = await import(mod('apps/upload.js'))
const { detectFormat } = await import(mod('modules/compress.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()
const app = new UploadWithCompress()

const role = '测试替换角色Z'
const roleDir = path.join(MIAO_PROFILE_LINK, 'normal-character', role)
const fileName = `${role}_10001_甲_乙.webp`
const filePath = path.join(roleDir, fileName)

/** 造一张真实图片（sharp 可解码），返回 data URL */
async function imageDataUrl (format, color) {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
    [format === 'png' ? 'png' : 'webp']()
    .toBuffer()
  return `data:image/${format};base64,${buf.toString('base64')}`
}

const makeE = (msg, url) => ({
  msg,
  isMaster: true,
  user_id: 1,
  message: url ? [{ type: 'image', url }] : [],
  replies: [],
  reply (m) { this.replies.push(m) }
})

try {
  fs.mkdirSync(roleDir, { recursive: true })
  const original = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
    .webp().toBuffer()
  fs.writeFileSync(filePath, original)

  // ---- 1. 正常替换：扩展名不变，字节换成目标格式 ----
  const pngUrl = await imageDataUrl('png', '#00ff00')
  const e1 = makeE(`#替换${role}面板图10001`, pngUrl)
  const ret1 = await app.replaceBySlot(e1)
  check('替换后不继续交给后续插件（非 false）', ret1 !== false, String(ret1))
  check('回复说明替换结果', String(e1.replies[0] || '').includes('已替换') && String(e1.replies[0]).includes(fileName), String(e1.replies[0]))
  check('文件名与序号未变（仍只有原文件）',
    fs.readdirSync(roleDir).join(',') === fileName, fs.readdirSync(roleDir).join(','))
  const after = fs.readFileSync(filePath)
  check('字节已换掉', !after.equals(original))
  check('PNG 源被转成目标扩展名格式（webp）', await detectFormat(after) === 'webp', await detectFormat(after))

  // ---- 2. 未找到序号 / 未带图片 ----
  const e2 = makeE(`#替换${role}面板图99999`, pngUrl)
  await app.replaceBySlot(e2)
  check('序号不存在 → 提示序号无效', String(e2.replies[0] || '').includes('序号无效'), String(e2.replies[0]))

  const e3 = makeE(`#替换${role}面板图10001`, null)
  await app.replaceBySlot(e3)
  check('未带图片 → 提示用法', String(e3.replies[0] || '').includes('未找到图片'), String(e3.replies[0]))

  // ---- 3. 图片字节仍是原格式时也不改变扩展名语义 ----
  const webpUrl = await imageDataUrl('webp', '#0000ff')
  const e4 = makeE(`#替换${role}面板图10001`, webpUrl)
  await app.replaceBySlot(e4)
  const after2 = fs.readFileSync(filePath)
  check('同格式替换同样生效且格式不变',
    !after2.equals(after) && await detectFormat(after2) === 'webp', await detectFormat(after2))
} finally {
  fs.rmSync(roleDir, { recursive: true, force: true })
}

finish()
