import fs from 'node:fs'
import path from 'node:path'
import { getRepoForChar } from '../model/mapJson.js'
import { getPluginConfig } from '../components/config.js'
import { resolveRoleName } from '../modules/alias.js'
import { compressToTarget } from '../modules/compress.js'
import { createPanelLink } from '../model/linkAggregator.js'
import { buildRepos, getRepoRoleDir, SEGMENTS } from '../model/repoRegistry.js'
import { escapeRegExp } from '../components/panelUtils.js'

/**
 * 面板图上传（版权信息可选）
 *
 * 含版权：角色名_n_作者_来源[_二改].扩展名 — #添加琴面板图 张三 米游社
 * 无版权：角色名_n.扩展名 — #添加琴面板图
 *
 * 写入目标：
 *   - 默认写入 default 图库（锅巴配置目录），n 从 20001 起
 *   - 若 default 图库路径指向主图库（miao-plugin-ProfileImg），按 map.json 分类到各主仓库
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

    // 确定目标仓库（default 图库 / 主图库按 map.json 路由）和角色目录
    const repos = buildRepos()
    const targetRepo = this._getUploadRepo(roleName, repos)
    const repoCharDir = getRepoRoleDir(targetRepo, 'normal', roleName)

    // 确保目录存在
    if (!fs.existsSync(repoCharDir)) {
      fs.mkdirSync(repoCharDir, { recursive: true })
    }

    // 计算序号：扫描目标仓库角色目录下的所有标准格式文件
    const nextNum = this._getNextSeq(repoCharDir, roleName, targetRepo.type)

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
        // 建聚合硬链接（供 miao-plugin 通过聚合目录读取）
        createPanelLink(filePath, path.basename(filePath), 'normal', roleName)
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
   * default 图库从段位起点（20001）开始，主图库从 1 开始
   * @param {string} dir - 角色目录
   * @param {string} roleName - 角色名
   * @param {string} repoType - 仓库类型（'default' | 其他）
   * @returns {number}
   */
  _getNextSeq(dir, roleName, repoType = 'main') {
    const floor = repoType === 'default' ? SEGMENTS.default.start : 1
    try {
      if (!fs.existsSync(dir)) return floor
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
      return Math.max(maxSeq + 1, floor)
    } catch {
      return floor
    }
  }

  /**
   * 确定上传目标仓库
   * - default 图库路径已配置且不指向主图库 → 写 default 图库
   * - default 图库指向 miao-plugin-ProfileImg（主图库）→ 按 map.json 路由到主仓库
   * - 未配置 default → 按 map.json 路由到主仓库（兼容旧行为）
   * @param {string} roleName - 角色名
   * @param {Array} repos - 仓库注册表
   * @returns {object} 目标仓库对象
   */
  _getUploadRepo(roleName, repos) {
    const config = getPluginConfig()
    const defaultDir = config?.gallery?.defaultDir
    const defaultRepo = repos.find(r => r.type === 'default')

    // 有 default 图库且配置了路径 → 写 default（除非指向主图库）
    if (defaultRepo && defaultDir) {
      const mainRepo0 = repos.find(r => r.type === 'main' && r.repoId === 0)
      const isMainDir = mainRepo0 && path.resolve(defaultDir) === path.resolve(mainRepo0.dir)
      if (!isMainDir) return defaultRepo
      // default 指向主图库 → 走 map.json 路由
      const repoId = getRepoForChar(roleName)
      return repos.find(r => r.type === 'main' && r.repoId === repoId) || defaultRepo
    }

    // 无 default 配置 → map.json 路由主仓库
    const repoId = getRepoForChar(roleName)
    return repos.find(r => r.type === 'main' && r.repoId === repoId) || repos.find(r => r.type === 'main')
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
