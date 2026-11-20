'use strict';
/**
 * 小诗童渲染包装（10_ui_spec.md §7）
 * Tiger.draw(ctx, {state, t, theme, x, y, scale}) — 不改渲染器本体。
 * fullBody: 首页/结算全身立绘；bust: 对局页半身像裁切窗（含前爪区，clap/facepalm 不被裁）。
 */
const Tiger = require('../../src/actors/tiger_renderer.js');

// 原生裁切窗（头 + 前爪 + 衣领），必须包含 y=296–372 前爪区
const BUST_WIN = { x: 40, y: 44, w: 320, h: 346 };

/**
 * 全身立绘（视觉中心水平居中、顶部对齐 y0）
 * @param {number} cx 屏幕水平中心（逻辑 px）
 * @param {number} y0 顶部 y
 * @param {number} scale 缩放
 */
function fullBody(ctx, opts) {
  Tiger.draw(ctx, {
    state: opts.state || 'idle',
    t: opts.t, theme: opts.theme || 'guofeng',
    x: opts.cx - (400 * opts.scale) / 2,
    y: opts.y0,
    scale: opts.scale,
  });
}

/**
 * 对局页半身像：原生窗 (40,44,320,346) → 屏幕目标盒 win
 * 调用前自行 save/clip/restore 由本函数包办。
 */
function bust(ctx, opts) {
  const win = opts.win; // {x,y,w,h}
  const s = win.w / BUST_WIN.w;
  ctx.save();
  // 圆角裁切（顶边与卡片语言一致）
  const r = Math.min(14, win.w / 2, win.h / 2);
  ctx.beginPath();
  ctx.moveTo(win.x + r, win.y);
  ctx.lineTo(win.x + win.w - r, win.y); ctx.arcTo(win.x + win.w, win.y, win.x + win.w, win.y + r, r);
  ctx.lineTo(win.x + win.w, win.y + win.h - r); ctx.arcTo(win.x + win.w, win.y + win.h, win.x + win.w - r, win.y + win.h, r);
  ctx.lineTo(win.x + r, win.y + win.h); ctx.arcTo(win.x, win.y + win.h, win.x, win.y + win.h - r, r);
  ctx.lineTo(win.x, win.y + r); ctx.arcTo(win.x, win.y, win.x + r, win.y, r);
  ctx.closePath();
  ctx.clip();
  Tiger.draw(ctx, {
    state: opts.state || 'idle',
    t: opts.t, theme: opts.theme || 'guofeng',
    x: win.x - BUST_WIN.x * s,
    y: win.y - BUST_WIN.y * s,
    scale: s,
  });
  ctx.restore();
}

module.exports = { Tiger, BUST_WIN, fullBody, bust, STATES: Tiger.STATES };
