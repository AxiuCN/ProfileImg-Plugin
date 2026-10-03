import fs from 'node:fs'
import { resolveRoleName } from '../modules/alias.js'
import { findImageByN } from '../model/galleryIndex.js'
import { resolveGalleryKey } from '../components/panelUtils.js'
import { isManager, canAccessGallery } from '../components/config.js'
import { guardLayout } from '../model/layoutGuard.js'
import { mainRepoLockIdForPath } from '../model/galleryConfig.js'
import { acquireLocks } from '../model/git.js'

/**
 * 删除面板图 — 接管 miao-plugin 的 #删除xxx面板图N
 * 优先级 1，高于 miao-plugin 默认优先级
 *
 * 段位寻址（多图库源布局）：
 *   default(10001~99999) → 删除默认图库（resources/profile）内的文件
 *   main(1~9999)         → 删除主仓库内的文件
 * 第三方图库源使用第三方原生命名、不参与段位寻址，需在源仓库中自行管理
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

  async delete (e) {
    // 布局守卫：旧布局需先迁移，未初始化需先初始化
    if (!(await guardLayout(e))) return true

    // 权限：仅主人或已授权成员（见 config/manager_config.yaml）
    if (!isManager(e)) {
      return e.reply('[面板图图库管理器]\n该指令仅主人或已授权群成员可使用')
    }

    // 从 regex 捕获组直接取角色名和序号（避免破坏含数字的角色名）
    const match = e.msg.match(/^#?\s*(?:移除|清除|删除)(.+?)(?:面板图)(\d+)\s*$/)
    if (!match) return true

    const roleName = resolveRoleName(match[1].trim())
    const n = parseInt(match[2], 10)

    const target = findImageByN(roleName, 'normal', n)
    if (!target) {
      return e.reply([
        `[面板图图库管理器]\n序号无效：角色${roleName}没有第${n}张图\n`,
        '（第三方图库的图片不参与序号，请在源仓库中管理）'
      ].join(''))
    }

    // 成员图库边界：目标图所属图库须被允许
    if (!e.isMaster) {
      const gkey = resolveGalleryKey(target.name, roleName, n)
      if (!gkey || !canAccessGallery(e.user_id, gkey)) {
        return e.reply(`[面板图图库管理器]\n你未被授权操作「${gkey || '未知'}」图库的面板图`)
      }
    }

    // 主仓库内的文件与 Git 更新共用源级锁（默认图库无需加锁）
    const lockId = mainRepoLockIdForPath(target.dir)
    const galleryLock = acquireLocks(lockId ? [{ id: lockId, operation: '删除面板图', type: 'update' }] : [])
    if (!galleryLock.ok) return e.reply(`[面板图图库管理器] ${galleryLock.msg}`)

    try {
      fs.unlinkSync(target.filePath)
      const label = target.source === 'default' ? '默认图库' : target.label
      return e.reply(`[面板图图库管理器]\n已从${label}删除${roleName}第${n}张面板图(${target.name})`)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 删除面板图失败:', err)
      return e.reply('[面板图图库管理器] 删除失败: ' + err.message)
    } finally {
      galleryLock.release()
    }
  }
}
