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

const ZERO = { roles: 0, images: 0, size: 0 }

/**
 * 仓库版本（主仓库 / 第三方图库展示用）
 * 更新时间截到分钟并去掉时区尾巴（git log %ci → `2026-01-02 03:04:05 +0800`）
 * @param {string} dir - 仓库目录
 * @returns {{ sha: string, updatedAt: string }|null}
 */
function repoVersion(dir) {
  const ver = getLocalVersionAt(dir)
  if (!ver) return null
  return { sha: ver.sha, updatedAt: String(ver.date || '').slice(0, 16) }
}

/** 屏蔽图库数据；未安装时只给 installed: false，由模板出「未安装」卡片 */
function blockedData() {
  if (!checkBlockedGallery().ok) return { installed: false }
  const { charCount, imageCount, totalSize } = getBlockedInfo()
  return {
    installed: true,
    charCount,
    imageCount,
    size: formatSize(totalSize),
    version: repoVersion(BLOCKED_REPO_DIR)
  }
}

/**
 * 组装状态图渲染数据
 *
 * 源列表按 profileImgSrc 的读取顺序排列，顶层条目带两位序号；
 * 同一第三方图库展开出的子文件夹（srcProbe 的分组子源）归到父图库条目下，
 * 父条目给合计规模与更新时间，子行给各自规模。
 * 状态图对所有人生效，因此只给仓库目录名，不回显服务器绝对路径。
 *
 * @param {{ mode?: 'overall'|'main'|'blocked', thirdParty?: Array<{name: string, dir: string, enabled?: boolean}> }} options
 * @returns {{ mode: string, title: string, subTitle: string, stats: object[], sources: object[], sourceCount: number, blocked: object|null, unregistered: object[], empty: boolean }}
 */
export function buildStatusData({ mode = 'overall', thirdParty } = {}) {
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
      sourceCount: 0,
      blocked,
      unregistered: [],
      // 未安装的屏蔽图库由 blocked 卡片自己表达，避免与空态卡重复
      empty: false
    }
  }

  const all = getSources(thirdParty ? { thirdParty } : {})
  const statByDir = new Map(all.map(s => [s.dir, statSource(s)]))
  const picked = mode === 'main' ? all.filter(s => s.kind === 'main') : all

  const entries = []
  const groupAt = new Map()

  for (const source of picked) {
    const stat = statByDir.get(source.dir) || ZERO
    const kind = KIND[source.kind] || { label: source.kind, badge: 'badge-main' }

    if (source.parent) {
      // 分组子源：挂到父图库条目下（父条目落在该图库第一个子源的位置，保持读取顺序）
      let parent = groupAt.get(source.parent)
      if (!parent) {
        parent = {
          order: '',
          label: source.parent,
          kindLabel: kind.label,
          badge: kind.badge,
          dirName: path.basename(path.dirname(source.dir)),
          roles: 0,
          images: 0,
          size: 0,
          sizeText: '',
          version: repoVersion(path.dirname(source.dir)),
          children: []
        }
        groupAt.set(source.parent, parent)
        entries.push(parent)
      }
      parent.children.push({
        label: source.groupName || source.label,
        dirName: path.basename(source.dir),
        roles: stat.roles,
        images: stat.images,
        sizeText: formatSize(stat.size)
      })
      parent.roles += stat.roles
      parent.images += stat.images
      parent.size += stat.size
      continue
    }

    entries.push({
      order: '',
      label: source.label,
      kindLabel: kind.label,
      badge: kind.badge,
      dirName: path.basename(source.dir),
      roles: stat.roles,
      images: stat.images,
      size: stat.size,
      sizeText: formatSize(stat.size),
      // 默认图库位于 miao-plugin 仓库内，其版本号与本插件无关，不展示
      version: source.kind === 'default' ? null : repoVersion(source.dir),
      children: []
    })
  }

  // 顶层序号 + 体积文本 + 合计；表头「图库源」按实际源数（分组子源各算一个）
  let sourceCount = 0, roles = 0, images = 0, size = 0
  entries.forEach((entry, idx) => {
    entry.order = String(idx + 1).padStart(2, '0')
    if (entry.children.length) entry.sizeText = formatSize(entry.size)
    sourceCount += entry.children.length || 1
    roles += entry.roles
    images += entry.images
    size += entry.size
  })

  const stats = mode === 'main'
    ? [
        { label: '仓库', value: entries.length },
        { label: '角色', value: roles },
        { label: '图片', value: images },
        { label: '体积', value: formatSize(size) }
      ]
    : [
        { label: '图库源', value: sourceCount },
        { label: '角色', value: roles },
        { label: '图片', value: images },
        { label: '体积', value: formatSize(size) }
      ]

  return {
    mode,
    title: meta.title,
    subTitle: meta.subTitle,
    stats,
    sources: entries,
    sourceCount,
    blocked: mode === 'overall' ? blockedData() : null,
    unregistered: mode === 'overall' ? listUnregisteredRepos().map(item => ({ name: item.name })) : [],
    empty: entries.length === 0
  }
}
