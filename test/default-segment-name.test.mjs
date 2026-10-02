/**
 * default 段位命名构造：原名以「」保留在备注段、段位改为 default 段（10001+）
 * 覆盖有版权 / 有备注 / 无版权 / 非标准命名四类输入
 */
import { mod, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { buildDefaultName } = await import(mod('model/migrateMultiSrc.js'))
const { SEGMENTS, parseFilename, resolveNRange } = await import(mod('components/panelUtils.js'))

const { check, finish } = checker()
const N = SEGMENTS.default.start // 10001

// 1. 有版权
const n1 = buildDefaultName('琴_1_张三_米游社.webp', '琴', N)
check('有版权：段位改为 default 段', n1 === `琴_${N}_张三_米游社_「琴_1_张三_米游社」.webp`, `实际 ${n1}`)
check('有版权：仍可解析为标准命名', parseFilename(n1, '琴').isStandard === true)
check('有版权：段位判定为 default', resolveNRange(parseFilename(n1, '琴').seq).source === 'default')

// 2. 有版权 + 原备注（备注段拼在原名之前）
const n2 = buildDefaultName('琴_1_张三_米游社_二改.webp', '琴', N)
check('带原备注：备注保留且原名进「」', n2 === `琴_${N}_张三_米游社_二改_「琴_1_张三_米游社_二改」.webp`, `实际 ${n2}`)
check('带原备注：段位为 default', resolveNRange(parseFilename(n2, '琴').seq).source === 'default')

// 3. 无版权
const n3 = buildDefaultName('琴_1.webp', '琴', N)
check('无版权：用「本地默认图库_默认」占位', n3 === `琴_${N}_本地默认图库_默认_「琴_1」.webp`, `实际 ${n3}`)

// 4. 非标准命名
const n4 = buildDefaultName('随便一张图.png', '琴', N)
check('非标准命名：归一为标准命名', n4 === `琴_${N}_本地默认图库_默认_「随便一张图」.png`, `实际 ${n4}`)
check('非标准命名：可解析', parseFilename(n4, '琴').isStandard === true)

// 5. 扩展名保留（含 jpg/jpeg 大小写）
check('保留扩展名 jpg', buildDefaultName('琴_2_甲_乙.jpg', '琴', 10002).endsWith('.jpg'))
check('保留扩展名 JpEg 原样', buildDefaultName('琴_2_甲_乙.JpEg', '琴', 10002).endsWith('.JpEg'))

// 6. 段位号按传入值（不与既有号冲突由调用方取号）
check('段位号使用传入值', buildDefaultName('琴_1_甲_乙.webp', '琴', 10050).startsWith('琴_10050_'))

// 7. 角色名含正则特殊字符不误伤
const n7 = buildDefaultName('知更鸟•晴歌_1_甲_乙.webp', '知更鸟•晴歌', N)
check('角色名含特殊字符（•）正常', n7 === `知更鸟•晴歌_${N}_甲_乙_「知更鸟•晴歌_1_甲_乙」.webp`, `实际 ${n7}`)

finish()
