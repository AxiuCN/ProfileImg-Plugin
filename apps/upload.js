import fs from 'node:fs'
import path from 'node:path'
import { loadMap, autoAssignRepo } from '../model/mapJson.js'
import { getPluginConfig, isManager, canAccessGallery } from '../components/config.js'
import { resolveRoleName } from '../modules/alias.js'
import { compressToTarget } from '../modules/compress.js'
import { getNextSeqInRange, SEGMENTS } from '../components/panelUtils.js'
import { getDefaultDir } from '../model/galleryConfig.js'
import { copyDefaultToMain, getMainRoleDir } from '../model/copier.js'

/**
 * 面板图上传（版权信息可选）
 *
 * 含版权：角色名_n_作者_来源[_二改].扩展名 — #添加琴面板图 张三 米游社
 * 无版权：角色名_n.扩展名 — #添加琴面板图
 *
 * 写入目标（默认位于 default 图库）：
 *   - 写入 default 目录，再复制到主仓库（带"本地默认图库"前缀）
 *   - default 目录 = config.yaml 的 gallery.defaultDir，未配置时用固定目录 gallery/ProfileImg/default
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

    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }
    // 上传统一写入 default 图库，成员需被允许 default 图库
    if (!e.isMaster && !canAccessGallery(e.user_id, 'default')) {
      return e.reply('[面板图图库管理器]\n你未被授权向 default 图库添加面板图')
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

    // 确定写入目录：default 图库（getDefaultDir 恒返回非空，未配置时用固定 default 目录）
    const defaultDir = getDefaultDir()
    const writeDir = defaultDir
      ? path.join(defaultDir, 'normal-character', roleName)
      : path.join(getMainRoleDir(roleName, 'normal'))
    if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true })

    const seqEnd = defaultDir ? 9999999 : SEGMENTS.main.end
    let nextNum = this._getNextSeq(writeDir, roleName, seqEnd)

    let addedCount = 0

    for (const img of imgSegments) {
      try {
        const imgUrl = img.url || img.data?.url
          || (img.data?.file_id ? img.data.file_id : null)
        if (!imgUrl) continue

        const res = await fetch(imgUrl)
        if (!res.ok) continue
        const buffer = Buffer.from(await res.arrayBuffer())

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

        // 压缩（若启用）
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

        fs.writeFileSync(filePath, finalBuffer)

        // 复制到主仓库（上传始终写入 default 图库，defaultDir 恒非空）
        if (defaultDir) {
          const r = copyDefaultToMain(filePath, roleName, 'normal')
          if (!r.ok) logger.warn(`[ProfileImg-Plugin] 复制到主仓库失败: ${r.error}`)
        }

        addedCount++
        nextNum++
      } catch (err) {
        logger.error('[PanelImgUpload] 处理图片失败:', err)
      }
    }

    if (addedCount > 0) {
      const senderName = (e.sender.card || e.sender.nickname || '').slice(0, 8)
      if (hasCopyright) {
        e.reply([
          segment.at(e.user_id, senderName),
          ` 成功添加${roleName}第${nextNum - addedCount}~${nextNum - 1}张面板图\n（原作者：${author}，来源：${source}${modifications ? `，二改：${modifications}` : ''}）`
        ])
      } else {
        e.reply([
          segment.at(e.user_id, senderName),
          ` 成功添加${roleName}第${nextNum - addedCount}~${nextNum - 1}张面板图`
        ])
      }
    } else {
      e.reply('[面板图图库管理器] 添加失败，请稍后重试。')
    }
    return true
  }

  /**
   * 计算下一个可用序号（扫描目录内所有该角色文件）
   * @param {string} dir - 角色目录
   * @param {string} roleName - 角色名
   * @param {number} seqEnd - 序号上限（default 目录用宽松上限，主仓库用 9999）
   * @returns {number}
   */
  _getNextSeq(dir, roleName, seqEnd) {
    const n = getNextSeqInRange(dir, roleName, 1, seqEnd)
    return n < 0 ? 1 : n
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
