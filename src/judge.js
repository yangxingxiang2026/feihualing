'use strict';
/**
 * 飞花令 v0.1 判定引擎（纯函数，零依赖，CommonJS）
 * ==============================================================
 * 玩家接龙判定：给定候选句、关键字、已用句集合、字池，返回判定结果。
 *
 * 规则（v1.4 锁定）：
 *  - 一句 = 单句：候选句先做 norm_key 归一（去标点/空白/全半角差异，仅保留汉字）
 *  - 只认库内句：norm_key 必须能在语料句库命中（norm_index 全等匹配，绝无模糊匹配）
 *  - 必须含本轮关键字（字池 8 字：人山风月春花天水）
 *  - REPEAT_LIMIT = 1：同一句每人限一次；usedKeys 为全局已用 norm_key 集合，
 *    一句被任何人用过即全员不可再出（全局去重即蕴含每人去重）
 *
 * reason 枚举：
 *  OK            通过
 *  FORMAT_ERROR  格式错误（空串 / 归一后非 5、7 言 / 非字符串）
 *  INVALID_KEYWORD 关键字不合法（不在字池 / 非单字）
 *  NOT_IN_CORPUS 非库内句（杜撰、或库外真实诗句）
 *  NO_KEYWORD    不含关键字
 *  DUPLICATE     重复（该句已在 usedKeys 中）
 */

const corpus = require('./data/corpus');

const POOL = corpus.pool;                       // ['人','山','风','月','春','花','天','水']
const REPEAT_LIMIT = 1;                         // v1.4：同一句每人限一次
const ALLOWED_LEN = [5, 7];                     // 仅 5/7 言句进句库，判定口径一致

/** norm_key：去标点/空白/全半角差异，仅保留汉字（全半角数字字母一律剔除） */
function normKey(s) {
  return (String(s || '').match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) || []).join('');
}

// norm_index 运行时构建：normKey -> 句下标（构建脚本保证全库唯一，CI 独立校验）
const NORM_INDEX = new Map();
corpus.lines.forEach((entry, i) => {
  const key = entry.slice(0, entry.indexOf('|'));
  NORM_INDEX.set(key, i);
});

/** usedKeys 兼容 Set / 数组 / 对象map，元素统一做 norm_key 归一 */
function toKeySet(usedKeys) {
  const set = new Set();
  if (!usedKeys) return set;
  if (usedKeys instanceof Set) {
    usedKeys.forEach(k => set.add(normKey(k)));
  } else if (Array.isArray(usedKeys)) {
    usedKeys.forEach(k => set.add(normKey(k)));
  } else if (typeof usedKeys === 'object') {
    Object.keys(usedKeys).forEach(k => set.add(normKey(k)));
  }
  return set;
}

/**
 * 判定一条候选句
 * @param {string} candidate  候选句原文（可含标点/空格/全半角差异）
 * @param {string} keyword    本轮关键字（字池单字）
 * @param {Set|Array|Object} usedKeys 全局已用句 norm_key 集合
 * @param {string[]} [pool]   字池，默认语料内置 8 字池
 * @returns {{pass: boolean, reason: string, lineId?: number}}
 */
function judge(candidate, keyword, usedKeys, pool) {
  const key = normKey(candidate);

  // 1) 格式：非空且归一后必须是 5/7 言（与句库口径一致）
  if (typeof candidate !== 'string' || !key) {
    return { pass: false, reason: 'FORMAT_ERROR' };
  }
  if (ALLOWED_LEN.indexOf(key.length) === -1) {
    return { pass: false, reason: 'FORMAT_ERROR' };
  }

  // 2) 关键字合法性：必须为字池中的单字
  const activePool = Array.isArray(pool) && pool.length ? pool : POOL;
  if (typeof keyword !== 'string' || [...keyword].length !== 1 || activePool.indexOf(keyword) === -1) {
    return { pass: false, reason: 'INVALID_KEYWORD' };
  }

  // 3) 库内句：norm_key 全等命中（绝不模糊匹配，近似句互不干扰）
  const lineId = NORM_INDEX.get(key);
  if (lineId === undefined) {
    return { pass: false, reason: 'NOT_IN_CORPUS' };
  }

  // 4) 含关键字
  if (key.indexOf(keyword) === -1) {
    return { pass: false, reason: 'NO_KEYWORD' };
  }

  // 5) 重复：v1.4 全局去重（usedKeys 内出现即拒，同一句每人限一次被全局去重覆盖）
  if (toKeySet(usedKeys).has(key)) {
    return { pass: false, reason: 'DUPLICATE' };
  }

  return { pass: true, reason: 'OK', lineId };
}

module.exports = { judge, normKey, POOL, REPEAT_LIMIT, ALLOWED_LEN, corpus };
