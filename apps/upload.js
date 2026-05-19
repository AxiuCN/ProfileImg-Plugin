import fs from 'node:fs'
import path from 'node:path'
import { getMainDir } from '../components/blockedInfo.js'
import { getPluginConfig } from '../components/config.js'
import { resolveRoleName } from '../components/alias.js'
import sharp from 'sharp'

/**
 * 高优先级拦截 #添加xx面板图 / #上传xx面板图，支持图片压缩
 * 优先级设为 1，高于 miao-plugin 默认优先级，确保先匹配
 * 默认关闭压缩，由配置文件 upload.enabled 控制
 */
export class UploadWithCompress extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]上传',
      dsc: '拦截并处理面板图上传（可选压缩）',
      event: 'message',
      priority: 1,
      rule: [
        {
          reg: /^#?\s*(?:上传|添加)(.+)(?:面板图)\s*$/,
          fnc: 'uploadWithCompress'
        }
      ]
    })
  }

  async uploadWithCompress(e) {
    // 1. 解析角色名（使用我们自己的别名解析，不依赖 miao-plugin 私有模块）
    const rawRole = e.msg.replace(/#|面板图|上传|添加/g, '').trim()
    const roleName = resolveRoleName(rawRole)

    // 2. 获取图片：消息本身 + 引用消息，支持 image 和文件型图片
    const isImg = (msg) => {
      if (msg.type === 'image') return true
      if (msg.type === 'file' && /\.(webp|png|jpg|jpeg|gif)$/i.test(msg.data?.file || '')) return true
      return false
    }

    let imgSegments = e.message.filter(isImg)
    if (imgSegments.length === 0) {
      const reply = await e.getReply?.()
      if (reply) imgSegments = reply.message.filter(isImg)
    }
    if (imgSegments.length === 0) {
      e.reply('[面板图图库管理器] 消息中未找到图片。')
      return true
    }

    // 3. 确保角色目录存在
    const mainDir = getMainDir(roleName)
    if (!fs.existsSync(mainDir)) fs.mkdirSync(mainDir, { recursive: true })

    // 4. 读取上传配置（默认关闭压缩，格式默认 webp，目标大小默认 500KB）
    const config = getPluginConfig()
    const uploadCfg = config?.upload || {}
    const compressEnabled = uploadCfg.enabled === true
    const format = uploadCfg.format || 'webp'

    let addedCount = 0
    for (const img of imgSegments) {
      try {
        // 构建下载链接（兼容多种协议端）
        let imgUrl = img.url || img.data?.url
        // 如果 url 为空，尝试用 file_id 作为 url（LLOneBot 等适配器支持）
        if (!imgUrl && img.data?.file_id) {
          imgUrl = img.data.file_id
        }
        if (!imgUrl) continue

        const res = await fetch(imgUrl)
        if (!res.ok) continue
        const buffer = Buffer.from(await res.arrayBuffer())

        // 准备文件名（保留原始名称，去除扩展名，自动添加数字后缀避免重复）
        const rawName = img.file || img.data?.file || ''
        let baseName = rawName.replace(/\.[^.]+$/, '') || Date.now().toString()
        const ext = `.${format}`
        let filePath = path.join(mainDir, baseName + ext)
        let counter = 1
        while (fs.existsSync(filePath)) {
          filePath = path.join(mainDir, `${baseName}_${counter}${ext}`)
          counter++
        }

        // 5. 压缩（若启用且原图大于目标大小）
        let finalBuffer = buffer
        if (compressEnabled) {
          // 从配置读取 maxSize（单位 KB），默认 500KB
          const maxKB = (uploadCfg.maxSize && !isNaN(uploadCfg.maxSize)) ? uploadCfg.maxSize : 500
          const targetBytes = maxKB * 1024

          // 只有原图大于目标大小时才压缩
          if (buffer.length > targetBytes) {
            const { compressed } = await compressToTarget(buffer, targetBytes, format)
            if (compressed && compressed.length < buffer.length) {
              finalBuffer = compressed
            }
          }
        }

        // 保存图片
        fs.writeFileSync(filePath, finalBuffer)
        addedCount++
      } catch (err) {
        logger.error(`[PanelImgUpload] 处理图片失败:`, err)
      }
    }

    // 6. 回复结果（@发送者 + 角色名 + 数量）
    if (addedCount > 0) {
      const senderName = (e.sender.card || e.sender.nickname || '').slice(0, 8)
      e.reply([segment.at(e.user_id, senderName), ` 成功添加${addedCount}张${roleName}面板图。`])
    } else {
      e.reply('[面板图图库管理器] 添加失败，请稍后重试。')
    }
    return true
  }
}

/**
 * 二分查找最高可用质量，使图片体积尽量接近目标值（不超过目标大小）
 * 以 quality=95 快速测试，缩小二分范围后最多迭代 50 次
 * @param {Buffer} inputBuffer - 原始图片 Buffer
 * @param {number} targetBytes - 目标字节数
 * @param {string} format - 输出格式 ('jpeg'|'webp'|'png')
 * @returns {Promise<{compressed: Buffer|null, size: number}>}
 */
async function compressToTarget(inputBuffer, targetBytes, format) {
  // 用 quality=95 快速测试，缩小二分查找范围
  let low = 1, high = 100
  const fast = await encodeWithQuality(inputBuffer, format, 95)
  if (fast.length <= targetBytes) { low = 95 } else { high = 95 }

  let bestQuality = low
  let bestBuffer = fast

  // 二分查找，最多 50 次迭代
  for (let i = 0; i < 50; i++) {
    const quality = Math.floor((low + high) / 2)
    const buf = await encodeWithQuality(inputBuffer, format, quality)
    if (buf.length <= targetBytes) {
      bestQuality = quality; bestBuffer = buf; low = quality + 1
    } else {
      high = quality - 1
    }
    if (low > high) break
  }

  // 只有压缩后体积确实减小才返回，否则保留原图
  return bestBuffer.length < inputBuffer.length
    ? { compressed: bestBuffer, size: bestBuffer.length }
    : { compressed: null, size: inputBuffer.length }
}

/**
 * 使用指定质量编码图片到内存 Buffer
 * @param {Buffer} inputBuffer - 原始图片 Buffer
 * @param {string} format - 输出格式
 * @param {number} quality - 质量 (1-100)
 * @returns {Promise<Buffer>}
 */
async function encodeWithQuality(inputBuffer, format, quality) {
  const pipeline = sharp(inputBuffer)
  if (format === 'jpeg') pipeline.jpeg({ quality })
  else if (format === 'webp') pipeline.webp({ quality })
  else if (format === 'png') pipeline.png({ quality, palette: true, compressionLevel: 9 })
  else pipeline.webp({ quality })
  return pipeline.toBuffer()
}