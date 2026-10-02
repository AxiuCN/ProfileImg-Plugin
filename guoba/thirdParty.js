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
      bottomHelpMessage: '首次使用请先在 QQ 中完成 #图库初始化 与 #下载主图库；第三方图库推荐先发送 #下载第三方图库 <Git地址>（自动克隆并注册），再回到此处调整名称 / 启用状态。若图库已自行下载到 gallery/ProfileImg 下，也可直接在此新增配置（dir 填该目录名）。修改配置后需重启 Yunzai 才会被 miao 读取；目录不存在或结构不符的条目不会被注册',
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
            bottomHelpMessage: 'gallery/ProfileImg 下的子目录名（需已存在该仓库目录；不存在则不会被注册，可先用 #下载第三方图库 克隆）',
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
