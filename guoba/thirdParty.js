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
      bottomHelpMessage: '首次使用请先在 QQ 中完成 #图库初始化 与 #下载主图库；第三方图库推荐先发送 #下载第三方图库 <Git地址> [目标目录]（自动克隆并登记，目标目录可省略或填跨盘绝对路径），再回到此处调整名称 / 启用状态。本地已有图库（含跨盘、非 git 的图片目录）直接在此新增条目即可，dir 填该目录的绝对路径，无需下载。只有本列表中的条目会被读取（不做目录扫描，跨盘仓库也必须在此登记；插件会扫描 gallery/ProfileImg 下已有目录并自动登记）；修改配置或新增图库后需重启 Yunzai 才会被 miao 读取；目录不存在或结构不符的条目不会被注册',
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
            label: '仓库目录（绝对路径）',
            bottomHelpMessage: '图库所在目录的绝对路径，也是该图库在配置里的唯一凭证：本地已有图库直接填其绝对路径（支持其他盘 / 网络盘，如 E:/fan-repo、//NAS/gallery/fan，建议用正斜杠）；网络盘（UNC）需先执行一次 git config --global --add safe.directory <该路径>，否则 git 会以 dubious ownership 拒绝下载/更新；旧配置里的相对子目录名仍兼容（相对 gallery/ProfileImg）；目录不存在或结构不符不会被注册',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'E:/fan-repo 或 //NAS/gallery/fan' }
          },
          {
            field: 'remoteUrl',
            label: '远程仓库地址',
            bottomHelpMessage: 'Git 仓库地址，用于 #更新第三方图库；#下载第三方图库 会自动写入。本地图库没有远程地址时留空 = 本地只读源（不参与更新）',
            component: 'Input',
            componentProps: { placeholder: '留空 = 本地只读源（不参与更新）' }
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
