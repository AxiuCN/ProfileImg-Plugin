import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar, setRepoForChar } from '../model/mapJson.js'
import { getPluginConfig } from '../components/config.js'
import { resolveRoleName } from '../modules/alias.js'
import { compressToTarget } from '../modules/compress.js'
import { createCharJunction } from '../model/junction.js'
import { getRepoCharDir, getRepoDir, PROFILE_DIR } from '../components/constants.js'
import { escapeRegExp } from '../components/panelUtils.js'

/**
 * 面板图上传（版权信息可选）
 *
 * 含版权：角色名_n_作者_来源[_二改].扩展名 — #添加琴面板图 张三 米游社
 * 无版权：角色名_n.扩展名 — #添加琴面板图
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

    // 解析角色名
    const rawRole = e.msg.match(/(?:上传|添加)(.+?)(?:面板图)/)?.[1]?.trim()
      || e.msg.replace(/#|面板图|上传|添加/g, '').trim()
    const roleName = resolveRoleName(rawRole)

    // 提取图片
    const imgSegments = await this._extractImages(e)
    if (imgSegments.length === 0) {
      e.reply('[面板图图库管理器] 消息中未找到图片。')
      return true
    }

    // 确定目标仓库和路径
    const repoId = getRepoForChar(roleName)
    const repoCharDir = path.join(getRepoCharDir(repoId, 'normal'), roleName)

    // 确保目录存在
    if (!fs.existsSync(repoCharDir)) {
      fs.mkdirSync(repoCharDir, { recursive: true })
      createCharJunction(roleName, 'normal', getRepoDir(repoId), PROFILE_DIR)
      setRepoForChar(roleName, repoId)
    }

    // 计算序号：扫描所有标准格式文件
    const nextNum = this._getNextSeq(repoCharDir, roleName)

    // 读取上传配置
    const config = getPluginConfig()
    const uploadCfg = config?.upload || {}
    const compressEnabled = uploadCfg.enabled === true
    const format = uploadCfg.format || 'webp'

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
        const ext = `.${format}`
        let baseName
        if (hasCopyright) {
          const modsPart = modifications ? `_${modifications}` : ''
          baseName = `${roleName}_${nextNum}_${author}_${source}${modsPart}`
        } else {
          baseName = `${roleName}_${nextNum}`
        }
        let filePath = path.join(repoCharDir, baseName + ext)
        let counter = 1
        while (fs.existsSync(filePath)) {
          filePath = path.join(repoCharDir, `${baseName}_${counter}${ext}`)
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
   * 计算下一个可用的序号（扫描所有标准格式：含版权 + 无版权）
   * @param {string} dir - 角色目录
   * @param {string} roleName - 角色名
   * @returns {number}
   */
  _getNextSeq(dir, roleName) {
    try {
      if (!fs.existsSync(dir)) return 1
      const files = fs.readdirSync(dir)
      const esc = escapeRegExp(roleName)
      // 匹配 角色名_n_*（含版权）和 角色名_n.扩展名（无版权）
      const pattern = new RegExp(`^${esc}_(\\d+)(?:_|\\.)`, 'i')
      let maxSeq = 0
      for (const file of files) {
        const m = file.match(pattern)
        if (m) {
          const seq = parseInt(m[1], 10)
          if (seq > maxSeq) maxSeq = seq
        }
      }
      return maxSeq + 1
    } catch {
      return 1
    }
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
