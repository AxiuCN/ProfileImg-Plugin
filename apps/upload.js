import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar, setRepoForChar } from '../model/mapJson.js'
import { getMainDir } from '../model/blockedInfo.js'
import { getPluginConfig } from '../components/config.js'
import { resolveRoleName } from '../modules/alias.js'
import { compressToTarget } from '../modules/compress.js'
import { createCharJunction } from '../model/junction.js'
import { getRepoCharDir, getRepoDir, PROFILE_DIR } from '../components/constants.js'

/**
 * 面板图上传（新版：含版权归属信息）
 *
 * 命名格式：<角色名><序号>_<原作者>_<来源>[_<二改情况>].webp
 * 示例：琴1_张三_米游社.webp、琴2_李四_lofter_AI扩图.webp
 *
 * 优先级 1，高于 miao-plugin 默认优先级，确保先匹配
 */
export class UploadWithCompress extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]上传',
      dsc: '上传面板图（支持版权归属）',
      event: 'message',
      priority: 1,
      rule: [
        {
          // 新版格式：#添加琴面板图 张三 米游社 [AI扩图]
          reg: /^#?\s*(?:上传|添加)(.+?)(?:面板图)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/,
          fnc: 'uploadWithAttribution'
        },
        {
          // 旧版兼容：#添加琴面板图（无版权信息，提示用户新格式）
          reg: /^#?\s*(?:上传|添加)(.+)(?:面板图)\s*$/,
          fnc: 'uploadLegacyHint'
        }
      ]
    })
  }

  /**
   * 新版上传：含版权归属信息
   */
  async uploadWithAttribution(e) {
    const match = e.msg.match(/^#?\s*(?:上传|添加)(.+?)(?:面板图)\s+(.+?)\s+(.+?)(?:\s+(.+))?\s*$/)
    if (!match) return true

    const rawRole = match[1].trim()
    const author = match[2].trim()
    const source = match[3].trim()
    const modifications = (match[4] || '').trim()

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
      // 自动创建 character-level junction
      createCharJunction(roleName, 'normal', getRepoDir(repoId), PROFILE_DIR)
      // 更新 map.json
      setRepoForChar(roleName, repoId)
    }

    // 计算序号：扫描已有文件，取最大序号+1
    const nextNum = this._getNextSeq(repoCharDir, roleName)

    // 读取上传配置
    const config = getPluginConfig()
    const uploadCfg = config?.upload || {}
    const compressEnabled = uploadCfg.enabled === true
    const format = uploadCfg.format || 'webp'

    let addedCount = 0
    const addedFiles = []

    for (const img of imgSegments) {
      try {
        const imgUrl = img.url || img.data?.url
          || (img.data?.file_id ? img.data.file_id : null)
        if (!imgUrl) continue

        const res = await fetch(imgUrl)
        if (!res.ok) continue
        const buffer = Buffer.from(await res.arrayBuffer())

        // 生成文件名
        const modsPart = modifications ? `_${modifications}` : ''
        const baseName = `${roleName}${nextNum}_${author}_${source}${modsPart}`
        const ext = `.${format}`
        let filePath = path.join(repoCharDir, baseName + ext)
        // 去重（极少情况）
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
        addedFiles.push(baseName + ext)
        addedCount++
        nextNum++
      } catch (err) {
        logger.error('[PanelImgUpload] 处理图片失败:', err)
      }
    }

    if (addedCount > 0) {
      const senderName = (e.sender.card || e.sender.nickname || '').slice(0, 8)
      e.reply([
        segment.at(e.user_id, senderName),
        ` 成功添加${roleName}第${nextNum - addedCount}~${nextNum - 1}张面板图\n（原作者：${author}，来源：${source}${modifications ? `，二改：${modifications}` : ''}）`
      ])
    } else {
      e.reply('[面板图图库管理器] 添加失败，请稍后重试。')
    }
    return true
  }

  /**
   * 旧版上传：提示用户新格式
   */
  async uploadLegacyHint(e) {
    const rawRole = e.msg.replace(/#|面板图|上传|添加/g, '').trim()
    e.reply([
      '[面板图图库管理器] 请使用新版格式上传面板图：\n',
      `#添加${rawRole || '角色名'}面板图 原作者 来源 [二改情况]\n`,
      '示例：#添加琴面板图 张三 米游社\n',
      '示例：#添加甘雨面板图 李四 lofter AI扩图'
    ].join(''))
    return true
  }

  /**
   * 计算下一个可用的序号
   * @param {string} dir - 角色目录
   * @param {string} roleName - 角色名
   * @returns {number}
   */
  _getNextSeq(dir, roleName) {
    try {
      if (!fs.existsSync(dir)) return 1
      const files = fs.readdirSync(dir)
      const pattern = new RegExp(`^${this._escapeRegExp(roleName)}(\\d+)_.+`)
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
   * 转义正则特殊字符（用于角色名中可能含有的特殊字符）
   */
  _escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
