import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 启动布局提示（私聊主人）
 *
 * 触发场景：
 *   - legacy：检测到旧版布局（需迁移）
 *   - fresh：未初始化（需 #图库初始化）
 *   - srcPending：启动时按配置重新注册了图库源，需重启才被 miao 读取
 * 目标：用户不使用管理/查看命令、也不看日志时，仍能知道需要操作
 *
 * 节流：同一状态 24 小时内最多提示一次（避免频繁重启被反复打扰）；
 * 发送成功才记录时间戳，发送失败（适配器未就绪等）下次启动会重试。
 */
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
/** 提示记录文件（git-ignored 的 data/ 目录） */
const NOTICE_FILE = path.join(DATA_DIR, 'layout-notice.json')
/** 同一状态的提示节流窗口 */
const THROTTLE_MS = 24 * 60 * 60 * 1000

/**
 * 是否应发送提示（同状态节流）
 * @param {'legacy'|'fresh'|'srcPending'} state
 * @param {{ file?: string, now?: number }} [opts]
 * @returns {boolean}
 */
function shouldNotify (state, opts = {}) {
  const file = opts.file || NOTICE_FILE
  const now = opts.now ?? Date.now()
  try {
    if (!fs.existsSync(file)) return true
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
    const last = Number(data[state] || 0)
    return !last || (now - last) > THROTTLE_MS
  } catch {
    return true
  }
}

/**
 * 记录某状态的提示时间
 * @param {'legacy'|'fresh'|'srcPending'} state
 * @param {{ file?: string, now?: number }} [opts]
 * @returns {boolean}
 */
function markNotified (state, opts = {}) {
  const file = opts.file || NOTICE_FILE
  const now = opts.now ?? Date.now()
  try {
    let data = {}
    if (fs.existsSync(file)) {
      try {
        data = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
      } catch {
        data = {}
      }
    }
    data[state] = now
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (e) {
    logger?.warn('[ProfileImg-Plugin] 写入布局提示记录失败:', e.message)
    return false
  }
}

/**
 * 生成提示文本
 * @param {'legacy'|'fresh'|'srcPending'} state
 * @returns {string} 非提示状态返回空串
 */
function buildNotice (state) {
  if (state === 'legacy') {
    return [
      '[面板图图库管理器] 需要升级图库布局',
      '',
      '检测到本机仍是旧版图库布局（junction 聚合）。当前版本已切换为 miao 多图库源布局，',
      '旧布局下图库相关命令会被拦截，需先完成迁移。',
      '',
      '操作步骤：',
      '1. 发送 #迁移图库 查看预检报告（只读，不会改动数据）',
      '2. 确认无误后发送 #确认 执行迁移',
      '3. 迁移完成后【立即重启 Yunzai】，miao 才会读取新的图库源',
      '',
      '说明：',
      '· 迁移不会删除主图库 / 第三方仓库中的原图，旧聚合目录内容保留在主仓库',
      '· 会自动备份 map.json、miao profile.js、gallery_config.yaml 到 gallery/backup/migrate-<时间>/',
      '· 默认图库文件名会规范为 default 段位，原文件名保留在「」备注段',
      '· 本提醒 24 小时内最多发送一次，迁移完成后不再发送'
    ].join('\n')
  }
  if (state === 'fresh') {
    return [
      '[面板图图库管理器] 图库尚未就绪',
      '',
      '当前未注册任何自有图库源，面板图图库功能尚未启用。',
      '',
      '请发送 #下载主图库 下载主图库图片（第三方图库用 #下载第三方图库 <Git地址>）；',
      '也可发送 #图库初始化 检查并补齐初始化项（目录 / 配置 / 图库源登记）。',
      '',
      '· 本提醒 24 小时内最多发送一次，完成下载后不再发送'
    ].join('\n')
  }
  if (state === 'srcPending') {
    return [
      '[面板图图库管理器] 图库源列表已更新',
      '',
      '本次启动检测到 miao 图库源列表与配置不一致，已按配置重新注册。',
      'miao 只在模块加载时读取一次图库源列表，因此需重启 Yunzai 才会生效。',
      '',
      '重启后发送 #图库状态 可确认已注册的图库源。',
      '',
      '· 本提醒 24 小时内最多发送一次'
    ].join('\n')
  }
  return ''
}

/**
 * 发送启动提示（带节流；发送成功才记录）
 * @param {'legacy'|'fresh'|'srcPending'} state
 * @param {{ file?: string, now?: number }} [opts]
 * @returns {Promise<boolean>} 是否已发送
 */
export async function notifyLayout (state, opts = {}) {
  const msg = buildNotice(state)
  if (!msg) return false
  if (!shouldNotify(state, opts)) return false

  try {
    if (typeof Bot !== 'undefined' && Bot?.sendMasterMsg) {
      await Bot.sendMasterMsg(msg)
    } else if (typeof Bot !== 'undefined' && Bot?.masterQQ?.length) {
      for (const qq of Bot.masterQQ) await Bot.pickFriend(qq).sendMsg(msg)
    } else {
      logger?.warn('[ProfileImg-Plugin] 主人账号不可用，跳过布局提示')
      return false
    }
    markNotified(state, opts)
    return true
  } catch (e) {
    // 适配器未就绪 / 风控等：不记录时间戳，下次启动重试
    logger?.warn('[ProfileImg-Plugin] 布局提示发送失败（下次启动重试）:', e.message)
    return false
  }
}
