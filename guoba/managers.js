/** 成员管理权限 Schema（存储于 config/manager_config.yaml） */

export function getSchema() {
  return [
    {
      label: '成员管理权限',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'managers',
      label: '允许使用管理指令的成员',
      bottomHelpMessage: '成员可执行 添加/删除/屏蔽/启用，且只能操作其管理仓库内的角色（主人不受限）。保存在 config/manager_config.yaml',
      component: 'GSubForm',
      componentProps: {
        multiple: true,
        schemas: [
          {
            field: 'qq',
            label: 'QQ号',
            component: 'Input',
            required: true,
            componentProps: { placeholder: '群成员 QQ 号' }
          },
          {
            field: 'repoId',
            label: '管理仓库编号',
            component: 'Input',
            componentProps: { placeholder: '留空 = 默认仓库 0' }
          }
        ]
      }
    }
  ]
}
