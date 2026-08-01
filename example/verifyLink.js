import fs from 'node:fs'
import path from 'node:path'

/**
 * 验证云崽进程的符号链接权限（mklink 文件符号链接可行性）
 *
 * 在云崽进程内直接创建文件符号链接，进程令牌即代表云崽实际权限。
 * 用于判断多图库聚合层能否用 mklink 文件符号链接替代硬链接。
 *
 * 命令：#验证符号链接
 */
export default class verifyLink extends plugin {
  constructor() {
    super({
      name: '[面板图图库管理器]验证符号链接',
      dsc: '验证进程能否创建文件符号链接（mklink 可行性）',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#验证符号链接$', fnc: 'verify', permission: 'master' }
      ]
    })
  }

  async verify(e) {
    const testDir = path.join(process.cwd(), 'plugins/ProfileImg-Plugin/data/verify-link-test')
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })

    const source = path.join(testDir, 'source.txt')
    const fileLink = path.join(testDir, 'file-link.txt')
    const junctionLink = path.join(testDir, 'junction-link')
    fs.writeFileSync(source, 'verify-ok')

    // 1. 文件符号链接（= mklink 无参数，Windows 需管理员/开发者模式）
    let fileResult
    try {
      fs.symlinkSync(source, fileLink, 'file')
      const l = fs.lstatSync(fileLink)
      const content = fs.readFileSync(fileLink, 'utf8')
      fileResult = {
        ok: true,
        isSymbolicLink: l.isSymbolicLink(),
        content
      }
    } catch (err) {
      fileResult = { ok: false, error: err.code, message: err.message }
    }

    // 2. junction（目录级，无需权限，对照组）
    let junctionResult
    try {
      fs.symlinkSync(source, junctionLink, 'junction')
      junctionResult = { ok: true }
    } catch (err) {
      junctionResult = { ok: false, error: err.code }
    }

    // 清理测试文件
    try { fs.rmSync(testDir, { recursive: true, force: true }) } catch {}

    const lines = [
      '[面板图图库管理器] 符号链接权限验证',
      '',
      `进程令牌: ${this._tokenLevel()}`,
      '',
      `文件符号链接 (mklink): ${fileResult.ok ? '成功' : '失败 ' + fileResult.error}`,
      fileResult.ok
        ? `  isSymbolicLink: ${fileResult.isSymbolicLink}, 读取: ${fileResult.content}`
        : `  ${fileResult.message || ''}`,
      '',
      `junction (对照): ${junctionResult.ok ? '成功' : '失败 ' + junctionResult.error}`
    ]
    if (fileResult.ok) {
      lines.push('', '✓ 云崽进程可创建文件符号链接，mklink 聚合方案可行')
    } else if (fileResult.error === 'EPERM') {
      lines.push('', '✗ 云崽进程为降权令牌，需提权（管理员运行/注册表开发者模式/授权 SeCreateSymbolicLinkPrivilege）')
    } else {
      lines.push('', `✗ 创建失败：${fileResult.error}`)
    }
    return e.reply(lines.join('\n'))
  }

  /** 获取进程令牌级别（Windows: High/Medium/Low） */
  _tokenLevel() {
    try {
      const out = require('child_process').execSync('whoami /groups', { encoding: 'utf8' })
      const m = out.match(/S-1-16-(\d+)/)
      const levels = { '12288': 'High (管理员, 提升)', '8192': 'Medium (标准令牌)', '4096': 'Low' }
      return m ? (levels[m[1]] || m[1]) : '未知'
    } catch {
      return '未知'
    }
  }
}
