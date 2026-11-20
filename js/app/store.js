'use strict';
/**
 * 应用状态：设置（适老字号 / 主题 / 减弱动效）+ 战绩持久化
 * v0.1：设置按钮一级可见、不做二级菜单（10_ui_spec.md H-03）——
 *       点按在字号 1.0/1.25/1.5 间循环并弹 toast；主题与减弱动效开关 v0.2 接入。
 */
const platform = require('../platform');

const KEY_SETTINGS = 'settings';
const KEY_RECORD = 'record';
const KEY_FIRST = 'firstRun';
const KEY_TUTORIAL = 'tutorialDone';
const KEY_GRUDGE = 'grudge';

// difficulty：难度档（用户口径 2026-11-18「按熟悉程度分级」）——
// easy 默认：核心名句层 + 优先五言 + 15s 决策期 + 新手 AI；normal：10s / 困难 AI
// mode：P0-3 起首页只有一个主按钮，玩法模式降为二级 chip（默认择句——P0-1 后它才是真玩法）
// sound：P0-5 音效开关，默认开
const DEFAULT_SETTINGS = { fontScale: 1.0, theme: 'light', reduceMotion: false, difficulty: 'easy', mode: 'choice', sound: true };
const DEFAULT_RECORD = { games: 0, wins: 0, losses: 0, draws: 0, bestCombo: 0, totalHits: 0, bestAvgReact: null, recentKeywords: [] };

function loadSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, platform.storageGet(KEY_SETTINGS, {}));
}
function saveSettings(s) { platform.storageSet(KEY_SETTINGS, s); }

function loadRecord() {
  return Object.assign({}, DEFAULT_RECORD, platform.storageGet(KEY_RECORD, {}));
}
function saveRecord(r) { return platform.storageSet(KEY_RECORD, r); }

/** 最近几局用过的令字（供开局排除，防「题目会重复」体感） */
function recentKeywords() {
  const r = loadRecord();
  return Array.isArray(r.recentKeywords) ? r.recentKeywords : [];
}

/** 对局结算 → 累计战绩；返回是否保存成功（失败走上层「战绩未保存」细条） */
function applyOutcome(outcome) {
  // 教学局不计战绩、不入仇册（§4.19 定稿口径，此处补上实际短路——原实现漏了）
  if (outcome && outcome.tutorial) return true;
  const r = loadRecord();
  r.games++;
  if (outcome.result === 'win') r.wins++;
  else if (outcome.result === 'loss') r.losses++;
  else r.draws++;
  r.bestCombo = Math.max(r.bestCombo, outcome.stats.maxCombo || 0);
  r.totalHits += outcome.stats.hits || 0;
  if (outcome.stats.avgReact != null && outcome.stats.avgReact > 0) {
    r.bestAvgReact = r.bestAvgReact == null ? outcome.stats.avgReact : Math.min(r.bestAvgReact, outcome.stats.avgReact);
  }
  // 记录最近 2 局令字（下一局开局排除，避免连续同字）
  const kw = outcome.stats && outcome.stats.keyword;
  if (kw) {
    const list = Array.isArray(r.recentKeywords) ? r.recentKeywords.filter(k => k !== kw) : [];
    list.unshift(kw);
    r.recentKeywords = list.slice(0, 2);
  }
  const ok = saveRecord(r);
  // 错句复仇（2026-11-19 PM 唯一推荐概念）：错句入册 + 本局雪耻回写
  const rev = outcome.stats && outcome.stats.revenge;
  if (rev) {
    if (Array.isArray(rev.newGrudge) && rev.newGrudge.length) addGrudgeLines(rev.newGrudge, r.games);
    if (Array.isArray(rev.killedTexts) && rev.killedTexts.length) markGrudgeAvenged(rev.killedTexts);
  }
  return ok;
}

// ---------------- 仇册（错句复仇 MVP，2026-11-19） ----------------
// 条目：{ text, addedAt, avenged, ts }——text 为玩家失手回合的正解真句（库内、含当局令字）。
// addedAt = 入册时的局数（record.games）；「满 3 局才甩」= 当前局数 - addedAt >= 2。
const GRUDGE_MAX = 30;
const GRUDGE_RIPE_GAP = 2;

function loadGrudge() {
  const g = platform.storageGet(KEY_GRUDGE, []);
  return Array.isArray(g) ? g : [];
}
function saveGrudge(list) {
  // 超上限：未雪耻的优先保留（雪耻过的是已翻篇的历史，可弃）
  if (list.length > GRUDGE_MAX) {
    const un = list.filter(e => !e.avenged);
    const av = list.filter(e => e.avenged);
    list = un.concat(av).slice(0, GRUDGE_MAX);
  }
  return platform.storageSet(KEY_GRUDGE, list);
}
/** 错句入册（按句文本去重）；返回实际新增条数 */
function addGrudgeLines(lines, games) {
  const g = loadGrudge();
  let added = 0;
  for (const text of lines || []) {
    if (!text || g.some(e => e.text === text)) continue;
    g.push({ text, addedAt: games, avenged: false, ts: Date.now() });
    added++;
  }
  if (added) saveGrudge(g);
  return added;
}
/** 雪耻回写：标记这些句为已翻篇 */
function markGrudgeAvenged(texts) {
  const set = new Set(texts || []);
  const g = loadGrudge();
  let changed = false;
  for (const e of g) {
    if (!e.avenged && set.has(e.text)) { e.avenged = true; changed = true; }
  }
  if (changed) saveGrudge(g);
  return changed;
}
/** 已熟成待甩的错句（未雪耻 + 入册满 3 局）——供 Match 出句加权 */
function grudgeRipe() {
  const games = loadRecord().games;
  return loadGrudge()
    .filter(e => !e.avenged && games - e.addedAt >= GRUDGE_RIPE_GAP)
    .map(e => e.text);
}
/** 仇册状态摘要（首页战绩签 / 结算页展示用） */
function grudgeSummary() {
  const g = loadGrudge();
  return { total: g.length, pending: g.filter(e => !e.avenged).length };
}

function isFirstRun() {
  return platform.storageGet(KEY_FIRST, true) === true;
}
function markFirstRunDone() { platform.storageSet(KEY_FIRST, false); }

/** 教学局是否已完成（P0-3：首局走 3 回合教学局，完成后不再出现） */
function isTutorialDone() { return platform.storageGet(KEY_TUTORIAL, false) === true; }
function markTutorialDone() { platform.storageSet(KEY_TUTORIAL, true); }

module.exports = { loadSettings, saveSettings, loadRecord, saveRecord, applyOutcome, recentKeywords, isFirstRun, markFirstRunDone, isTutorialDone, markTutorialDone, loadGrudge, saveGrudge, addGrudgeLines, markGrudgeAvenged, grudgeRipe, grudgeSummary, GRUDGE_MAX, DEFAULT_RECORD };
