/** 私聊通知主人 */
export function notifyMaster(msg) {
  if (Bot.masterQQ && Bot.masterQQ.length > 0) {
    Bot.masterQQ.forEach(qq => Bot.pickFriend(qq).sendMsg(msg))
  }
}

/**
 * 重启引导文案
 * 图库源列表（profileImgSrc）只在 miao 模块加载时读取一次，变更后必须重启才生效
 * @returns {string}
 */
export function restartHint () {
  return '\n⚠️ 请重启 Yunzai 使图库变更生效（miao 只在启动时读取图库源列表）'
}

/**
 * 图库源同步结果 → 用户提示文本（下载 / 更新 / 删除类命令统一使用）
 * @param {{ ok: boolean, changed: boolean, list: string[], skipped: Array<{label: string, reason: string}>, error?: string }} synced
 *   syncProfileImgSrc() 的返回值
 * @returns {string} 追加到回复末尾的提示文本
 */
export function buildSyncReport (synced) {
  if (!synced?.ok) return `\n⚠️ 注册图库源失败：${synced?.error || '未知错误'}`
  const lines = [`\n当前已注册图库源：${synced.list.length} 个（含默认图库）`]
  if (synced.skipped.length) {
    // 「已配置但未就绪」的条目：目录不存在或结构不符；不影响已注册的源
    lines.push(`\nℹ️ 另有 ${synced.skipped.length} 个已配置图库未注册（与本次操作无关）：`)
    for (const s of synced.skipped) {
      lines.push(`  · ${s.label}：${s.reason}`)
      lines.push('    修复：确认仓库已完整克隆（可用 #下载第三方图库 <URL> 重新下载，或 #删除第三方图库 <名> 后重下），目录需为 normal-character/{角色}/ 或平铺 {角色}/')
    }
  }
  if (synced.changed) lines.push(restartHint())
  return lines.join('')
}