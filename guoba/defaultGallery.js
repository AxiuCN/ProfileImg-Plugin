/** default 图库上传 Schema */

export function getSchema () {
  return [
    {
      label: 'default 图库上传',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'gallery.defaultDir',
      label: '图库目录名',
      bottomHelpMessage: '手动上传面板图的默认存放目录名（位于 gallery/ProfileImg/ 下），为空时使用默认图库 default',
      component: 'Input',
      componentProps: {
        placeholder: '如：my-default-gallery（留空=直接写入主图库）'
      }
    }
  ]
}
