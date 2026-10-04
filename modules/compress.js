import sharp from 'sharp'

/**
 * 二分查找最高可用质量，使图片体积尽量接近目标值（不超过目标大小）
 * 以 quality=95 快速测试，缩小二分范围后最多迭代 50 次
 * @param {Buffer} inputBuffer - 原始图片 Buffer
 * @param {number} targetBytes - 目标字节数
 * @param {string} format - 输出格式 ('jpeg'|'webp'|'png')
 * @returns {Promise<{compressed: Buffer|null, size: number}>}
 */
export async function compressToTarget(inputBuffer, targetBytes, format) {
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

/**
 * 探测图片实际格式（sharp 口径：jpeg / png / webp / gif …）
 * 读不出格式时返回空串，调用方按「需要转换」处理
 * @param {Buffer} inputBuffer - 图片 Buffer
 * @returns {Promise<string>} 格式名（小写），失败返回空串
 */
export async function detectFormat(inputBuffer) {
  try {
    const meta = await sharp(inputBuffer).metadata()
    return meta?.format || ''
  } catch {
    return ''
  }
}

/**
 * 按目标格式重新编码图片（保证字节与文件扩展名一致，不做体积优化）
 * @param {Buffer} inputBuffer - 原始图片 Buffer
 * @param {string} format - 目标格式 ('jpeg'|'webp'|'png')
 * @param {number} [quality] - 质量 (1-100)，默认 95
 * @returns {Promise<Buffer>} 目标格式的图片 Buffer
 */
export async function convertToFormat(inputBuffer, format, quality = 95) {
  return encodeWithQuality(inputBuffer, format, quality)
}
