'use strict';
/**
 * 教学局（P0-3 首 90 秒）回归：
 *  ① 三句教学名句必须在库、伪句必须在库外、全部含令字「月」；
 *  ② 教学局参数：3 回合 / 固定月字 / 20s / 强制点选（哪怕传 blocks）；
 *  ③ 全流程：三回合提示递进 → 第三回合诗童失手 → 判胜；
 *  ④ 每回合仍需满足 P0-1 可判别性（≥2 个含令字选项 + 至少 1 条伪句）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const R = p => require(path.join(ROOT, p));

const { Match } = R('js/game/match');
const C = R('js/game/candidates');
const { corpus, normKey } = R('src/judge');

test('教学局名句/伪句契约：三句在库、伪句在库外、全部含「月」', () => {
  assert.equal(C.TUTORIAL_ROUNDS.length, 3, '教学局恰好 3 回合');
  for (const r of C.TUTORIAL_ROUNDS) {
    assert.ok(r.line.indexOf('月') !== -1, `${r.line} 应含令字月`);
    assert.ok(corpus.norm_index[normKey(r.line)] !== undefined, `${r.line} 必须在句库内`);
    assert.ok(corpus.norm_index[normKey(r.fake)] === undefined, `${r.fake} 必须不在句库内（否则伪句会被 judge 放行）`);
    assert.ok(r.hint && r.tip, `${r.line} 需有提示与贴士文案`);
  }
  // 递进：第 1 回合给答案、第 2 回合给出处、第 3 回合靠自己
  assert.ok(C.TUTORIAL_ROUNDS[0].hint.indexOf('床前明月光') !== -1, '第 1 回合必须把答案念出来（一次必成）');
  assert.ok(C.TUTORIAL_ROUNDS[1].hint.indexOf('张九龄') !== -1, '第 2 回合只给出处');
  assert.equal(C.TUTORIAL_ROUNDS[2].hint.indexOf('靠你自己') !== -1, true, '第 3 回合撤掉提示');
});

test('教学局参数：3 回合 / 固定月字 / 20s / 强制点选模式', () => {
  const m = new Match({ tutorial: true, mode: 'blocks', difficulty: 'normal', seed: 7 });
  assert.equal(m.cfg.mode, 'choice', '教学局只用点选（字块没有"念给你听"的余地）');
  assert.equal(m.keyword, '月', '教学局固定令字月');
  assert.equal(m.cfg.roundMax, 3);
  assert.equal(m.cfg.timerSec, 20, '教学局给 20s（比简单档 15s 更宽）');
  const snap = m.snapshot();
  assert.ok(snap.tutorial && snap.tutorial.total === 3, '快照应携带教学局上下文');
});

test('教学局每回合保持可判别性：≥2 个含令字选项 + 至少 1 条伪句 + 唯一正解', () => {
  const { judge, POOL } = R('src/judge');
  for (const seed of [1, 2, 3, 11, 22]) {
    for (let step = 0; step < 3; step++) {
      const g = C.genTutorialRound(step, '月', new Set(), C.mulberry32(seed * 31 + step));
      assert.ok(g, `seed ${seed} step ${step} 应能生成`);
      const opts = g.options;
      const withKw = opts.filter(o => o.text.indexOf('月') !== -1);
      assert.ok(withKw.length >= 2, `seed ${seed} 第 ${step + 1} 回合含令字选项 ${withKw.length} < 2`);
      assert.equal(opts.filter(o => o.kind === 'fake').length >= 1, true, `seed ${seed} 第 ${step + 1} 回合应有伪句`);
      assert.equal(opts.filter(o => o.kind === 'correct').length, 1, '恰好一个正解');
      // 干扰项必须判不过（否则"错选项"也能得分）
      opts.filter(o => o.kind !== 'correct').forEach(o => {
        assert.equal(judge(o.text, '月', new Set(), POOL).pass, false, `${o.text} 是干扰项，judge 必须判不过`);
      });
      // 正解必须判过
      assert.equal(judge(opts[g.correctPos].text, '月', new Set(), POOL).pass, true);
    }
  }
});

test('教学局全流程：提示递进 + 第三回合诗童失手 + 判胜 + outcome.tutorial', () => {
  const m = new Match({ tutorial: true, seed: 99 });
  const hints = [];
  let aiFailInLastRound = false;
  let guard = 0;
  while (m.phase !== 'result' && guard++ < 6000) {
    m.update(0.05);
    if (m.phase === 'player') {
      if (!hints[m.roundSeq]) hints[m.roundSeq] = m.tutorialHint;
      m.submitChoice(m.candidates.correctPos);
    }
    if (m.phase === 'aiFeedback' && m.roundSeq === 2 && m.feedback && m.feedback.kind === 'aiFail') {
      aiFailInLastRound = true;
    }
  }
  assert.equal(m.phase, 'result', '教学局必须能走到结算（不卡死）');
  assert.equal(m.outcome.tutorial, true, '结果需标记教学局');
  assert.equal(m.outcome.stats.rounds, 3, '恰好 3 回合');
  assert.equal(m.playerHits, 3, '按提示选正解 → 三句全对');
  assert.equal(aiFailInLastRound, true, '第 3 回合必须让诗童失手（哇时刻）');
  assert.equal(m.outcome.result, 'win', '三句全对应判胜');
  assert.equal(hints.length, 3, '三回合各有提示');
  assert.equal(m.snapshot().outcome.result, 'win');
});

test('非教学局不受影响：仍是 12 回合 / 非月字随机 / 无教学上下文', () => {
  let sawNonYue = false;
  for (const seed of [1, 5, 9, 21, 33]) {
    const m = new Match({ mode: 'choice', difficulty: 'easy', seed });
    assert.equal(m.cfg.roundMax, 12);
    assert.equal(m.cfg.tutorial, false);
    assert.equal(m.snapshot().tutorial, null, '非教学局不应有教学提示');
    if (m.keyword !== '月') sawNonYue = true;
  }
  assert.ok(sawNonYue, '非教学局令字应随机（不应恒为月）');
});

test('教学局脚本句预留（2026-11-20 修提示复读）：AI 手牌/补牌永不占用脚本句 + 回落清旧提示', () => {
  const aiLib = R('js/game/ai');
  const scriptLines = C.TUTORIAL_ROUNDS.map(r => r.line);
  const lineTextOf = i => corpus.lines[i].split('|')[0];
  // ① 多种子下 AI 开局手牌都不含教学脚本句
  for (const seed of [1, 5, 9, 21, 33, 777, 2026]) {
    const m = new Match({ tutorial: true, seed });
    const handTexts = m.ai.hand.map(i => lineTextOf(i));
    assert.equal(
      handTexts.some(t => scriptLines.includes(t)), false,
      `seed ${seed} AI 手牌不应含脚本句：${handTexts.join('/')}`);
  }
  // ② 补牌路径同样预留：ai 实例携带预留集合，deal(1) 也不回脚本句
  const ai = aiLib.create('rookie', '月', C.mulberry32(9), 'mixed', scriptLines);
  assert.equal(ai.reserve.size, 3, '预留集合应随 ai 实例携带');
  for (let k = 0; k < 20; k++) {
    const more = aiLib.deal(1, '月', new Set(), C.mulberry32(100 + k), 'mixed', scriptLines);
    assert.equal(more.some(i => scriptLines.includes(lineTextOf(i))), false, `补牌第 ${k + 1} 次不应回脚本句`);
  }
  // ③ 回落路径：脚本句被占（usedKeys 预置）→ 发牌回落且旧提示被清空（不再复读）
  const m2 = new Match({ tutorial: true, seed: 9 });
  m2.tutorialHint = '出自 张九龄《望月怀远》';   // 模拟第 2 回合残留
  m2.tutorialTip = '有改过字的假句，要选真句';
  m2.usedKeys.add(scriptLines[2]);              // 模拟诗童抢先接走第 3 回合脚本句
  m2._dealRound();
  assert.equal(m2.tutorialHint, null, '脚本回落必须清空旧 hint（防提示复读）');
  assert.equal(m2.tutorialTip, null, '脚本回落必须清空旧 tip');
});
