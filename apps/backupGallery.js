import fs from 'node:fs'
import path from 'node:path'
import { MIAO_PROFILE_LINK, BACKUP_DIR } from '../components/constants.js'
import { isJunction } from '../model/junction.js'

/**
 * #备份图库 — 将旧 miao-plugin/resources/profile 复制到 backup 目录
 * 前置条件：profile 为真实目录（非 junction）
 */
export class BackupGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]备份',
      dsc: '备份旧图库数据',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#备份图库$', fnc: 'backup', permission: 'master' }
      ]
    })
  }

  async backup(e) {
    // 检查前置条件
    if (!fs.existsSync(MIAO_PROFILE_LINK)) {
      return e.reply('[面板图图库管理器] 没有需要备份的图库（profile 目录不存在）。')
    }
    if (isJunction(MIAO_PROFILE_LINK)) {
      return e.reply('[面板图图库管理器] 图库已初始化，不需要备份。请使用 #迁移图库 恢复备份数据。')
    }

    e.reply('[面板图图库管理器] 开始备份图库，请稍候...')

    try {
      // 确保 backup 目录存在
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true })
      }

      // 使用 fs.cp 递归复制
      const src = MIAO_PROFILE_LINK
      const dest = path.join(BACKUP_DIR, 'profile')
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true })
      }
      fs.cpSync(src, dest, { recursive: true })

      return e.reply([
        '备份已完成，原图库备份位于 ProfileImg-Plugin/resources/gallery/backup，\n',
        '在图库初始化完成后可以发送【#迁移图库】重新启用原图库。'
      ].join(''))
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 备份失败:', err)
      return e.reply('[面板图图库管理器] 备份失败: ' + err.message)
    }
  }
}
