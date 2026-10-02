/**
 * 第三方图库目录值解析与回写（dir 为绝对路径凭证，读取兼容相对名）
 *
 * - `resolveThirdPartyDir`：配置值 → 绝对路径（相对名拼 gallery/ProfileImg，绝对路径原样，正反斜杠均可）
 * - `toConfigDirValue`：绝对路径 → 配置值（一律正斜杠绝对路径）
 */
import path from 'node:path'
import { mod, checker, installFrameworkStubs } from './_helper.mjs'

installFrameworkStubs()

const { resolveThirdPartyDir, toConfigDirValue } = await import(mod('model/galleryConfig.js'))
const { PROFILE_IMG_DIR } = await import(mod('components/constants.js'))

const { check, finish } = checker()
const base = path.resolve(PROFILE_IMG_DIR)
// 与 base 不同盘/不同卷的绝对路径（Windows 下取另一盘符，非 Windows 用同级外部目录）
const outsideDir = process.platform === 'win32'
  ? path.join(path.parse(base).root === 'C:\\' ? 'E:\\' : 'C:\\', 'gallery', 'fan-repo')
  : path.join(path.parse(base).root, 'tmp', 'fan-repo')

// ---- 1. 解析配置值（兼容写法）----
check('相对子目录名（旧配置）→ gallery/ProfileImg 下',
  path.resolve(resolveThirdPartyDir('fan-repo')) === path.resolve(base, 'fan-repo'))
check('多级相对名（旧配置）→ gallery/ProfileImg 下',
  path.resolve(resolveThirdPartyDir('a/b')) === path.resolve(base, 'a', 'b'))
check('正斜杠绝对路径原样（跨盘）',
  path.resolve(resolveThirdPartyDir(outsideDir.split(path.sep).join('/'))) === path.resolve(outsideDir))
check('反斜杠绝对路径原样（Windows 写法兼容）',
  path.resolve(resolveThirdPartyDir(outsideDir)) === path.resolve(outsideDir))
check('UNC 网络盘路径可用',
  path.resolve(resolveThirdPartyDir('//NAS/gallery/fan')) === path.resolve('//NAS/gallery/fan'))
check('空值返回空串', resolveThirdPartyDir('') === '' && resolveThirdPartyDir(undefined) === '')

// ---- 2. 回写配置值：一律绝对路径 ----
const absInside = path.join(base, 'fan-repo')
check('库内目录也写绝对路径（不再写相对名）',
  toConfigDirValue(absInside) === absInside.split(path.sep).join('/') && toConfigDirValue(absInside).includes('/'))
check('库外 → 正斜杠绝对路径',
  toConfigDirValue(outsideDir) === outsideDir.split(path.sep).join('/'))
check('空值返回空串', toConfigDirValue('') === '')

// ---- 3. 往返一致 ----
check('往返一致（库内）',
  path.resolve(resolveThirdPartyDir(toConfigDirValue(absInside))) === path.resolve(absInside))
check('往返一致（跨盘）',
  path.resolve(resolveThirdPartyDir(toConfigDirValue(outsideDir))) === path.resolve(outsideDir))

finish()
