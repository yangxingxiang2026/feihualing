'use strict';
/**
 * 平台适配层：隔离微信小游戏 API 与浏览器/Node 测试环境差异。
 * 全部返回逻辑 px 口径，调用方不感知 dpr。
 */
/* global wx, document, requestAnimationFrame */

const isWx = typeof wx !== 'undefined';

function createMainCanvas() {
  if (isWx) {
    const canvas = wx.createCanvas();
    return canvas;
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 375; c.height = 667;
    document.body.appendChild(c);
    return c;
  }
  // Node 测试环境：无头 stub
  return { width: 375, height: 667, getContext: () => null };
}

function createOffscreen(width, height) {
  if (isWx && wx.createOffscreenCanvas) {
    let c = null;
    try { c = wx.createOffscreenCanvas({ type: '2d', width, height }); } catch (e) { c = null; }
    // 兼容：部分基础库只支持双参签名
    if (!c || typeof c.getContext !== 'function') {
      try { c = wx.createOffscreenCanvas(width, height); } catch (e2) { c = null; }
    }
    if (c) {
      // 兼容：部分真机忽略构造尺寸参数（回落 300×150），显式赋值兜底
      try {
        if (c.width !== width) c.width = width;
        if (c.height !== height) c.height = height;
      } catch (e3) { /* 尺寸不可写时保持原样，drawBaked 层兜底 */ }
      // 能力自检：上下文缺失或缺基础绘制/渐变能力时直接放弃离屏（否则会「画了但不可见」静默黑屏）
      try {
        const probe = c.getContext && c.getContext('2d');
        if (!probe || typeof probe.fillRect !== 'function' || typeof probe.createLinearGradient !== 'function') {
          console.warn('[fhl] 离屏 2d 上下文能力不足，已降级直绘');
          return null;
        }
      } catch (e4) {
        console.warn('[fhl] 离屏画布探测异常，已降级直绘:', e4 && e4.message);
        return null;
      }
    }
    return c;
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return c;
  }
  // Node 测试环境：可观察 stub（记录 fillStyle/strokeStyle/fillText/渐变色标），供烘焙层断言
  const rec = { texts: [], fillStyles: [], strokeStyles: [], gradStops: [], calls: [], w: width, h: height };
  const ctx = new Proxy({
    measureText: s => ({ width: String(s).length * 32 }),
    createLinearGradient() {
      const g = { addColorStop(pos, color) { rec.gradStops.push(color); } };
      return g;
    },
    createRadialGradient() {
      const g = { addColorStop(pos, color) { rec.gradStops.push(color); } };
      return g;
    },
    fillText(s) { rec.texts.push(String(s)); rec.calls.push(['fillText', String(s)]); },
    fill() { rec.calls.push(['fill']); },
    stroke() { rec.calls.push(['stroke']); },
  }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set(t, k, v) {
      if (k === 'fillStyle') rec.fillStyles.push(v);
      if (k === 'strokeStyle') rec.strokeStyles.push(v);
      t[k] = v; return true;
    },
  });
  rec.ctx = ctx;
  headlessOffscreenCtxs.push(rec);
  return { width, height, getContext: () => ctx };
}
/** Node 测试专用：最近一次「整屏」离屏烘焙记录（§4.22 起 ink 纸纹 tile/印章/笔触会嵌套烘焙，
 *  按「面积最大」取主记录，避免子资产顶掉断言目标；微信侧恒为 null） */
const headlessOffscreenCtxs = [];
function lastHeadlessBake() {
  let best = null, bestA = -1;
  for (let i = 0; i < headlessOffscreenCtxs.length; i++) {
    const r = headlessOffscreenCtxs[i];
    const a = (r.w || 0) * (r.h || 0);
    if (a >= bestA) { bestA = a; best = r; }   // 同面积取最新（battle/result 整屏同尺寸）
  }
  return best;
}

function screenInfo() {
  if (isWx) {
    const sys = wx.getSystemInfoSync();
    const win = sys.windowWidth || 375;
    const h = sys.windowHeight || Math.round(win * 1.777);
    const safeTop = (sys.statusBarHeight != null ? sys.statusBarHeight : 20);
    // iOS 全面屏底部 home indicator
    const safeBottom = (sys.safeArea && sys.safeArea.bottom && sys.screenHeight && sys.screenHeight - sys.safeArea.bottom > 16) ? (sys.screenHeight - sys.safeArea.bottom) : 0;
    let menuRect = null;
    if (wx.getMenuButtonBoundingClientRect) {
      try { menuRect = wx.getMenuButtonBoundingClientRect(); } catch (e) { /* 兜底 */ }
    }
    return { W: win, H: h, dpr: sys.pixelRatio || 2, safeTop, safeBottom, menuRect };
  }
  return { W: 375, H: 667, dpr: 2, safeTop: 20, safeBottom: 0, menuRect: null };
}

function onTouch(handler) {
  if (isWx) {
    wx.onTouchStart(e => handler('start', e.touches[0]));
    wx.onTouchEnd(e => handler('end', (e.changedTouches && e.changedTouches[0]) || null));
    return;
  }
  if (typeof document !== 'undefined') {
    const c = document.querySelector('canvas');
    if (!c) return;
    c.addEventListener('mousedown', e => handler('start', { clientX: e.clientX, clientY: e.clientY }));
    c.addEventListener('mouseup', e => handler('end', { clientX: e.clientX, clientY: e.clientY }));
  }
}

function requestFrame(cb) {
  if (isWx && wx.requestAnimationFrame) return wx.requestAnimationFrame(cb);
  if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(cb);
  return null; // Node 测试环境由驱动器手动步进
}

function onThemeChange(cb) {
  if (isWx && wx.onThemeChange) wx.onThemeChange(cb);
}

// ---- 存储（战绩 / 设置）----
function storageGet(key, fallback) {
  try {
    if (isWx) {
      const v = wx.getStorageSync(key);
      return v === '' || v == null ? fallback : v;
    }
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('fhl_' + key) : null;
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
function storageSet(key, value) {
  try {
    if (isWx) { wx.setStorageSync(key, value); return true; }
    if (typeof localStorage !== 'undefined') { localStorage.setItem('fhl_' + key, JSON.stringify(value)); return true; }
  } catch (e) { /* 写失败走上层兜底 */ }
  return false;
}

// ---- 设备分档（氛围动效降级依据；取不到按中档）----
function deviceTier() {
  try {
    if (isWx && typeof wx.getDeviceInfo === 'function') {
      const b = wx.getDeviceInfo().benchmarkLevel;
      if (b >= 1 && b <= 15) return 0;   // 低端：粒子 6 / 动效降档
      if (b > 0 && b <= 30) return 1;    // 中端
      if (b > 30) return 2;              // 高端
    }
  } catch (e) { /* 取不到按中档 */ }
  return 1;
}

// ---- 分享（小游戏转发；浏览器/Node 环境安全 no-op）----/** 主动分享：wx.shareAppMessage({ title, imageUrl? })，返回是否真正唤起 */
function share(opts) {
  if (isWx && wx.shareAppMessage) {
    try {
      // 开发者工具模拟器无法弹出真实转发面板（点了没反应会被当成「功能没有」）
      // → 如实返回 false，上层 toast 提示用真机预览
      const info = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      if (info && info.platform === 'devtools') return false;
      wx.shareAppMessage(opts || {});
      return true;
    } catch (e) { return false; }
  }
  return false;
}
/** 被动分享：右上角菜单转发；titleFn 动态生成标题（如带战绩） */
function initShare(titleFn) {
  if (!isWx) return;
  try { if (wx.showShareMenu) wx.showShareMenu({}); } catch (e) { /* 菜单不可用不阻断 */ }
  try { if (wx.onShareAppMessage) wx.onShareAppMessage(() => ({ title: (titleFn && titleFn()) || '飞花令 · 与诗童对诗' })); } catch (e) { /* 同上 */ }
}

module.exports = { isWx, createMainCanvas, createOffscreen, screenInfo, onTouch, requestFrame, onThemeChange, storageGet, storageSet, share, initShare, lastHeadlessBake, deviceTier };
