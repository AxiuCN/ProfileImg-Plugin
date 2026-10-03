import fs from 'node:fs'
import path from 'node:path'
import { loadMap, autoAssignRepo, getActiveRepoIds } from '../model/mapJson.js'
import { getPluginConfig, isManager, canAccessGallery } from '../components/config.js'
import { resolveRoleName } from '../modules/alias.js'
import { compressToTarget } from '../modules/compress.js'
import { getNextSeqInRange, SEGMENTS } from '../components/panelUtils.js'
import { getRepoDir } from '../components/constants.js'
import { getUploadDir, getDefaultDir, mainRepoLockIdForPath } from '../model/galleryConfig.js'
import { acquireLocks } from '../model/git.js'
import { guardLayout } from '../model/layoutGuard.js'

/**
 * 面板图上传（版权信息可选）
 *
 * 含版权：角色名_n_作者_来源[_备注].扩展名 — #添加琴面板图 张三 米游社
 * 无版权：角色名_n.扩展名 — #添加琴面板图
 *
 * 写入目标（多图库源布局）：
 *   - 成员上传始终写入默认图库（miao-plugin/resources/profile），文件名取 default 段位（10001+）
 *   - 主人可配置 config.yaml 的 gallery.defaultDir 作为手动上传目录；配置为主仓库目录时直写主仓库（main 段位）
 *   - 不再复制到主仓库：各图库仓库作为独立源由 miao 直接读取
 *
 * 优先级 1，高于 miao-plugin 默认优先级，确保先匹配
 */
export class UploadWithCompress extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]上传',
      dsc: '上传面板图（版权信息可选）',
      event: 'message',
      priority: 1,
      rule: [
        {
          // 含版权：#添加琴面板图 张三 米游社 [AI扩图]
          reg: /^#?\s*(?:上传|添加)(.+?)(?:面板图)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/,
          fnc: 'uploadWithAttribution'
        },
        {
          // 无版权：#添加琴面板图
          reg: /^#?\s*(?:上传|添加)(.+)(?:面板图)\s*$/,
          fnc: 'uploadSimple'
        }
      ]
    })
  }

  /** 含版权上传 */
  async uploadWithAttribution(e) {
    const match = e.msg.match(/^#?\s*(?:上传|添加)(.+?)(?:面板图)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
    if (!match) return true

    return this._doUpload(e, {
      author: match[2].trim(),
      source: match[3].trim(),
      modifications: (match[4] || '').trim()
    })
  }

  /** 无版权上传 */
  async uploadSimple(e) {
    // 只有纯 "#添加角色面板图"（无额外参数）才走这里
    const msg = e.msg.replace(/^#/, '').replace(/^(上传|添加)/, '').replace(/面板图/, '').trim()
    if (!msg) return true

    return this._doUpload(e, {})
  }

  /**
   * 统一上传逻辑
   * @param {object} e - 消息事件
   * @param {{ author?: string, source?: string, modifications?: string }} attribution
   */
  async _doUpload(e, attribution = {}) {
    const { author, source, modifications } = attribution
    const hasCopyright = !!(author && source)

    // 布局守卫：旧布局（junction 聚合）必须先迁移；未初始化需先初始化
    if (!(await guardLayout(e))) return true

    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }
    // 上传统一写入 default 图库，成员需被允许 default 图库
    if (!e.isMaster && !canAccessGallery(e.user_id, 'default')) {
      return e.reply('[面板图图库管理器]\n你未被授权向 default 图库添加面板图')
    }

    // 下划线是文件名各部分的固定分隔符，含下划线会导致版权解析错乱
    if (hasCopyright && [author, source, modifications].some(v => v && v.includes('_'))) {
      return e.reply('[面板图图库管理器]\n上传失败：作者/来源/备注不允许包含下划线（_）\n（下划线是文件名各部分的固定分隔符）')
    }

    // 解析角色名
    const rawRole = e.msg.match(/(?:上传|添加)(.+?)(?:面板图)/)?.[1]?.trim()
      || e.msg.replace(/#|面板图|上传|添加/g, '').trim()
    const roleName = resolveRoleName(rawRole)

    // 新角色：自动分配主仓库（map.json 统一路由）
    const map = loadMap()
    if (!(roleName in map.mapping)) {
      autoAssignRepo(roleName)
      logger.info(`[ProfileImg-Plugin] 新角色「${roleName}」已自动分配主仓库`)
    }

    // 提取图片
    const imgSegments = await this._extractImages(e)
    if (imgSegments.length === 0) {
      e.reply('[面板图图库管理器] 消息中未找到图片。')
      return true
    }

    // 读取上传配置
    const config = getPluginConfig()
    const uploadCfg = config?.upload || {}
    const compressEnabled = uploadCfg.enabled === true
    const format = uploadCfg.format || 'webp'
    const ext = `.${format}`

    // 成员上传始终写入默认图库（权限授权的图库），
    // 与 gallery.defaultDir（手动上传存放目录）解耦，防止配置成主仓库时越权写 main
    const isMember = !e.isMaster
    const uploadDir = isMember ? getDefaultDir() : getUploadDir()
    // 主人将手动上传目录配置为主仓库 → 直写主仓库（main 段位）；其余（含成员）写默认图库（default 段位）
    const directMain = !isMember && getActiveRepoIds().some(id => getRepoDir(id) === uploadDir)
    const writeDir = path.join(uploadDir, 'normal-character', roleName)
    if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true })

    const seg = directMain ? SEGMENTS.main : SEGMENTS.default

    // 直写主仓库时与 Git 更新共用源级锁（默认图库不是 git 仓库，无需加锁）
    const lockId = directMain ? mainRepoLockIdForPath(uploadDir) : ''
    const galleryLock = acquireLocks(lockId ? [{ id: lockId, operation: '写入面板图', type: 'update' }] : [])
    if (!galleryLock.ok) return e.reply(`[面板图图库管理器] ${galleryLock.msg}`)

    let addedCount = 0
    const assignedNums = []

    try {
      for (const img of imgSegments) {
        try {
          const imgUrl = img.url || img.data?.url
            || (img.data?.file_id ? img.data.file_id : null)
          if (!imgUrl) continue

          const res = await fetch(imgUrl)
          if (!res.ok) continue
          const buffer = Buffer.from(await res.arrayBuffer())

          // 压缩（若启用）—— 放在取号之前：压缩含 await，取号与写盘之间必须无 await
          let finalBuffer = buffer
          if (compressEnabled) {
            const maxKB = (uploadCfg.maxSize && !isNaN(uploadCfg.maxSize)) ? uploadCfg.maxSize : 500
            const targetBytes = maxKB * 1024
            if (buffer.length > targetBytes) {
              const { compressed } = await compressToTarget(buffer, targetBytes, format)
              if (compressed && compressed.length < buffer.length) {
                finalBuffer = compressed
              }
            }
          }

          // 序号在下载/压缩完成后再取：取号与写盘之间没有 await，避免并发上传撞到同一个 n
          const nextNum = this._getNextSeq(writeDir, roleName, seg.start, seg.end)

          // 生成文件名
          let baseName
          if (hasCopyright) {
            const modsPart = modifications ? `_${modifications}` : ''
            baseName = `${roleName}_${nextNum}_${author}_${source}${modsPart}`
          } else {
            baseName = `${roleName}_${nextNum}`
          }
          let filePath = path.join(writeDir, baseName + ext)
          let counter = 1
          while (fs.existsSync(filePath)) {
            filePath = path.join(writeDir, `${baseName}_${counter}${ext}`)
            counter++
          }

          fs.writeFileSync(filePath, finalBuffer)

          addedCount++
          assignedNums.push(nextNum)
        } catch (err) {
          logger.error('[PanelImgUpload] 处理图片失败:', err)
        }
      }
    } finally {
      galleryLock.release()
    }

    if (addedCount > 0) {
      const senderName = (e.sender.card || e.sender.nickname || '').slice(0, 8)
      const range = `${assignedNums[0]}~${assignedNums[assignedNums.length - 1]}`
      if (hasCopyright) {
        e.reply([
          segment.at(e.user_id, senderName),
          ` 成功添加${roleName}第${range}张面板图\n（原作者：${author}，来源：${source}${modifications ? `，备注：${modifications}` : ''}）`
        ])
      } else {
        e.reply([
          segment.at(e.user_id, senderName),
          ` 成功添加${roleName}第${range}张面板图`
        ])
      }
    } else {
      e.reply('[面板图图库管理器] 添加失败，请稍后重试。')
    }
    return true
  }

  /**
   * 计算下一个可用序号（段位内最小空缺，扫描目录内所有该角色文件）
   * @param {string} dir - 角色目录
   * @param {string} roleName - 角色名
   * @param {number} start - 段位起点
   * @param {number} end - 段位终点
   * @returns {number}
   */
  _getNextSeq(dir, roleName, start, end) {
    const n = getNextSeqInRange(dir, roleName, start, end)
    return n < 0 ? start : n
  }

  /**
   * 从消息中提取图片 segment
   */
  async _extractImages(e) {
    const isImg = (msg) => {
      if (msg.type === 'image') return true
      if (msg.type === 'file' && /\.(webp|png|jpg|jpeg|gif)$/i.test(msg.data?.file || '')) return true
      return false
    }
    let imgSegments = e.message.filter(isImg)
    if (imgSegments.length === 0) {
      try {
        const reply = await e.getReply?.()
        if (reply) imgSegments = reply.message.filter(isImg)
      } catch {}
    }
    return imgSegments
  }
}
