import fs from 'node:fs'
import path from 'node:path'
import { BACKUP_DIR } from '../components/constants.js'
import { checkProfileJunction } from '../model/gallery.js'
import { notifyMaster } from '../components/notify.js'
import { parseFilename } from '../components/panelUtils.js'
import { getDefaultDir } from '../model/galleryConfig.js'
import { copyDefaultToMain } from '../model/copier.js'

const IMG_RE = /\.(webp|png|jpg|jpeg|gif)$/i

/**
 * #迁移图库 — 将 backup 中的旧图库数据迁入 default 图库，再复制到主图库
 * 前置条件：图库已初始化，backup 目录存在，已配置 default 图库
 *
 * 迁移目标：default 图库（普通目录）→ 复制到主仓库（本地默认图库前缀）
 * 不再创建 Profile-old 目录
 */
export class MigrateGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]迁移',
      dsc: '将备份图库迁移到 default 图库并复制到主图库',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#迁移图库$', fnc: 'migrate', permission: 'master' }
      ]
    })
  }

  async migrate(e) {
    // 检查前置条件
    const backupProfile = path.join(BACKUP_DIR, 'profile')
    if (!fs.existsSync(backupProfile)) {
      return e.reply('[面板图图库管理器] 没有找到备份数据，请先执行 #备份图库。')
    }

    const jCheck = checkProfileJunction()
    if (!jCheck.ok) {
      return e.reply(jCheck.msg)
    }

    const defaultDir = getDefaultDir()
    if (!defaultDir) {
      return e.reply('[面板图图库管理器] default 图库不可用，无法迁移。')
    }

    e.reply('[面板图图库管理器] 开始迁移图库，请稍候...')

    try {
      let migratedChars = 0
      let migratedImgs = 0
      let renamedImgs = 0
      let copiedToMain = 0

      const types = ['normal-character', 'super-character']

      // ========== 第一阶段：复制 backup → default 图库 ==========
      for (const type of types) {
        const backupTypeDir = path.join(backupProfile, type)
        if (!fs.existsSync(backupTypeDir)) continue

        const chars = fs.readdirSync(backupTypeDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const charDir of chars) {
          const charName = charDir.name
          const targetDir = path.join(defaultDir, type, charName)
          const sourceDir = path.join(backupTypeDir, charName)

          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
          }

          const files = fs.readdirSync(sourceDir, { withFileTypes: true })
            .filter(f => f.isFile() && IMG_RE.test(f.name))

          for (const file of files) {
            const src = path.join(sourceDir, file.name)
            const dest = path.join(targetDir, file.name)
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(src, dest)
              migratedImgs++
            }
          }
          migratedChars++
        }
      }

      // ========== 第二阶段：default 图库内重命名非标准文件为 角色_n.ext ==========
      for (const type of types) {
        const defaultTypeDir = path.join(defaultDir, type)
        if (!fs.existsSync(defaultTypeDir)) continue

        const chars = fs.readdirSync(defaultTypeDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const charDir of chars) {
          const charName = charDir.name
          const targetDir = path.join(defaultTypeDir, charName)
          if (!fs.existsSync(targetDir)) continue

          const imgNames = fs.readdirSync(targetDir).filter(f => IMG_RE.test(f))

          let maxSeq = 0
          for (const fname of imgNames) {
            const parsed = parseFilename(fname, charName)
            if (parsed.isStandard && parsed.seq > maxSeq) maxSeq = parsed.seq
          }

          let nextSeq = maxSeq + 1
          for (const fname of imgNames) {
            const parsed = parseFilename(fname, charName)
            // 标准命名（含版权/无版权）保留原名
            if (parsed.isStandard) continue

            const ext = path.extname(fname)
            let newName = `${charName}_${nextSeq}${ext}`
            let counter = 1
            while (fs.existsSync(path.join(targetDir, newName))) {
              newName = `${charName}_${nextSeq}_${counter}${ext}`
              counter++
            }
            if (fname !== newName) {
              fs.renameSync(path.join(targetDir, fname), path.join(targetDir, newName))
              renamedImgs++
            }
            nextSeq++
          }
        }
      }

      // ========== 第三阶段：复制 default → 主仓库（本地默认图库前缀） ==========
      for (const type of ['normal', 'super']) {
        const defaultTypeDir = path.join(defaultDir, `${type}-character`)
        if (!fs.existsSync(defaultTypeDir)) continue

        const chars = fs.readdirSync(defaultTypeDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const charDir of chars) {
          const charName = charDir.name
          const roleDir = path.join(defaultTypeDir, charName)
          if (!fs.existsSync(roleDir)) continue
          const files = fs.readdirSync(roleDir).filter(f => IMG_RE.test(f))
          for (const f of files) {
            const r = copyDefaultToMain(path.join(roleDir, f), charName, type)
            if (r.ok) copiedToMain++
          }
        }
      }

      const msg = `原图库迁移已完成，共迁移 ${migratedChars} 个角色 / ${migratedImgs} 张图片\n` +
        `重命名：${renamedImgs} / 复制到主图库：${copiedToMain}\n` +
        `目标：default 图库（本地默认图库前缀）\n` +
        `你可以手动删除 ProfileImg-Plugin/resources/gallery/backup 的原图库备份。`
      notifyMaster(msg)
      return e.reply(msg)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 迁移失败:', err)
      return e.reply('[面板图图库管理器] 迁移失败: ' + err.message)
    }
  }
}
