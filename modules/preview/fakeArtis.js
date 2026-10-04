/**
 * 预览用的「一套伪造圣遗物」（所有角色共用，值全是我们编的）
 *
 * 为什么不能凭空写字段：miao 的 `Artis.setArtis()` 只认**真实的主词条 / 副词条 id**
 * （`mainId` 查 `mainIdMap`、`attrIds` 查 `attrIdMap`，星铁还要 `Artifact.get(id)` 能解析），
 * 认不出的部件会被**静默跳过**——面板就会出现「少一件」或「没有副词条」。
 * 因此这里的 id 全部是 miao 元数据里的真实取值，只有等级 / 词条数量是编的：
 *   - 原神：魔女 5 件（花 / 羽 / 沙 / 杯 / 冠），杯按角色元素挑元素伤害杯
 *   - 星铁：过客 4 件（头 / 手 / 衣 / 鞋）+ 太空封印站 2 件（球 / 绳）
 *     ——星铁的位面饰品（5/6 号位）是**独立套装**，不在遗器套里
 */

/** 原神：伪造套装的各部位固定主词条（花=小生命、羽=小攻击、沙=大攻击、冠=暴击率） */
const GS_MAIN_IDS = { 1: 15001, 2: 15003, 3: 15004, 5: 13007 }
/** 原神：火伤杯（元素伤害杯的兜底值） */
const GS_DMG_CUP_ID = 15008
/** 原神：魔女套各部位名（元数据取不到时的兜底） */
const GS_NAMES = { 1: '魔女的炎之花', 2: '魔女常燃之羽', 3: '魔女破灭之时', 4: '魔女的心之火', 5: '焦灼的魔女帽' }
/** 原神：想要的副词条（按元数据取对应 id） */
const GS_SUB_KEYS = ['cpct', 'cdmg', 'atk', 'hp']

/** 星铁：遗器 4 件 + 位面饰品 2 件 */
const SR_PIECES = [
  { id: '61011', mainId: 1 }, // 头：小生命（固定）
  { id: '61012', mainId: 1 }, // 手：小攻击（固定）
  { id: '61013', mainId: 4 }, // 衣：暴击率
  { id: '61014', mainId: 4 }, // 鞋：速度
  { id: '63015', mainId: 9 }, // 球：属性伤害（按元素覆盖）
  { id: '63016', mainId: 2 } // 绳：能量恢复效率
]
/** 星铁：想要的副词条 id（1 小生命 / 2 小攻击 / 8 暴击率 / 9 暴击伤害）与词条数量 */
const SR_SUB_IDS = [1, 2, 8, 9]
const SR_SUB_COUNT = 3
/** 星铁：球位主词条（元素伤害）在 mainIdx[5] 里的反向表 */
const SR_ELEM_MAIN = { phy: 4, fire: 5, ice: 6, elec: 7, wind: 8, quantum: 9, imaginary: 10 }

/**
 * 构造一套伪造圣遗物
 * @param {object} opts
 * @param {object} opts.miao - loadMiao() 的返回值
 * @param {'gs'|'sr'} opts.game
 * @param {string} [opts.elem] - 角色元素（决定伤害杯 / 伤害球）
 * @returns {object|null} 以部位序号为 key 的圣遗物数据；构造失败返回 null
 */
export function buildFakeArtis ({ miao, game, elem }) {
  try {
    return game === 'sr' ? buildSr(miao, elem) : buildGs(miao, elem)
  } catch (err) {
    logger?.warn('[ProfileImg-Plugin] 伪造圣遗物构造失败:', err?.message || err)
    return null
  }
}

/**
 * 原神：魔女 5 件
 * @param {object} miao
 * @param {string} [elem]
 * @returns {object|null}
 */
function buildGs (miao, elem) {
  const set = miao.ArtifactSet?.get('炽烈的炎之魔女', 'gs')
  const attrIds = pickSubAttrIds(miao, 'gs', GS_SUB_KEYS)
  if (attrIds.length === 0) return null
  const cupId = pickGsCupId(miao, elem)
  const mains = { ...GS_MAIN_IDS, 4: cupId }
  const artis = {}
  for (const idx of [1, 2, 3, 4, 5]) {
    const name = set?.getArti?.(idx)?.name || GS_NAMES[idx]
    if (!name) return null
    artis[idx] = { name, level: 20, star: 5, mainId: mains[idx], attrIds }
  }
  return artis
}

/**
 * 星铁：过客 4 件 + 太空封印站 2 件
 * @param {object} miao
 * @param {string} [elem]
 * @returns {object|null}
 */
function buildSr (miao, elem) {
  const attrIds = SR_SUB_IDS.map(id => `${id},${SR_SUB_COUNT},0`)
  const orbId = SR_ELEM_MAIN[elem] || 9
  const artis = {}
  for (const [i, piece] of SR_PIECES.entries()) {
    const idx = i + 1
    if (!miao.Artifact?.get?.(piece.id, 'sr')) return null
    artis[idx] = {
      id: piece.id,
      level: 15,
      star: 5,
      mainId: idx === 5 ? orbId : piece.mainId,
      attrIds
    }
  }
  return artis
}

/**
 * 取指定副词条 key 对应的 id（每个 key 取数值最大的那一档）
 * @param {object} miao
 * @param {'gs'|'sr'} game
 * @param {string[]} keys
 * @returns {Array<number|string>}
 */
function pickSubAttrIds (miao, game, keys) {
  const attrIdMap = miao.Meta?.getMeta?.(game, 'arti')?.attrIdMap || {}
  const best = {}
  for (const [id, ds] of Object.entries(attrIdMap)) {
    if (!ds || !keys.includes(ds.key)) continue
    if (!best[ds.key] || ds.value > best[ds.key].value) best[ds.key] = { id, value: ds.value }
  }
  return keys.map(k => best[k]?.id).filter(v => v !== undefined)
}

/**
 * 取原神元素伤害杯的 mainId（元数据里按元素 key 反查，取不到就用火伤杯）
 * @param {object} miao
 * @param {string} [elem]
 * @returns {number}
 */
function pickGsCupId (miao, elem) {
  if (!elem) return GS_DMG_CUP_ID
  const mainIdMap = miao.Meta?.getMeta?.('gs', 'arti')?.mainIdMap || {}
  for (const [id, key] of Object.entries(mainIdMap)) {
    if (key === elem) return Number(id)
  }
  return GS_DMG_CUP_ID
}
