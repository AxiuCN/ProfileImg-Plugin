/**
 * 预览命令：面板立绘区尺寸与模板数据契约 + 序号定位
 *
 * 预览不依赖 miao 面板数据（自绘立绘区），因此这里断言的是本插件自己的契约：
 * 立绘区尺寸必须与 miao 面板 `.main-pic` 对齐（原神 1400×500 / 星铁 1400×520）、
 * 等比 contain 后的显示尺寸计算、文件名/来源/提示文案，以及序号不存在时的提示。
 *
 * 夹具建在默认图库（真实目录）下的临时角色目录，套件结束时清理。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mod, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { buildPreviewData, PANEL_BOX, PreviewProfileImg } = await import(mod('apps/previewProfileImg.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()

// ---- 1. 立绘区尺寸与显示尺寸契约 ----
check('原神立绘区 = miao 面板的 1400×500',
  PANEL_BOX.gs.width === 1400 && PANEL_BOX.gs.height === 500)
check('星铁立绘区 = miao 面板的 1400×520',
  PANEL_BOX.sr.width === 1400 && PANEL_BOX.sr.height === 520)

const gsData = buildPreviewData({
  roleName: '琴',
  n: 3,
  filePath: path.join('E:', 'repo', '琴_3_甲_乙.webp'),
  label: '主图库',
  isSr: false,
  imageSize: { width: 2000, height: 1000 }
})
check('原神：框尺寸与游戏名正确',
  gsData.boxWidth === 1400 && gsData.boxHeight === 500 && gsData.gameName === '原神',
  `${gsData.boxWidth}×${gsData.boxHeight} ${gsData.gameName}`)
check('等比 contain 显示尺寸按较小缩放比计算（2000×1000 → 1000×500 / 50%）',
  gsData.displaySize === '1000×500' && gsData.scalePct === '50%',
  `${gsData.displaySize} ${gsData.scalePct}`)
check('原图尺寸与文件名回填', gsData.imageSize === '2000×1000' && gsData.fileName === '琴_3_甲_乙.webp',
  `${gsData.imageSize} ${gsData.fileName}`)
check('图片用 file:// 绝对地址供模板引用',
  gsData.fileUrl === pathToFileURL(path.join('E:', 'repo', '琴_3_甲_乙.webp')).href, gsData.fileUrl)
check('提示文案指向 miao 原生命令（原神不带 #星铁）',
  gsData.note.includes('#琴面板 面板图3') && !gsData.note.includes('#星铁琴'), gsData.note)

const srData = buildPreviewData({
  roleName: '三月七',
  n: 1,
  filePath: path.join('E:', 'repo', '三月七_1.webp'),
  label: '米游社',
  isSr: true,
  imageSize: { width: 1000, height: 1040 }
})
check('星铁：框高与显示尺寸按 1400×520 计算（1000×1040 → 500×520 / 50%）',
  srData.boxHeight === 520 && srData.displaySize === '500×520' && srData.scalePct === '50%',
  `${srData.displaySize} ${srData.scalePct}`)
check('星铁提示带 #星铁 前缀', srData.note.includes('#星铁三月七面板 面板图1'), srData.note)
check('无尺寸信息时不显示尺寸行（不报错）',
  buildPreviewData({ roleName: '琴', n: 1, filePath: 'x.webp', label: '主图库' }).displaySize === '' &&
  buildPreviewData({ roleName: '琴', n: 1, filePath: 'x.webp', label: '主图库' }).imageSize === '')

// ---- 2. 序号定位（需要真实序号）----
const roleDir = path.join(MIAO_PROFILE_LINK, 'normal-character', '测试预览角色Z')
const app = new PreviewProfileImg()

try {
  fs.mkdirSync(roleDir, { recursive: true })
  fs.writeFileSync(path.join(roleDir, '测试预览角色Z_10001_甲_乙.webp'), 'x')

  const makeE = (msg) => ({ msg, isMaster: true, user_id: 1, replies: [], reply (m) { this.replies.push(m) } })

  const ok = await app.resolvePreviewTarget(makeE('#预览测试预览角色Z面板图10001'))
  check('命中序号 → 返回模板数据', ok.ok === true, JSON.stringify(ok.reply || ''))
  check('数据里带上角色名/序号/来源标签',
    ok.data.roleName === '测试预览角色Z' && ok.data.seq === 10001 && ok.data.label === '默认图库',
    `${ok.data.roleName} ${ok.data.seq} ${ok.data.label}`)

  const srTarget = await app.resolvePreviewTarget(makeE('#星铁预览测试预览角色Z面板图10001'))
  check('星铁前缀决定立绘区尺寸', srTarget.data.boxHeight === 520, String(srTarget.data.boxHeight))

  const miss = await app.resolvePreviewTarget(makeE('#预览测试预览角色Z面板图99999'))
  check('序号不存在 → 返回提示', miss.ok === false && miss.reply.includes('序号无效'), miss.reply)
  check('序号无效提示含角色与序号', miss.reply.includes('99999'), miss.reply)

  const bad = await app.resolvePreviewTarget(makeE('#预览测试预览角色Z面板图'))
  check('命令格式不匹配 → 给出用法', bad.ok === false && bad.reply.includes('用法'), bad.reply)
} finally {
  fs.rmSync(roleDir, { recursive: true, force: true })
}

finish()
