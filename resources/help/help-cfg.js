export const helpCfg = {
  title: '#图库帮助',
  subTitle: 'ProfileImg-Plugin 帮助'
}

export const helpList = [
  {
    group: '图库初始化（仅主人）',
    auth: 'master',
    list: [
      { icon: 87, title: '#图库初始化', desc: '初始化多图库源布局（生成 miao config/profile.js 并注册图库源；源列表有变化需重启 Yunzai）' },
      { icon: 89, title: '#迁移图库', desc: '旧版图库布局升级到多图库源布局（完成后需重启 Yunzai）' }
    ]
  },
  {
    group: '图库下载（仅主人）',
    auth: 'master',
    list: [
      { icon: 87, title: '#下载主图库', desc: '克隆主图库并注册为图库源' },
      { icon: 88, title: '#强制下载主图库', desc: '删除现有仓库后重新克隆主图库' },
      { icon: 87, title: '#下载屏蔽图库', desc: '克隆屏蔽图库' },
      { icon: 88, title: '#强制下载屏蔽图库', desc: '删除现有仓库后重新克隆屏蔽图库' },
      { icon: 89, title: '#下载第三方图库 <URL> [目标目录]', desc: '克隆第三方图库（目录可省，支持跨盘 / 网络盘绝对路径），登记到 gallery_config.yaml 并注册为图库源' }
    ]
  },
  {
    group: '图库状态',
    list: [
      { icon: 80, title: '#图库状态', desc: '查看全部图库源与屏蔽图库总览（含未登记图库目录提示）' },
      { icon: 80, title: '#主图库状态', desc: '查看各主仓库的规模与路径' },
      { icon: 80, title: '#屏蔽图库状态', desc: '查看屏蔽图库详细信息' }
    ]
  },
  {
    group: '图库更新（仅主人，自动更新默认 5:30 统一执行）',
    auth: 'master',
    list: [
      { icon: 87, title: '#主图库更新', desc: '拉取所有主图库仓库最新版本' },
      { icon: 88, title: '#主图库强制更新', desc: '强制同步所有主图库仓库' },
      { icon: 87, title: '#屏蔽图库更新', desc: '拉取屏蔽图库最新版本' },
      { icon: 88, title: '#屏蔽图库强制更新', desc: '强制同步屏蔽图库' },
      { icon: 87, title: '#更新第三方图库 [图库名]', desc: '拉取第三方图库最新版本（只读源，仅 git pull，不复制图片）' },
      { icon: 88, title: '#删除第三方图库 <图库名>', desc: '移除配置并删除该图库的 Git 仓库目录（磁盘根 / 图库根 / 默认图库 / 主图库受保护）' }
    ]
  },
  {
    group: '面板图上传（含版权归属）',
    list: [
      { icon: 75, title: '#添加<角色名>面板图 <作者> <来源>', desc: '上传面板图并标注版权' },
      { icon: 75, title: '#添加琴面板图 张三 米游社', desc: '示例：作者张三 / 来源米游社' },
      { icon: 75, title: '#添加甘雨面板图 李四 lofter AI扩图', desc: '示例：含备注' }
    ]
  },
  {
    group: '面板图管理',
    list: [
      { icon: 75, title: '#<角色名>面板图列表', desc: '查看角色面板图（最多 20 张）' },
      { icon: 75, title: '#<角色名>面板图可视化', desc: 'HTML 网格浏览全部面板图' },
      { icon: 92, title: '#删除<角色名>面板图<序号>', desc: '删除指定序号的面板图' },
      { icon: 92, title: '#重命名<角色名>面板图 <序号> <作者> <来源>', desc: '修改版权信息（仅主人）' },
      { icon: 92, title: '#屏蔽<角色名>面板图 <序号>', desc: '移入屏蔽图库（仅主人）' },
      { icon: 92, title: '#启用<角色名>面板图 <序号>', desc: '移回主图库（仅主人）' },
      { icon: 75, title: '#<角色名>面板图屏蔽列表', desc: '查看角色被屏蔽的面板图' }
    ]
  }
]
