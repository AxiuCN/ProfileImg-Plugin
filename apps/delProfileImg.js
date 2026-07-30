import fs from 'node:fs'
import path from 'node:path'
import { resolveRoleName } from '../modules/alias.js'
import { getMainDir } from '../model/blockedInfo.js'
import { getRepoForChar } from '../model/mapJson.js'
import { removeCharJunction } from '../model/junction.js'
import { PROFILE_DIR } from '../components/constants.js'
import { sortPanelFiles } from '../components/panelUtils.js'

/**
 * 删除面板图 — 接管 miao-plugin 的 #删除xxx面板图N
 * 优先级 1，高于 miao-plugin 默认优先级
 * 序号 N 对应文件名中的 n（角色名_n_...），非数组下标
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
    // 从 regex 捕获组直接取角色名和序号（不再用 replace 盲删数字，避免破坏含数字的角色名）
    const match = e.msg.match(/^#?\s*(?:移除|清除|删除)(.+?)(?:面板图)(\d+)\s*$/)
    if (!match) return true

    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[2], 10)

    const charDir = getMainDir(roleName)
    if (!fs.existsSync(charDir)) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    }

    // 读取并排序所有图片文件
    const imgNames = fs.readdirSync(charDir)
      .filter(f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f))

    if (imgNames.length === 0) {
      return e.reply(`[面板图图库管理器]\n角色${roleName}暂无面板图`)
    }

    const sorted = sortPanelFiles(imgNames, roleName)

    // 按 n 查找目标文件
    let targetFile = null
    let nonStdIdx = 0
    for (const item of sorted) {
      if (item.parsed.isStandard) {
        if (item.parsed.seq === n) { targetFile = item.name; break }
      } else {
        if (100001 + nonStdIdx === n) { targetFile = item.name; break }
        nonStdIdx++
      }
    }

    if (!targetFile) {
      return e.reply(`[面板图图库管理器]\n序号无效，当前有${sorted.length}张图`)
    }

    try {
      fs.unlinkSync(path.join(charDir, targetFile))

      // 如果删除后角色目录为空，清理 junction 和空目录
      const remaining = fs.readdirSync(charDir).filter(
        f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f)
      )
      if (remaining.length === 0) {
        removeCharJunction(roleName, 'normal', PROFILE_DIR)
        removeCharJunction(roleName, 'super', PROFILE_DIR)
        if (fs.readdirSync(charDir).length === 0) {
          fs.rmdirSync(charDir)
        }
      }

      return e.reply(`[面板图图库管理器]\n已删除${roleName}第${n}张面板图(${targetFile})`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除面板图失败:', err)
      return e.reply('[面板图图库管理器] 删除失败: ' + err.message)
    }
  }
}
