export const helpCfg = {
  title: '#图库帮助',
  subTitle: 'ProfileImg-Plugin 帮助'
}

export const helpList = [
  {
    group: '图库初始化（仅主人）',
    auth: 'master',
    list: [
      { icon: 87, title: '#图库初始化', desc: '初始化图库（创建 junction + 下载仓库）' },
      { icon: 88, title: '#备份图库', desc: '备份旧 miao-plugin/resources/profile 数据' },
      { icon: 89, title: '#迁移图库', desc: '将备份数据迁移到新仓库结构' }
    ]
  },
  {
    group: '图库状态',
    list: [
      { icon: 80, title: '#图库状态', desc: '查看主图库与屏蔽图库总览' },
      { icon: 80, title: '#主图库状态', desc: '查看主图库各仓库详细信息' },
      { icon: 80, title: '#屏蔽图库状态', desc: '查看屏蔽图库详细信息' }
    ]
  },
  {
    group: '图库更新（仅主人）',
    auth: 'master',
    list: [
      { icon: 87, title: '#主图库更新', desc: '拉取所有主图库仓库最新版本' },
      { icon: 87, title: '#屏蔽图库更新', desc: '拉取屏蔽图库最新版本' },
      { icon: 88, title: '#主图库强制更新', desc: '强制同步所有主图库仓库' },
      { icon: 88, title: '#屏蔽图库强制更新', desc: '强制同步屏蔽图库' },
      { icon: 88, title: '#强制下载主图库', desc: '删除现有仓库后重新下载' }
    ]
  },
  {
    group: '面板图上传（含版权归属）',
    list: [
      { icon: 75, title: '#添加<角色名>面板图 <作者> <来源>', desc: '上传面板图并标注版权' },
      { icon: 75, title: '#添加琴面板图 张三 米游社', desc: '示例：作者张三 / 来源米游社' },
      { icon: 75, title: '#添加甘雨面板图 李四 lofter AI扩图', desc: '示例：含二改情况' }
    ]
  },
  {
    group: '面板图管理',
    list: [
      { icon: 75, title: '#<角色名>面板图列表', desc: '查看角色面板图（含版权信息）' },
      { icon: 92, title: '#删除<角色名>面板图<序号>', desc: '删除指定序号的面板图' },
      { icon: 92, title: '#重命名<角色名>面板图 <序号> <作者> <来源>', desc: '修改版权信息（仅主人）' },
      { icon: 92, title: '#屏蔽<角色名>面板图 <序号>', desc: '移入屏蔽图库（仅主人）' },
      { icon: 92, title: '#启用<角色名>面板图 <序号>', desc: '移回主图库（仅主人）' },
      { icon: 75, title: '#<角色名>面板图屏蔽列表', desc: '查看角色被屏蔽的面板图' }
    ]
  }
]
