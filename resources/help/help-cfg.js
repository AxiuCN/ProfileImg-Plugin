export const helpCfg = {
  title: '面板图图库管理器',
  subTitle: 'ProfileImg-Plugin 帮助'
}

export const helpList = [
  {
    group: '图库状态',
    list: [
      { icon: 1, title: '#图库状态', desc: '查看主图库与屏蔽图库总览' },
      { icon: 2, title: '#主图库状态', desc: '查看主图库详细信息' },
      { icon: 3, title: '#屏蔽图库状态', desc: '查看屏蔽图库详细信息' }
    ]
  },
  {
    group: '图库更新（仅主人）',
    auth: 'master',
    list: [
      { icon: 4, title: '#主图库更新', desc: '拉取主图库最新版本' },
      { icon: 5, title: '#屏蔽图库更新', desc: '拉取屏蔽图库最新版本' },
      { icon: 6, title: '#主图库强制更新', desc: '强制同步主图库' },
      { icon: 7, title: '#屏蔽图库强制更新', desc: '强制同步屏蔽图库' },
      { icon: 8, title: '#管理器更新', desc: '检查并更新管理器自身' },
      { icon: 9, title: '#管理器强制更新', desc: '强制更新管理器自身' }
    ]
  },
  {
    group: '图库安装（仅主人）',
    auth: 'master',
    list: [
      { icon: 10, title: '#下载主图库', desc: '安装主图库' },
      { icon: 11, title: '#下载屏蔽图库', desc: '安装屏蔽图库' }
    ]
  },
  {
    group: '面板图管理',
    list: [
      { icon: 12, title: '#<角色名>面板图屏蔽列表', desc: '查看角色被屏蔽的面板图' },
      { icon: 13, title: '#屏蔽<角色名>面板图 <序号>', desc: '移入屏蔽图库（仅主人，支持别名）' },
      { icon: 14, title: '#启用<角色名>面板图 <序号>', desc: '移回主图库（仅主人，支持别名）' }
    ]
  }
]