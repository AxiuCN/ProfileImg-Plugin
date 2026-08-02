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
      bottomHelpMessage: '管理第三方图库仓库（保存在 config/gallery_config.yaml），保存后可用 #更新第三方图库 同步',
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
            field: 'normalPath',
            label: '普通角色目录',
            bottomHelpMessage: '角色目录相对仓库根的路径："normal-character"=有类型层，"."=角色目录在根，空=无',
            component: 'Input',
            componentProps: { placeholder: 'normal-character / .（角色目录在根）/ 留空（无）' }
          },
          {
            field: 'superPath',
            label: '彩蛋角色目录',
            bottomHelpMessage: '角色目录相对仓库根的路径（同 normalPath），为空表示该类型不存在',
            component: 'Input',
            componentProps: { placeholder: 'super-character / .（角色目录在根）/ 留空（无）' }
          },
          {
            field: 'enabled',
            label: '启用',
            bottomHelpMessage: '关闭后跳过该图库的同步与更新',
            component: 'Switch'
          }
        ]
      }
    }
  ]
}
