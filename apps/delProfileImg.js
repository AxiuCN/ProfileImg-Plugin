import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getRoleFiles } from '../model/blockedInfo.js'
import { resolveNRange, resolveGalleryKey, escapeRegExp } from '../components/panelUtils.js'
import { isManager, canAccessGallery } from '../components/config.js'
import { getDefaultDir } from '../model/galleryConfig.js'

/**
 * 删除面板图 — 接管 miao-plugin 的 #删除xxx面板图N
 * 优先级 1，高于 miao-plugin 默认优先级
 * 序号 N 按段位判断来源（见计划 §序号段位设计）：
 *   main(1~9999)         → 删除主仓库源文件
 *   default(10001~99999) → 删除主仓库副本 + 同步删除 default 源文件
 *   third-party(≥100001) → .bak 屏蔽（源在第三方仓库，不可真删）
 */
export class DelProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]删除',
      dsc: '删除面板图',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?\s*(?:移除|清除|删除)(.+)(?:面板图)(\d+)\s*$/, fnc: 'delete' }
      ]
    })
  }

  async delete(e) {
    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }

    // 从 regex 捕获组直接取角色名和序号（不再用 replace 盲删数字，避免破坏含数字的角色名）
    const match = e.msg.match(/^#?\s*(?:移除|清除|删除)(.+?)(?:面板图)(\d+)\s*$/)
    if (!match) return true

    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[2], 10)

    const files = getRoleFiles(roleName, 'normal')
    const target = files.find(f => f.displayN === n)
    if (!target) {
      return e.reply(`[面板图图库管理器]\n序号无效，角色${roleName}没有第${n}张图`)
    }

    // 成员图库边界：目标图所属图库须被允许
    if (!e.isMaster) {
      const gkey = resolveGalleryKey(target.name, roleName, n)
      if (!gkey || !canAccessGallery(e.user_id, gkey)) {
        return e.reply(`[面板图图库管理器]\n你未被授权操作「${gkey || '未知'}」图库的面板图`)
      }
    }

    const { source } = resolveNRange(n)

    try {
      if (source === 'main') {
        // 主图库：删除源文件
        fs.unlinkSync(target.filePath)
        return e.reply(`[面板图图库管理器]\n已删除${roleName}第${n}张面板图(${target.name})`)
      }

      if (source === 'default') {
        // default 复制：删主仓库副本 + 同步删 default 源文件
        fs.unlinkSync(target.filePath)
        let extraMsg = ''
        const origName = extractDefaultOriginal(target.name, roleName)
        if (origName) {
          const defaultFile = path.join(getDefaultDir(), 'normal-character', roleName, origName)
          if (fs.existsSync(defaultFile)) {
            try {
              fs.unlinkSync(defaultFile)
              extraMsg = '\n已同步删除 default 图库源文件'
            } catch { /* default 源删除失败不阻塞 */ }
          }
        }
        return e.reply(`[面板图图库管理器]\n已删除${roleName}第${n}张面板图(${target.name})${extraMsg}`)
      }

      if (source === 'third-party') {
        // 第三方：源文件在第三方仓库，不可真删，改 .bak 屏蔽
        fs.renameSync(target.filePath, target.filePath + '.bak')
        return e.reply(`[面板图图库管理器]\n第三方图库图片不可删除，已屏蔽${roleName}第${n}张面板图(${target.name})`)
      }

      return e.reply('[面板图图库管理器]\n该文件不符合命名规范，无法删除')
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除面板图失败:', err)
      return e.reply('[面板图图库管理器] 删除失败: ' + err.message)
    }
  }
}

/**
 * 从 default 复制文件名提取 default 图库源文件名
 * 琴_10001_本地默认图库_默认_fav01.webp → fav01.webp
 * @param {string} filename
 * @param {string} roleName
 * @returns {string|null}
 */
function extractDefaultOriginal(filename, roleName) {
  const esc = escapeRegExp(roleName)
  const m = filename.match(new RegExp(`^${esc}_\\d+_本地默认图库_默认_(.+)$`, 'i'))
  return m ? m[1] : null
}
