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