import { getLayoutState } from './migrateMultiSrc.js'

/**
 * 布局守卫（强制迁移）
 *
 * 本插件已完成「多图库源布局」切换，旧布局（junction 聚合）不再支持：
 *   legacy — 必须发送 #迁移图库 升级（提示后拒绝执行）
 *   fresh  — 未初始化，需先 #图库初始化（allowFresh 为 true 的下载/初始化类命令放行）
 *   ready  — 正常执行
 *
 * 用法：图库数据类命令（上传/删除/列表/可视化/屏蔽/重命名/状态）开头调用；
 * 初始化与下载类命令传 { allowFresh: true }。
 *
 * @param {object} e - 消息事件（需具备 reply）
 * @param {{ allowFresh?: boolean }} [opts]
 * @returns {Promise<boolean>} true = 放行；false = 已回复拦截
 */
export async function guardLayout (e, opts = {}) {
  const { allowFresh = false } = opts
  const state = getLayoutState()
  if (state === 'legacy') {
    await e.reply([
      '[面板图图库管理器]\n',
      '检测到旧版图库布局（junction 聚合），本版本已切换为多图库源布局。\n',
      '请发送 #迁移图库 完成升级（升级后需重启 Yunzai）。'
    ].join(''))
    return false
  }
  if (state === 'fresh' && !allowFresh) {
    await e.reply('[面板图图库管理器]\n图库尚未初始化，请先发送 #图库初始化。')
    return false
  }
  return true
}
