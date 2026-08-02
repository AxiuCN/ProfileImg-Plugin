/** 上传压缩 Schema */

export function getSchema () {
  return [
    {
      label: '上传压缩',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'upload.enabled',
      label: '启用压缩',
      bottomHelpMessage: '上传面板图时自动压缩（超过目标大小时生效）',
      component: 'Switch'
    },
    {
      field: 'upload.format',
      label: '压缩格式',
      bottomHelpMessage: '选择压缩后的图片格式，推荐 webp',
      component: 'Select',
      required: true,
      componentProps: {
        options: [
          { label: 'WebP', value: 'webp' },
          { label: 'JPEG', value: 'jpeg' },
          { label: 'PNG', value: 'png' }
        ],
        placeholder: '请选择压缩格式'
      }
    },
    {
      field: 'upload.maxSize',
      label: '目标大小（KB）',
      bottomHelpMessage: '原图超过此大小时触发压缩，默认 500KB',
      component: 'InputNumber',
      componentProps: {
        min: 1,
        max: 10240,
        defaultValue: 500,
        placeholder: '500'
      }
    }
  ]
}
