/**
 * 图库操作锁：锁 id 归属、互斥、过期/损坏接管
 *
 * - `thirdPartyLockId` / `mainRepoLockIdForPath`：下载/更新/删除共用一把三方锁，主仓库按 repoId 加锁
 * - `acquireLock` / `acquireLocks`：同一把锁二次获取被拒、release 后可再取、过期与损坏的锁可接管
 *
 * 说明：锁文件目录是生产代码固定的 `data/git-locks/`（不在 test/.test-tmp 内），
 * 因此本套件只用 `test-*` 前缀的临时 id，并在 finally 里清理，不碰真实仓库的锁。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mod, pluginRoot, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { acquireLock, acquireLocks } = await import(mod('model/git.js'))
const { thirdPartyLockId, mainRepoLockIdForPath } = await import(mod('model/galleryConfig.js'))
const { getRepoDir, MIAO_PROFILE_LINK } = await import(mod('components/constants.js'))

const { check, finish } = checker()
const lockDir = path.join(pluginRoot, 'data/git-locks')
const tmpId = 'test-lock-a'
const tmpId2 = 'test-lock-b'
const lockFile = (id) => path.join(lockDir, `${id.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.lock`)

try {
  // ---- 1. 锁 id 归属 ----
  check('第三方锁 id 按图库名统一', thirdPartyLockId('MBT') === 'tp:MBT' && thirdPartyLockId({ name: '米游社_原图' }) === 'tp:米游社_原图')
  check('第三方锁 id 兼容空值', thirdPartyLockId({}) === 'tp:unknown' && thirdPartyLockId('') === 'tp:unknown')

  const mainDir = getRepoDir(0)
  check('主仓库根目录 → 该仓库锁 id', mainRepoLockIdForPath(mainDir) === '0', mainRepoLockIdForPath(mainDir))
  check('主仓库角色目录 → 该仓库锁 id',
    mainRepoLockIdForPath(path.join(mainDir, 'normal-character', '琴')) === '0')
  check('默认图库不是主仓库 → 空串', mainRepoLockIdForPath(MIAO_PROFILE_LINK) === '')
  check('无关目录 → 空串', mainRepoLockIdForPath(path.join(pluginRoot, '.git')) === '' && mainRepoLockIdForPath('') === '')
  check('相邻同名前缀目录不算命中',
    mainRepoLockIdForPath(mainDir + '-副本') === '', mainRepoLockIdForPath(mainDir + '-副本'))

  // ---- 2. 互斥与释放 ----
  fs.rmSync(lockFile(tmpId), { force: true })
  const first = acquireLock(tmpId, '测试操作', 'update')
  check('首次获取成功', first.ok === true)
  check('锁文件名做了消毒', fs.existsSync(lockFile(tmpId)))

  const second = acquireLock(tmpId, '第二次操作', 'update')
  check('同一把锁被占用时拒绝', second.ok === false && second.msg.includes('测试操作'), second.msg)
  check('拒绝时不覆盖已有锁信息', JSON.parse(fs.readFileSync(lockFile(tmpId), 'utf8')).operation === '测试操作')

  first.release()
  check('释放后锁文件已删除', !fs.existsSync(lockFile(tmpId)))
  const third = acquireLock(tmpId, '第三次操作', 'update')
  check('释放后可再次获取', third.ok === true)
  third.release()
  check('二次释放后锁文件已删除', !fs.existsSync(lockFile(tmpId)))

  // ---- 3. 多把锁整体获取 / 失败回滚 ----
  const both = acquireLocks([
    { id: tmpId, operation: '组合操作A', type: 'update' },
    { id: tmpId2, operation: '组合操作B', type: 'update' }
  ])
  check('多把锁整体获取成功', both.ok === true && fs.existsSync(lockFile(tmpId)) && fs.existsSync(lockFile(tmpId2)))
  const blockedByFirst = acquireLock(tmpId2, '插队操作', 'update')
  check('组合持有的第二把锁同样互斥', blockedByFirst.ok === false)
  both.release()
  check('整体释放清空所有锁文件', !fs.existsSync(lockFile(tmpId)) && !fs.existsSync(lockFile(tmpId2)))

  const held = acquireLock(tmpId, '占位操作', 'update')
  const partial = acquireLocks([
    { id: tmpId, operation: '组合操作A' },
    { id: tmpId2, operation: '组合操作B' }
  ])
  check('一把拿不到时整体失败', partial.ok === false)
  check('失败时回滚已获取的锁', !fs.existsSync(lockFile(tmpId2)))
  check('失败不影响别人持有的锁', fs.existsSync(lockFile(tmpId)))
  held.release()

  check('空清单直接成功', acquireLocks([]).ok === true)
  check('id 为空的项被跳过', acquireLocks([{ id: '', operation: 'x' }]).ok === true)

  // ---- 4. 过期与损坏的锁可接管 ----
  fs.mkdirSync(lockDir, { recursive: true })
  fs.writeFileSync(lockFile(tmpId), JSON.stringify({ operation: '陈旧操作' }))
  const old = new Date(Date.now() - 60 * 60 * 1000)
  fs.utimesSync(lockFile(tmpId), old, old)
  const takeover = acquireLock(tmpId, '接管操作', 'update')
  check('过期锁被接管', takeover.ok === true && JSON.parse(fs.readFileSync(lockFile(tmpId), 'utf8')).operation === '接管操作')
  takeover.release()

  fs.writeFileSync(lockFile(tmpId), 'not-json')
  const damaged = acquireLock(tmpId, '损坏接管', 'update')
  check('损坏锁文件可接管', damaged.ok === true)
  damaged.release()

  // ---- 5. 锁文件名消毒（`:` 在 Windows 上非法）----
  const colon = acquireLock('tp:test', '冒号测试', 'update')
  check('锁 id 中的冒号被消毒为文件名', colon.ok === true && fs.existsSync(path.join(lockDir, 'tp_test.lock')))
  colon.release()
} finally {
  for (const id of [tmpId, tmpId2, 'tp_test', 'tp:test']) {
    fs.rmSync(lockFile(id), { force: true })
  }
}

finish()
