/** 图库更新模块 Schema — 主图库 / 屏蔽图库 / 第三方图库更新 */

export function getSchema () {
  return [
    { label: '图库更新', component: 'SOFT_GROUP_BEGIN' },

    // 主图库
    { label: '主图库', component: 'Divider' },
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
    },

    // 屏蔽图库
    { label: '屏蔽图库', component: 'Divider' },
    {
      field: 'gallery.blocked.enabled',
      label: '启用自动检查',
      bottomHelpMessage: '检测到新版本时是否推送通知，关闭后仍可手动更新',
      component: 'Switch'
    },
    {
      field: 'gallery.blocked.remoteUrl',
      label: '远程仓库地址',
      bottomHelpMessage: 'Git 仓库 URL（更换源或自定义镜像）',
      component: 'Input',
      componentProps: {
        placeholder: 'https://github.com/...'
      }
    },
    {
      field: 'gallery.blocked.cron',
      label: '检查时间',
      helpMessage: '自动检查更新的 cron 表达式（默认每天 5:40）',
      component: 'EasyCron',
      required: true,
      componentProps: {
        defaultValue: '0 40 5 * * *',
        placeholder: '0 40 5 * * *'
      }
    },
    {
      field: 'gallery.blocked.autoUpdate',
      label: '自动更新',
      bottomHelpMessage: '检测到更新后是否自动执行 git pull',
      component: 'Switch'
    },
    {
      field: 'gallery.blocked.autoRestart',
      label: '自动重启',
      bottomHelpMessage: '自动更新后是否重启云崽（屏蔽图库更新无需重启）',
      component: 'Switch'
    },

    // 第三方图库更新
    { label: '第三方图库更新', component: 'Divider' },
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
    },
    {
      field: 'gallery.thirdPartyUpdate.autoRestart',
      label: '自动重启',
      bottomHelpMessage: '自动更新后是否重启云崽（图库更新一般无需重启）',
      component: 'Switch'
    }
  ]
}
