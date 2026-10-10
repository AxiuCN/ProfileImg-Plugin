import path from 'node:path'
import { checkBlockedGallery } from '../model/gallery.js'
import { formatSize } from '../components/format.js'
import { getLocalVersionAt } from '../model/version.js'
import { getBlockedInfo } from '../model/blockedInfo.js'
import { statSource, getSources } from '../model/galleryIndex.js'
import { listUnregisteredRepos } from '../model/galleryConfig.js'
import { BLOCKED_REPO_DIR } from '../components/constants.js'
import { guardLayout } from '../model/layoutGuard.js'
import { render } from '../components/render.js'

/** 源类型显示名 */
const KIND_LABEL = { default: '默认图库', main: '主仓库', thirdParty: '第三方图库' }

/** 第三方源的颜色循环池（每次遇到新的第三方就取下一个） */
const THIRD_COLORS = ['purple', 'pink', 'orange', 'green', 'indigo', 'teal', 'rose', 'cyan']

export class Status extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]状态',
      dsc: '查看图库状态',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#主图库状态$', fnc: 'status' },
        { reg: '^#屏蔽图库状态$', fnc: 'blockedStatus' },
        { reg: '^#图库状态$', fnc: 'overallStatus' }
      ]
    })
  }

  _sourceLine(source, stat) {
    const kind = KIND_LABEL[source.kind] || source.kind
    return `  ${source.label}（${kind}）：${stat.roles} 角色 / ${stat.images} 图片 / ${formatSize(stat.size)}\n` +
      `    目录：${path.basename(source.dir)}\n`
  }

  async status(e) {
    if (!(await guardLayout(e))) return true

    const statByDir = new Map(getSources().map(s => [s.dir, statSource(s)]))
    const mains = getSources().filter(s => s.kind === 'main')
    if (mains.length === 0) {
      return e.reply('[面板图图库管理器] 未找到主图库仓库，请发送 #下载主图库')
    }

    let msg = '[面板图图库管理器] 主图库\n'
    let totalRoles = 0, totalImages = 0
    for (const source of mains) {
      const stat = statByDir.get(source.dir) || { roles: 0, images: 0, size: 0 }
      msg += '\n' + this._sourceLine(source, stat)
      const ver = getLocalVersionAt(source.dir)
      msg += ver ? `    版本：${ver.sha} / ${ver.date}\n` : '    版本：未知\n'
      totalRoles += stat.roles
      totalImages += stat.images
    }
    if (mains.length > 1) {
      msg += `\n合计：${totalRoles} 角色 / ${totalImages} 图片\n`
    }
    return e.reply(msg)
  }

  async blockedStatus(e) {
    if (!(await guardLayout(e))) return true

    const check = checkBlockedGallery()
    if (!check.ok) return e.reply(check.msg)
    const { charCount, totalSize, imageCount } = getBlockedInfo()
    const version = getLocalVersionAt(BLOCKED_REPO_DIR)
    let msg = '[面板图图库管理器] 屏蔽图库\n'
    msg += '屏蔽角色数：' + charCount + '\n'
    msg += '屏蔽图片数：' + imageCount + '\n'
    msg += '总大小：' + formatSize(totalSize) + '\n'
    if (version) {
      msg += '版本：' + version.sha + '\n'
      msg += '时间：' + version.date + '\n'
    } else {
      msg += '无法获取版本信息\n'
    }
    return e.reply(msg)
  }

  /** #图库状态 — 渲染成图片，失败降级为文本 */
  async overallStatus(e) {
    if (!(await guardLayout(e))) return true

    const sources = getSources()
    const statByDir = new Map(sources.map(s => [s.dir, statSource(s)]))

    let totalRoles = 0, totalImages = 0, totalSize = 0
    for (const s of sources) {
      const stat = statByDir.get(s.dir) || { roles: 0, images: 0, size: 0 }
      totalRoles += stat.roles
      totalImages += stat.images
      totalSize += stat.size
    }

    // ---- 每个源分配颜色 + 图标 ----
    // 默认图库 / 主图库固定色；第三方按出现顺序循环取色
    // 同一仓库展开的多个分组共用同一个颜色（用 label 前缀索引）
    let thirdColorIdx = 0
    const thirdColorByRepo = new Map() // 第三方仓库名 → 颜色 key

    const flat = sources.map(source => {
      const stat = statByDir.get(source.dir) || { roles: 0, images: 0, size: 0 }
      const parts = source.kind === 'thirdParty' ? source.label.split('·') : []
      const repoName = parts[0] || source.label

      let colorKey
      if (source.kind === 'default') colorKey = 'gray'
      else if (source.kind === 'main') colorKey = 'blue'
      else {
        if (!thirdColorByRepo.has(repoName)) {
          thirdColorByRepo.set(repoName, THIRD_COLORS[thirdColorIdx++ % THIRD_COLORS.length])
        }
        colorKey = thirdColorByRepo.get(repoName)
      }

      // 图标：默认图库 / 主图库 / 第三方单源
      const iconKey = source.kind === 'default'
        ? 'folder-gray'
        : source.kind === 'main'
          ? 'folder-star'
          : 'folder-image'

      return {
        kind: source.kind,
        kindLabel: KIND_LABEL[source.kind] || source.kind,
        label: parts[0] || source.label,
        subName: parts[1] || '',
        dirName: path.basename(source.dir),
        roles: stat.roles,
        images: stat.images,
        size: stat.size,
        sizeText: formatSize(stat.size),
        iconKey,
        colorKey
      }
    })

    // ---- 分组归并：≥2 子项才保留分组 ----
    const displayItems = []
    const groupMap = new Map()
    for (const item of flat) {
      if (item.kind === 'thirdParty' && item.subName) {
        if (!groupMap.has(item.label)) {
          const group = {
            kind: 'thirdParty',
            kindLabel: item.kindLabel,
            label: item.label,
            isGroup: true,
            children: [],
            roles: 0, images: 0, size: 0, sizeText: '',
            iconKey: 'folder-blue',
            colorKey: item.colorKey
          }
          groupMap.set(item.label, group)
          displayItems.push(group)
        }
        const g = groupMap.get(item.label)
        g.children.push(item)
        g.roles += item.roles
        g.images += item.images
        g.size += item.size
      } else {
        displayItems.push({ ...item, isGroup: false, children: [] })
      }
    }
    for (let i = displayItems.length - 1; i >= 0; i--) {
      const it = displayItems[i]
      if (it.isGroup) {
        it.sizeText = formatSize(it.size)
        if (it.children.length === 1) {
          const only = it.children[0]
          displayItems[i] = { ...only, label: it.label, isGroup: false, children: [] }
        }
      }
    }

    // ---- 屏蔽图库 ----
    const blockedCheck = checkBlockedGallery()
    let blocked = { installed: false }
    if (blockedCheck.ok) {
      const { charCount, imageCount, totalSize: bSize } = getBlockedInfo()
      const ver = getLocalVersionAt(BLOCKED_REPO_DIR)
      blocked = {
        installed: true,
        charCount,
        imageCount,
        sizeText: formatSize(bSize),
        version: ver?.sha || ''
      }
    }

    const unregistered = listUnregisteredRepos().map(u => u.name)

    const data = {
      sourceCount: sources.length,
      totalRoles,
      totalImages,
      totalSizeText: formatSize(totalSize),
      items: displayItems,
      blocked,
      unregistered,
      isEmpty: sources.length <= 1
    }

    try {
      const img = await render('status', 'index', data, 'jpeg')
      if (img) return e.reply(img)
    } catch (err) {
      logger?.warn('[ProfileImg-Plugin] 状态图渲染失败，降级为文本:', err?.message)
    }
    return e.reply(this._textOverview(sources, statByDir, blockedCheck, unregistered))
  }

  _textOverview(sources, statByDir, blockedCheck, unregistered) {
    let msg = `[面板图图库管理器] 总览（图库源 ${sources.length} 个）\n`
    let totalRoles = 0, totalImages = 0, totalSize = 0
    for (const source of sources) {
      const stat = statByDir.get(source.dir) || { roles: 0, images: 0, size: 0 }
      msg += '\n' + this._sourceLine(source, stat)
      totalRoles += stat.roles
      totalImages += stat.images
      totalSize += stat.size
    }
    msg += `\n合计：${totalRoles} 角色 / ${totalImages} 图片 / ${formatSize(totalSize)}\n`

    if (blockedCheck.ok) {
      const { charCount, totalSize: blockedSize, imageCount } = getBlockedInfo()
      const blockedVer = getLocalVersionAt(BLOCKED_REPO_DIR)
      msg += '\n屏蔽图库：\n'
      msg += '  屏蔽角色数：' + charCount + '\n'
      msg += '  屏蔽图片数：' + imageCount + '\n'
      msg += '  大小：' + formatSize(blockedSize) + '\n'
      msg += blockedVer ? '  版本：' + blockedVer.sha + '\n' : '  版本：未知\n'
    } else {
      msg += '\n屏蔽图库：未安装\n'
    }

    if (unregistered.length) {
      msg += '\n未登记的图库目录（下次启动自动登记并注册）：\n'
      for (const name of unregistered) {
        msg += `  · ${name}\n`
      }
      msg += '  也可在锅巴「第三方图库」新增条目（dir 填该目录的绝对路径）；跨盘图库请直接填绝对路径\n'
    }
    return msg
  }
}