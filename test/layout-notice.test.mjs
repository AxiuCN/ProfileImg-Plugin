/**
 * 启动提示（私聊主人）：文案内容、24h 同状态节流、失败不记录（下次重试）、主人不可用不发送
 * 只通过公开入口 notifyLayout 断言行为，全部用临时文件（test/.test-tmp），不触碰真实 data/
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { notifyLayout } = await import(mod('model/layoutNotice.js'))

const tmp = ensureTmpDir()
const file = path.join(tmp, 'notice', 'layout-notice.json')
fs.rmSync(path.dirname(file), { recursive: true, force: true })

const { check, finish } = checker()
const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000
const sent = []
globalThis.Bot = { sendMasterMsg: async (m) => { sent.push(m) }, masterQQ: [123456] }

/** 发送并返回文本（未发送时返回空串） */
async function send (state, now) {
  const before = sent.length
  const ok = await notifyLayout(state, { file, now })
  return { ok, text: sent.length > before ? sent[sent.length - 1] : '' }
}

// ---- 1. 三种状态的文案与节流（同一状态 24h 内只发一次）----
const legacy = await send('legacy', NOW)
check('legacy 提示已发送', legacy.ok === true)
check('legacy 含 #迁移图库 与 #确认', legacy.text.includes('#迁移图库') && legacy.text.includes('#确认'))
check('legacy 说明不删原图与自动备份', legacy.text.includes('不会删除') && legacy.text.includes('备份'))
check('legacy 说明节流窗口', legacy.text.includes('24 小时'))
check('同状态 24h 内不再发送', (await send('legacy', NOW + 1000)).ok === false)
check('超过 24h 后再次发送', (await send('legacy', NOW + DAY + 1)).ok === true)

const fresh = await send('fresh', NOW + 10)
check('fresh 含 #图库初始化 与 #下载主图库',
  fresh.text.includes('#图库初始化') && fresh.text.includes('#下载主图库'))

const pending = await send('srcPending', NOW + 20)
check('srcPending 说明源列表已更新并指向 #图库状态',
  pending.text.includes('图库源列表已更新') && pending.text.includes('#图库状态'))
check('srcPending 含重启要求', pending.text.includes('重启'))
check('不同状态各自独立节流（fresh 未被 legacy 影响）', (await send('fresh', NOW + 30)).ok === false)

check('ready 状态无提示且不发送', (await send('ready', NOW + 40)).ok === false)

// ---- 2. 发送失败不记录时间戳（启动早期适配器未就绪）----
fs.rmSync(file, { force: true })
globalThis.Bot = { sendMasterMsg: async () => { throw new Error('adapter not ready') } }
check('发送失败返回 false', (await send('legacy', NOW)).ok === false)
globalThis.Bot = { sendMasterMsg: async (m) => { sent.push(m) }, masterQQ: [123456] }
check('失败未写时间戳 → 下次重试可发送', (await send('legacy', NOW)).ok === true)

// ---- 3. 主人账号不可用 ----
delete globalThis.Bot
check('主人账号不可用时不发送且返回 false', (await notifyLayout('legacy', { file: path.join(tmp, 'notice', 'x.json'), now: NOW })) === false)

finish()
