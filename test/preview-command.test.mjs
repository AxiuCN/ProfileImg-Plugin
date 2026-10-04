/**
 * 预览命令：改写为 miao 面板命令的契约 + 转发语义
 *
 * `#预览琴面板图3` 本身不渲染，而是把消息改写成 miao 的面板命令后返回 false 交给 miao。
 * 因此这里断言两件事：① 改写结果符合 miao 的语法（含原神 90 级 / 星铁 80 级的虚拟面板基准）；
 * ② 处理函数确实返回 false 且改写了 e.msg（返回 true 表示改由本插件自己回复）。
 *
 * 夹具建在默认图库（真实目录）下一个临时角色目录，套件结束时清理。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, skip } from './_helper.mjs'

installFrameworkStubs()

const { buildPanelPreviewMsg } = await import(mod('apps/previewProfileImg.js'))
const { MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()

// ---- 1. 改写契约（与 miao 之间唯一的接口）----
check('原神：注入 90 级虚拟面板基准',
  buildPanelPreviewMsg('琴', 3) === '#琴面板 面板图3 补90级', buildPanelPreviewMsg('琴', 3))
check('星铁：注入 80 级并保留 #星铁 前缀',
  buildPanelPreviewMsg('三月七', 1, true) === '#星铁三月七面板 面板图1 补80级', buildPanelPreviewMsg('三月七', 1, true))
check('默认图库的大序号原样传递',
  buildPanelPreviewMsg('琴', 10001) === '#琴面板 面板图10001 补90级', buildPanelPreviewMsg('琴', 10001))

// ---- 2. 转发语义（需要一个真实序号：夹具建在默认图库的临时角色目录）----
const roleDir = path.join(MIAO_PROFILE_LINK, 'normal-character', '测试预览角色Z')
const { PreviewProfileImg } = await import(mod('apps/previewProfileImg.js'))
const app = new PreviewProfileImg()

try {
  fs.mkdirSync(roleDir, { recursive: true })
  fs.writeFileSync(path.join(roleDir, '测试预览角色Z_10001_甲_乙.webp'), 'x')

  const makeE = (msg) => ({ msg, isMaster: true, user_id: 1, replies: [], reply (m) { this.replies.push(m) } })

  const e1 = makeE('#预览测试预览角色Z面板图10001')
  const ret1 = app.previewBySlot(e1)
  check('预览命中序号 → 返回 false 交给 miao', ret1 === false, String(ret1))
  check('e.msg 被改写为 miao 面板命令',
    e1.msg === '#测试预览角色Z面板 面板图10001 补90级', e1.msg)
  check('未自行回复', e1.replies.length === 0, JSON.stringify(e1.replies))

  const e2 = makeE('#星铁预览测试预览角色Z面板图10001')
  app.previewBySlot(e2)
  check('星铁前缀决定注入等级',
    e2.msg === '#星铁测试预览角色Z面板 面板图10001 补80级', e2.msg)

  const e3 = makeE('#预览测试预览角色Z面板图99999')
  const ret3 = app.previewBySlot(e3)
  check('序号不存在 → 自行回复并终止', ret3 !== false && e3.replies.length === 1, JSON.stringify(e3.replies))
  check('序号无效提示含角色与序号', String(e3.replies[0]).includes('99999'), String(e3.replies[0]))
} finally {
  fs.rmSync(roleDir, { recursive: true, force: true })
}

finish()
