import path from 'node:path'
import { checkBlockedGallery } from '../model/gallery.js'
import { formatSize } from '../components/format.js'
import { getLocalVersionAt } from '../model/version.js'
import { getBlockedInfo } from '../model/blockedInfo.js'
import { statSource, getSources } from '../model/galleryIndex.js'
import { listUnregisteredRepos } from '../model/galleryConfig.js'
import { BLOCKED_REPO_DIR } from '../components/constants.js'

/** 源类型显示名 + 徽标样式（徽标类名定义见 resources/common/ui.css） */
const KIND = {
  default: { label: '默认图库', badge: 'badge-default' },
  main: { label: '主仓库', badge: 'badge-main' },
  thirdParty: { label: '第三方图库', badge: 'badge-third' }
}

/** 三种状态模式（对应 #图库状态 / #主图库状态 / #屏蔽图库状态） */
const MODE = {
  overall: { title: '图库状态', subTitle: '全部图库源总览' },
  main: { title: '主图库状态', subTitle: '各主仓库规模与版本' },
  blocked: { title: '屏蔽图库状态', subTitle: '屏蔽图库规模与版本' }
}

/**
 * 单个源的展示数据
 * 状态图对所有人生效，因此只给仓库目录名，不回显服务器绝对路径
 * @param {object} source - getSources 元素
 * @param {{ roles: number, images: number, size: number }} stat - statSource 结果
 */
function sourceRow(source, stat) {
  const kind = KIND[source.kind] || { label: source.kind, badge: 'badge-main' }
  // 只有主仓库展示版本：默认图库位于 miao-plugin 仓库内，其版本号与本插件无关
  const ver = source.kind === 'main' ? getLocalVersionAt(source.dir) : null
  return {
    label: source.label,
    kindLabel: kind.label,
    badge: kind.badge,
    dirName: path.basename(source.dir),
    roles: stat.roles,
    images: stat.images,
    size: formatSize(stat.size),
    version: ver ? { sha: ver.sha, date: ver.date } : null
  }
}

/** 屏蔽图库数据；未安装时只给 installed: false，由模板出「未安装」卡片 */
function blockedData() {
  if (!checkBlockedGallery().ok) return { installed: false }
  const { charCount, imageCount, totalSize } = getBlockedInfo()
  const ver = getLocalVersionAt(BLOCKED_REPO_DIR)
  return {
    installed: true,
    charCount,
    imageCount,
    size: formatSize(totalSize),
    version: ver ? { sha: ver.sha, date: ver.date } : null
  }
}

/**
 * 组装状态图渲染数据
 * @param {{ mode?: 'overall'|'main'|'blocked' }} options
 * @returns {{ mode: string, title: string, subTitle: string, stats: object[], sources: object[], blocked: object|null, unregistered: object[], empty: boolean }}
 */
export function buildStatusData({ mode = 'overall' } = {}) {
  const meta = MODE[mode] || MODE.overall

  if (mode === 'blocked') {
    const blocked = blockedData()
    return {
      mode,
      title: meta.title,
      subTitle: meta.subTitle,
      stats: blocked.installed
        ? [
            { label: '屏蔽角色', value: blocked.charCount },
            { label: '屏蔽图片', value: blocked.imageCount },
            { label: '体积', value: blocked.size }
          ]
        : [
            { label: '屏蔽角色', value: 0 },
            { label: '屏蔽图片', value: 0 },
            { label: '体积', value: 0 }
          ],
      sources: [],
      blocked,
      unregistered: [],
      // 未安装的屏蔽图库由 blocked 卡片自己表达，避免与空态卡重复
      empty: false
    }
  }

  const all = getSources()
  const statByDir = new Map(all.map(s => [s.dir, statSource(s)]))
  const picked = mode === 'main' ? all.filter(s => s.kind === 'main') : all
  const zero = { roles: 0, images: 0, size: 0 }

  const sources = picked.map(s => sourceRow(s, statByDir.get(s.dir) || zero))

  let roles = 0, images = 0, size = 0
  for (const s of picked) {
    const stat = statByDir.get(s.dir) || zero
    roles += stat.roles
    images += stat.images
    size += stat.size
  }

  const stats = mode === 'main'
    ? [
        { label: '仓库', value: sources.length },
        { label: '角色', value: roles },
        { label: '图片', value: images },
        { label: '体积', value: formatSize(size) }
      ]
    : [
        { label: '图库源', value: sources.length },
        { label: '角色', value: roles },
        { label: '图片', value: images },
        { label: '体积', value: formatSize(size) }
      ]

  return {
    mode,
    title: meta.title,
    subTitle: meta.subTitle,
    stats,
    sources,
    blocked: mode === 'overall' ? blockedData() : null,
    unregistered: mode === 'overall' ? listUnregisteredRepos().map(item => ({ name: item.name })) : [],
    empty: sources.length === 0
  }
}
