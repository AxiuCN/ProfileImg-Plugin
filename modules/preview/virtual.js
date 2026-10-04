import { buildFakeArtis } from './fakeArtis.js'

/**
 * 虚拟角色面板的构造（不发任何请求、不读账号数据）
 *
 * 用伪造 UID `100000009`（游戏内测流出之外的号段）配一份假数据直接 `new Avatar()`：
 * 不走 miao 的 `Player`，因此**不会在 data/PlayerData/ 下落任何文件**，也不会碰真实玩家存档。
 * 等级按游戏给（原神 90 / 星铁 80）——星铁属性表按突破段索引，超过 80 会算出越界 promote。
 */

/** 伪造 UID（面板上显示的 UID，非真实账号） */
export const FAKE_UID = '100000009'

/** 原神：按武器类型给默认武器（与 miao 面板变换的兜底一致） */
const GS_DEF_WEAPON = {
  bow: '西风猎弓',
  catalyst: '西风秘典',
  claymore: '西风大剑',
  polearm: '西风长枪',
  sword: '西风剑'
}

/** 星铁：按命途给默认光锥候选（逐个用 Weapon.get 校验，全部取不到时用兜底光锥） */
const SR_WEAPON_CANDIDATES = {
  毁灭: ['无可取代的东西', '记一位星神的陨落'],
  巡猎: ['于夜色中', '我将，巡猎'],
  智识: ['银河铁道之夜', '天才们的休憩'],
  同谐: ['但战斗还未结束', '记忆中的模样'],
  虚无: ['以世界之名', '晚安与睡颜'],
  存护: ['制胜的瞬间', '朗道的选择'],
  丰饶: ['时节不居', '暖夜不会漫长'],
  记忆: ['让世界喧闹起来', '溯洄']
}
const SR_FALLBACK_WEAPON = '于夜色中'

/**
 * 构造虚拟面板
 * @param {object} opts
 * @param {object} opts.miao - loadMiao() 的返回值
 * @param {object} opts.char - miao Character 实例
 * @returns {object|null} Avatar 实例；构造失败返回 null
 */
export function buildVirtualProfile ({ miao, char }) {
  const isSr = char.isSr
  const level = isSr ? 80 : 90
  const weapon = pickWeapon(miao, char)
  const artis = buildFakeArtis({ miao, game: char.game, elem: char.elem })
  const base = {
    id: char.id,
    uid: FAKE_UID,
    level,
    cons: 0,
    _source: 'change',
    artis
  }
  if (isSr) base.trees = []
  if (weapon) base.weapon = { name: weapon.name, level, affix: 1 }

  try {
    const profile = new miao.Avatar({ ...base, talent: buildTalent(char) }, char.game)
    return profile?.isProfile ? profile : null
  } catch (err) {
    logger?.warn('[ProfileImg-Plugin] 虚拟面板构造失败:', err?.message || err)
    return null
  }
}

/**
 * 伪造天赋等级（面板模板对缺失的天赋位有 `|| {}` 兜底，故只给该游戏的基础位）
 * @param {object} char
 * @returns {object}
 */
function buildTalent (char) {
  return char.isSr ? { a: 6, e: 8, t: 8, q: 8 } : { a: 9, e: 9, q: 9 }
}

/**
 * 取虚拟面板的默认武器
 * @param {object} miao
 * @param {object} char
 * @returns {object|null}
 */
function pickWeapon (miao, char) {
  if (!char.isSr) {
    const name = GS_DEF_WEAPON[char.weaponType] || GS_DEF_WEAPON.sword
    return miao.Weapon.get(name, 'gs')
  }
  for (const name of (SR_WEAPON_CANDIDATES[char.weapon] || [])) {
    const weapon = miao.Weapon.get(name, 'sr')
    if (weapon) return weapon
  }
  return miao.Weapon.get(SR_FALLBACK_WEAPON, 'sr')
}
