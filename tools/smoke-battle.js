'use strict';
/** 无头集成冒烟：BattleScreen 两模式全流程（stub ctx，逐步 update/draw/touch） */
function stubCtx() {
  const target = {
    measureText: s => ({ width: String(s).length * 32 }),
    createLinearGradient: () => ({ addColorStop(){} }),
    canvas: { width: 750, height: 1334 },
  };
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { BattleScreen } = require(path.join(ROOT, 'js/ui/screens/battle'));
const { resolveTokens } = require(path.join(ROOT, 'js/ui/tokens'));
const info = { W: 375, H: 667, dpr: 2, safeTop: 20, safeBottom: 15, menuRect: null };
const app = { info, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto(){} };
const ctx = stubCtx();

for (const mode of ['choice', 'blocks']) {
  const b = BattleScreen(app, { mode, seed: 12345 });
  b.enter();
  let t = 0, actedRound = -1;
  const phasesSeen = new Set();
  while (t < 90 && b.match.phase !== 'result') {
    b.update(0.05); t += 0.05;
    b.draw(ctx, t); // 每个相位至少画一帧（reveal/player/feedback/aiThink/aiFeedback/poolEmpty）
    phasesSeen.add(b.match.phase);
    if (b.match.phase === 'poolEmpty') { b.touch('start', 187, 300); b.touch('end', 187, 300); continue; }
    // 2026-11-18：每回合都要作答（超时改本回合判负后，只答一次会让冒烟卡在 12 回合里跑不完）
    if (b.match.phase === 'player' && actedRound !== b.match.roundSeq) {
      actedRound = b.match.roundSeq;
      if (mode === 'choice') {
        const card = b.hotRects.find(h => h.id === 'battle.card.0');
        b.touch('start', card.x + 10, card.y + 10); b.touch('end', card.x + 10, card.y + 10);
      } else {
        // 逐字点块（跳过干扰块）→ 提交
        const order = b.match.blocks.blocks.map((blk, i) => ({ blk, i })).filter(x => !x.blk.distractor);
        const byChar = {};
        b.match.blocks.sentence.split('').forEach(ch => {
          const cellIdx = b.match.blocks.blocks.findIndex((blk, i) => !blk.distractor && blk.char === ch && !(i in byChar) && Object.values(byChar).indexOf(i) === -1);
          byChar[ch + '#' + Object.keys(byChar).length] = cellIdx >= 0 ? cellIdx : order[0].i;
        });
        Object.values(byChar).forEach(i => {
          const cell = b.hotRects.find(h => h.id === 'battle.cell.' + i);
          b.touch('start', cell.x + 5, cell.y + 5); b.touch('end', cell.x + 5, cell.y + 5);
        });
        const submit = b.hotRects.find(h => h.id === 'battle.submit');
        b.touch('start', submit.x + 5, submit.y + 5); b.touch('end', submit.x + 5, submit.y + 5);
      }
    }
  }
  console.log(mode, '→ phases:', [...phasesSeen].join('>'), '| result:', b.match.outcome && b.match.outcome.result, 'hits', b.match.playerHits, 'tiger', b.match.tigerHits, 'hotRects', b.hotRects.length);
}

// 教学局（P0-3）：按屏幕提示点正解卡 → 3 回合走完 → 应判胜
{
  const b = BattleScreen(app, { tutorial: true, seed: 777 });
  b.enter();
  let t = 0; const hints = []; let aiFailedLast = false;
  while (t < 120 && b.match.phase !== 'result') {
    b.update(0.05); t += 0.05;
    b.draw(ctx, t); // 教学提示行 / 贴士 pill 每个相位都过一遍绘制
    if (b.match.phase === 'player' && b.match.candidates) {
      if (!hints[b.match.roundSeq]) hints[b.match.roundSeq] = b.match.tutorialHint;
      const pos = b.match.candidates.correctPos;
      const card = b.hotRects.find(h => h.id === 'battle.card.' + pos);
      b.touch('start', card.x + 10, card.y + 10); b.touch('end', card.x + 10, card.y + 10);
    }
    if (b.match.phase === 'aiFeedback' && b.match.roundSeq === 2 && b.match.feedback && b.match.feedback.kind === 'aiFail') aiFailedLast = true;
  }
  console.log('tutorial → rounds', b.match.roundSeq, '| result:', b.match.outcome && b.match.outcome.result,
    'hits', b.match.playerHits, 'tiger', b.match.tigerHits, '| 第3回合虎失手:', aiFailedLast,
    '| hints:', hints.join(' / '));
  const { ResultScreen } = require(path.join(ROOT, 'js/ui/screens/result'));
  const rs = ResultScreen(app, { outcome: b.match.outcome, mode: 'choice', lastPlayerLine: b.match.lastPlayerLine, lastTigerLine: b.match.lastTigerLine });
  rs.enter(); rs.update(0.5); rs.draw(ctx, 1.0);
  console.log('tutorial result 渲染 ok');
}
console.log('smoke ok');
