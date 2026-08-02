/** 主图库（仓库 0）Schema — 不含分组头，由 guoba/index.js 统一编排 */

export function getSchema () {
  return [
    {
      field: 'gallery.repos.0.enabled',
      label: '启用自动检查',
      bottomHelpMessage: '检测到新版本时是否推送通知，关闭后仍可手动更新',
      component: 'Switch'
    },
    {
      field: 'gallery.repos.0.remoteUrl',
      label: '远程仓库地址',
      bottomHelpMessage: 'Git 仓库 URL（更换源或自定义镜像）',
      component: 'Input',
      componentProps: {
        placeholder: 'https://github.com/...'
      }
    },
    {
      field: 'gallery.repos.0.cron',
      label: '检查时间',
      helpMessage: '自动检查更新的 cron 表达式（默认每天 5:20）',
      component: 'EasyCron',
      required: true,
      componentProps: {
        defaultValue: '0 20 5 * * *',
        placeholder: '0 20 5 * * *'
      }
    },
    {
      field: 'gallery.repos.0.autoUpdate',
      label: '自动更新',
      bottomHelpMessage: '检测到更新后是否自动执行 git pull',
      component: 'Switch'
    },
    {
      field: 'gallery.repos.0.autoRestart',
      label: '自动重启',
      bottomHelpMessage: '自动更新后是否重启云崽（图库更新一般无需重启）',
      component: 'Switch'
    }
  ]
}
