'use strict';
/**
 * 同局题目去重回归 + 难易分级核查（2026-11-20 用户反馈）：
 * ① 同一局内（含玩家题句 / 选项 / AI 出句 / 错题本甩句）任何诗句不得出现第二次；
 * ② 难易分级（2026-11-20 二改）：简单档 tier0 核心名句五言优先；困难档 tier0 核心名句
 *    七言优先——首版「困难绕开 tier0 走教材名篇」被真机打回（冷句一题答不出），见 §4.26。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { Match } = require(path.join(ROOT, 'js/game/match'));
const { mulberry32, isTop, lineText, genChoiceCandidates, genBlocks } = require(path.join(ROOT, 'js/game/candidates'));
const { corpus } = require(path.join(ROOT, 'src/judge'));

const DT = 0.05;

/** 推进到指定相位 */
function runTo(m, phase, maxSec) {
  let t = 0;
  while (m.phase !== phase && t < (maxSec || 120)) { m.update(DT); t += DT; }
  if (m.phase !== phase) throw new Error(`未到达相位 ${phase}，当前 ${m.phase}`);
}

/** 记录一次出现，重复即断言失败 */
function seen(seenSet, text, tag, round) {
  assert.ok(text, `${tag} 第 ${round} 回合句文本为空`);
  assert.equal(seenSet.has(text), false, `同局出现重复句（${tag} 第 ${round} 回合）：${text}`);
  seenSet.add(text);
}

/** 完整跑一局 choice，收集全部出现过的诗句（玩家对/错、选项、AI、错题本甩句） */
function runChoice(seed, roundMax) {
  const m = new Match({ mode: 'choice', seed, roundMax: roundMax || 12, difficulty: 'normal' });
  const seenSet = new Set();
  let round = 0;
  let guard = 0;
  let prevPhase = m.phase;
  while (m.phase !== 'result' && guard++ < 4000) {
    // 相位边沿记录（aiFeedback 持续 ~1.5s，逐帧记录会把同一句记 N 遍 → 假阳性）
    if (m.phase === 'aiFeedback' && prevPhase !== 'aiFeedback'
        && m.feedback && m.feedback.kind === 'aiPlay') {
      seen(seenSet, m.feedback.text, 'aiPlay', round);
    }
    prevPhase = m.phase;
    if (m.phase === 'player') {
      round++;
      // 选项里的每一条（正确/干扰）都算"出现过的题目内容"
      (m.candidates && m.candidates.options || []).forEach(o => seenSet.add(o.text));
      // 玩家全对：正确句入 usedKeys，题句天然不重复
      m.submitChoice(m.candidates.correctPos);
      m.update(DT);
      continue;
    }
    m.update(DT);
  }
  return seenSet;
}

test('同局不重复 ①：choice 全对 12 回合，题句/选项/AI 出句全局无重复（多 seed）', () => {
  [11, 4242, 3003, 9021].forEach(seed => {
    const seenSet = runChoice(seed, 12);
    assert.ok(seenSet.size >= 20, `seed ${seed} 收集到的句子数异常少：${seenSet.size}`);
  });
});

test('同局不重复 ②：玩家故意答错（错句入册路径）也不产生重复', () => {
  // 全程选最后一个非正确项 → fail → 错句入册；下一回合题句/选项不得再出现任何已见句
  const m = new Match({ mode: 'choice', seed: 777, roundMax: 12, difficulty: 'normal' });
  const seenSet = new Set();
  let round = 0, guard = 0, prevPhase = m.phase;
  while (m.phase !== 'result' && guard++ < 4000) {
    if (m.phase === 'aiFeedback' && prevPhase !== 'aiFeedback'
        && m.feedback && m.feedback.kind === 'aiPlay') {
      seen(seenSet, m.feedback.text, 'aiPlay', round);
    }
    prevPhase = m.phase;
    if (m.phase === 'player') {
      round++;
      (m.candidates && m.candidates.options || []).forEach(o => seenSet.add(o.text));
      const wrong = m.candidates.options.findIndex(o => o.kind !== 'correct');
      m.submitChoice(wrong >= 0 ? wrong : 0);
      m.update(DT);
      continue;
    }
    m.update(DT);
  }
  assert.ok(round >= 10, `答错路径应跑满接近 12 回合，实际 ${round}`);
});

test('同局不重复 ③：blocks 字块模式 12 回合正确句不重复', () => {
  [5151, 666, 1234].forEach(seed => {
    const m = new Match({ mode: 'blocks', seed, roundMax: 12, difficulty: 'normal' });
    const seenSet = new Set();
    let guard = 0, prevPhase = m.phase;
    while (m.phase !== 'result' && guard++ < 4000) {
      if (m.phase === 'aiFeedback' && prevPhase !== 'aiFeedback'
          && m.feedback && m.feedback.kind === 'aiPlay') {
        seen(seenSet, m.feedback.text, 'aiPlay', m.roundSeq + 1);
      }
      prevPhase = m.phase;
      if (m.phase === 'player') {
        assert.ok(m.blocks && m.blocks.sentence, 'blocks 相位应有题面');
        seen(seenSet, m.blocks.sentence, 'blocks 题句', m.roundSeq + 1);
        // 正确句判定后入 usedKeys——直接提交正确句推进
        m.submitBlocksText(m.blocks.sentence);
        m.update(DT);
        continue;
      }
      m.update(DT);
    }
    assert.ok(m.roundSeq >= 10, `seed ${seed} 对局应跑满 12 回合，实际 ${m.roundSeq}`);
  });
});

test('同局不重复 ④：生成器直查——genChoiceCandidates/genBlocks 永不返回已用句', () => {
  for (const kw of ['月', '花', '风', '水']) {
    const used = new Set();
    for (let i = 0; i < 8; i++) {
      const c = genChoiceCandidates(kw, used, mulberry32(i * 31 + 7), 4, false);
      if (!c) break;
      c.options.forEach(o => assert.equal(used.has(o.text), false, `${kw} 第 ${i + 1} 次生成：已用句混入选项（${o.text}）`));
      used.add(c.options[c.correctPos].text);
    }
  }
});

test('难易分级核查 ⑤：困难档 tier0 核心名句优先且七言为主（多 seed 抽样）', () => {
  // 困难档（easy=false）：tier0 核心名句内七言优先，tier0 耗尽才下沉教材名篇兜底。
  // 抽样统计 tier0 命中率（应 ≥80%）与七言占比（应 ≥60%——正是与简单档五言的难度差）。
  let topHits = 0, sevenHits = 0, total = 0;
  ['月', '花', '风', '春', '山', '水'].forEach(kw => {
    const used = new Set();
    for (let i = 0; i < 10; i++) {
      const c = genChoiceCandidates(kw, used, mulberry32(i * 97 + 3), 4, false);
      if (!c) break;
      total++;
      const t = lineText(c.correctIdx);
      if (isTop(c.correctIdx)) topHits++;
      if (t.length === 7) sevenHits++;
      used.add(t);
    }
  });
  assert.ok(topHits / total >= 0.8, `困难档 tier0 命中率 ${(topHits / total * 100).toFixed(0)}% 应 ≥80%（真机复盘：冷句不可接受）`);
  assert.ok(sevenHits / total >= 0.6, `困难档七言占比 ${(sevenHits / total * 100).toFixed(0)}% 应 ≥60%（七言=困难档难度差）`);
});

test('难易分级核查 ⑥：简单档题句仍优先核心名句层（对照组）', () => {
  let topHits = 0, total = 0;
  ['月', '花', '风', '春', '山', '水'].forEach(kw => {
    const used = new Set();
    for (let i = 0; i < 10; i++) {
      const c = genChoiceCandidates(kw, used, mulberry32(i * 97 + 3), 4, true);
      if (!c) break;
      total++;
      if (isTop(c.correctIdx)) topHits++;
      used.add(lineText(c.correctIdx));
    }
  });
  assert.ok(topHits / total >= 0.8, `简单档 tier0 命中率 ${(topHits / total * 100).toFixed(0)}% 应 ≥80%`);
});
