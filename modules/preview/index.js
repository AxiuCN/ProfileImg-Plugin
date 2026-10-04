import { loadMiao } from './miao.js'
import { findSplash, toTemplatePath } from './splash.js'
import { buildVirtualProfile } from './virtual.js'
import { buildPanelRenderData, buildPanelDmgCalc } from './renderData.js'

/**
 * 面板图预览：在本插件里渲染一张「带完整 miao 面板 UI」的预览图
 *
 * 思路：不写 miao 的任何数据、也不改写消息交给 miao，而是
 *   ① 用虚拟数据（伪造 UID + 一套伪造圣遗物）构造一个角色面板；
 *   ② 把指定序号的面板图作为立绘；
 *   ③ 用 **miao 自己的面板模板**（`character/profile-detail`）渲染成图。
 * 这样面板 UI 与 miao 完全一致（模板跟着 miao 走，不会各自漂移），
 * 数据则全部是虚拟的，因此不要求发起者拥有该角色或该游戏账号。
 *
 * 图库里可能先收录了 miao 还没有的角色（未实装 / 未来角色）：这时没有它的属性表、
 * 天赋、技能图标，于是**借一个占位角色当骨架**（原神 胡桃 / 星铁 三月七），
 * 只把名字、立绘与头像换成目标角色，并在面板顶部标注是占位数据。
 */

/** 命令解析（`#预览xx面板图N` / `*预览xx面板图N` / `#星铁预览xx面板图N`）；rule 与解析共用 */
export const PREVIEW_CMD_RE = /^([#*])?\s*(星铁|原神)?\s*预览(.+?)(?:面板图)\s*(\d+)\s*$/

/** 没有游戏关键词时的默认游戏：`#` 原神、`*` 星铁 */
const DEFAULT_GAME = { '#': 'gs', '*': 'sr' }

/** 占位骨架角色（miao 里稳定存在的老角色） */
const PLACEHOLDER_CHAR = { gs: '胡桃', sr: '三月七' }

/**
 * 解析预览命令
 * @param {string} msg - 消息文本
 * @returns {{ roleName: string, n: number, game: 'gs'|'sr' }|null} 不匹配返回 null
 */
export function parsePreviewCommand (msg) {
  const match = String(msg || '').match(PREVIEW_CMD_RE)
  if (!match) return null
  const [, prefix, gameWord, roleName, n] = match
  const game = gameWord === '原神' ? 'gs' : gameWord ? 'sr' : (DEFAULT_GAME[prefix] || 'gs')
  return { roleName: roleName.trim(), n: parseInt(n, 10), game }
}

/**
 * 解析预览目标：优先用 miao 的角色数据，miao 没收录时借占位骨架
 * @param {object} opts
 * @param {object} opts.miao - loadMiao() 的返回值
 * @param {string} opts.roleName - 角色名（同图库目录名）
 * @param {'gs'|'sr'} [opts.game] - 命令前缀推断出的游戏（仅占位时生效）
 * @returns {{ char: object, placeholder: boolean, displayName: string }|null}
 */
export function resolvePreviewTarget ({ miao, roleName, game = 'gs' }) {
  const char = miao.Character.get(roleName)
  // 已知角色以 miao 数据为准（游戏、属性、天赋、图标都用它自己的）
  if (char && !char.isCustom) return { char, placeholder: false, displayName: char.name }
  // 未收录（或自定义）角色：借该游戏的占位骨架，只换名字 / 立绘 / 头像
  const donor = miao.Character.get(PLACEHOLDER_CHAR[game] || PLACEHOLDER_CHAR.gs)
  if (!donor) return null
  return { char: donor, placeholder: true, displayName: roleName }
}

/**
 * 渲染面板图预览
 * @param {object} opts
 * @param {object} opts.e - 消息事件（渲染需要 e.runtime）
 * @param {string} opts.roleName - 已解析为官方名的角色名（同时用作图库目录名）
 * @param {number} opts.n - 面板图序号
 * @param {'gs'|'sr'} [opts.game] - 命令前缀推断出的游戏（miao 未收录该角色时用）
 * @returns {Promise<{ ok: boolean, image?: object, char?: object, msg?: string }>}
 */
export async function renderPanelPreview ({ e, roleName, n, game }) {
  const miao = await loadMiao()
  if (!miao) return { ok: false, msg: '当前环境没有可用的 miao-plugin，无法渲染面板预览' }

  const target = resolvePreviewTarget({ miao, roleName, game })
  if (!target) return { ok: false, msg: `没有找到角色「${roleName}」，也没能构造占位面板` }

  const targetImage = findSplash(roleName, n)
  if (!targetImage) return { ok: false, msg: `序号无效：角色${roleName}没有第${n}张图` }

  const profile = buildVirtualProfile({ miao, char: target.char })
  if (!profile) return { ok: false, msg: '虚拟面板构造失败（miao 数据异常），可稍后重试' }

  const splash = toTemplatePath(targetImage.filePath)
  const dmgCalc = await buildPanelDmgCalc(miao, profile, target.char)
  const renderData = buildPanelRenderData({
    miao,
    char: target.char,
    profile,
    splash,
    dmgCalc,
    displayName: target.placeholder ? target.displayName : '',
    changeProfile: target.placeholder
      ? `该角色（${target.displayName}）尚未收录进 miao-plugin：图标与数值为占位数据，仅用于预览面板图`
      : '面板图预览（虚拟面板，非实际账号数据）'
  })

  const image = await miao.Common.render('character/profile-detail', renderData, { e, scale: 1.6, retType: 'base64' })
  if (!image) return { ok: false, msg: '面板渲染失败（miao 渲染器没有返回图片）' }
  return { ok: true, image, char: target.char, placeholder: target.placeholder }
}
