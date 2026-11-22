'use strict';
/** 场景状态机流转 + 小虎渲染冒烟（无头，stub ctx） */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

test('场景状态机：home → battle → result → home 全流转零异常', () => {
  const game = require(path.join(ROOT, 'game.js'));
  const { app } = game;
  assert.equal(app.scene.id, 'home', '启动进入首页');
  app.goto('battle', { mode: 'blocks' });
  assert.equal(app.scene.id, 'battle');
  assert.equal(app.scene.mode, 'blocks');
  app.goto('battle', { mode: 'choice' });
  assert.equal(app.scene.id, 'battle');
  assert.equal(app.scene.match.cfg.mode, 'choice');
  app.goto('result', {
    outcome: { result: 'win', reason: 'roundsFull', stats: { hits: 5, tigerHits: 3, maxCombo: 2, avgReact: 3.3, rounds: 12, keyword: '月' } },
    mode: 'choice',
  });
  assert.equal(app.scene.id, 'result');
  app.goto('home', {});
  assert.equal(app.scene.id, 'home');
});

test('场景各绘一帧（stub ctx）零异常', () => {
  const game = require(path.join(ROOT, 'game.js'));
  const { app } = game;
  function stubCtx() {
    const target = {
      measureText: s => ({ width: String(s).length * 32 }),
      createLinearGradient: () => ({ addColorStop(){} }),
    };
    return new Proxy(target, {
      get(t, k) { if (k in t) return t[k]; return () => {}; },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  const ctx = stubCtx();
  for (const [name, params] of [['home', {}], ['battle', { mode: 'choice' }], ['battle', { mode: 'blocks' }], ['result', { outcome: { result: 'draw', stats: { hits: 0, maxCombo: 0, avgReact: 0, rounds: 0, keyword: '花' } } }]]) {
    app.goto(name, params);
    app.scene.update(0.016);
    app.scene.draw(ctx, 1.23);
    app.scene.draw(ctx, 2.34); // 第二帧（动画相位不同）
  }
  app.goto('home', {});
  assert.ok(true);
});

test('小虎渲染器：4 状态 × 2 主题 × fullBody/bust 全部零异常', () => {
  const tiger = require(path.join(ROOT, 'js/ui/tiger.js'));
  function stubCtx() {
    const target = {
      measureText: s => ({ width: String(s).length * 32 }),
      createLinearGradient: () => ({ addColorStop(){} }),
      save() {}, restore() {}, translate() {}, scale() {}, clip() {},
      beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {},
    };
    return new Proxy(target, {
      get(t, k) { if (k in t) return t[k]; return () => {}; },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  const ctx = stubCtx();
  assert.deepEqual(tiger.STATES, ['idle', 'clap', 'facepalm', 'cheer', 'pet', 'moonwalk']);
  for (const theme of ['guofeng', 'anime']) {
    for (const state of tiger.STATES) {
      for (const t of [0, 1.2, 2.9, 4.5]) { // 覆盖呼吸/眨眼/拍击/撒花/踩奶相位
        tiger.fullBody(ctx, { cx: 187.5, y0: 214, scale: 0.34, state, theme, t });
        tiger.bust(ctx, { win: { x: 150, y: 100, w: 100, h: 108 }, state, theme, t });
      }
    }
  }
  assert.ok(true, '5 状态 × 2 主题 × 4 时间点 × 2 画法 = 80 次绘制零异常');
});
