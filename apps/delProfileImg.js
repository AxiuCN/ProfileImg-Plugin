import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getMainDir } from '../model/blockedInfo.js'
import { getRepoForChar } from '../model/mapJson.js'
import { removeCharJunction } from '../model/junction.js'
import { PROFILE_DIR } from '../components/constants.js'

/**
 * 删除面板图 — 接管 miao-plugin 的 #删除xxx面板图N
 * 优先级 1，高于 miao-plugin 默认优先级
 */
export class DelProfileImg extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]删除',
      dsc: '删除面板图',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?\s*(?:移除|清除|删除)(.+)(?:面板图)(\d){1,}\s*$/, fnc: 'delete' }
      ]
    })
  }

  async delete(e) {
    // 解析角色名（miao-plugin 内部重新解析，我们也照做）
    const roleName = resolveRoleName(
      e.msg.replace(/#|面板图|列表|上传|删除|\d+/g, '').trim()
    )
    const charDir = getMainDir(roleName)

    if (!fs.existsSync(charDir)) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    }

    // 读取所有图片文件
    const imgs = fs.readdirSync(charDir)
      .filter(f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f.name || f))

    if (imgs.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    }

    const num = e.msg.match(/\d+/)
    const idx = parseInt(num?.[0] || '1', 10)

    if (idx < 1 || idx > imgs.length) {
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${imgs.length}张图`)
    }

    const targetFile = imgs[idx - 1]
    try {
      fs.unlinkSync(path.join(charDir, targetFile))

      // 如果删除后角色目录为空，清理 junction 和空目录
      const remaining = fs.readdirSync(charDir).filter(
        f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f)
      )
      if (remaining.length === 0) {
        // 尝试清理 junction
        removeCharJunction(roleName, 'normal', PROFILE_DIR)
        removeCharJunction(roleName, 'super', PROFILE_DIR)
        // 删除空角色目录
        if (fs.readdirSync(charDir).length === 0) {
          fs.rmdirSync(charDir)
        }
      }

      return e.reply(`[面板图图库管理器]\n已删除${roleName}第${idx}张面板图(${targetFile})`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除面板图失败:', err)
      return e.reply('[面板图图库管理器] 删除失败: ' + err.message)
    }
  }
}
