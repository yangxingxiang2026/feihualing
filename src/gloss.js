'use strict';
/**
 * 诗笺（诗词释义）查询层
 *
 * 单一职责：把「原句」映射到释义、出处、全诗与整首串讲，不做任何排版/绘制。
 * 数据：
 *   src/data/gloss.js      单句直译（手工维护，key = corpus norm_key）
 *   src/data/poem_gloss.js 整首串讲（key = "题名|作者"）
 *   src/data/poem_text.js  全诗正文（构建期从语料源 p.text 原样带出，与 sources 同下标）
 * 出处/正文/串讲 key 全部实时对齐 corpus，不各抄一份（两处各抄一份必然漂移）。
 */
const DATA = require('./data/gloss');
const POEM_GLOSS = require('./data/poem_gloss');
const POEM_TEXT = require('./data/poem_text').texts;
const { corpus } = require('./judge');

/** 该句是否有释义 */
function has(text) {
  return Object.prototype.hasOwnProperty.call(DATA, text);
}

/** 取释义 {g, n} | null */
function of(text) {
  return has(text) ? DATA[text] : null;
}

/** 句 → 语料句下标 | null */
function lineIndex(text) {
  const i = corpus.norm_index[text];
  return i == null ? null : Number(i);
}

/** 句 → 诗集下标（sources 下标）| null */
function srcIdx(text) {
  const i = lineIndex(text);
  if (i == null) return null;
  const p = String(corpus.lines[i]).split('|');
  return p[1] == null ? null : Number(p[1]);
}

/**
 * 反查出处。sources[s] = "title|author|dynasty"。
 * @returns {{title:string, author:string, dynasty:string}|null}
 */
function source(text) {
  const si = srcIdx(text);
  if (si == null) return null;
  return sourceOf(si);
}

/** 诗集下标 → 出处三段 */
function sourceOf(si) {
  const s = corpus.sources[si];
  if (!s) return null;
  const p = String(s).split('|');
  return { title: p[0] || '', author: p[1] || '', dynasty: p[2] || '' };
}

/** 诗集下标 → 全诗正文（构建期原样带出，含原标点） */
function poemText(si) {
  return POEM_TEXT[si] || '';
}

/** 整首串讲 | null */
function introOf(si) {
  const s = sourceOf(si);
  if (!s) return null;
  const k = s.title + '|' + s.author;
  return Object.prototype.hasOwnProperty.call(POEM_GLOSS, k) ? POEM_GLOSS[k].g : null;
}

/**
 * 全诗断行：按句读切（，。！？；：、），每段带原标点。
 * 中文竖排视觉的常规做法——一个句读一行，五七言诗一行就是半联，词的长短句也自然成行。
 * 不用 String.prototype.split(/lookbehind/)：老基础库不支持后行断言，逐字符扫最稳。
 */
const BREAK = '，。！？；：、';
function splitLines(text) {
  const out = [];
  let cur = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\n' || ch === '\r') { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
    if (BREAK.indexOf(ch) >= 0) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** 去标点（高亮比对用） */
function stripPunc(s) {
  return String(s).replace(/[^\u4e00-\u9fa5]/g, '');
}

/**
 * 把全诗切成「渲染行」，并标出哪些行属于本局/本诗的句子。
 * @param {number} si 诗集下标
 * @param {string[]} marks 要高亮的句子（norm_key）
 * @returns {Array<{s:string, hl:boolean, mark:string}>}
 */
function renderLines(si, marks) {
  const set = new Set(marks || []);
  const lines = splitLines(poemText(si));
  return lines.map(s => {
    const k = stripPunc(s);
    let hit = '';
    if (set.has(k)) hit = k;
    else {
      // 跨句读的句子（词里偶见）：整段包含即高亮
      for (const m of set) { if (m && k.indexOf(m) >= 0) { hit = m; break; } }
    }
    return { s, hl: !!hit, mark: hit };
  });
}

/**
 * 按「首」聚合本页要展示的内容。
 * 优先本局真出现过的句子所属的诗（mine=true）；不足 max 首时用同令字收录句所在诗补齐。
 * 同一首诗里的多句合并成一条，避免《古诗十九首》那种一首三句被拆成三页。
 *
 * @param {string[]} lines 本局亮过的句子（Match.roundLines）
 * @param {string} keyword 本局令字
 * @param {number} max 最多几首
 */
function poems(lines, keyword, max) {
  const n = max || 6;
  const order = [];          // si 顺序
  const marksOf = new Map(); // si -> Set(句)
  const push = (si, t) => {
    if (!marksOf.has(si)) { marksOf.set(si, new Set()); order.push(si); }
    marksOf.get(si).add(t);
  };
  for (const t of lines || []) {
    if (!has(t)) continue;
    const si = srcIdx(t);
    if (si == null) continue;
    // 已满上限时只并入已有诗（同诗第二句不该被丢掉，否则一首诗会缺句）
    if (!marksOf.has(si) && order.length >= n) continue;
    push(si, t);
  }
  const mineCount = order.length;
  if (order.length < n && keyword) {
    for (const t of Object.keys(DATA)) {
      if (order.length >= n) break;
      if (t.indexOf(keyword) < 0) continue;
      const si = srcIdx(t);
      if (si == null) continue;
      push(si, t);
    }
  }
  return order.slice(0, n).map((si, i) => {
    const s = sourceOf(si);
    const marks = Array.from(marksOf.get(si));
    return {
      si,
      mine: i < mineCount,
      title: s ? s.title : '',
      author: s ? s.author : '',
      dynasty: s ? s.dynasty : '',
      text: poemText(si),
      lines: renderLines(si, marks),
      marks,
      glosses: marks.map(t => ({ text: t, g: DATA[t] ? DATA[t].g : '', n: DATA[t] ? DATA[t].n : '' })),
      intro: introOf(si),
    };
  });
}

/**
 * 挑本页要展示的句子（单句卡时代的接口，2026-11-21 起诗笺页改用 poems()。
 * 保留是因为结算页入口提示与旧测试仍在用，行为不变）。
 *
 * @param {string[]} lines 本局亮过的句子（Match.roundLines）
 * @param {string} keyword 本局令字
 * @param {number} max 最多几条
 */
function pick(lines, keyword, max) {
  const n = max || 6;
  const out = [];
  const seen = new Set();
  for (const t of lines || []) {
    if (out.length >= n) break;
    if (!has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(Object.assign({ text: t, mine: true }, DATA[t]));
  }
  if (out.length < n && keyword) {
    for (const t of Object.keys(DATA)) {
      if (out.length >= n) break;
      if (seen.has(t) || t.indexOf(keyword) < 0) continue;
      seen.add(t);
      out.push(Object.assign({ text: t, mine: false }, DATA[t]));
    }
  }
  return out;
}

/** 收录条数（测试/埋点用） */
function count() {
  return Object.keys(DATA).length;
}

/** 诗级收录条数 */
function poemCount() {
  return Object.keys(POEM_GLOSS).length;
}

module.exports = {
  has, of, source, sourceOf, srcIdx, lineIndex, poemText, introOf,
  splitLines, stripPunc, renderLines, poems, pick, count, poemCount,
  DATA, POEM_GLOSS, POEM_TEXT,
};
