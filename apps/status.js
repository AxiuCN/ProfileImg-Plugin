import fs from 'node:fs'
import path from 'node:path'
import { checkBlockedGallery } from '../model/gallery.js'
import { formatSize, getDirSize } from '../components/format.js'
import { getLocalVersionAt } from '../model/version.js'
import { getBlockedInfo } from '../model/blockedInfo.js'
import { countSourceImages, getSources } from '../model/galleryIndex.js'
import { listUnregisteredRepos } from '../model/galleryConfig.js'
import { BLOCKED_REPO_DIR } from '../components/constants.js'
import { guardLayout } from '../model/layoutGuard.js'

/** 源类型显示名 */
const KIND_LABEL = { default: '默认图库', main: '主仓库', thirdParty: '第三方图库' }

/**
 * 图库状态（多图库源布局）
 *
 * 面板图由「默认图库 + 各主仓库 + 可直读的第三方仓库」多源提供：
 * 统计取 countSourceImages()（各源角色数 / 图片数）与 getBlockedInfo()（屏蔽图库），
 * 展示每个源的规模与路径；不再有 junction / 副本概念。
 */
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

  /**
   * 统计单个源的图片体积
   * 分层源统计 normal/super-character；平铺源逐个子目录累计并跳过 .git 等版本目录
   * @param {object} source - getSources 元素
   * @returns {number} 字节数
   */
  _sourceSize(source) {
    if (source.level === 'flat') {
      let size = 0
      let entries = []
      try {
        entries = fs.readdirSync(source.dir, { withFileTypes: true })
      } catch {
        return 0
      }
      for (const e of entries) {
        if (e.name === '.git') continue
        const p = path.join(source.dir, e.name)
        if (e.isDirectory()) size += getDirSize(p)
        else if (e.isFile()) size += fs.statSync(p).size
      }
      return size
    }
    let size = 0
    for (const type of ['normal-character', 'super-character']) {
      const d = path.join(source.dir, type)
      if (fs.existsSync(d)) size += getDirSize(d)
    }
    return size
  }

  /**
   * 生成单个源的展示行（规模 + 目录名）
   * 状态命令对所有人生效，只展示仓库目录名，不回显服务器绝对路径
   * @param {object} source - getSources 元素
   * @param {{ roles: number, images: number }} stat - countSourceImages 元素
   * @param {number} size - 源图片体积（字节）
   * @returns {string}
   */
  _sourceLine(source, stat, size) {
    const kind = KIND_LABEL[source.kind] || source.kind
    return `  ${source.label}（${kind}）：${stat.roles} 角色 / ${stat.images} 图片 / ${formatSize(size)}\n` +
      `    目录：${path.basename(source.dir)}\n`
  }

  /** #主图库状态 — 各主仓库的规模与版本 */
  async status(e) {
    if (!(await guardLayout(e))) return true

    const statByDir = new Map(countSourceImages().map(s => [s.dir, s]))
    const mains = getSources().filter(s => s.kind === 'main')
    if (mains.length === 0) {
      return e.reply('[面板图图库管理器] 未找到主图库仓库，请发送 #下载主图库')
    }

    let msg = '[面板图图库管理器] 主图库\n'
    let totalRoles = 0, totalImages = 0
    for (const source of mains) {
      const stat = statByDir.get(source.dir) || { roles: 0, images: 0 }
      msg += '\n' + this._sourceLine(source, stat, this._sourceSize(source))
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

  /** #屏蔽图库状态 — 屏蔽图库规模与版本 */
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

  /** #图库状态 — 全部图库源总览 + 屏蔽图库 */
  async overallStatus(e) {
    if (!(await guardLayout(e))) return true

    const statByDir = new Map(countSourceImages().map(s => [s.dir, s]))
    const sources = getSources()
    let msg = `[面板图图库管理器] 总览（图库源 ${sources.length} 个）\n`
    let totalRoles = 0, totalImages = 0, totalSize = 0
    for (const source of sources) {
      const stat = statByDir.get(source.dir) || { roles: 0, images: 0 }
      const size = this._sourceSize(source)
      msg += '\n' + this._sourceLine(source, stat, size)
      totalRoles += stat.roles
      totalImages += stat.images
      totalSize += size
    }
    msg += `\n合计：${totalRoles} 角色 / ${totalImages} 图片 / ${formatSize(totalSize)}\n`

    // 屏蔽图库
    const blockedCheck = checkBlockedGallery()
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

    // 未登记的图库目录：目录存在但不在 gallery_config.yaml 中（下次启动自动登记并注册）
    const unregistered = listUnregisteredRepos()
    if (unregistered.length) {
      msg += '\n未登记的图库目录（下次启动自动登记并注册）：\n'
      for (const item of unregistered) {
        msg += `  · ${item.name}\n`
      }
      msg += '  也可在锅巴「第三方图库」新增条目（dir 填该目录的绝对路径）；跨盘图库请直接填绝对路径\n'
    }
    return e.reply(msg)
  }
}
