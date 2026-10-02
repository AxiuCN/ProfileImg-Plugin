/**
 * 启动布局提示（私聊主人）：文本内容、24h 同状态节流、失败不记录（下次重试）、主人不可用时不发送
 * 全部用临时文件（test/.test-tmp），不触碰真实 data/layout-notice.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, checker, installFrameworkStubs, ensureTmpDir } from './_helper.mjs'

installFrameworkStubs()

const { shouldNotify, markNotified, buildNotice, notifyLayout, THROTTLE_MS } =
  await import(mod('model/layoutNotice.js'))

const tmp = ensureTmpDir()
const file = path.join(tmp, 'notice', 'layout-notice.json')
fs.rmSync(path.dirname(file), { recursive: true, force: true })

const { check, finish } = checker()
const NOW = 1_700_000_000_000

// ---- 1. 提示文本 ----
const legacy = buildNotice('legacy')
check('legacy 含 #迁移图库', legacy.includes('#迁移图库'))
check('legacy 含 #确认', legacy.includes('#确认'))
check('legacy 含重启要求', legacy.includes('重启'))
check('legacy 说明不删原图与自动备份', legacy.includes('不会删除') && legacy.includes('备份'))
check('legacy 说明节流', legacy.includes('24 小时'))
const fresh = buildNotice('fresh')
check('fresh 含 #图库初始化', fresh.includes('#图库初始化'))
check('fresh 含 #下载主图库', fresh.includes('#下载主图库'))
const srcPending = buildNotice('srcPending')
check('srcPending 说明源列表已更新', srcPending.includes('图库源列表已更新'))
check('srcPending 含重启要求', srcPending.includes('重启'))
check('srcPending 指向 #图库状态', srcPending.includes('#图库状态'))
check('ready 无提示文本', buildNotice('ready') === '')

// ---- 2. 节流逻辑 ----
check('首次应提示', shouldNotify('legacy', { file, now: NOW }) === true)
check('markNotified 写入成功', markNotified('legacy', { file, now: NOW }) === true)
check('刚提示过 → 不再提示', shouldNotify('legacy', { file, now: NOW + 1000 }) === false)
check('恰好超过 24h → 再次提示', shouldNotify('legacy', { file, now: NOW + THROTTLE_MS + 1 }) === true)
check('不同状态互不影响', shouldNotify('fresh', { file, now: NOW }) === true)
check('srcPending 与其他状态独立节流', shouldNotify('srcPending', { file, now: NOW }) === true)
check('srcPending 记录后自身节流生效',
  markNotified('srcPending', { file, now: NOW }) === true &&
  shouldNotify('srcPending', { file, now: NOW + 1000 }) === false &&
  shouldNotify('srcPending', { file, now: NOW + THROTTLE_MS + 1 }) === true)

// ---- 3. 发送（Bot 桩）----
const sent = []
globalThis.Bot = { sendMasterMsg: async (m) => { sent.push(m) }, masterQQ: [123456] }
check('发送成功返回 true', (await notifyLayout('legacy', { file, now: NOW + THROTTLE_MS + 1000 })) === true)
check('已推送给主人', sent.length === 1 && sent[0].includes('#迁移图库'))
check('发送后 24h 内不再发送', (await notifyLayout('legacy', { file, now: NOW + THROTTLE_MS + 2000 })) === false)
check('ready 状态不发送', (await notifyLayout('ready', { file, now: NOW + THROTTLE_MS + 3000 })) === false)

// ---- 4. 发送失败不记录时间戳（启动早期适配器未就绪）----
fs.rmSync(file, { force: true })
globalThis.Bot = { sendMasterMsg: async () => { throw new Error('adapter not ready') } }
check('发送失败返回 false', (await notifyLayout('legacy', { file, now: NOW })) === false)
check('失败不写时间戳 → 下次启动重试', shouldNotify('legacy', { file, now: NOW }) === true)

// ---- 5. 主人账号不可用 ----
delete globalThis.Bot
check('Bot 不可用时不发送且返回 false', (await notifyLayout('legacy', { file, now: NOW })) === false)

finish()
