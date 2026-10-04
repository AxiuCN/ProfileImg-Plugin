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
 */

/**
 * 渲染面板图预览
 * @param {object} opts
 * @param {object} opts.e - 消息事件（渲染需要 e.runtime）
 * @param {string} opts.roleName - 已解析为官方名的角色名（同时用作图库目录名）
 * @param {number} opts.n - 面板图序号
 * @returns {Promise<{ ok: boolean, image?: string, char?: object, msg?: string }>}
 */
export async function renderPanelPreview ({ e, roleName, n }) {
  const miao = await loadMiao()
  if (!miao) return { ok: false, msg: '当前环境没有可用的 miao-plugin，无法渲染面板预览' }

  const char = miao.Character.get(roleName)
  if (!char) return { ok: false, msg: `没有找到角色「${roleName}」` }
  if (char.isCustom) return { ok: false, msg: `自定义角色${char.name}暂不支持面板预览` }

  const target = findSplash(roleName, n)
  if (!target) return { ok: false, msg: `序号无效：角色${roleName}没有第${n}张图` }

  const profile = buildVirtualProfile({ miao, char })
  if (!profile) return { ok: false, msg: '虚拟面板构造失败（miao 数据异常），可稍后重试' }

  const dmgCalc = await buildPanelDmgCalc(miao, profile, char)
  const renderData = buildPanelRenderData({
    miao,
    char,
    profile,
    splash: toTemplatePath(target.filePath),
    dmgCalc,
    changeProfile: '面板图预览（虚拟面板，非实际账号数据）'
  })

  const image = await miao.Common.render('character/profile-detail', renderData, { e, scale: 1.6, retType: 'base64' })
  if (!image) return { ok: false, msg: '面板渲染失败（miao 渲染器没有返回图片）' }
  return { ok: true, image, char }
}
