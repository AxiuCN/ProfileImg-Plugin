import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { GIT_WORK_DIR, BLOCKED_GALLERY_PATH, MAIN_REPO_URL, BLOCKED_REPO_URL } from './utils.js'

async function installGallery(repoUrl, targetDir, label, updateCmd) {
  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, '.git'))) {
    return `[面板图图库管理器] ${label}已安装，请使用 ${updateCmd} 进行更新`
  }
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    execSync('git init --initial-branch=main', { cwd: targetDir, encoding: 'utf8', timeout: 10000 })
    execSync(`git remote add origin ${repoUrl}`, { cwd: targetDir, encoding: 'utf8', timeout: 10000 })
    execSync('git fetch origin main --depth 1', { cwd: targetDir, encoding: 'utf8', timeout: 60000 })
    execSync('git reset --hard origin/main', { cwd: targetDir, encoding: 'utf8', timeout: 10000 })
    return `[面板图图库管理器] ${label}安装成功！`
  } catch (err) {
    const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
    return `[面板图图库管理器] ${label}安装失败\n${errorMsg}`
  }
}

export class Download extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]安装',
      dsc: '安装图库',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#下载主图库$', fnc: 'downloadMain', permission: 'master' },
        { reg: '^#下载屏蔽图库$', fnc: 'downloadBlocked', permission: 'master' }
      ]
    })
  }

  async downloadMain(e) {
    e.reply('[面板图图库管理器] 开始安装主图库，请稍候...')
    const result = await installGallery(MAIN_REPO_URL, GIT_WORK_DIR, '主图库', '#主图库更新')
    return e.reply(result)
  }

  async downloadBlocked(e) {
    e.reply('[面板图图库管理器] 开始安装屏蔽图库，请稍候...')
    if (!fs.existsSync(path.join(GIT_WORK_DIR, '.git'))) {
      return e.reply('[面板图图库管理器] 主图库未初始化 Git，请先安装主图库')
    }
    if (fs.existsSync(path.join(BLOCKED_GALLERY_PATH, '.git'))) {
      return e.reply('[面板图图库管理器] 屏蔽图库已安装，请使用 #更新屏蔽图库 进行更新')
    }
    try {
      execSync(`git submodule add ${BLOCKED_REPO_URL} blocked-character`, {
        cwd: GIT_WORK_DIR,
        encoding: 'utf8',
        timeout: 30000
      })
      return e.reply('[面板图图库管理器] 屏蔽图库安装成功！')
    } catch (err) {
      const errorMsg = err.stderr || err.stdout || err.message || '未知错误'
      return e.reply('[面板图图库管理器] 屏蔽图库安装失败\n' + errorMsg)
    }
  }
}