/** 图库更新模块 Schema — 统一自动更新 / 主图库 / 屏蔽图库 / 第三方图库更新 / 刷新副本 */

export function getSchema () {
  return [
    { label: '图库更新', component: 'SOFT_GROUP_BEGIN' },

    // 自动更新（所有图库统一 cron）
    { label: '自动更新', component: 'Divider' },
    {
      field: 'gallery.autoUpdate.enabled',
      label: '启用自动更新',
      bottomHelpMessage: '是否启用图库自动更新总开关，默认开启',
      component: 'Switch'
    },
    {
      field: 'gallery.autoUpdate.cron',
      label: '更新时间',
      helpMessage: '所有图库统一的自动检查 cron 表达式（默认每天 5:30），按主图库 → 屏蔽图库 → 第三方图库 → 刷新副本顺序执行',
      component: 'EasyCron',
      required: true,
      componentProps: {
        defaultValue: '0 30 5 * * *',
        placeholder: '0 30 5 * * *'
      }
    },

    // 主图库
    { label: '主图库', component: 'Divider' },
    {
      field: 'gallery.repos.0.autoUpdate',
      label: '参与自动更新',
      bottomHelpMessage: '该仓库是否参与统一自动更新，默认开启',
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

    // 屏蔽图库
    { label: '屏蔽图库', component: 'Divider' },
    {
      field: 'gallery.blocked.enabled',
      label: '参与自动更新',
      bottomHelpMessage: '屏蔽图库是否参与统一自动更新，默认开启',
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

    // 第三方图库更新
    { label: '第三方图库更新', component: 'Divider' },
    {
      field: 'gallery.thirdPartyUpdate.enabled',
      label: '参与自动更新',
      bottomHelpMessage: '第三方图库是否参与统一自动更新，默认开启',
      component: 'Switch'
    },

    // 刷新副本
    { label: '刷新副本', component: 'Divider' },
    {
      field: 'gallery.refreshCopies.enabled',
      label: '自动刷新副本',
      bottomHelpMessage: '每次自动更新后执行 #刷新图库副本（角色级 junction + default/第三方副本），默认开启',
      component: 'Switch'
    }
  ]
}
