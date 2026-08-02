/** 第三方图库自动更新 Schema — 不含分组头，由 guoba/index.js 统一编排 */

export function getSchema () {
  return [
    {
      field: 'gallery.thirdPartyUpdate.enabled',
      label: '启用自动检查',
      bottomHelpMessage: '检测到第三方图库新版本时是否推送通知，关闭后仍可手动更新',
      component: 'Switch'
    },
    {
      field: 'gallery.thirdPartyUpdate.cron',
      label: '检查时间',
      helpMessage: '自动检查更新的 cron 表达式（留空 = 不自动检查）',
      component: 'EasyCron',
      componentProps: {
        defaultValue: '0 0 5 * * *',
        placeholder: '0 0 5 * * *'
      }
    },
    {
      field: 'gallery.thirdPartyUpdate.autoUpdate',
      label: '自动更新',
      bottomHelpMessage: '检测到更新后是否自动执行 git pull 并复制新图到主图库',
      component: 'Switch'
    }
  ]
}
