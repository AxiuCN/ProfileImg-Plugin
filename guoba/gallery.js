/** default 图库 + 第三方图库 Schema */

export function getSchema () {
  return [
    // ==================== default 图库 ====================
    {
      label: 'default 图库上传',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gallery.defaultDir',
      label: '图库目录名',
      bottomHelpMessage: '手动上传面板图的默认存放目录名（位于 gallery/ProfileImg/ 下），为空时使用默认图库 default',
      component: 'Input',
      componentProps: {
        placeholder: '如：my-default-gallery（留空=直接写入主图库）'
      }
    },

    // ==================== 第三方图库 ====================
    {
      label: '第三方图库',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gallery.thirdParty',
      label: '第三方图库列表',
      bottomHelpMessage: '管理第三方图库仓库（保存在 config/gallery_config.yaml），保存后可用 #更新第三方图库 同步',
      component: 'GSubForm',
      componentProps: {
        multiple: true,
        schemas: [
          {
            field: 'name',
            label: '图库名称',
            component: 'Input',
            required: true,
            componentProps: { placeholder: '用于显示与文件名前缀' }
          },
          {
            field: 'dir',
            label: '目录名',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'gallery/ProfileImg 下的子目录名，如：xxx-fan-repo' }
          },
          {
            field: 'remoteUrl',
            label: '远程仓库地址',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'https://github.com/xxx/xxx.git' }
          },
          {
            field: 'normalPath',
            label: '普通角色目录',
            component: 'Input',
            componentProps: { placeholder: 'normal-character（为空则无该类型）' }
          },
          {
            field: 'superPath',
            label: '彩蛋角色目录',
            component: 'Input',
            componentProps: { placeholder: 'super-character（为空则无该类型）' }
          },
          {
            field: 'enabled',
            label: '启用',
            component: 'Switch'
          }
        ]
      }
    }
  ]
}
