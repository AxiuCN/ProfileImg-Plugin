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
      bottomHelpMessage: '首次使用请先在 QQ 中完成 #图库初始化 与 #下载主图库；第三方图库推荐先发送 #下载第三方图库 <Git地址> [目标目录]（自动克隆并注册，目标目录可省略或填跨盘绝对路径），再回到此处调整名称 / 启用状态。若图库已自行下载到任意位置，也可直接在此新增配置（dir 填子目录名或绝对路径）。只有本列表中的条目会被读取（不做目录扫描，跨盘仓库也必须在此注册），未注册的仓库目录会被忽略并在 #图库状态 中提示；修改配置或新增图库后需重启 Yunzai 才会被 miao 读取；目录不存在或结构不符的条目不会被注册',
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
            label: '目录名或路径',
            bottomHelpMessage: '图库仓库目录：可填 gallery/ProfileImg 下的子目录名，也可填绝对路径（支持其他盘 / 网络盘，如 E:/fan-repo、//NAS/gallery/fan，建议用正斜杠）；网络盘（UNC）需先执行一次 git config --global --add safe.directory <该路径>，否则 git 会以 dubious ownership 拒绝下载/更新；目录不存在或结构不符不会被注册，可先用 #下载第三方图库 <URL> [目标目录] 克隆',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'xxx-fan-repo 或 E:/fan-repo（跨盘绝对路径）' }
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
