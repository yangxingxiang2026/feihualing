'use strict';
/** 最小埋点（P0-4）回归：事件契约、字段清洗、环形缓冲、非法事件忽略 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const track = require(path.join(ROOT, 'js/app/track'));

test('埋点事件契约恰好 6 个（PM 验收口径）', () => {
  assert.deepEqual(track.EVENTS, ['fhl_start', 'fhl_round', 'fhl_end', 'fhl_again', 'fhl_share', 'fhl_exit']);
});

test('字段清洗：布尔→1/0、数字两位、字符串截断 32、对象/空值丢弃', () => {
  track.reset();
  const ev = track.track('fhl_start', {
    mode: 1, tutorial: true, off: false, ms: 12.3456,
    kw: '月', huge: 'x'.repeat(80), obj: { a: 1 }, nil: null, und: undefined, empty: '',
  });
  assert.ok(ev && ev.e === 'fhl_start');
  assert.equal(ev.d.mode, 1);
  assert.equal(ev.d.tutorial, 1);
  assert.equal(ev.d.off, 0);
  assert.equal(ev.d.ms, 12.35);
  assert.equal(ev.d.kw, '月');
  assert.equal(ev.d.huge.length, 32, '字符串必须截断（reportAnalytics 限制）');
  ['obj', 'nil', 'und', 'empty'].forEach(k => assert.ok(!(k in ev.d), `${k} 应被丢弃`));
});

test('非法事件名被忽略（防拼错污染后台事件表）', () => {
  track.reset();
  assert.equal(track.track('fhl_typo', { a: 1 }), null);
  assert.equal(track.dump().length, 0);
});

test('本地环形缓冲：上限 200，count 可数', () => {
  track.reset();
  for (let i = 0; i < 250; i++) track.track('fhl_round', { round: i });
  assert.equal(track.dump().length, 200, '缓冲上限 200（只留最近）');
  assert.equal(track.count('fhl_round'), 200);
  assert.equal(track.dump()[199].d.round, 249, '保留的是最近的事件');
  track.reset();
  assert.equal(track.dump().length, 0);
});

test('全流程 6 事件都能落进缓冲（界面接入点存在性检查）', () => {
  track.reset();
  track.track('fhl_start', { mode: 1, difficulty: 1, tutorial: 1, kw: '月' });
  track.track('fhl_round', { round: 1, ok: 1, reason: 'OK', ms: 3200 });
  track.track('fhl_end', { result: 1, hits: 3, tiger: 2, rounds: 3, dur: 62, timeouts: 0 });
  track.track('fhl_again', { tutorial: 1 });
  track.track('fhl_share', { result: 1, hits: 3 });
  track.track('fhl_exit', { from: 1, round: 3 });
  const names = track.dump().map(e => e.e);
  assert.deepEqual(names, track.EVENTS, '6 事件顺序落盘');
  // 埋点不得含任何可识别信息字段
  const banned = ['openid', 'openId', 'nickname', 'avatar', 'phone', 'uid', 'device'];
  track.dump().forEach(e => Object.keys(e.d).forEach(k => assert.ok(banned.indexOf(k) === -1, `禁止上报 ${k}`)));
});
