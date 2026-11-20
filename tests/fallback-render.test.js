'use strict';
/**
 * 降级渲染回归（2026-11-18 真机黑屏事故）
 * 事故：真机离屏 2d 上下文能力不足时，烘焙层画了但内容不可见 → 全屏只剩每帧直绘的小虎。
 * 本测试强制 platform.createOffscreen 返回 null，断言三屏「静态内容」仍能整屏直绘出来。
 */
const test = require('node:test');
const assert = require('node:assert');

const platform = require('../js/platform');
const { resolveTokens } = require('../js/ui/tokens');
const { HomeScreen } = require('../js/ui/screens/home');
const { BattleScreen } = require('../js/ui/screens/battle');
const { ResultScreen } = require('../js/ui/screens/result');
const layout = require('../js/ui/layout');

function makeRecCtx() {
  const rec = { texts: [], fillRects: 0, fills: 0 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({
    measureText: s => ({ width: String(s).length * 32 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fillText(s) { rec.texts.push(String(s)); },
    fill() { rec.fills++; },
    stroke() {},
    fillRect() { rec.fillRects++; },
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    translate() {}, scale() {}, setTransform() {}, clip() {},
  }, {
    get(t, k) { return (k in t) ? t[k] : (() => {}); },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, rec };
}

function makeApp(extra) {
  const info = { W: 375, H: 667, safeTop: 20, safeBottom: 15, dpr: 2 };
  return Object.assign({
    info,
    tokens: resolveTokens('light', false),
    settings: { fontScale: 1.0, reduceMotion: false, theme: 'light' },
    goto() {},
    applySettings() {},
  }, extra || {});
}

test('降级渲染：离屏不可用时首页静态内容仍直绘（标题/主按钮/chip/战绩）', () => {
  const orig = platform.createOffscreen;
  platform.createOffscreen = () => null;   // 模拟真机离屏能力不足
  try {
    const app = makeApp();
    const s = HomeScreen(app);
    s.enter();
    const { ctx, rec } = makeRecCtx();
    s.draw(ctx, 0.5);
    const all = rec.texts.join('');
    assert.ok(all.includes('飞') && all.includes('花') && all.includes('令'), '标题三字应直绘出现，实绘：' + all);
    // P0-3：首页合并为唯一主按钮「开始对诗」，模式/难度/音效降为 chip
    assert.ok(all.includes('开始对诗'), '唯一主按钮应出现，实绘：' + all);
    assert.ok(all.includes('择句') && all.includes('字块'), '模式 chip 两段应出现');
    assert.ok(all.includes('简单') && all.includes('困难'), '难度 chip 两段应出现');
    assert.ok(all.includes('音效'), '音效 chip 应常驻可见');
    assert.ok(all.includes('我的战绩'), '战绩条应出现');
    assert.ok(rec.fillRects >= 2, '背景渐变 + ≥1 次实心填充应发生，实绘 fillRect=' + rec.fillRects);
  } finally {
    platform.createOffscreen = orig;
  }
});

test('降级渲染：离屏不可用时对局页静态框架仍直绘（令字/上句/候选）', () => {
  const orig = platform.createOffscreen;
  platform.createOffscreen = () => null;
  try {
    const app = makeApp();
    const s = BattleScreen(app, { mode: 'choice' });
    s.enter();
    const { ctx, rec } = makeRecCtx();
    s.draw(ctx, 0.2);
    const all = rec.texts.join('');
    const snap = s.match.snapshot();
    assert.ok(all.includes(String(snap.keyword)), '关键字应出现在直绘层，实绘：' + all.slice(0, 80));
    assert.ok(s.hotRects.length >= 2, '热区应在离屏失败时仍然注册');
  } finally {
    platform.createOffscreen = orig;
  }
});

test('降级渲染：离屏不可用时结算页按钮文字仍直绘', () => {
  const orig = platform.createOffscreen;
  platform.createOffscreen = () => null;
  try {
    const app = makeApp();
    const outcome = { result: 'win', stats: { hits: 3, maxCombo: 2, avgReact: 3, rounds: 5, keyword: '花' } };
    const s = ResultScreen(app, { outcome, lastPlayerLine: '春眠不觉晓', lastTigerLine: '夜来风雨声', mode: 'choice' });
    s.enter();
    const { ctx, rec } = makeRecCtx();
    s.draw(ctx, 0.5);
    const all = rec.texts.join('');
    assert.ok(all.includes('再来一局') && all.includes('回首页'), '结算按钮文字应直绘出现，实绘：' + all);
  } finally {
    platform.createOffscreen = orig;
  }
});

test('离屏可用时仍走烘焙路径（未误伤正常路径）', () => {
  const app = makeApp();
  const s = HomeScreen(app);
  s.enter();
  const { ctx, rec } = makeRecCtx();
  s.draw(ctx, 0.5);
  // 烘焙成功时静态文字在离屏层，主 ctx 只应有背景 drawImage（stub 记录不到文字）
  assert.ok(rec.texts.length === 0 || rec.texts.join('').indexOf('飞花令') < 0, '烘焙路径不应重复直绘静态文本');
  assert.ok(layout.home(app.info).hotRects.length === 7,
    '首页热区恒为 7（开始对诗 / 模式×2 / 难度×2 / 音效 / 战绩）');
});
