/** 第三方图库 Schema */

export function getSchema () {
  return [
    {
      label: '第三方图库',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gallery.thirdParty',
      label: '第三方图库列表',
      bottomHelpMessage: '第三方仓库作为独立只读图库源注册（保存在 config/gallery_config.yaml）；目录结构自动探测，支持 normal-character/{角色}/ 与 super-character/{角色}/ 或平铺 {角色}/',
      component: 'GSubForm',
      componentProps: {
        multiple: true,
        schemas: [
          {
            field: 'name',
            label: '图库名称',
            bottomHelpMessage: '图库名，用于文件名前缀与显示（如 米游社）',
            component: 'Input',
            required: true,
            componentProps: { placeholder: '用于显示与文件名前缀' }
          },
          {
            field: 'dir',
            label: '目录名',
            bottomHelpMessage: 'gallery/ProfileImg 下的子目录名，如 xxx-fan-repo',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'gallery/ProfileImg 下的子目录名，如：xxx-fan-repo' }
          },
          {
            field: 'remoteUrl',
            label: '远程仓库地址',
            bottomHelpMessage: 'Git 仓库地址（#下载第三方图库 会自动写入）',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'https://github.com/xxx/xxx.git' }
          },
          {
            field: 'enabled',
            label: '启用',
            bottomHelpMessage: '关闭后跳过该图库的更新与图库源注册',
            component: 'Switch'
          }
        ]
      }
    }
  ]
}
