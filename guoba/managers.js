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
      bottomHelpMessage: '成员可执行 添加/删除/屏蔽/启用，且只能操作被允许图库内的图（主图库 / default / 第三方图库）。保存在 config/manager_config.yaml',
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
            field: 'repos',
            label: '允许的图库',
            component: 'Input',
            componentProps: { placeholder: '逗号分隔：main,default,第三方图库名（留空 = 仅 default）' }
          }
        ]
      }
    }
  ]
}
