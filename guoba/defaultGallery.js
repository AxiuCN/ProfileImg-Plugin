/** default 图库上传 Schema */

export function getSchema () {
  return [
    {
      label: 'default 图库上传',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gallery.defaultDir',
      label: '手动上传目录名',
      bottomHelpMessage: '手动上传面板图的默认存放目录名（位于 gallery/ProfileImg/ 下）。留空写入 default 图库目录；若填主仓库目录名（如 miao-plugin-ProfileImg），上传将直接写入主图库',
      component: 'Input',
      componentProps: {
        placeholder: '留空=使用 default 图库目录'
      }
    }
  ]
}
