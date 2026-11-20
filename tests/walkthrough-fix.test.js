'use strict';
/** §11 走查 FAIL 修复回归测试（F1–F7 + D1 v2 映射） */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const R = p => require(path.join(ROOT, p));

const layout = R('js/ui/layout');
const platform = R('js/platform');
const { BattleScreen, REASON_TEXT, reasonTextOf } = R('js/ui/screens/battle');
const { ResultScreen } = R('js/ui/screens/result');
const { HomeScreen } = R('js/ui/screens/home');
const { resolveTokens } = R('js/ui/tokens');

const INFO = { W: 375, H: 667, dpr: 2, safeTop: 20, safeBottom: 0, menuRect: null };

/** 记录型 stub ctx：捕获 fillText / fillStyle / strokeStyle */
function recordingCtx() {
  const rec = { texts: [], fillStyles: [], strokeStyles: [], calls: [] };
  const target = {
    measureText: s => ({ width: String(s).length * 32 }),
    createLinearGradient: () => ({ addColorStop(){} }),
    fillText(s) { rec.texts.push(String(s)); rec.calls.push(['fillText', String(s)]); },
    fill() { rec.calls.push(['fill']); },
    stroke() { rec.calls.push(['stroke']); },
  };
  return { ctx: new Proxy(target, {
    get(t, k) {
      if (k === 'measureText' || k === 'fillText' || k === 'fill' || k === 'stroke') return t[k];
      return () => {};
    },
    set(t, k, v) {
      if (k === 'fillStyle') rec.fillStyles.push(v);
      if (k === 'strokeStyle') rec.strokeStyles.push(v);
      t[k] = v; return true;
    },
  }), rec };
}

test('D1 v2：错因文案映射与 §11.3 逐字一致', () => {
  assert.equal(reasonTextOf('NO_KEYWORD', '花'), '不含「花」字');
  assert.equal(REASON_TEXT.NOT_IN_CORPUS, '非认证诗句');
  assert.equal(REASON_TEXT.FORMAT_ERROR, '这句不完整');
  assert.equal(REASON_TEXT.INVALID_KEYWORD, '令字有误');
  assert.equal(REASON_TEXT.DUPLICATE, '这句用过了');
  assert.equal(REASON_TEXT.TIMEOUT, '超时 · 本回合判负');
});

test('F1：字块模式接错 → errorPill 渲染路径不崩（修复前 TypeError）', () => {
  const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto(){} };
  const { ctx } = recordingCtx();
  const b = BattleScreen(app, { mode: 'blocks', seed: 4242 });
  b.enter();
  b.update(0.9); // 过亮相
  assert.equal(b.match.phase, 'player');
  // 故意拼错：句首换成干扰字（不变量保证不在库内 → NOT_IN_CORPUS → pill 路径）
  const bad = b.match.blocks.sentence.slice(1);
  const dChar = b.match.blocks.blocks.find(x => x.distractor).char;
  const r = b.match.submitBlocksText(dChar + bad);
  assert.equal(r.pass, false);
  assert.equal(b.match.feedback.kind, 'fail');
  // 渲染反馈帧：修复前此处 ep.fromY 抛 TypeError
  b.update(0.05);
  b.draw(ctx, 1.0);
  assert.ok(true, '字块模式接错渲染零异常');
});

test('F1 前置 + 2026-11-19 UI 评审 A：errorPill 盖预览槽、不与提示条/字块格相交', () => {
  const sh = layout.battleShared(INFO);
  const bb = layout.battleBlocks(INFO, sh);
  const bc = layout.battleChoice(INFO, sh);
  assert.ok(bb.errorPill, 'blocks 布局应有 errorPill');
  assert.ok(bc.errorPill, 'choice 布局应有 errorPill');
  // A：pill 必须正好盖在预览槽上（失败时预览无内容，遮住零信息损失）
  ['x', 'y', 'w', 'h'].forEach(k => assert.equal(bb.errorPill[k], bb.preview[k], `errorPill.${k} 与预览槽重合`));
  // A：pill 不得与提示条（lastBar）相交——真机截图实锤旧位置 y 248 压两行提示文字
  const pillTop = bb.errorPill.fromY < bb.errorPill.y ? bb.errorPill.fromY : bb.errorPill.y;
  const lbBottom = sh.lastBar.y + sh.lastBar.h;
  assert.ok(pillTop >= lbBottom, `pill 滑入起点 ${pillTop} 应在提示条底 ${lbBottom} 之下`);
  // A：pill 不得与第一行字块相交（fromY 滑入终点也不越界）
  const gridTop = Math.min(...bb.cells.map(c2 => c2.vis.y));
  assert.ok(bb.errorPill.y + bb.errorPill.h <= gridTop, 'pill 底不应压到字块格');
});

test('F2：match 出结果后 400ms 触发 goto result，且去重不重复触发', () => {
  const wentTo = [];
  const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto: (s, p) => wentTo.push({ s, p }) };
  const b = BattleScreen(app, { mode: 'choice', seed: 5151 });
  b.enter();
  b.update(0.9);
  // 白盒：直接让对局出结果（模拟超时/判满后的 outcome 就绪态）
  b.match._toResult('win', 'test');
  assert.equal(b.match.phase, 'result');
  b.update(0.3);
  assert.equal(wentTo.length, 0, '400ms 内不应转场（facepalm/cheer 先露脸）');
  b.update(0.15); // 累计 0.45s
  assert.equal(wentTo.length, 1, '应恰好触发一次 goto result');
  assert.equal(wentTo[0].s, 'result');
  assert.equal(wentTo[0].p.outcome.result, 'win');
  assert.equal(wentTo[0].p.mode, 'choice');
  b.update(0.5);
  assert.equal(wentTo.length, 1, '去重：不重复 goto');
});

test('F3/F4：结算页亮暗两主题各渲染一次，暗色走 token 背景、卡片用 c.surface', () => {
  for (const [mode, sysDark] of [['light', false], ['dark', true]]) {
    const tokens = resolveTokens(mode, sysDark);
    const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens, goto(){} };
    const { ctx, rec } = recordingCtx();
    const r = ResultScreen(app, { outcome: { result: 'win', reason: 'roundsFull', stats: { hits: 5, tigerHits: 3, maxCombo: 2, avgReact: 3, rounds: 12, keyword: '月' } }, mode: 'choice' });
    r.enter(); r.update(0.5); r.draw(ctx, 1.0);
    const bake = platform.lastHeadlessBake();
    assert.ok(bake, '结算页应有离屏烘焙记录');
    const expectedBg = tokens.dark ? tokens.c.bg : '#FFFBF2';
    const expectedBgEnd = tokens.dark ? tokens.c.bgEnd : '#F9F0DD';
    assert.ok(bake.gradStops.includes(expectedBg) && bake.gradStops.includes(expectedBgEnd),
      `${mode} 主题背景渐变应为 ${expectedBg}→${expectedBgEnd}（F4，实得 ${bake.gradStops.join('|')}）`);
    assert.ok(bake.fillStyles.includes(tokens.c.surface), `${mode} 主题卡片应使用 c.surface（F3）`);
  }
});

test('F5：L0 烘焙不再含血条文字标签（数字标签只在 L2）', () => {
  const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto(){} };
  const { ctx, rec } = recordingCtx();
  const b = BattleScreen(app, { mode: 'blocks', seed: 666 });
  b.enter(); // bake 走 L0
  b.draw(ctx, 0); // 空相位帧
  const baked = rec.texts.filter(t => t === '我' || t === '诗童');
  assert.equal(baked.length, 0, '烘焙层不应有独立「我」「诗童」标签（修复前重影）');
});

test('F6：空战绩时首页显示「我的战绩 · 暂无」', () => {
  const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto(){} };
  const { ctx } = recordingCtx();
  const h = HomeScreen(app);
  h.enter(); h.draw(ctx, 1.0);
  const bake = platform.lastHeadlessBake();
  assert.ok(bake, '首页应有离屏烘焙记录');
  assert.ok(bake.texts.some(t => t.indexOf('暂无') !== -1),
    `空态文案应烘焙出现（实绘：${bake.texts.filter(t => t.indexOf('战绩') !== -1).join('|')}）`);
});

test('F7：倒计时环内数字一体（cx=236 基准）整体置于胶囊菜单左侧且玩家相位画 track 底环', () => {
  const sh = layout.battleShared(INFO);
  // 2026-11-18 真机：原数字贴屏缘（rightX=340）撞右上角胶囊 → 环内数字单元左移，
  // 环右缘必须 ≤ 260（胶囊自 W-96=279 起，留 ≥19px 安全距）
  assert.equal(sh.timerRing.cx, 236);
  assert.ok(sh.timerRing.cx + sh.timerRing.r <= 260, `环右缘 ${sh.timerRing.cx + sh.timerRing.r} 应 ≤260，让出胶囊区`);
  const app = { info: INFO, settings: { fontScale: 1.0, reduceMotion: false }, tokens: resolveTokens('light', false), goto(){} };
  const { ctx, rec } = recordingCtx();
  const b = BattleScreen(app, { mode: 'choice', seed: 777 });
  b.enter();
  b.update(0.9); // 进入 player
  b.draw(ctx, 1.0);
  assert.ok(rec.strokeStyles.includes('rgba(43,35,29,0.12)'), '玩家相位应画 c.track 底环（B1-04）');
});

test('D3：底锚 fallback 统一（home 与 battle/result 同值）', () => {
  const home = layout.home(INFO);
  const sh = layout.battleShared(INFO);
  const res = layout.result(INFO);
  assert.equal(home.record.y, sh.yBtn, '战绩条与对局按钮行同一底锚收口');
  assert.equal(res.againBtn.y, sh.yBtn, '结算按钮行同一底锚收口');
});
