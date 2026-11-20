'use strict';
/**
 * 错句复仇 MVP（2026-11-19 PM 唯一推荐概念）回归：
 * 入册去重/上限 → 熟成门槛（满 3 局）→ 诗童甩错句 → 反杀翻倍 + 雪耻回写 → 教学局隔离
 */
// Node 下 platform 存储是 no-op：挂内存 localStorage shim 让 store 真正持久化
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'js/app/store'));
const { Match } = require(path.join(ROOT, 'js/game/match'));
const { corpus } = require(path.join(ROOT, 'src/judge'));

const G1 = '床前明月光';
const G2 = '月落乌啼霜满天';
test.before(() => {
  if (corpus.norm_index[G1] == null || corpus.norm_index[G2] == null) {
    throw new Error('测试错句不在语料库：' + G1 + ' / ' + G2);
  }
});

/** 驱动对局：玩家每回合点正解，返回 {grudgePlays, revengePasses} */
function drive(m, maxFrames) {
  const seen = { grudgePlays: 0, revengePasses: 0 };
  let prevPhase = '';
  for (let i = 0; i < (maxFrames || 2000) && m.phase !== 'result'; i++) {
    m.update(0.05);
    if (m.phase === 'aiFeedback' && prevPhase !== 'aiFeedback' && m.feedback &&
        m.feedback.kind === 'aiPlay' && m.feedback.grudge) {
      seen.grudgePlays++;
      assert.equal(m.revengeRound.text, m.feedback.text, '甩出后须挂起雪耻回合');
    }
    if (m.phase === 'playerFeedback' && prevPhase !== 'playerFeedback' &&
        m.feedback && m.feedback.kind === 'pass' && m.feedback.revenge) seen.revengePasses++;
    if (m.phase === 'player' && m.candidates) m.submitChoice(m.candidates.correctPos);
    prevPhase = m.phase;
  }
  return seen;
}

test('入册：去重 + 上限 30 + 未雪耻优先保留', () => {
  store.saveGrudge([]);
  assert.equal(store.addGrudgeLines([G1], 5), 1);
  assert.equal(store.addGrudgeLines([G1], 6), 0, '同句不得重复入册');
  const lines = [];
  for (let i = 0; i < 35; i++) lines.push('测试句' + i);
  store.addGrudgeLines(lines, 7);
  const g = store.loadGrudge();
  assert.equal(g.length, store.GRUDGE_MAX, '仇册不得超 30 条');
  assert.ok(g.some(e => e.text === G1 && !e.avenged), '旧错句未雪耻应保留');
});

test('熟成门槛：入册满 3 局才可甩，雪耻后永不再甩', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 10 }));
  store.addGrudgeLines([G1], 10);            // 第 10 局入册
  assert.deepEqual(store.grudgeRipe(), [], '当局与次局不得甩');
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 11 }));
  assert.deepEqual(store.grudgeRipe(), [], '差 1 局仍不甩');
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 12 }));
  assert.deepEqual(store.grudgeRipe(), [G1], '满 3 局（12-10>=2）熟成');
  store.markGrudgeAvenged([G1]);
  assert.deepEqual(store.grudgeRipe(), [], '雪耻后从仇册出句池移除');
});

test('对局：诗童优先甩错句（aiPlay.grudge）且每局至多 2 句', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 12 }));
  store.addGrudgeLines([G1, G2], 1);         // 入册早 → 均已熟成
  const m = new Match({ keyword: '月', seed: 7, grudgeLines: [G1, G2] });
  const seen = drive(m);
  assert.ok(seen.grudgePlays >= 1, '熟成错句在手：诗童必须至少甩一次');
  assert.ok(seen.grudgePlays <= 2, '每局至多甩 2 句（防刷屏）');
  assert.ok(m.outcome, '对局须正常走到结算');
});

test('反杀翻倍：接上仇册句 → +2、revenge 标记、雪耻回写', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 12 }));
  store.addGrudgeLines([G1], 1);
  const m = new Match({ keyword: '月', seed: 7, grudgeLines: [G1] });
  // 推进到诗童甩错句
  let guard = 0;
  while (!(m.phase === 'aiFeedback' && m.feedback && m.feedback.grudge) && m.phase !== 'result' && guard++ < 600) {
    m.update(0.05);
    if (m.phase === 'player' && m.candidates) m.submitChoice(m.candidates.correctPos);
  }
  assert.ok(m.revengeRound, '雪耻回合应挂起');
  const hitsBefore = m.playerHits;
  guard = 0;
  while (m.phase !== 'player' && guard++ < 200) m.update(0.05);
  const snap = m.snapshot();
  assert.ok(snap.revenge && !snap.revenge.avenged, '决策期快照应携带悬着的雪耻回合（UI 仇册签依据）');
  m.submitChoice(m.candidates.correctPos);
  assert.equal(m.feedback.kind, 'pass');
  assert.equal(m.feedback.revenge, true, '接上仇册句须标记 revenge');
  assert.equal(m.playerHits, hitsBefore + 2, '反杀翻倍 = 正常 +1 再奖 +1');
  assert.equal(m.revengeRound, null, '雪耻回合已消费');
  assert.deepEqual(m.revengeKills, [G1], '雪耻清单须记录该错句');
  // 走完对局并结算回写
  drive(m);
  const r = m.outcome.stats.revenge;
  assert.ok(r.kills >= 1, 'outcome.stats.revenge.kills 应统计');
  store.applyOutcome(m.outcome);
  const g = store.loadGrudge().find(e => e.text === G1);
  assert.ok(g && g.avenged, '结算后仇册该句须标记已雪耻');
  assert.ok(!store.grudgeRipe().includes(G1), '已雪耻句不得再进甩句池');
});

test('错句入册：玩家失手回合的正解进入 grudgeNew 并在结算后落册', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 3 }));
  const m = new Match({ keyword: '月', seed: 1 });   // 种子 1：失手句当局不复现（2026-11-20 随困难档题句分级改动重探测；种子 4 在新分级下会让失手句复现被补接）
  m.update(0.9); // 过 reveal
  const wrongPos = m.candidates.correctPos === 0 ? 1 : 0;
  m.submitChoice(wrongPos);
  assert.equal(m.feedback.kind, 'fail');
  const expect = m.candidates.options[m.candidates.correctPos].text;
  assert.ok(m.grudgeNew.includes(expect), '失手回合正解须入错句清单');
  drive(m);
  store.applyOutcome(m.outcome);
  const g = store.loadGrudge().find(e => e.text === expect);
  assert.ok(g, '结算后错句须落册（当局未被玩家补接）');
  assert.equal(g.addedAt, store.loadRecord().games, 'addedAt 须为入册时局数（熟成门槛基准）');
  assert.equal(g.avenged, false);
});

test('错句宽恕：失手后当局补接上的句不入册', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 3 }));
  const m = new Match({ keyword: '月', seed: 11 });
  m.update(0.9);
  const miss = m.candidates.options[m.candidates.correctPos].text;
  m.submitChoice(m.candidates.correctPos === 0 ? 1 : 0);   // 故意点错
  assert.ok(m.grudgeNew.includes(miss));
  // 下一回合若该句再次出现并被接上 → 结算时应从入册清单剔除
  drive(m);
  if (m.usedKeys.has(miss)) {
    assert.ok(!m.outcome.stats.revenge.newGrudge.includes(miss), '已被补接的句不算仇');
  } else {
    assert.ok(true, '该句未再出现，不适用宽恕分支');
  }
});

test('教学局隔离：不入册、不甩句、不计战绩', () => {
  store.saveGrudge([]);
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 9 }));
  const m = new Match({ tutorial: true, seed: 5, grudgeLines: [G1] });
  drive(m);
  assert.equal(m.grudgeNew.length, 0, '教学局失手不入册');
  assert.ok(m.outcome.tutorial, '教学局结果须带 tutorial 标记');
  const before = store.loadRecord().games;
  store.applyOutcome(m.outcome);
  assert.equal(store.loadRecord().games, before, '教学局不得计入战绩');
  assert.equal(store.loadGrudge().length, 0, '教学局不得写仇册');
});
