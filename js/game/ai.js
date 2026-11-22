'use strict';
/**
 * AI 陪练（v1.4 §2.6 平衡七条）
 * 1. 开局有限手牌：新手 5 / 普通 8 / 高手 12
 * 2. 难度 = 手牌数 + 失误率(20%/10%/5%) + 思考时长三参数
 * 3. AI 回合也有 10s 上限（思考时长 ≤2s，正常不触顶）
 * 4. 与玩家共用全局 usedKeys
 * 5. 回合上限 12（match.js 管）；6. 换字重置手牌与 usedKeys（match.js 管）；7. 拟人延迟不参与平衡
 */
const { pickCorrect, remaining, isFamous, isHot, isTop, shuffled } = require('./candidates');
const { corpus } = require('../../src/judge');

const LEVELS = {
  rookie:  { hand: 5,  errorRate: 0.20, thinkMin: 1.2, thinkMax: 2.0, label: '新手' },
  normal:  { hand: 8,  errorRate: 0.10, thinkMin: 0.8, thinkMax: 1.5, label: '困难' },
  expert:  { hand: 12, errorRate: 0.05, thinkMin: 0.3, thinkMax: 0.8, label: '高手' },
};
const lineText = i => corpus.lines[i].split('|')[0];

function create(level, keyword, rng, difficulty, reserve) {
  const cfg = LEVELS[level] || LEVELS.normal;
  return {
    cfg,
    level,
    rng,
    difficulty: difficulty || 'mixed',
    reserve: reserve instanceof Set ? reserve : new Set(reserve || []),
    hand: deal(cfg.hand, keyword, [], rng, difficulty || 'mixed', reserve),
  };
}

/**
 * 按关键字+难度发牌：从未用、含字的池里抽 handSize 句。
 * difficulty: 'e'|'m'|'h' 按学段三档过滤；'mixed' 不限档。
 * reserve（2026-11-20）：预留句文本集合（教学局的三句教学脚本）——AI 手牌
 * 绝不许占用，否则教学回合脚本发牌 used.has(spec.line) 命中回落常规发牌、旧提示复读。
 * 档内不足则逐级放宽到全档（v1.4 §2.6 池空兜底精神，禁止 random([])）。
 */
function deal(handSize, keyword, usedKeys, rng, difficulty, reserve) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  const reserved = reserve instanceof Set ? reserve : new Set(reserve || []);
  const byLevel = lv => (corpus.char_index[keyword] || [])
    .filter(i => !used.has(lineText(i)) && !reserved.has(lineText(i))
      && (lv === undefined || corpus.lines[i].split('|')[2] === lv));
  let pool = byLevel(difficulty && difficulty !== 'mixed' ? difficulty : undefined);
  if (pool.length < handSize) pool = byLevel(undefined); // 档内不足放宽
  // ★ 四级经典偏好：AI 手牌优先装核心名句 → 教材名篇 → 名家 → 其余（诗童出句应为热门经典）
  const top = pool.filter(isTop);
  const hot = pool.filter(i => !isTop(i) && isHot(i));
  const fam = pool.filter(i => !isTop(i) && !isHot(i) && isFamous(i));
  const rest = pool.filter(i => !isTop(i) && !isHot(i) && !isFamous(i));
  const ordered = shuffled(top, rng).concat(shuffled(hot, rng)).concat(shuffled(fam, rng)).concat(shuffled(rest, rng));
  return ordered.slice(0, handSize);
}

/**
 * AI 出手。
 * @returns {{action:'play', lineIdx, thinkSec} | {action:'fail', thinkSec} | {action:'exhausted'}}
 *  - 手牌空 → exhausted（诗童接不上 → 结算）
 *  - 命中失误率 → fail（出干扰性质失败，该回合失手）
 *  - 正常 → play：出一句未用手牌（AI 点选也完整走 judge 由 match 校验）
 */
function act(ai, keyword, usedKeys, elapsed) {
  const { rng, cfg } = ai;
  // 手牌里被玩家先出掉的句要剔除（共用 usedKeys）
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  ai.hand = ai.hand.filter(i => !used.has(lineText(i)));
  if (!ai.hand.length) {
    // 手牌耗尽尝试从池里补一张（v1.4 §2.6.1 出完即判接不上；这里按池兜底防误杀）
    const more = deal(1, keyword, usedKeys, rng, ai.difficulty, ai.reserve);
    if (more.length) ai.hand = more;
    else return { action: 'exhausted' };
  }
  const thinkSec = cfg.thinkMin + rng() * (cfg.thinkMax - cfg.thinkMin);
  if (elapsed > 10) return { action: 'fail', thinkSec: Math.min(thinkSec, 0.5) }; // AI 超时同分支
  if (rng() < cfg.errorRate) return { action: 'fail', thinkSec };
  const j = Math.floor(rng() * ai.hand.length);
  const lineIdx = ai.hand[j];
  ai.hand.splice(j, 1);
  return { action: 'play', lineIdx, thinkSec };
}

module.exports = { LEVELS, create, deal, act };
