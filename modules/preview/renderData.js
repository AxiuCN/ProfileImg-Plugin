import { FAKE_UID } from './virtual.js'

/**
 * 面板模板的渲染数据组装
 *
 * 复刻 miao `ProfileDetail.render()` 的整形部分（属性 Base/Plus、圣遗物评分、武器详情、
 * 星铁行迹矩阵、模板字段名），但**去掉**取数 / 绑定 UID / 排行 / 缓存等与本预览无关的环节：
 * 面板数据全部来自虚拟面板，头像与技能图标仍用 miao 的角色元数据。
 * 模板对字段的硬要求（缺了会抛错）见下方注释，改动时不要删字段。
 */

/**
 * 组装 renderData
 * @param {object} opts
 * @param {object} opts.miao - loadMiao() 的返回值
 * @param {object} opts.char - miao Character 实例
 * @param {object} opts.profile - 虚拟面板 Avatar 实例
 * @param {string} opts.splash - 立绘（模板可用路径，见 splash.js）
 * @param {object} opts.dmgCalc - 伤害数据（可为 {}，模板会隐藏伤害区）
 * @param {string} [opts.displayName] - 展示用角色名（miao 未收录该角色时，占位骨架换个名字）
 * @param {string} [opts.changeProfile] - 顶部「非实际数据」横幅文案
 * @returns {object} 交给 Common.render 的 renderData
 */
export function buildPanelRenderData ({ miao, char, profile, splash, dmgCalc, displayName, changeProfile }) {
  const { Format } = miao
  const game = char.game
  const isGs = game === 'gs'
  const a = profile.attr
  const base = profile.base
  const attr = {}
  for (const key of (isGs ? 'hp,def,atk,mastery' : 'hp,def,atk,speed').split(',')) {
    const fn = (n) => Format.comma(n, key === 'hp' ? 0 : 1)
    attr[key] = fn(a[key])
    attr[`${key}Base`] = fn(base[key])
    attr[`${key}Plus`] = fn(a[key] - base[key])
  }
  for (const key of (isGs ? 'cpct,cdmg,recharge,dmg' : 'cpct,cdmg,recharge,dmg,effPct,effDef,heal,stance,joy').split(',')) {
    const fn = Format.pct
    // 原神物理角色主展示物伤，与 miao 面板一致
    const key2 = (key === 'dmg' && isGs && a.phy > a.dmg) ? 'phy' : key
    attr[key] = fn(a[key2])
    attr[`${key}Base`] = fn(base[key2])
    attr[`${key}Plus`] = fn(a[key2] - base[key2])
  }

  // 圣遗物评分：模板会取 artisDetail.mark / charWeight / artis，故不能为空对象
  const artisDetail = profile.getArtisMark() || {}
  artisDetail.allAttr = padAllAttr(profile.artis?.getAllAttr?.())

  const data = profile.getData('name,abbr,cons,level,talent,dataSource,updateTime,imgs,costumeSplash') || {}
  data.costumeSplash = splash
  data.dataSource = '虚拟预览'
  data.weapon = profile.getWeaponDetail()
  // 占位骨架：面板上的名字与头像换成目标角色（技能 / 命座图标仍是占位角色的，已在横幅里标注）
  if (displayName) {
    data.name = displayName
    data.abbr = displayName
    if (data.imgs) data.imgs.face = splash
  }
  if (char.isSr) data.treeData = buildTreeData(char, data, profile)

  return {
    save_id: FAKE_UID,
    uid: FAKE_UID,
    game,
    data,
    attr,
    elem: char.elem,
    hsr_paths: char.weapon,
    dmgCalc: dmgCalc || {},
    artisDetail,
    artisKeyTitle: miao.Artifact.getArtisKeyTitle(game),
    bodyClass: `char-${char.name}`,
    mode: 'profile',
    wCfg: {},
    changeProfile
  }
}

/**
 * 伤害数据（虚拟面板下算得出就显示，算不出就让模板隐藏伤害区）
 * @param {object} miao - loadMiao() 的返回值
 * @param {object} profile - 虚拟面板 Avatar 实例
 * @param {object} char - miao Character 实例
 * @returns {Promise<object>} 整理后的 dmgCalc，失败返回 {}
 */
export async function buildPanelDmgCalc (miao, profile, char) {
  if (!profile?.hasDmg) return {}
  try {
    const dmgCalc = await profile.calcDmg({
      enemyLv: char.isSr ? 80 : 103,
      mode: 'profile',
      dmgIdx: 0
    })
    if (!dmgCalc?.ret) return {}
    const dmgData = []
    const dmgMsg = []
    for (const ds of dmgCalc.ret) {
      if (ds.type !== 'text') {
        ds.dmg = miao.Format.comma(ds.dmg, 0)
        ds.avg = miao.Format.comma(ds.avg, 0)
      }
      dmgData.push(ds)
    }
    for (let msg of (dmgCalc.msg || [])) {
      msg = String(msg).replace(':', '：')
      dmgMsg.push(msg.split('：'))
    }
    dmgCalc.dmgMsg = dmgMsg
    dmgCalc.dmgData = dmgData
    return dmgCalc
  } catch (err) {
    logger?.warn('[ProfileImg-Plugin] 虚拟面板伤害计算失败，已隐藏伤害区:', err?.message || err)
    return {}
  }
}

/**
 * 补齐 allAttr 到 9 项（模板按 9 项排版，不足时渲染空位）
 * @param {Array} [allAttr]
 * @returns {Array}
 */
function padAllAttr (allAttr) {
  const list = (allAttr || []).slice(0, 9)
  while (list.length < 9) list.push({})
  return list
}

/**
 * 星铁行迹矩阵（复刻 miao 的 9 格布局：3 个技能 + 15 个行迹点）
 * @param {object} char
 * @param {object} data - profile.getData 的结果（取技能图标）
 * @param {object} profile
 * @returns {Array}
 */
function buildTreeData (char, data, profile) {
  const treeData = []
  const treeMap = {}
  '0113355778'.split('').forEach((pos, idx) => {
    treeData[pos] = treeData[pos] || []
    const tmp = { type: 'tree', img: '/meta-sr/public/icons/tree-cpct.webp' }
    treeData[pos].push(tmp)
    treeMap[idx + 201 + ''] = tmp
  })
  for (const id of Object.keys(char.detail?.tree || {})) {
    const treeId = /([12][01][0-9])$/.exec(id + '')?.[1]
    if (treeId && treeId[0] === '2' && treeMap[treeId]) {
      treeMap[treeId].img = `/meta-sr/public/icons/tree-${char.detail?.tree?.[id]?.key}.webp`
    }
  }
  ;[2, 4, 6].forEach((pos, idx) => {
    const tmp = { type: 'talent', img: data.imgs?.[`tree${idx + 1}`] }
    treeData[pos] = tmp
    treeMap[idx + 101 + ''] = tmp
  })
  for (const tree of (profile.trees || [])) {
    const treeId = /([12][01][0-9])$/.exec(tree.pointId + '')?.[1]
    if (treeId && treeMap[treeId]) treeMap[treeId].value = 1
  }
  return treeData
}
