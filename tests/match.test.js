'use strict';
/** 对局状态机单测：全流程模拟（update(dt) 驱动，无真实定时器） */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Match } = require('../js/game/match');
const { judge, corpus, POOL } = require('../src/judge');
const C = require('../js/game/candidates');

const DT = 0.05;
const lineText = i => corpus.lines[i].split('|')[0];

/** 推进到指定相位 */
function runTo(m, phase, maxSec) {
  let t = 0;
  while (m.phase !== phase && t < (maxSec || 120)) { m.update(DT); t += DT; }
  if (m.phase !== phase) throw new Error(`未到达相位 ${phase}，当前 ${m.phase}`);
}
/** 跑完一个完整回合并返回玩家判定结果 */
function playRound(m, pick) {
  runTo(m, 'player');
  const r = pick(m);
  runTo(m, 'reveal', 30); // 过 AI 反馈后进入下一回合 reveal（或 result）
  return r;
}

test('全胜模拟：12 回合全对 → 回合封顶生效、按接诗数判定', () => {
  const m = new Match({ mode: 'choice', seed: 1001, aiLevel: 'normal', roundMax: 12 });
  assert.equal(m.phase, 'reveal'); // 开局先出字亮相，倒计时不启动
  for (let i = 0; i < 11; i++) {
    playRound(m, (mm) => {
      assert.equal(mm.phase, 'player');
      const r = mm.submitChoice(mm.candidates.correctPos);
      assert.equal(r.pass, true, `第 ${i + 1} 回合正确项应通过`);
      return r;
    });
    assert.equal(m.playerHits, i + 1);
    assert.equal(m.phase, 'reveal');
  }
  // 第 12 回合结束后应直接进结算
  runTo(m, 'player');
  const r12 = m.submitChoice(m.candidates.correctPos);
  assert.equal(r12.pass, true);
  runTo(m, 'result', 60);
  assert.equal(m.outcome.stats.rounds, 12);
  assert.equal(m.outcome.reason, 'roundsFull');
  assert.equal(m.playerHits, 12);
  assert.ok(['win', 'draw'].includes(m.outcome.result),
    `12 全对应胜或和（AI 亦全中则和）：${m.outcome.result}，虎中 ${m.tigerHits}`);
});

test('判定铁律：点选结果完整跑 judge——干扰项判不通过（noKw/fake）、已用句判重复', () => {
  const m = new Match({ mode: 'choice', seed: 2002, roundMax: 3 });
  runTo(m, 'player');
  const correct = m.candidates.options[m.candidates.correctPos].text;
  // 1) ★ 干扰项全 fail 口径：点干扰项 → 完整跑 judge 判不通过（noKw→NO_KEYWORD / fake→NOT_IN_CORPUS）
  const badPos = m.candidates.options.findIndex((o, i) => i !== m.candidates.correctPos && (o.kind === 'noKw' || o.kind === 'fake'));
  if (badPos >= 0) {
    const badText = m.candidates.options[badPos].text;
    const r1 = m.submitChoice(badPos);
    assert.equal(r1.pass, false, `干扰句「${badText}」(${m.candidates.options[badPos].kind}) 完整跑 judge 必须判不通过`);
    assert.ok(['NO_KEYWORD', 'NOT_IN_CORPUS'].includes(r1.reason), `错因应为 NO_KEYWORD/NOT_IN_CORPUS，实得 ${r1.reason}`);
    assert.equal(m.usedKeys.has(badText), false, '判不通过的句不入 usedKeys');
    runTo(m, 'reveal', 30);
    // 2) dup 陷阱：把当前候选正确句标为已用（模拟他人先出）→ 点它完整跑 judge 判 DUPLICATE
    runTo(m, 'player');
    const p2 = m.candidates.correctPos;
    const correctText2 = m.candidates.options[p2].text;
    m.usedKeys.add(correctText2);
    const r2 = m.submitChoice(p2);
    assert.equal(r2.pass, false, '已用句再出判重复');
    assert.equal(r2.reason, 'DUPLICATE');
    runTo(m, 'reveal', 30);
  }
});

test('幽灵出句器：句必含关键字、不在 usedKeys、难度过滤生效', () => {
  const aiLib = require('../js/game/ai');
  for (const diff of ['e', 'm', 'h', 'mixed']) {
    const ai = aiLib.create('normal', '月', C.mulberry32(11), diff);
    assert.ok(ai.hand.length > 0, `难度 ${diff} 应有手牌`);
    for (const i of ai.hand) {
      const key = lineText(i);
      assert.ok(key.indexOf('月') !== -1, `幽灵手牌「${key}」必含关键字`);
      if (diff !== 'mixed') assert.equal(corpus.lines[i].split('|')[2], diff, `手牌学段应为 ${diff}`);
    }
  }
  // 幽灵出句后入 usedKeys，再出句不与之重复
  // （seed 12 首抽可能命中 10% 失误率；多 seed 找一局 play，断言不依赖具体随机序列）
  let ai = null, act = null;
  for (let s = 12; s < 32 && !act; s++) {
    ai = aiLib.create('normal', '月', C.mulberry32(s), 'mixed');
    const a = aiLib.act(ai, '月', new Set(), 0.5);
    if (a.action === 'play') { act = a; break; }
  }
  assert.ok(act, '多 seed 下至少一局首抽应为 play');
  const used = new Set();
  assert.equal(used.has(lineText(act.lineIdx)), false, '幽灵出句不得与 usedKeys 重复');
  used.add(lineText(act.lineIdx));
  for (let n = 0; n < 8; n++) {
    const a2 = aiLib.act(ai, '月', used, 0.5);
    if (a2.action === 'play') assert.equal(used.has(lineText(a2.lineIdx)), false, '再次出句仍不得重复');
  }
});

test('重复句拒绝：usedKeys 全局共用（玩家与 AI 共池）', () => {
  const m = new Match({ mode: 'choice', seed: 3003, roundMax: 2 });
  runTo(m, 'player');
  m.submitChoice(m.candidates.correctPos);
  const playerLine = m.feedback.text;
  assert.equal(m.usedKeys.has(playerLine), true);
  runTo(m, 'reveal', 30); // AI 回合走完
  // AI 出过的句也应入 usedKeys
  if (m.feedback && m.feedback.kind === 'aiPlay') {
    assert.equal(m.usedKeys.has(m.feedback.text), true);
  }
});

test('超时 → 本回合判负分（诗童 +1），对局继续不终局（2026-11-18 P0 容错改版）', () => {
  const m = new Match({ mode: 'choice', seed: 4004, timerSec: 10, roundMax: 12 });
  runTo(m, 'player');
  const kw = m.keyword;
  let t = 0;
  while (m.phase === 'player' && t < 15) { m.update(0.1); t += 0.1; }
  // 超时不再直接结算
  assert.notEqual(m.phase, 'result', '超时不得整局判负');
  assert.equal(m.phase, 'playerFeedback');
  assert.equal(m.feedback.reason, 'TIMEOUT');
  assert.equal(m.timeouts, 1);
  assert.equal(m.tigerHits, 1, '超时给诗童记 1 分');
  assert.equal(m.roundSeq, 0, '超时当回合先不计数，反馈结束后才结束回合');
  // 走完反馈 → 跳过 AI 回合 → 下一回合 reveal
  runTo(m, 'reveal', 10);
  assert.equal(m.roundSeq, 1, '超时回合同样消耗一个回合');
  assert.equal(m.keyword, kw, '关键字不变');
  // 再超时一次仍不终局，累计 2 次
  runTo(m, 'player', 10);
  let t2 = 0;
  while (m.phase === 'player' && t2 < 15) { m.update(0.1); t2 += 0.1; }
  assert.equal(m.timeouts, 2);
  assert.notEqual(m.phase, 'result');
  assert.equal(m.tigerHits, 2);
});

test('AI 手牌耗尽 → 玩家直接胜', () => {
  const m = new Match({ mode: 'choice', seed: 5005, aiLevel: 'rookie', roundMax: 12 });
  // 白盒：清空 AI 手牌并封死补牌池（当前关键字全量标已用）
  runTo(m, 'player');
  const allKw = (corpus.char_index[m.keyword] || []).map(lineText);
  allKw.forEach(t => m.usedKeys.add(t));
  m.ai.hand = [];
  m.submitChoice(m.candidates.correctPos); // 先过自己这轮
  runTo(m, 'result', 30);
  assert.equal(m.outcome.result, 'win');
  assert.equal(m.outcome.reason, 'aiExhausted');
});

test('池空兜底：换字确认后重发（禁止 random([]) 崩溃）', () => {
  const m = new Match({ mode: 'choice', seed: 6006 });
  runTo(m, 'player');
  const oldKeyword = m.keyword;
  // 白盒：封死当前字全部句 → 触发池空
  const allKw = (corpus.char_index[oldKeyword] || []).map(lineText);
  allKw.forEach(t => m.usedKeys.add(t));
  m._dealRound();
  assert.equal(m.phase, 'poolEmpty');
  assert.ok(m.snapshot().suggestKeyword, '应给出换字建议');
  assert.ok(m.confirmSwitch(), '换字确认应成功');
  assert.notEqual(m.keyword, oldKeyword);
  assert.equal(m.phase, 'reveal');
  runTo(m, 'player', 30);
  assert.ok(m.candidates, '换字后应能正常出候选');
});

test('字块拼句模式：组句提交走完整 judge', () => {
  const m = new Match({ mode: 'blocks', seed: 7007, roundMax: 3 });
  for (let i = 0; i < 2; i++) {
    runTo(m, 'player');
    const sentence = m.blocks.sentence;
    const r = m.submitBlocksText(sentence);
    assert.equal(r.pass, true);
    runTo(m, 'reveal', 30);
    assert.equal(m.phase, 'reveal');
  }
  runTo(m, 'player');
  m.submitBlocksText(m.blocks.sentence);
  runTo(m, 'result', 30);
  assert.ok(['win', 'draw', 'loss'].includes(m.outcome.result));
  assert.equal(m.outcome.stats.rounds, 3);
});

test('拼错句 → judge 拒（NOT_IN_CORPUS / FORMAT_ERROR 落错因 pill）', () => {
  const m = new Match({ mode: 'blocks', seed: 8008, roundMax: 2 });
  runTo(m, 'player');
  // 故意组错（正块少一个字 + 干扰字）
  const sentence = m.blocks.sentence;
  const bad = sentence.slice(0, sentence.length - 1) + m.blocks.blocks.find(b => b.distractor).char;
  const r = m.submitBlocksText(bad);
  assert.equal(r.pass, false);
  assert.equal(m.feedback.kind, 'fail');
  runTo(m, 'reveal', 30);
});

test('快照完整性：UI 需要的字段齐全', () => {
  const m = new Match({ mode: 'choice', seed: 9009 });
  const s = m.snapshot();
  ['phase', 'mode', 'keyword', 'round', 'roundMax', 'timeLeft', 'playerHits', 'tigerHits',
   'combo', 'usedKeys', 'candidates', 'blocks', 'feedback', 'lastSentence', 'suggestKeyword', 'outcome']
    .forEach(k => assert.ok(k in s, `快照缺字段 ${k}`));
  assert.equal(s.candidates.length, 4);
  assert.equal(s.keyword, m.keyword);
});

test('AI 三档参数符合 v1.4 §2.6（手牌 5/8/12、失误 20%/10%/5%）', () => {
  const aiLib = require('../js/game/ai');
  assert.equal(aiLib.LEVELS.rookie.hand, 5);
  assert.equal(aiLib.LEVELS.normal.hand, 8);
  assert.equal(aiLib.LEVELS.expert.hand, 12);
  assert.equal(aiLib.LEVELS.rookie.errorRate, 0.20);
  assert.equal(aiLib.LEVELS.normal.errorRate, 0.10);
  assert.equal(aiLib.LEVELS.expert.errorRate, 0.05);
  assert.ok(aiLib.LEVELS.rookie.thinkMax <= 2.0);
});
