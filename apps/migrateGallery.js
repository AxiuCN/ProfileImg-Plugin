import fs from 'node:fs'
import path from 'node:path'
import { PROFILE_DIR, BACKUP_DIR, MIAO_PROFILE_LINK, getRepoDir } from '../components/constants.js'
import { isJunction, createCharJunction } from '../model/junction.js'
import { loadMap, setRepoForChars } from '../model/mapJson.js'
import { notifyMaster } from '../components/notify.js'
import { parseFilename } from '../components/panelUtils.js'

/**
 * #迁移图库 — 将 backup 中的旧图库数据分散到各个仓库
 * 前置条件：图库已初始化，backup 目录存在
 *
 * 分配策略：按 map.json 表确定每个角色的归属仓库
 * 不在表中的角色默认仓库 0，同时更新 map.json
 *
 * 复制完成后，所有文件重命名为 角色名_n.扩展名（n 从 10001 起）
 */
export class MigrateGallery extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]迁移',
      dsc: '将备份图库迁移到新仓库结构',
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

    if (!isJunction(MIAO_PROFILE_LINK)) {
      return e.reply('[面板图图库管理器] 图库尚未初始化，请先执行 #图库初始化。')
    }

    e.reply('[面板图图库管理器] 开始迁移图库，请稍候...')

    try {
      const map = loadMap()
      const newChars = {}  // 新发现的角色 → 仓库 0
      let migratedChars = 0
      let migratedImgs = 0
      let renamedImgs = 0

      const types = ['normal-character', 'super-character']
      for (const type of types) {
        const backupTypeDir = path.join(backupProfile, type)
        if (!fs.existsSync(backupTypeDir)) continue

        const chars = fs.readdirSync(backupTypeDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const charDir of chars) {
          const charName = charDir.name
          // 确定目标仓库
          const repoId = charName in map.mapping ? map.mapping[charName] : 0
          if (!(charName in map.mapping)) {
            newChars[charName] = repoId
          }

          const repoDir = getRepoDir(repoId)
          const targetDir = path.join(repoDir, type, charName)
          const sourceDir = path.join(backupTypeDir, charName)

          // 确保目标目录存在
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
          }

          // 复制图片文件
          const files = fs.readdirSync(sourceDir, { withFileTypes: true })
            .filter(f => f.isFile() && /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name))

          for (const file of files) {
            const src = path.join(sourceDir, file.name)
            const dest = path.join(targetDir, file.name)
            // 不覆盖已有文件
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(src, dest)
              migratedImgs++
            }
          }
          migratedChars++
        }
      }

      // 更新 map.json
      if (Object.keys(newChars).length > 0) {
        setRepoForChars(newChars)
      }

      // 第二遍遍历：重命名迁移文件为 角色名_n.扩展名（n 从 10001 起）
      for (const type of types) {
        const backupTypeDir = path.join(backupProfile, type)
        if (!fs.existsSync(backupTypeDir)) continue

        const chars = fs.readdirSync(backupTypeDir, { withFileTypes: true })
          .filter(d => d.isDirectory())

        for (const charDir of chars) {
          const charName = charDir.name
          const repoId = charName in map.mapping ? map.mapping[charName] : (newChars[charName] || 0)
          const repoDir = getRepoDir(repoId)
          const targetDir = path.join(repoDir, type, charName)

          if (!fs.existsSync(targetDir)) continue

          // 扫描该角色目录下所有图片文件，找最大已有 n
          const imgNames = fs.readdirSync(targetDir)
            .filter(f => /\.(webp|png|jpg|jpeg|gif)$/i.test(f))

          let maxSeq = 0
          for (const fname of imgNames) {
            const parsed = parseFilename(fname, charName)
            if (parsed.isStandard && parsed.seq > maxSeq) maxSeq = parsed.seq
          }

          // 对需要重命名的文件（非标准 + 标准但 seq < 10001 的无版权文件）进行重命名
          let nextSeq = Math.max(maxSeq + 1, 10001)
          for (const fname of imgNames) {
            const parsed = parseFilename(fname, charName)
            // 跳过已有标准命名的文件（含版权或其他迁移文件）
            if (parsed.isStandard) continue

            const ext = path.extname(fname)
            let newName = `${charName}_${nextSeq}${ext}`
            // 去重
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

      // 为新角色创建 junction
      let junctionCount = 0
      const updatedMap = loadMap()
      for (const charName of Object.keys(updatedMap.mapping)) {
        const repoId = updatedMap.mapping[charName]
        const repoDir = getRepoDir(repoId)
        const nResult = createCharJunction(charName, 'normal', repoDir, PROFILE_DIR)
        const sResult = createCharJunction(charName, 'super', repoDir, PROFILE_DIR)
        if (nResult.ok || sResult.ok) junctionCount++
      }

      const msg = `原图库迁移已完成，共迁移 ${migratedChars} 个角色 / ${migratedImgs} 张图片\n` +
        `重命名：${renamedImgs} / 新角色：${Object.keys(newChars).length} / junction：${junctionCount}\n` +
        `你可以手动删除 ProfileImg-Plugin/resources/gallery/backup 的原图库备份。`
      notifyMaster(msg)
      return e.reply(msg)
    } catch (err) {
      logger.error('[ProfileImg-Plugin] 迁移失败:', err)
      return e.reply('[面板图图库管理器] 迁移失败: ' + err.message)
    }
  }
}
