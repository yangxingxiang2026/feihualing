/* 预览 bundle，由 tools/build/bundle-preview.js 生成，勿手改 */
(function () {
  var __defs = {}, __cache = {};
  function __reg(id, fn) { __defs[id] = fn; }
  function __dir(id) { var i = id.lastIndexOf('/'); return i < 0 ? '' : id.slice(0, i); }
  function __req(fromDir, spec) {
    var p = (spec.charAt(0) === '.') ? __norm(fromDir + '/' + spec) : spec;
    if (!/\.[a-zA-Z]+$/.test(p)) p += '.js';
    if (__cache[p]) return __cache[p].exports;
    var fn = __defs[p];
    if (!fn) throw new Error('module not found: ' + p + ' (from ' + fromDir + ')');
    var mod = { exports: {} };
    __cache[p] = mod;
    fn(mod, mod.exports, function (s) { return __req(__dir(p), s); });
    return mod.exports;
  }
  function __norm(p) {
    var parts = p.split('/'), stack = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (s === '' || s === '.') continue;
      if (s === '..') stack.pop(); else stack.push(s);
    }
    return stack.join('/');
  }
__reg("js/platform.js", function (module, exports, require) {
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

});
__reg("js/ui/tokens.js", function (module, exports, require) {
'use strict';
/**
 * Design Token（10_ui_spec.md §1）
 * 三层：Primitive（仅 tokens 内部）→ Semantic（业务只用这层）→ 字阶/间距/圆角/动效。
 * 亮/暗两套，主题切换只换值、不重建布局。
 */

const P = { // Primitive（唯一色彩事实源：tiger THEMES.guofeng）
  tiger: '#F2C33C', amberDeep: '#C98A28',
  vermilion: '#C9372C', vermilionDeep: '#A82A21',
  azure: '#2E6E8E', bamboo: '#7FC5A8', bambooDeep: '#3E7A5E',
  ink: '#2B231D', inkSoft: '#6A6157', inkFaint: '#8C8378',
  cream: '#FFF9EC', creamDeep: '#F6ECD7',
  pink: '#E88494', gold: '#D9A441', white: '#FFFFFF',
};

const T = {
  // —— 语义层：业务代码只准用这一层 ——
  color: {
    light: {
      bg: P.cream, bgEnd: P.creamDeep,
      surface: '#FFFDF7', surfaceAlt: 'rgba(43,35,29,0.055)', track: 'rgba(43,35,29,0.12)',
      fg: P.ink, fg2: P.inkSoft, onBrand: P.cream, disabled: P.inkFaint,
      lineSoft: 'rgba(43,35,29,0.16)', lineStrong: P.ink,
      primary: P.vermilion, primaryGrad: [P.vermilion, P.vermilionDeep],
      secondary: P.azure, success: P.bambooDeep, danger: P.vermilion, reward: P.tiger,
      // 翠绿主按钮（字块提交键，2026-11-18 用户指定）：比竹绿更鲜亮一档
      successGrad: ['#3E9C6E', '#2E7A52'],
      barPlayer: P.azure, barRival: P.vermilion,
      resultShadow: 'rgba(43,35,29,0.10)', resultShadow2: 'rgba(43,35,29,0.16)',
      badgeBg: P.tiger, badgeFg: P.ink, pillNumBg: 'rgba(46,110,142,0.12)',
      recordBg: 'rgba(46,110,142,0.10)', mask: 'rgba(255,249,236,0.96)',
      gold: P.gold,
    },
    dark: {
      bg: '#1E1A16', bgEnd: '#262019',
      surface: '#2A241E', surfaceAlt: 'rgba(243,234,217,0.07)', track: 'rgba(243,234,217,0.14)',
      fg: '#F3EAD9', fg2: '#C4B8A5', onBrand: '#1E1A16', disabled: '#6F665C',
      lineSoft: 'rgba(243,234,217,0.18)', lineStrong: '#F3EAD9',
      primary: '#E15A4B', primaryGrad: ['#E15A4B', '#C9372C'],
      secondary: '#6FA8C6', success: '#8FD3B8', danger: '#E15A4B', reward: P.tiger,
      successGrad: ['#4DB384', '#35906A'],
      barPlayer: '#6FA8C6', barRival: '#E15A4B',
      resultShadow: 'rgba(0,0,0,0.20)', resultShadow2: 'rgba(0,0,0,0.28)',
      badgeBg: P.tiger, badgeFg: P.ink, pillNumBg: 'rgba(111,168,198,0.16)',
      recordBg: 'rgba(111,168,198,0.12)', mask: 'rgba(30,26,22,0.96)',
      gold: P.gold,
    },
  },
  // —— 字阶（fs.keyword/result/title/timer/hero 不参与适老缩放）——
  fs: { hero: 240, keyword: 120, result: 96, title: 64, h1: 40, h2: 32, body: 32,
        bodyS: 28, label: 22, caption: 18, badge: 14, timer: 48, timerUrgent: 56 },
  sp: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  r: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 },
  st: { hair: 1, thin: 2, mid: 3, thick: 4 },
  du: { flash: 120, fast: 180, base: 260, slow: 420, reveal: 800 },
  // 适老：只放大允许缩放的 token（§1.3 标注可缩放者）
  scalable: { h1: 1, h2: 1, body: 1, bodyS: 1, label: 1, caption: 1 },
  scaled(name, S) { const v = T.fs[name]; if (!(name in T.scalable)) return v; return S === 1 ? v : Math.round(v * S); },
};

// 字体栈（§1.3）
const FAM_SERIF = "'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC',serif";
const FAM_SANS = "-apple-system,'PingFang SC','Helvetica Neue',sans-serif";

/** font 字符串一律函数化，禁止手拼 */
function font(weight, size, family) {
  const w = weight >= 700 ? 'bold ' : (weight >= 600 ? '600 ' : '');
  return `${w}${size}px ${family === 'serif' ? FAM_SERIF : FAM_SANS}`;
}

/** 主题解析：'light'|'dark'|'auto' → 具体 token 集 */
function resolveTokens(themeMode, systemDark) {
  const dark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);
  return { dark, c: dark ? T.color.dark : T.color.light };
}

module.exports = { T, P, font, FAM_SERIF, FAM_SANS, resolveTokens };

});
__reg("js/ui/layout.js", function (module, exports, require) {
'use strict';
/**
 * 三屏坐标表（10_ui_spec.md §3/§4/§5，全部 375×667 逻辑 px）
 * 纯数据模块：输入屏幕信息 → 输出元素几何 + hotRects。
 * 适配：x 乘 k = W/375；顶部区 y 加 safeTop 偏移；底部区用底锚公式；中部弹性给小虎 scale。
 */

const KREF = 375;
const REF_SAFE_TOP = 20;

/**
 * @param {{W,H,safeTop,safeBottom}} s
 * @returns {k, dx(topOffset), yBtn(底部按钮行 y), yRecord}
 */
function frame(s) {
  const k = s.W / KREF;
  const topOff = (s.safeTop || REF_SAFE_TOP) - REF_SAFE_TOP; // 顶锚偏移
  const yBtn = s.H - (s.safeBottom || 0) - 12 - 88;          // 底锚：底部按钮行
  return { k, topOff, yBtn };
}
const X = (v, k) => Math.round(v * k * 100) / 100;
const Y = (v, off) => v + off;

// ---------------- 首页 ----------------
function home(s) {
  const { k, topOff } = frame(s);
  // 2026-11-18 P0-3：首页从「两个模式的说明书」收成「一个游戏的开始」——
  // 唯一主按钮「开始对诗」，玩法模式 / 难度 / 音效降为按钮上方的三个 chip。
  const BTN_H = 88;
  const yRecord = s.H - (s.safeBottom || 0) - 12 - 88;
  const startY = yRecord - 16 - BTN_H;      // 主按钮底锚：紧贴在战绩签上方
  const chipY = Y(240, topOff), chipH = 34; // 240：避开副标题分隔线（subtitle.mid+22）
  const zoneTop = chipY + chipH + 8;
  const zoneBot = startY - 10;
  const TIGER_H = 560;                      // 渲染器原生内容实际延伸到 y≈545（脚/尾/笔），按 560 计
  const zoneH = Math.max(zoneBot - zoneTop, 120);
  const tigerScale = Math.max(0.20, Math.min(0.46, zoneH / TIGER_H));
  const tigerH = TIGER_H * tigerScale;
  const tigerY = zoneTop + Math.max(0, (zoneH - tigerH) / 2);
  // 三个 chip 横排：模式 146 / 难度 108 / 音效 73，间距 8，右缘 359 = W-16
  const MODE_W = 146, DIFF_W = 108, SOUND_W = 73;
  return {
    k,
    // 2026-11-18：字号循环按钮移除——fontScale 1.25/1.5 档已多次引发溢出 bug（结算按钮/战绩签/上句条），
    // 收益（适老）远低于稳定性成本；界面锁定标准字号，fontScale 基础设施保留待后续整版适配
    title: { cx: X(187.5, k), mid: Y(158, topOff), size: 64, tracking: 6 },
    subtitle: { cx: X(187.5, k), mid: Y(200, topOff), size: 24 },
    tiger: { x: s.W / 2 - 200 * tigerScale, y: tigerY, scale: tigerScale },
    modeChip: { x: X(16, k), y: chipY, w: MODE_W * k, h: chipH, r: 17 },
    diffChip: { x: X(170, k), y: chipY, w: DIFF_W * k, h: chipH, r: 17 },
    soundChip: { x: X(286, k), y: chipY, w: SOUND_W * k, h: chipH, r: 17 },
    startBtn: { x: X(16, k), y: startY, w: X(343, k), h: BTN_H, r: 22,
                chev: { x: X(326, k), y: startY + BTN_H / 2 - 8 },
                hot: [X(16, k), startY - 6, X(343, k), BTN_H + 12] },
    record: { x: X(16, k), y: yRecord, w: X(343, k), h: 88, r: 44,
              seal: { x: X(34, k), y: yRecord + 18, size: 48 }, textX: X(98, k), mid: yRecord + 44,
              arrow: { x: X(330, k), y: yRecord + 36 }, hot: [X(16, k), yRecord, X(343, k), 88] },
    hotRects: [
      { id: 'home.start', x: X(16, k), y: startY - 6, w: X(343, k), h: BTN_H + 12 },
      { id: 'home.modeChoice', x: X(16, k), y: chipY, w: (MODE_W / 2) * k, h: chipH },
      { id: 'home.modeBlocks', x: X(16 + MODE_W / 2, k), y: chipY, w: (MODE_W / 2) * k, h: chipH },
      { id: 'home.diffEasy', x: X(170, k), y: chipY, w: (DIFF_W / 2) * k, h: chipH },
      { id: 'home.diffNormal', x: X(170 + DIFF_W / 2, k), y: chipY, w: (DIFF_W / 2) * k, h: chipH },
      { id: 'home.sound', x: X(286, k), y: chipY, w: SOUND_W * k, h: chipH },
      { id: 'home.record', x: X(16, k), y: yRecord, w: X(343, k), h: 88 },
    ],
  };
}

// ---------------- 对局页共用（B0–B3） ----------------
function battleShared(s) {
  const { k, topOff, yBtn } = frame(s);
  return {
    k, yBtn,
    back: { x: X(52, k), y: Y(72, topOff), r: 18, hot: [X(8, k), Y(44, topOff), 88 * k, 88] },
    roundPill: { x: X(104, k), y: Y(56, topOff), w: 96 * k, h: 32, r: 16 },
    // 2026-11-18：倒计时原画在 rightX=340（贴屏缘），真机上撞进右上角胶囊菜单领域
    // → 改为「环内数字」一体单元，整体置于胶囊左侧（胶囊占 W-96 起，环右缘 260k 恒在其左）
    timerRing: { cx: X(236, k), cy: Y(70, topOff), r: 24 },
    sealCard: { x: X(12, k), y: Y(100, topOff), w: 128 * k, h: 128, r: 18, inner: { x: X(18, k), y: Y(106, topOff), w: 116 * k, h: 116, r: 14 } },
    keyword: { cx: X(76, k), mid: Y(164, topOff) },
    bustWin: { x: X(150, k), y: Y(100, topOff), w: 100 * k, h: 108 * k },
    playerLabel: { x: X(256, k), y: Y(104, topOff), w: 107 * k, h: 20 },
    playerBar: { x: X(256, k), y: Y(126, topOff), w: 107 * k, h: 12, r: 6 },
    rivalLabel: { x: X(256, k), y: Y(150, topOff), w: 107 * k, h: 20 },
    rivalBar: { x: X(256, k), y: Y(172, topOff), w: 107 * k, h: 12, r: 6 },
    comboDots: { x: X(256, k), y: Y(196, topOff), size: 10, gap: 6 },
    // 2026-11-18：上句条 56→64（真机两行文字叠字修复），预览条/字块格随之让位
    lastBar: { x: X(12, k), y: Y(232, topOff), w: 351 * k, h: 64, r: 12 },
    lastLabel: { x: X(28, k), y: Y(240, topOff), w: 60 * k, h: 16 },
    lastText: { x: X(28, k), y: Y(258, topOff), w: 323 * k, h: 26 },
    menuBanned: s.menuRect || { x: s.W - 96, y: 0, w: 96, h: 44 },
  };
}

// ---------------- 对局 B4a · 字块拼句 ----------------
function battleBlocks(s, shared) {
  const { k, topOff, yBtn } = frame(s);
  // 2026-11-19 UI 评审 C：中部内容（预览槽/字块格）原本顶锚、按钮底锚，
  // 高屏（812+）在字块格与按钮间留出 ~200px 空洞（真机截图实锤）。
  // → 富余空间三等分塞进 预览槽上方/预览槽与字块格/字块格与按钮 三处间隙；
  //   667 基准帧 extra=0，与旧版坐标完全一致。
  const previewY0 = Y(300, topOff);
  const zoneBot = yBtn - 12;
  const refSpan = 240;               // 667 基准：preview 56 + gap 4 + 字块格纵向跨度 180
  const extra = Math.max(0, zoneBot - previewY0 - refSpan);
  const g = extra / 3;
  const previewY = previewY0 + g;
  const gridY = previewY + 60 + g;
  const cells = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      cells.push({
        x: X(11 + col * 88, k), y: gridY + row * 96, w: 88 * k, h: 96,
        vis: { x: X(11 + col * 88 + 8, k), y: gridY + row * 96 + 12, w: 72 * k, h: 72 * k, r: 14 },
      });
    }
  }
  return {
    preview: { x: X(12, k), y: previewY, w: 351 * k, h: 56, r: 12 },
    cells,
    // 2026-11-19 UI 评审 A：错因 pill 原画在 y 248（提示条两行文字正中间），
    // 真机截图实锤「超时 · 本回合判负」与「提示：王维《…》」互相穿插都读不清。
    // → 改为盖在预览槽上：失败时 seq 已清空、预览槽无内容，被 pill 暂时遮住零信息损失；
    //   也不占新槽位（667 帧垂直预算已满，无永久空槽可用）。
    errorPill: { x: X(12, k), y: previewY, w: 351 * k, h: 56, r: 14, fromY: previewY + 40 },
    undoBtn: { x: X(12, k), y: yBtn, w: 105 * k, h: 88, r: 14 },
    clearBtn: { x: X(128, k), y: yBtn, w: 105 * k, h: 88, r: 14 },
    submitBtn: { x: X(244, k), y: yBtn, w: 119 * k, h: 88, r: 14 },
  };
}

// ---------------- 对局 B4b · 点选接句 ----------------
function battleChoice(s, shared) {
  const { k, topOff, yBtn } = frame(s);
  const ys = [264, 360, 456, 552].map(v => {
    // 最后一张卡用底锚收口，前三张顶锚排布（667 参考帧两者重合）
    return Math.min(Y(v, topOff), yBtn);
  });
  const cards = ys.map((y, i) => ({
    x: X(12, k), y, w: 351 * k, h: 88, r: 14,
    num: { x: X(44, k), y: y + 44, r: 16 },
    text: { x: X(72, k), y: y + 10, w: 275 * k, h: 68 },
  }));
  return {
    thinBar: { x: X(12, k), y: Y(236, topOff), w: 351 * k, h: 22 },
    cards,
    errorPill: { x: X(12, k), y: Y(248, topOff), w: 351 * k, h: 40, r: 20, fromY: Y(288, topOff) },
  };
}

// ---------------- 出字亮相（全屏） ----------------
function reveal(s) {
  const { k, topOff } = frame(s);
  return {
    label: { cx: s.W / 2, mid: Y(180, topOff) },
    char: { cx: s.W / 2, mid: Y(333, topOff) },
    lineTop: { x: X(127, k), y: Y(213, topOff), w: 121 },
    lineBottom: { x: X(127, k), y: Y(453, topOff), w: 121 },
  };
}

// ---------------- 结算页 ----------------
function result(s) {
  const { k, topOff, yBtn } = frame(s);
  // 2026-11-18 判胜负可读性改版：副标题区加比分/统计行，回顾卡加原因行，
  // 底部三按钮（再来一局/分享/回首页）
  const yCard = Y(398, topOff);
  // 2026-11-19 UI 评审 E：回顾卡原固定 h 138，高屏在卡与按钮间留 ~180px 空白（真机截图实锤）
  // → 卡高自适应拉伸吃掉富余空间（667 基准帧 h=138 与旧版一致），卡内行距同步拉开
  const cardH = Math.max(138, yBtn - 16 - yCard);
  const hX = cardH - 138;            // 拉伸量，分配给卡内行距
  const tigerScale = 0.27;           // 2026-11-19 F：0.30→0.27 给统计行与卡之间留呼吸位
  return {
    k,
    resultChar: { cx: s.W / 2, mid: Y(99, topOff) },
    // F：结果字下装饰短横线，压住大字重心
    charLine: { x: s.W / 2 - 24, y: Y(148, topOff), w: 48, h: 4 },
    subtitle: { cx: s.W / 2, mid: Y(172, topOff) },
    statsMid: Y(202, topOff),
    tiger: { x: X(107.5, k), y: Y(212, topOff), scale: tigerScale },
    review: { x: X(12, k), y: yCard, w: 351 * k, h: cardH, r: 14 },
    miniSeal: { x: X(26, k), y: yCard + 18 + hX * 0.08, size: 56, inner: { x: X(32, k), y: yCard + 24 + hX * 0.08, size: 44 } },
    rowMe: { label: { x: X(98, k), y: yCard + 14 + hX * 0.12, w: 40 * k, h: 20 }, text: { x: X(98, k), y: yCard + 36 + hX * 0.12, w: 253 * k, h: 28 } },
    rowTiger: { label: { x: X(98, k), y: yCard + 62 + hX * 0.4, w: 60 * k, h: 20 }, text: { x: X(98, k), y: yCard + 84 + hX * 0.4, w: 253 * k, h: 28 } },
    reasonMid: yCard + cardH - 18,     // 判定行锚卡底，卡拉伸时行距均匀
    againBtn: { x: X(12, k), y: yBtn, w: 157 * k, h: 88, r: 14 },
    shareBtn: { x: X(176, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    homeBtn: { x: X(273, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    hotRects: [
      { id: 'result.again', x: X(12, k), y: yBtn, w: 157 * k, h: 88 },
      { id: 'result.share', x: X(176, k), y: yBtn, w: 90 * k, h: 88 },
      { id: 'result.home', x: X(273, k), y: yBtn, w: 90 * k, h: 88 },
    ],
  };
}

module.exports = { frame, home, battleShared, battleBlocks, battleChoice, reveal, result };

});
__reg("js/ui/draw.js", function (module, exports, require) {
'use strict';
/**
 * 原子绘制层（10_ui_spec.md §9.1 / §1.5）
 * 铁律：rrect 用 arcTo 手写（禁 ctx.roundRect）；椭圆带兜底；阴影用偏移实底（禁 shadowBlur）；
 *       measureText 结果按 key 缓存；渐变对象布局期创建，禁止在 draw 循环内创建。
 */

/** 圆角矩形路径（arcTo 四段，低版本基础库安全） */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ellipse 兼容探测（一次）
let ellipseOk = null;
function ensureEllipse(ctx) {
  if (ellipseOk === null) {
    try { ellipseOk = typeof ctx.ellipse === 'function'; } catch (e) { ellipseOk = false; }
  }
  return ellipseOk;
}
/** 椭圆填充：探测失败走 save/translate/scale/arc/restore 兜底 */
function ell(ctx, x, y, rx, ry, fill, stroke, lw) {
  ctx.beginPath();
  if (ensureEllipse(ctx)) {
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.restore();
  }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
}

/** elevation 偏移实底阴影（§1.5） */
function shadow(ctx, x, y, w, h, r, level, c) {
  if (!level) return;
  const off = level >= 2 ? 4 : 2;
  const col = level >= 2 ? c.resultShadow2 : c.resultShadow;
  rrect(ctx, x, y + off, w, h, r);
  ctx.fillStyle = col; ctx.fill();
}

/** 文本（对齐 + 可选省略截断，measure 缓存） */
const measureCache = new Map();
function textWidth(ctx, s, f) {
  const key = s + '|' + f;
  let w = measureCache.get(key);
  if (w === undefined) { ctx.font = f; w = ctx.measureText(s).width; measureCache.set(key, w); }
  return w;
}
function text(ctx, s, x, y, f, color, opt) {
  opt = opt || {};
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'middle';
  if (opt.maxW && ctx.measureText(s).width > opt.maxW) {
    s = truncate(ctx, s, f, opt.maxW);
    ctx.font = f; // truncate 可能改过 font
    ctx.fillStyle = color;
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'middle';
  }
  ctx.fillText(s, x, y);
}
function truncate(ctx, s, f, maxW) {
  const key = s + '|' + f + '|' + maxW;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;
  let out = s;
  ctx.font = f;
  if (ctx.measureText(s).width > maxW) {
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    out = s.slice(0, lo) + '…';
  }
  measureCache.set(key, out);
  return out;
}

/** pill（胶囊条） */
function pill(ctx, x, y, w, h, fill, r) {
  rrect(ctx, x, y, w, h, r != null ? r : h / 2);
  ctx.fillStyle = fill; ctx.fill();
}

/** 竖向渐变主按钮底（渐变对象由调用方在布局期缓存传入） */
function gradBtn(ctx, grad, x, y, w, h, r) {
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = grad; ctx.fill();
}
/** 布局期创建竖向渐变（真机离屏上下文不可用/异常时回落纯色 c0，绝不让 fillStyle 变 undefined） */
function makeVGrad(ctx, x, y0, y1, c0, c1) {
  try {
    if (!ctx || typeof ctx.createLinearGradient !== 'function') return c0;
    const g = ctx.createLinearGradient(x, y0, x, y1);
    if (!g || typeof g.addColorStop !== 'function') return c0;
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    return g;
  } catch (e) {
    return c0;
  }
}

/** 血条（带描边保形；track 为轨道色 token，D4 裁决：暗色用 c.track，禁硬编码亮色值） */
function bar(ctx, x, y, w, h, ratio, fill, track, lineSoft, r) {
  rrect(ctx, x, y, w, h, r != null ? r : h / 2);
  ctx.fillStyle = track; ctx.fill();
  if (ratio > 0) {
    rrect(ctx, x, y, Math.max(w * Math.min(1, ratio), h), h, r != null ? r : h / 2);
    ctx.fillStyle = fill; ctx.fill();
  }
  rrect(ctx, x, y, w, h, r != null ? r : h / 2);
  ctx.lineWidth = 1; ctx.strokeStyle = lineSoft; ctx.stroke();
}

/** 印章（方章 + 内框） */
function seal(ctx, x, y, size, fill, innerLine, char, f, fg) {
  rrect(ctx, x, y, size, size, 8); ctx.fillStyle = fill; ctx.fill();
  rrect(ctx, x + 6, y + 6, size - 12, size - 12, 6);
  ctx.lineWidth = 1; ctx.strokeStyle = innerLine; ctx.stroke();
  if (char) text(ctx, char, x + size / 2, y + size / 2, f, fg, { align: 'center' });
}

/** 折线箭头 › */
function chevron(ctx, x, y, color, lw) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + 9, y + 8); ctx.lineTo(x, y + 16);
  ctx.strokeStyle = color; ctx.lineWidth = lw || 2.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

const verifiedBake = typeof WeakSet === 'function' ? new WeakSet() : null;
/** 烘焙层铺底：drawImage 失败 / L0 不可用 / 真机「画了不可见」时，直绘背景渐变兜底 */
function drawBaked(ctx, L0, W, H, bg) {
  if (L0 && L0.width > 0 && L0.height > 0) {
    try {
      ctx.drawImage(L0, 0, 0, W, H);
      // 一次性像素自证：部分真机 drawImage 不报错但离屏内容不可见（整屏透明）
      if (verifiedBake && !verifiedBake.has(L0)) {
        verifiedBake.add(L0);
        try {
          const px = ctx.getImageData(2, 2, 1, 1); // 该点必在铺底范围内（getImageData 用设备像素，取左上角最稳）
          const dt = px && px.data;
          if (dt && dt.length >= 4 && dt[3] === 0) {
            if (bg) {
              ctx.fillStyle = makeVGrad(ctx, 0, 0, H, bg[0], bg[1]);
              ctx.fillRect(0, 0, W, H);
            }
            return false;
          }
        } catch (e) { /* 取不到像素按正常处理，不误伤 */ }
      }
      return true;
    } catch (e) { /* 落直绘兜底 */ }
  }
  if (bg) {
    ctx.fillStyle = makeVGrad(ctx, 0, 0, H, bg[0], bg[1]);
    ctx.fillRect(0, 0, W, H);
  }
  return false;
}
module.exports = { rrect, ell, shadow, text, textWidth, truncate, pill, gradBtn, makeVGrad, drawBaked, bar, seal, chevron, measureCache };

});
__reg("src/actors/tiger_renderer.js", function (module, exports, require) {
/*
 * 小虎诗童 · Canvas 2D 程序化渲染器
 * ---------------------------------------------------------------
 * 纯 Canvas 2D 路径绘制，无图片、无 WebGL、无 3D、无外部依赖。
 * 可在浏览器预览页直接用，也可在微信小游戏里 require 后于主循环调用。
 *
 * 用法：
 *   const Tiger = require('./tiger_renderer.js');
 *   // 每帧：
 *   Tiger.draw(ctx, { state:'idle', t: elapsedSeconds, theme:'guofeng', x:200, y:0, scale:1 });
 *
 * 设计基线：国风动漫 1.2 头身超萌版（头占约 72%），
 *   淡白正统王字 + 简化短弧虎纹（按定稿），琥珀大眼、粉耳心、
 *   竹青交领、朱砂腰封、青玉佩、圆尾墨尖、斜靠毛笔。
 */
(function (root) {
  'use strict';

  // ---------- 主题配色 ----------
  var THEMES = {
    guofeng: {
      name: '国风动漫',
      fur: '#F2C33C', furShade: '#C98A28', outline: '#2B231D',
      cream: '#FFF9EC', pink: '#E88494', pinkLine: '#C46074',
      wang: '#FFF6E4', wangEdge: '#8A6A2F',
      iris: '#D98F32', irisTop: '#4A2A12', pupil: '#1A120A',
      robe: '#2E6E8E', sash: '#C9372C', gold: '#D9A441',
      jade: '#7FC5A8', ink: '#2B231D', petal: ['#E88494', '#F2C33C', '#FFF9EC', '#7FC5A8']
    },
    anime: {
      name: '日系赛璐璐',
      fur: '#FFC23D', furShade: '#E08A1E', outline: '#3A2410',
      cream: '#FFF6E0', pink: '#FF8FA3', pinkLine: '#E8617D',
      wang: '#FFF6E4', wangEdge: '#B89038',
      iris: '#F0A830', irisTop: '#7A4218', pupil: '#241408',
      robe: '#3FA98C', sash: '#E8402A', gold: '#FFC93D',
      jade: '#7FC5A8', ink: '#3A2410', petal: ['#FF8FA3', '#FFC23D', '#FFF6E0', '#3FA98C']
    }
  };

  var STATES = ['idle', 'clap', 'facepalm', 'cheer', 'pet'];

  // ---------- 工具 ----------
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function ellipse(ctx, x, y, rx, ry, fill, stroke, lw) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 3; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function line(ctx, pts, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function curve(ctx, p0, c0, c1, p1, stroke, lw, fill) {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(c0[0], c0[1], c1[0], c1[1], p1[0], p1[1]);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function arcStroke(ctx, x, y, r, a0, a1, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.lineCap = 'round'; ctx.stroke();
  }

  // ---------- 尾巴 ----------
  function drawTail(ctx, C, state, t) {
    var droop = state === 'facepalm' ? 22 : 0;
    // pet：尾巴舒服慢摇（幅度介于 idle 与 cheer 之间）
    var sway = Math.sin(t * (state === 'cheer' ? 6 : state === 'pet' ? 4.5 : 2.4))
      * (state === 'cheer' ? 18 : state === 'pet' ? 13 : 9);
    var baseX = 248, baseY = 496;
    var tipX = 300 + sway, tipY = 430 + droop;
    // 外描边
    curve(ctx, [baseX, baseY], [312, 536], [330, 486], [tipX, tipY], C.outline, 40);
    // 虎黄主体
    curve(ctx, [baseX, baseY], [312, 536], [330, 486], [tipX, tipY], C.fur, 33);
    // 墨尖
    curve(ctx, [tipX - 4, tipY + 14], [tipX + 6, tipY + 4], [tipX + 2, tipY - 8], [tipX - 2, tipY - 16], C.outline, 36);
    curve(ctx, [tipX - 4, tipY + 14], [tipX + 6, tipY + 4], [tipX + 2, tipY - 8], [tipX - 2, tipY - 16], C.ink, 29);
  }

  // ---------- 身体 + 小袄 ----------
  function drawBody(ctx, C) {
    var cx = 200, cy = 442;
    ellipse(ctx, cx, cy, 58, 60, C.fur, C.outline, 3.5);
    // 交领（石青右衽）
    ctx.beginPath();
    ctx.moveTo(154, 408); ctx.quadraticCurveTo(200, 388, 246, 410);
    ctx.quadraticCurveTo(238, 420, 226, 424); ctx.lineTo(200, 414);
    ctx.lineTo(174, 424); ctx.quadraticCurveTo(162, 420, 154, 408); ctx.closePath();
    ctx.fillStyle = C.robe; ctx.fill();
    line(ctx, [200, 414, 214, 444, 200, 452], C.cream, 5); // 右衽交叠
    // 朱砂腰封
    ctx.fillStyle = C.sash; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(156, 424, 88, 14); ctx.fill(); ctx.stroke();
    // 腰封结
    line(ctx, [200, 438, 200, 458], C.gold, 2.5);
    line(ctx, [192, 448, 200, 456, 208, 448], C.gold, 2.5);
    // 青玉佩
    ellipse(ctx, 236, 464, 11, 11, C.jade, C.gold, 2);
    line(ctx, [236, 453, 236, 444], C.sash, 3);
    // 肚皮白毛
    ellipse(ctx, 200, 458, 30, 26, C.cream, null);
  }

  // ---------- 耳朵 ----------
  // pet 状态（2026-11-20 触摸互动升级）：耳朵轻抖——被摸舒服时的小动作，左右相位错开
  function drawEar(ctx, C, x, state, t) {
    ctx.save();
    if (state === 'pet') {
      ctx.translate(x, 108);
      ctx.rotate(Math.sin(t * 9 + (x < 200 ? 0 : 1.7)) * 0.055);
      ctx.translate(-x, -108);
    }
    ellipse(ctx, x, 108, 46, 52, C.fur, C.outline, 3.5);
    arcStroke(ctx, x, 94, 30, Math.PI * 1.1, Math.PI * 1.9, C.furShade, 8);
    ellipse(ctx, x, 114, 28, 31, C.cream, C.outline, 2);
    ellipse(ctx, x, 122, 19, 21, C.pink, C.pinkLine, 1.5);
    ctx.restore();
  }

  // ---------- 头 ----------
  function drawHead(ctx, C, state, blink, t) {
    var hx = 200, hy = 225;
    // 头主体
    ellipse(ctx, hx, hy, 150, 155, C.fur, C.outline, 4);
    // 右侧暗部
    ctx.beginPath();
    ctx.moveTo(200, 70);
    ctx.bezierCurveTo(287, 70, 350, 142, 350, 225);
    ctx.bezierCurveTo(350, 308, 287, 380, 200, 380);
    ctx.bezierCurveTo(248, 310, 248, 140, 200, 70);
    ctx.closePath(); ctx.fillStyle = C.furShade; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;

    drawEar(ctx, C, 98, state, t); drawEar(ctx, C, 302, state, t);

    // 虎纹：简化短弧（已按定稿去掉钩尾），左右各 3 道
    ctx.strokeStyle = C.outline; ctx.lineWidth = 8; ctx.lineCap = 'round';
    var ys = [214, 240, 266];
    for (var i = 0; i < 3; i++) {
      var y = ys[i];
      ctx.beginPath(); ctx.moveTo(68, y); ctx.quadraticCurveTo(84, y - 6, 98, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(332, y); ctx.quadraticCurveTo(316, y - 6, 302, y + 6); ctx.stroke();
    }

    // 王字：正统三横一竖，淡白 + 淡金勾边（按定稿）
    function wang() {
      line(ctx, [184, 126, 216, 126], C.wangEdge, 12);
      line(ctx, [186, 145, 214, 145], C.wangEdge, 12);
      line(ctx, [178, 164, 222, 164], C.wangEdge, 12);
      line(ctx, [200, 124, 200, 166], C.wangEdge, 12);
      line(ctx, [184, 126, 216, 126], C.wang, 8);
      line(ctx, [186, 145, 214, 145], C.wang, 8);
      line(ctx, [178, 164, 222, 164], C.wang, 8);
      line(ctx, [200, 124, 200, 166], C.wang, 8);
    }
    wang();

    // 眼睛
    drawEyes(ctx, C, state, blink, t);

    // 口鼻
    var mz = 324;
    ellipse(ctx, 200, mz, 66, 37, C.cream, C.outline, 2.5);
    // 粉鼻
    ctx.beginPath();
    ctx.moveTo(188, 310); ctx.quadraticCurveTo(200, 303, 212, 310);
    ctx.quadraticCurveTo(212, 322, 200, 327); ctx.quadraticCurveTo(188, 322, 188, 310);
    ctx.closePath(); ctx.fillStyle = C.pink; ctx.fill(); ctx.strokeStyle = C.pinkLine; ctx.lineWidth = 1.5; ctx.stroke();
    // 嘴（随状态）
    drawMouth(ctx, C, state);
    // 胡须
    line(ctx, [150, 328, 116, 324], C.cream, 2);
    line(ctx, [150, 336, 112, 342], C.cream, 2);
    line(ctx, [250, 328, 284, 324], C.cream, 2);
    line(ctx, [250, 336, 288, 342], C.cream, 2);
    // 腮红
    ellipse(ctx, 94, 318, 32, 17, C.pink, null); ctx.globalAlpha = 0.55;
    ellipse(ctx, 94, 318, 32, 17, C.pink, null); ctx.globalAlpha = 1;
    ellipse(ctx, 306, 318, 32, 17, C.pink, null); ctx.globalAlpha = 0.55;
    ellipse(ctx, 306, 318, 32, 17, C.pink, null); ctx.globalAlpha = 1;
    line(ctx, [76, 314, 92, 320], C.pinkLine, 2);
    line(ctx, [84, 307, 98, 316], C.pinkLine, 2);
    line(ctx, [324, 314, 308, 320], C.pinkLine, 2);
    line(ctx, [316, 307, 302, 316], C.pinkLine, 2);
  }

  // ---------- 眼睛 ----------
  function drawEyes(ctx, C, state, blink, t) {
    var eyes = [[137, 242], [263, 242]];
    for (var e = 0; e < 2; e++) {
      var x = eyes[e][0], y = eyes[e][1];
      ctx.save();
      ctx.translate(x, y);

      if (state === 'clap' || state === 'cheer' || state === 'pet') {
        // 弯月笑眼：上扬弧（pet：弧度更缓——半眯的享受眼，不是大笑）
        var amp = state === 'pet' ? -15 : -20;
        ctx.beginPath(); ctx.moveTo(-30, 8); ctx.quadraticCurveTo(0, amp, 30, 8);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
        if (state === 'cheer') {
          ellipse(ctx, -14, -2, 4, 4, C.cream, null);
          ellipse(ctx, 14, -2, 4, 4, C.cream, null);
        }
        ctx.restore();
        continue;
      }

      if (state === 'facepalm') {
        // 无奈半闭眼
        ellipse(ctx, 0, 6, 34, 18, '#FFFFFF', C.outline, 3);
        ellipse(ctx, 0, 10, 20, 13, C.iris, null);
        ellipse(ctx, 0, 11, 9, 9, C.pupil, null);
        ellipse(ctx, -7, 5, 5, 5, '#FFFFFF', null);
        ctx.beginPath(); ctx.moveTo(-34, 2); ctx.quadraticCurveTo(0, -10, 34, 2);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
        continue;
      }

      // idle：睁眼 / 眨眼
      if (blink > 0.7) {
        // 闭眼弯月弧
        ctx.beginPath(); ctx.moveTo(-34, 4); ctx.quadraticCurveTo(0, 16, 34, 4);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
      } else {
        // 眼白完整
        ellipse(ctx, 0, 0, 38, 42, '#FFFFFF', C.outline, 3);
        // 虹膜（略小，留足眼白）
        ellipse(ctx, 0, 4, 28, 32, C.iris, null);
        // 虹膜上半深色
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 4, 28, Math.PI, 0); ctx.closePath(); ctx.clip();
        ellipse(ctx, 0, 4, 28, 32, C.irisTop, null);
        ctx.restore();
        // 瞳孔
        ellipse(ctx, 0, 6, 12, 16, C.pupil, null);
        // 双层高光
        ellipse(ctx, -10, -8, 9, 9, '#FFFFFF', null);
        ellipse(ctx, 10, 14, 4.5, 4.5, '#FFFFFF', null);
        ellipse(ctx, -7, 18, 2.5, 2.5, '#FFFFFF', null);
        // 上眼睑沿眼白上缘，不再用超半径大圆弧
        ctx.beginPath(); ctx.moveTo(-37, -6); ctx.quadraticCurveTo(0, -46, 37, -6);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- 嘴 ----------
  function drawMouth(ctx, C, state) {
    if (state === 'idle') {
      line(ctx, [186, 340, 200, 348, 214, 340], C.outline, 2.5);
    } else if (state === 'facepalm') {
      line(ctx, [188, 344, 196, 340, 204, 344, 212, 340], C.outline, 2.5);
    } else if (state === 'pet') {
      // ω 猫嘴：满足时的小猫口（2026-11-20 触摸互动升级）
      ctx.beginPath();
      ctx.moveTo(184, 341);
      ctx.quadraticCurveTo(192, 350, 200, 341);
      ctx.quadraticCurveTo(208, 350, 216, 341);
      ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    } else {
      // clap / cheer：张嘴笑
      ctx.beginPath();
      ctx.moveTo(184, 338); ctx.quadraticCurveTo(200, 366, 216, 338);
      ctx.quadraticCurveTo(200, 344, 184, 338); ctx.closePath();
      ctx.fillStyle = C.outline; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(192, 350); ctx.quadraticCurveTo(200, 344, 208, 350);
      ctx.quadraticCurveTo(200, 356, 192, 350); ctx.closePath();
      ctx.fillStyle = C.pink; ctx.fill();
    }
  }

  // ---------- 前爪 ----------
  // 2026-11-20 真机反馈「缺少手？」：爪其实一直在（全身立绘各状态都有），但太小且无细节，
  // 观感弱 → 提取独立函数 + 加趾缝两道（furShade 短弧），并让毛笔握进右爪（见 drawBrushHeld）
  function drawClaw(ctx, C, x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    ellipse(ctx, 0, 0, 34, 22, C.fur, C.outline, 3);
    ellipse(ctx, 0, 7, 26, 13, C.cream, null);
    // 趾缝：肉垫上两道短弧，让"小手"可读
    line(ctx, [-10, 4, -6, 11], C.furShade, 2);
    line(ctx, [6, 11, 10, 4], C.furShade, 2);
    ctx.restore();
  }

  // 握持毛笔：笔杆从右爪中心穿出（先画杆、后叠爪 = 握住的效果），随爪位移动（踩奶时笔跟着晃）
  function drawBrushHeld(ctx, C, hx, hy) {
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(0.5);
    // 笔杆（金竹）：爪为轴向上伸出
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(-5, -110, 10, 116); ctx.fill(); ctx.stroke();
    // 朱砂笔箍
    ctx.fillStyle = C.sash;
    ctx.beginPath(); ctx.rect(-6.5, -16, 13, 11); ctx.fill(); ctx.stroke();
    // 笔头墨尖（向下触地）
    ctx.beginPath(); ctx.moveTo(-8, -5); ctx.quadraticCurveTo(0, 36, 8, -5); ctx.closePath();
    ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
  }

  function drawArms(ctx, C, state, t) {
    if (state === 'idle') {
      drawClaw(ctx, C, 150, 494, -0.1);
      drawBrushHeld(ctx, C, 250, 494);   // 毛笔握在右爪（杆先画、爪后叠 = 握住）
      drawClaw(ctx, C, 250, 494, 0.1);
    } else if (state === 'clap') {
      var tap = Math.abs(Math.sin(t * 8)) * 12;
      drawClaw(ctx, C, 200 - 16 - tap, 372, -0.5); drawClaw(ctx, C, 200 + 16 + tap, 372, 0.5);
      // 拍击星光
      ctx.globalAlpha = 0.8;
      line(ctx, [200, 350, 200, 336], C.gold, 3);
      ctx.globalAlpha = 1;
    } else if (state === 'facepalm') {
      drawClaw(ctx, C, 252, 296, -0.9); // 右爪捂脸
      drawClaw(ctx, C, 168, 494, -0.1);
    } else if (state === 'pet') {
      // 踩奶：被摸舒服时前爪交替轻揉，毛笔握在右爪跟着晃
      var knead = Math.sin(t * 5) * 6;
      drawClaw(ctx, C, 150, 478 + knead, -0.3);
      drawBrushHeld(ctx, C, 250, 478 - knead);
      drawClaw(ctx, C, 250, 478 - knead, 0.3);
    } else { // cheer
      var lift = Math.sin(t * 6) * 8;
      drawClaw(ctx, C, 126, 350 + lift, -0.7); drawClaw(ctx, C, 274, 350 + lift, 0.7);
    }
  }

  // ---------- 毛笔（斜靠：仅举手/捂脸等爪腾不出的状态） ----------
  function drawBrush(ctx, C) {
    ctx.save();
    ctx.translate(322, 470); ctx.rotate(-0.42);
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(-5, -70, 10, 78); ctx.fill(); ctx.stroke();
    // 笔头墨尖
    ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(0, 40, 8, 8); ctx.closePath();
    ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
  }

  // ---------- 撒花粒子 ----------
  function drawPetals(ctx, C, t) {
    for (var i = 0; i < 18; i++) {
      var speed = 55 + rnd(i) * 70;
      var y = ((t * speed + rnd(i + 50) * 600) % 620) - 60;
      var x = 40 + rnd(i + 10) * 320 + Math.sin(t * 2 + i) * 16;
      var a = t * 3 + i;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.globalAlpha = 0.9;
      ellipse(ctx, 0, 0, 7, 4, C.petal[i % C.petal.length], null);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 主绘制 ----------
  // opt: { state, t, theme, x, y, scale }
  function draw(ctx, opt) {
    opt = opt || {};
    var state = STATES.indexOf(opt.state) >= 0 ? opt.state : 'idle';
    var t = opt.t || 0;
    var C = THEMES[opt.theme] || THEMES.guofeng;
    var scale = opt.scale == null ? 1 : opt.scale;

    ctx.save();
    ctx.translate(opt.x || 0, opt.y || 0);
    ctx.scale(scale, scale);

    // 呼吸浮动
    var breath = Math.sin(t * 3) * 3;
    ctx.translate(0, breath);

    // 眨眼（idle 专用，约每 3.6s 一次）
    var blink = 0;
    if (state === 'idle') {
      var p = t % 3.6;
      if (p < 0.13) blink = Math.sin(p / 0.13 * Math.PI);
    }

    drawTail(ctx, C, state, t);
    drawBody(ctx, C);
    drawHead(ctx, C, state, blink, t);
    drawArms(ctx, C, state, t);
    // 毛笔：idle/pet 已握在右爪（drawArms 内），其余状态爪腾不出 → 斜靠身侧
    if (state !== 'idle' && state !== 'pet') drawBrush(ctx, C);
    if (state === 'cheer') drawPetals(ctx, C, t);

    ctx.restore();
  }

  var api = { draw: draw, THEMES: THEMES, STATES: STATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TigerRenderer = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

});
__reg("js/ui/tiger.js", function (module, exports, require) {
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

});
__reg("js/ui/pet.js", function (module, exports, require) {
'use strict';
/**
 * 小诗童触摸互动（2026-11-20 用户需求；同日二版升级「再生动一些」）：
 * 摸头 / 摸肚子 / 挠脚（对局页半身像为头/爪两区）。
 *
 * 二版动作设计（像摸小猫）：
 *  - 摸头「贴手蹭」：歪头贴向手指 + 轻揉微摆（往手心蹭的劲），持续 1.5s；
 *    渲染器 'pet' 状态同步眯眼 + ω 猫嘴 + 耳朵轻抖 + 前爪踩奶 + 尾巴慢摇；
 *  - 摸肚「扭一扭」：左右摇摆 + 挤压弹性（squash/stretch），配合波纹与软喵；
 *  - 挠脚「先蹲后蹬」：先下蹲蓄力 0.1s 再弹起蹬腿，像被挠痒的猫，星花迸开。
 *
 * 设计约束：
 *  - 零图片零音频资产：反馈 = 程序化粒子 + 小幅 transform；声音走 sound.js 合成萌音；
 *  - offset() 返回 {dx,dy,rot,sx,sy}，屏侧以盒底立足点为支点做 rotate+scale；
 *  - 冷却按区：头 450ms（连续撸猫节奏）/ 其余 600ms；不同区可即时切换；
 *  - 玩家决策热区（按钮/选项/字块）优先：pet 热区一律追加在各屏 hotRects 末尾，
 *    且按下态 tint 跳过 pet.*（摸头时罩黑不萌）。
 */

const COOLDOWN_HEAD = 0.45;             // 摸头：短冷却，支持连续撸
const COOLDOWN_OTHER = 0.6;             // 其余部位
const LIFE = { head: 1.5, belly: 1.1, foot: 1.0, paw: 1.0 };  // 各区动画时长

/**
 * 由小虎可见盒算互动热区。
 * @param {'full'|'bust'} kind full=全身立绘（首页/结算：头/肚/脚）；bust=对局半身窗（头/爪）
 * @param {{x:number,y:number,w:number,h:number}} box 小虎在屏幕上的可见盒
 *        full: w=400*scale, h=560*scale；bust: 直接传 bustWin
 * @returns {Array<{id:string,x:number,y:number,w:number,h:number}>}
 */
function petZones(kind, box) {
  if (kind === 'bust') {
    // 半身窗原生 (40,44,320,346)：头 44–290（占窗 0–0.71），爪 296–372（0.73–1）
    return [
      { id: 'pet.head', x: box.x, y: box.y, w: box.w, h: box.h * 0.68 },
      { id: 'pet.paw', x: box.x + box.w * 0.12, y: box.y + box.h * 0.68, w: box.w * 0.76, h: box.h * 0.32 },
    ];
  }
  // 全身原生高 560：头 60–380（≈0–0.57），身/肚 380–470（0.57–0.74），脚/尾 470–560（0.74–1）
  return [
    { id: 'pet.head', x: box.x, y: box.y, w: box.w, h: box.h * 0.54 },
    { id: 'pet.belly', x: box.x + box.w * 0.18, y: box.y + box.h * 0.54, w: box.w * 0.64, h: box.h * 0.22 },
    { id: 'pet.foot', x: box.x + box.w * 0.12, y: box.y + box.h * 0.76, w: box.w * 0.76, h: box.h * 0.24 },
  ];
}

const ZONE_LIFE = z => LIFE[z] || 1.0;

/** 每屏一个实例 */
function create() {
  let fx = null;          // {zone, t, cx, cy, scale, dir}
  let coolZone = null;    // 冷却中的部位 id
  let coolT = 0;          // 冷却剩余秒
  let box = null;         // 当前小虎可见盒（供特效锚点）
  let dir = 1;            // 蹭的方向（交替，左右歪头有变化）

  return {
    petZones,   // 模块级函数挂到实例上，屏侧统一走 pet.* 一个命名空间
    /** 各屏 build/enter 时同步小虎盒 */
    setBox(b) { box = b; },

    /**
     * 触发互动。命中冷却或动画未结束时返回 false（屏据此决定是否发声/埋点）。
     * @param {'head'|'belly'|'foot'|'paw'} zone
     */
    trigger(zone) {
      if (!box) return false;
      const cool = zone === 'head' ? COOLDOWN_HEAD : COOLDOWN_OTHER;
      if (coolT > 0 && coolZone === zone) return false;
      coolZone = zone;
      coolT = cool;
      dir = -dir;
      // 特效锚点（屏幕坐标）：头=盒顶中心，肚=盒中心，脚/爪=盒底中心
      const anchor = zone === 'head' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.16 }
        : zone === 'belly' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.62 }
        : { x: box.x + box.w / 2, y: box.y + box.h * 0.88 };
      fx = { zone, t: 0, x: anchor.x, y: anchor.y, scale: box.h / 560, dir };
      return true;
    },

    update(dt) {
      if (coolT > 0) { coolT -= dt; if (coolT <= 0) { coolT = 0; coolZone = null; } }
      if (fx) { fx.t += dt; if (fx.t > ZONE_LIFE(fx.zone)) fx = null; }
    },

    /** 离屏清理（动画/冷却全部归零） */
    reset() { fx = null; coolZone = null; coolT = 0; },

    /** 互动进行中屏侧应给小虎 'pet' 状态（眯眼/ω嘴/踩奶），否则返回 null 用原状态 */
    stateOverride() { return fx ? 'pet' : null; },

    /**
     * 小虎绘制 transform（区内衰减，之外归零）。
     *  - head 贴手蹭：缓入缓出的持续歪头（rot+dx 同向"贴向手指"）+ 9Hz 轻揉微摆；
     *  - belly 扭一扭：摇摆 2 个来回 + 底部 squash 挤压；
     *  - foot/paw 先蹲后蹬：0.16 相位下蹲（dy 下沉 + 压扁），随后蹬腿弹起（拉长 + 歪身）。
     * 返回 {dx,dy,rot,sx,sy}，sx/sy=1 时屏侧可跳过 scale。
     */
    offset() {
      if (!fx) return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
      const z = fx.zone, p = Math.min(fx.t / ZONE_LIFE(z), 1), sc = fx.scale, d = fx.dir;
      if (z === 'head') {
        // 包络：0–0.2 贴上去，0.2–0.72 保持（含轻揉），0.72–1 松开回正
        let env;
        if (p < 0.2) env = Math.sin((p / 0.2) * Math.PI / 2);
        else if (p < 0.72) env = 1;
        else env = Math.sin(((1 - p) / 0.28) * Math.PI / 2);
        const rub = Math.sin(fx.t * 9) * 0.02 * env;   // 轻揉微摆（往手心蹭）
        return { dx: d * 5 * env, dy: 0, rot: d * 0.075 * env + rub, sx: 1, sy: 1 };
      }
      if (z === 'belly') {
        const decay = 1 - p * 0.6;
        const sq = Math.sin(p * Math.PI * 3) * (1 - p);
        return {
          dx: 0,
          dy: Math.sin(p * Math.PI * 2) * 2.5 * decay,
          rot: Math.sin(p * Math.PI * 4) * 0.06 * decay,
          sx: 1 + 0.035 * sq,      // 挤压时横宽纵扁（体积守恒近似）
          sy: 1 - 0.05 * sq,
        };
      }
      // foot / paw：先蹲后蹬
      if (p < 0.16) {
        const q = p / 0.16;
        return { dx: 0, dy: 5 * sc * q, rot: 0, sx: 1 + 0.04 * q, sy: 1 - 0.06 * q };
      }
      const q = Math.min((p - 0.16) / 0.5, 1);
      const jump = Math.sin(q * Math.PI);
      return {
        dx: 0,
        dy: -14 * sc * jump,
        rot: d * 0.09 * jump,
        sx: 1 - 0.03 * jump,
        sy: 1 + 0.05 * jump,      // 蹬起瞬间拉长
      };
    },

    /**
     * 叠加特效（在各屏绘制完小虎后调用）。
     * head=心心+音符上浮 / belly=波纹扩散+音符 / foot·paw=星花迸开。
     * 全程 alpha ≤0.9、数量 ≤4，与四季粒子同一量级，不构成性能负担。
     */
    draw(ctx) {
      if (!fx) return;
      const p = Math.min(fx.t / ZONE_LIFE(fx.zone), 1);
      const fade = 1 - p;
      ctx.save();
      if (fx.zone === 'head') {
        // 3 个心心/音符错峰上浮
        const marks = ['♥', '♪', '♥'];
        for (let i = 0; i < 3; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.6 - i * 0.18));
          if (lp <= 0 || lp >= 1) continue;
          const sway = Math.sin(lp * Math.PI * 2 + i * 2) * 6;
          ctx.globalAlpha = (1 - lp) * 0.9;
          ctx.fillStyle = i === 1 ? 'rgba(184,115,51,0.9)' : 'rgba(214,69,69,0.85)';
          ctx.font = Math.round(13 + fx.scale * 8) + 'px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(marks[i], fx.x + (i - 1) * 16 * fx.scale * 3 + sway, fx.y - 14 - lp * 26 * fx.scale * 3);
        }
      } else if (fx.zone === 'belly') {
        // 两圈波纹从肚心扩散 + 一个音符飘出
        for (let i = 0; i < 2; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.5 - i * 0.25));
          if (lp <= 0) continue;
          ctx.globalAlpha = (1 - lp) * 0.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, (8 + lp * 26) * fx.scale * 3, 0, Math.PI * 2);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(184,115,51,0.8)'; ctx.stroke();
        }
        const lp2 = Math.max(0, Math.min(1, p * 1.3 - 0.1));
        if (lp2 > 0 && lp2 < 1) {
          ctx.globalAlpha = (1 - lp2) * 0.85;
          ctx.fillStyle = 'rgba(184,115,51,0.9)';
          ctx.font = Math.round(12 + fx.scale * 7) + 'px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('♪', fx.x + 20 * fx.scale * 3, fx.y - 10 - lp2 * 20 * fx.scale * 3);
        }
      } else {
        // 4 道星花（短线十字）从底心迸开 + 中央一个小「!」跳字
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2;
          const r0 = 6 * fx.scale * 3, r1 = (6 + p * 16) * fx.scale * 3;
          ctx.globalAlpha = fade * 0.8;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
          ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,195,60,0.9)'; ctx.stroke();
        }
        if (p > 0.12 && p < 0.5) {
          ctx.globalAlpha = (1 - (p - 0.12) / 0.38) * 0.9;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round(14 + fx.scale * 8) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', fx.x, fx.y - 26 * fx.scale * 3);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    /** 测试/调试钩子 */
    _fx() { return fx; },
  };
}

module.exports = { petZones, create, COOLDOWN_HEAD, COOLDOWN_OTHER, LIFE };

});
__reg("js/ui/ink.js", function (module, exports, require) {
'use strict';
/**
 * 水墨共享烘焙资产（2026-11-19 展示升级①②公共零件，docs §4.22）
 * 纸纹 / 茶渍 / 烛光 / 印章 / 朱批笔触 / 季节粒子——全部离屏烘焙一次复用。
 *
 * 设计红线（UI 评审定稿）：
 * - 「书写感」放叙事时刻（出句/反馈），「效率感」留选择时刻（四选一横排不动）；
 * - battle 决策期零干扰：氛围层只进静态烘焙，粒子动效仅 home/result；
 * - 稳态每帧 draw 调用恒定：动画播完即「烙印」为单次 drawImage；
 * - 低端机（benchmarkLevel ≤ 15）降档；Node/无离屏环境全部 null/false 安全。
 */
const platform = require('../platform');

// ---------------- 季节（tokens 语义组的轻量实现，随月份自动换季） ----------------
function seasonOf(month) {
  const m = month != null ? month : new Date().getMonth(); // 0-11
  if (m <= 1 || m === 11) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/** 设备分档 → 粒子数（低端 6 / 中端 10 / 高端 14） */
function particleCount(tier) {
  return [6, 10, 14][tier] || 10;
}

function _rng(seed) {
  let x = (seed || 20261119) >>> 0;
  return function () {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0xFFFFFFFF;
  };
}

// ---------------- 氛围层（进各屏静态烘焙，零每帧成本） ----------------

/** 纸纹 tile：128×128 噪点 + 纤维丝 → createPattern 平铺（strength: home 0.5 / battle 1.0） */
function bakePaperTexture(g, W, H, strength, seed) {
  const s = strength == null ? 1 : strength;
  if (s <= 0 || W <= 0 || H <= 0) return false;
  try {
    const tile = platform.createOffscreen(128, 128);
    if (!tile) return false;
    const tg = tile.getContext('2d');
    if (!tg) return false;
    const rnd = _rng(seed || 20261119);
    for (let i = 0; i < 150; i++) {
      tg.fillStyle = i % 2 ? 'rgba(43,35,29,0.10)' : 'rgba(255,252,240,0.12)';
      tg.fillRect(rnd() * 128, rnd() * 128, 1 + rnd(), 1 + rnd());
    }
    for (let i = 0; i < 26; i++) {
      tg.fillStyle = 'rgba(43,35,29,0.05)';
      tg.fillRect(rnd() * 128, rnd() * 128, 4 + rnd() * 14, 0.8);
    }
    if (typeof g.createPattern !== 'function') return false;
    const pat = g.createPattern(tile, 'repeat');
    if (!pat) return false;
    g.save();
    g.globalAlpha = 0.55 * s;
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.restore();
    return true;
  } catch (e) { return false; }
}

/** 陈年茶渍：三团暖褐径向渐变错落（alpha ≤0.05，不吃正文对比度） */
function bakeTeaStains(g, W, H) {
  try {
    if (typeof g.createRadialGradient !== 'function') return false;
    const spots = [
      [W * 0.12, H * 0.16, Math.min(W, H) * 0.26],
      [W * 0.92, H * 0.55, Math.min(W, H) * 0.20],
      [W * 0.30, H * 0.94, Math.min(W, H) * 0.22],
    ];
    for (let i = 0; i < spots.length; i++) {
      const x = spots[i][0], y = spots[i][1], r = spots[i][2];
      const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
      grad.addColorStop(0, 'rgba(150,104,60,0.050)');
      grad.addColorStop(0.7, 'rgba(150,104,60,0.025)');
      grad.addColorStop(1, 'rgba(150,104,60,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return true;
  } catch (e) { return false; }
}

/** 烛光：暖光斑（静态版进烘焙；呼吸版调用方每帧叠 delta） */
function bakeCandleGlow(g, x, y, r, alpha) {
  try {
    if (typeof g.createRadialGradient !== 'function') return false;
    const grad = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(242,180,90,' + (alpha) + ')');
    grad.addColorStop(1, 'rgba(242,180,90,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    return true;
  } catch (e) { return false; }
}

// ---------------- 印章（印泥红底 + 白字 + 侵蚀噪点；换字复用） ----------------
function _rrectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 烘焙印章 sprite。text 1-2 字（「妙」/「对」/「雪耻」）。
 * 侵蚀噪点用 destination-out 打斑——同一逻辑换字即得新章。
 * @returns 离屏 canvas | null（无离屏环境调用方跳过盖章动画）
 */
function bakeSeal(text, size, inkDark, fgLight) {
  try {
    const t = String(text || '妙').slice(0, 2);
    const cv = platform.createOffscreen(size, size);
    if (!cv) return null;
    const g = cv.getContext('2d');
    if (!g) return null;
    const rnd = _rng(t.charCodeAt(0) * 7919 + (t.charCodeAt(1) || 0) * 131);
    // 印泥红底：径向渐变 + 圆角
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, inkDark || '#C9372C');
    grad.addColorStop(1, '#A52418');
    _rrectPath(g, size * 0.06, size * 0.06, size * 0.88, size * 0.88, size * 0.14);
    g.fillStyle = grad; g.fill();
    // 侵蚀斑驳（印泥不匀）
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 42; i++) {
      g.globalAlpha = 0.35 + rnd() * 0.5;
      g.fillRect(rnd() * size, rnd() * size, 0.8 + rnd() * 2.2, 0.8 + rnd() * 2.2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // 白字（1 字大、2 字小）
    const fs = Math.round(size * (t.length > 1 ? 0.40 : 0.58));
    g.font = '700 ' + fs + 'px serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fgLight || '#FFF9EC';
    g.fillText(t, size / 2, size / 2 + size * 0.02);
    // 字面轻蚀（年代感）
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.18 + rnd() * 0.2;
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return cv;
  } catch (e) { return null; }
}

// ---------------- 朱批笔触（贝塞尔飞白，整条烘焙 → 播放时 clip 揭开） ----------------
/**
 * 烘焙一条从左到右的朱批笔触。宽度包络：起笔细 → 中段粗 → 收笔飞白分叉。
 * @param color 笔触色（正常 rgba(201,55,44,.85) / 雪耻金）
 * @param paper 纸色（飞白挖条用）
 */
function bakeStroke(w, h, color, paper) {
  try {
    const cw = Math.ceil(w), ch = Math.ceil(h);
    if (cw < 40 || ch < 12) return null;
    const cv = platform.createOffscreen(cw, ch);
    if (!cv) return null;
    const g = cv.getContext('2d');
    if (!g) return null;
    const y0 = ch / 2;
    const P0 = { x: 2, y: y0 + ch * 0.20 };
    const C = { x: cw * 0.5, y: y0 - ch * 0.34 };
    const P1 = { x: cw - 2, y: y0 + ch * 0.12 };
    const bez = tt => {
      const a = (1 - tt) * (1 - tt), b = 2 * tt * (1 - tt), cc = tt * tt;
      return { x: a * P0.x + b * C.x + cc * P1.x, y: a * P0.y + b * C.y + cc * P1.y };
    };
    const dbez = tt => {
      const dx = 2 * (1 - tt) * (C.x - P0.x) + 2 * tt * (P1.x - C.x);
      const dy = 2 * (1 - tt) * (C.y - P0.y) + 2 * tt * (P1.y - C.y);
      const L = Math.hypot(dx, dy) || 1;
      return { x: dx / L, y: dy / L };
    };
    const wt = tt => ch * 0.16 * (0.45 + 1.15 * Math.sin(Math.PI * Math.min(1, tt * 1.12))) * (1 - tt * 0.22);
    const N = 36;
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const tt = i / N;
      const p = bez(tt), dv = dbez(tt), hw = wt(tt) / 2;
      top.push([p.x - dv.y * hw, p.y + dv.x * hw]);
      bot.push([p.x + dv.y * hw, p.y - dv.x * hw]);
    }
    g.beginPath();
    g.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= N; i++) g.lineTo(top[i][0], top[i][1]);
    for (let i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
    g.fillStyle = color;
    g.globalAlpha = 0.88;
    g.fill();
    // 飞白：3 条沿路径的纸色细笔道把实心撕开
    g.globalAlpha = 0.5;
    g.strokeStyle = paper || '#F5EFE0';
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * ch * 0.09 + ch * 0.03;
      g.lineWidth = 0.8 + k * 0.4;
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const tt = i / N, p = bez(tt), dv = dbez(tt);
        const x = p.x - dv.y * off, y = p.y + dv.x * off + Math.sin(tt * 9 + k) * 0.7;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    return cv;
  } catch (e) { return null; }
}

// ---------------- 季节粒子 sprite（translate/rotate only，低端机安全） ----------------
/**
 * @param kind seasonOf() 之值
 * @param dark 暗色主题降透明
 */
function bakeParticle(kind, dark) {
  try {
    const S = 16;
    const cv = platform.createOffscreen(S, S);
    if (!cv) return null;
    const g = cv.getContext('2d');
    if (!g) return null;
    const pal = {
      spring: ['#F3A7B6', '#E88494'],
      summer: ['#CBDCA8', '#AEC98E'],
      autumn: ['#E3A257', '#C9853F'],
      winter: ['#FFFFFF', '#E8EEF5'],
    }[kind] || ['#F3A7B6', '#E88494'];
    const baseA = dark ? 0.62 : 1;
    if (kind === 'winter') {
      // 雪粒：软边白点
      const grad = g.createRadialGradient(S / 2, S / 2, 0.5, S / 2, S / 2, 4);
      grad.addColorStop(0, 'rgba(255,255,255,' + (0.95 * baseA) + ')');
      grad.addColorStop(1, 'rgba(232,238,245,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(S / 2, S / 2, 4, 0, Math.PI * 2); g.fill();
    } else {
      // 花瓣/柳絮/落叶：旋转椭圆 + 高光
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate(-0.5);
      g.globalAlpha = 0.92 * baseA;
      g.fillStyle = pal[1];
      g.beginPath(); g.ellipse(0, 0, 7, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.5 * baseA;
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(-1, -0.8, 4.5, 2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    return cv;
  } catch (e) { return null; }
}

module.exports = { seasonOf, particleCount, bakePaperTexture, bakeTeaStains, bakeCandleGlow, bakeSeal, bakeStroke, bakeParticle };

});
__reg("js/app/store.js", function (module, exports, require) {
'use strict';
/**
 * 应用状态：设置（适老字号 / 主题 / 减弱动效）+ 战绩持久化
 * v0.1：设置按钮一级可见、不做二级菜单（10_ui_spec.md H-03）——
 *       点按在字号 1.0/1.25/1.5 间循环并弹 toast；主题与减弱动效开关 v0.2 接入。
 */
const platform = require('../platform');

const KEY_SETTINGS = 'settings';
const KEY_RECORD = 'record';
const KEY_FIRST = 'firstRun';
const KEY_TUTORIAL = 'tutorialDone';
const KEY_GRUDGE = 'grudge';

// difficulty：难度档（用户口径 2026-11-18「按熟悉程度分级」）——
// easy 默认：核心名句层 + 优先五言 + 15s 决策期 + 新手 AI；normal：10s / 困难 AI
// mode：P0-3 起首页只有一个主按钮，玩法模式降为二级 chip（默认择句——P0-1 后它才是真玩法）
// sound：P0-5 音效开关，默认开
const DEFAULT_SETTINGS = { fontScale: 1.0, theme: 'light', reduceMotion: false, difficulty: 'easy', mode: 'choice', sound: true };
const DEFAULT_RECORD = { games: 0, wins: 0, losses: 0, draws: 0, bestCombo: 0, totalHits: 0, bestAvgReact: null, recentKeywords: [] };

function loadSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, platform.storageGet(KEY_SETTINGS, {}));
}
function saveSettings(s) { platform.storageSet(KEY_SETTINGS, s); }

function loadRecord() {
  return Object.assign({}, DEFAULT_RECORD, platform.storageGet(KEY_RECORD, {}));
}
function saveRecord(r) { return platform.storageSet(KEY_RECORD, r); }

/** 最近几局用过的令字（供开局排除，防「题目会重复」体感） */
function recentKeywords() {
  const r = loadRecord();
  return Array.isArray(r.recentKeywords) ? r.recentKeywords : [];
}

/** 对局结算 → 累计战绩；返回是否保存成功（失败走上层「战绩未保存」细条） */
function applyOutcome(outcome) {
  // 教学局不计战绩、不入仇册（§4.19 定稿口径，此处补上实际短路——原实现漏了）
  if (outcome && outcome.tutorial) return true;
  const r = loadRecord();
  r.games++;
  if (outcome.result === 'win') r.wins++;
  else if (outcome.result === 'loss') r.losses++;
  else r.draws++;
  r.bestCombo = Math.max(r.bestCombo, outcome.stats.maxCombo || 0);
  r.totalHits += outcome.stats.hits || 0;
  if (outcome.stats.avgReact != null && outcome.stats.avgReact > 0) {
    r.bestAvgReact = r.bestAvgReact == null ? outcome.stats.avgReact : Math.min(r.bestAvgReact, outcome.stats.avgReact);
  }
  // 记录最近 2 局令字（下一局开局排除，避免连续同字）
  const kw = outcome.stats && outcome.stats.keyword;
  if (kw) {
    const list = Array.isArray(r.recentKeywords) ? r.recentKeywords.filter(k => k !== kw) : [];
    list.unshift(kw);
    r.recentKeywords = list.slice(0, 2);
  }
  const ok = saveRecord(r);
  // 错句复仇（2026-11-19 PM 唯一推荐概念）：错句入册 + 本局雪耻回写
  const rev = outcome.stats && outcome.stats.revenge;
  if (rev) {
    if (Array.isArray(rev.newGrudge) && rev.newGrudge.length) addGrudgeLines(rev.newGrudge, r.games);
    if (Array.isArray(rev.killedTexts) && rev.killedTexts.length) markGrudgeAvenged(rev.killedTexts);
  }
  return ok;
}

// ---------------- 仇册（错句复仇 MVP，2026-11-19） ----------------
// 条目：{ text, addedAt, avenged, ts }——text 为玩家失手回合的正解真句（库内、含当局令字）。
// addedAt = 入册时的局数（record.games）；「满 3 局才甩」= 当前局数 - addedAt >= 2。
const GRUDGE_MAX = 30;
const GRUDGE_RIPE_GAP = 2;

function loadGrudge() {
  const g = platform.storageGet(KEY_GRUDGE, []);
  return Array.isArray(g) ? g : [];
}
function saveGrudge(list) {
  // 超上限：未雪耻的优先保留（雪耻过的是已翻篇的历史，可弃）
  if (list.length > GRUDGE_MAX) {
    const un = list.filter(e => !e.avenged);
    const av = list.filter(e => e.avenged);
    list = un.concat(av).slice(0, GRUDGE_MAX);
  }
  return platform.storageSet(KEY_GRUDGE, list);
}
/** 错句入册（按句文本去重）；返回实际新增条数 */
function addGrudgeLines(lines, games) {
  const g = loadGrudge();
  let added = 0;
  for (const text of lines || []) {
    if (!text || g.some(e => e.text === text)) continue;
    g.push({ text, addedAt: games, avenged: false, ts: Date.now() });
    added++;
  }
  if (added) saveGrudge(g);
  return added;
}
/** 雪耻回写：标记这些句为已翻篇 */
function markGrudgeAvenged(texts) {
  const set = new Set(texts || []);
  const g = loadGrudge();
  let changed = false;
  for (const e of g) {
    if (!e.avenged && set.has(e.text)) { e.avenged = true; changed = true; }
  }
  if (changed) saveGrudge(g);
  return changed;
}
/** 已熟成待甩的错句（未雪耻 + 入册满 3 局）——供 Match 出句加权 */
function grudgeRipe() {
  const games = loadRecord().games;
  return loadGrudge()
    .filter(e => !e.avenged && games - e.addedAt >= GRUDGE_RIPE_GAP)
    .map(e => e.text);
}
/** 仇册状态摘要（首页战绩签 / 结算页展示用） */
function grudgeSummary() {
  const g = loadGrudge();
  return { total: g.length, pending: g.filter(e => !e.avenged).length };
}

function isFirstRun() {
  return platform.storageGet(KEY_FIRST, true) === true;
}
function markFirstRunDone() { platform.storageSet(KEY_FIRST, false); }

/** 教学局是否已完成（P0-3：首局走 3 回合教学局，完成后不再出现） */
function isTutorialDone() { return platform.storageGet(KEY_TUTORIAL, false) === true; }
function markTutorialDone() { platform.storageSet(KEY_TUTORIAL, true); }

module.exports = { loadSettings, saveSettings, loadRecord, saveRecord, applyOutcome, recentKeywords, isFirstRun, markFirstRunDone, isTutorialDone, markTutorialDone, loadGrudge, saveGrudge, addGrudgeLines, markGrudgeAvenged, grudgeRipe, grudgeSummary, GRUDGE_MAX, DEFAULT_RECORD };

});
__reg("js/app/sound.js", function (module, exports, require) {
'use strict';
/**
 * 最小音效集（P0-5）：落子 / 接对 / 失手 —— 三音，零音频资产、零授权风险。
 *
 * 为什么是程序化合成而不是音频文件：
 *   ① 小游戏主包体积敏感（当前 222KB，一个 2s 古筝 mp3 就要 40–80KB）；
 *   ② 免版税素材仍需留存授权链，合成音无版权瑕疵；
 *   ③ 三音都是极短音（≤0.3s），合成听感足够（木质敲击 / 琴弦拨奏 / 下行气声）。
 *
 * 平台：微信 wx.createWebAudioContext()（基础库 2.10.0+）；浏览器预览 window.AudioContext。
 * 铁律：任何一步失败（无 API / 上下文创建失败 / 节点异常）一律静默降级为无声——
 *       音效永远不该阻断玩法，也不该在控制台刷错误。
 *
 * 2026-11-20 触摸互动升级（小老虎"本身的声音"要软萌）：
 *   - note 第 6 位可选 opts：{ attack, vibHz, vibDepth, amHz, amDepth }
 *     attack=软起振秒；vib*=颤音（音高小幅摆动，猫喵的"抖"）；am*=振幅调制
 *     （26Hz 咕噜的"喉震"，真猫 purr 的本质就是 ~25Hz 的 AM）；
 *   - spec.overtone = { ratio, gain }：每个音符叠加一个 ratio 倍频副振荡器
 *     （拟"嗓音"的共振峰质感，gain 为相对主音的音量比）；
 *   - voice 标记：小老虎的叫声。发声期间其余玩法音让路（voiceUntil 门前）——
 *     背景声处理=优先级而不是混音，实现最简、无需总线。
 */

/**
 * 音色配方：notes = [起始频率, 延迟秒, 时长秒, 峰值音量, 终止频率?, opts?]
 *   pick 落子：三角波双击，像竹牌相碰（高频短促，不抢决策注意力）
 *   pass 接对：正弦五度上行（G5→D6），像拨了一下琴弦
 *   fail 失手：三角波下行（330→247），短促下沉，不刺耳、不惩罚感
 */
const SFX = {
  pick: { type: 'triangle', notes: [[1180, 0, 0.07, 0.055], [1570, 0.012, 0.05, 0.028]] },
  pass: { type: 'sine', notes: [[784, 0, 0.24, 0.070], [1174, 0.085, 0.30, 0.060]] },
  fail: { type: 'triangle', notes: [[330, 0, 0.16, 0.065, 247], [247, 0.105, 0.22, 0.050, 196]] },
  // 小诗童叫声三连（2026-11-20 三版：「嗷呜」幼虎叫 + 音量加大）——
  // 「嗷呜」= 两段式元音滑动：先上扬（嗷）再回落拖长（呜），2 倍频泛音拟幼兽嗓音；
  // 峰值从 ≤0.07 提到 0.10–0.12（用户反馈"声音大一点"，仍低于玩法音 pass 0.07×包络的可闻峰）。
  // 摸头「嗷呜~」：满足长音——上扬 0.3s → 拖长回落带颤音，底部叠 92Hz 喉震低音（咕噜垫底）
  purr: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [260, 0, 0.30, 0.11, 540, { attack: 0.04, vibHz: 5, vibDepth: 8 }],
      [540, 0.28, 0.55, 0.095, 300, { attack: 0.03, vibHz: 5, vibDepth: 8 }],
      [92, 0.05, 0.70, 0.06, 84, { attack: 0.05, amHz: 26, amDepth: 0.8 }],
    ],
  },
  // 摸肚「嗷呜嗷」：连蹦两声半——嗷→呜→嗷，俏皮
  giggle: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [320, 0, 0.16, 0.11, 600, { attack: 0.02, vibHz: 6, vibDepth: 8 }],
      [600, 0.15, 0.15, 0.095, 400, { attack: 0.015 }],
      [400, 0.29, 0.18, 0.10, 640, { attack: 0.02, vibHz: 6, vibDepth: 8 }],
    ],
  },
  // 挠脚「嗷呜！」：被挠痒的惊叫——急上扬更高、回落更快
  chirp: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [300, 0, 0.17, 0.12, 820, { attack: 0.012 }],
      [820, 0.16, 0.22, 0.095, 340, { attack: 0.01, vibHz: 7, vibDepth: 10 }],
    ],
  },
};

let ac = null;          // AudioContext（懒创建：首次 play 才建，避免启动即占资源）
let failed = false;     // 环境不支持 / 异常 → 后续 play 直接快速返回
let enabled = true;     // 用户开关（默认开）
let voiceUntil = -1;    // 小叫声占线截止时刻（秒，ctx.currentTime 域）——其余音让路

/** 设置开关：tone 为假值即整局静音 */
function setEnabled(v) { enabled = !!v; }
function isEnabled() { return enabled; }

function ensureCtx() {
  if (ac || failed) return ac;
  try {
    if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
      ac = wx.createWebAudioContext();
    } else if (typeof AudioContext !== 'undefined') {
      ac = new AudioContext();
    } else if (typeof webkitAudioContext !== 'undefined') {
      ac = new webkitAudioContext();
    }
  } catch (e) { ac = null; }
  // 能力自检：缺 createOscillator/createGain 的上下文直接放弃（真机旧基础库）
  if (ac && (typeof ac.createOscillator !== 'function' || typeof ac.createGain !== 'function')) {
    ac = null;
  }
  if (!ac) failed = true;
  return ac;
}

/** 建一条振荡器（freq 起止 + 包络），返回是否成功。供主音/泛音复用 */
function spawnOsc(a, t0, dur, peak, freq, freqEnd, type, attackSec) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  if (!osc || !gain) return null;
  osc.type = type;
  try { osc.frequency.setValueAtTime(freq, t0); } catch (e) { osc.frequency.value = freq; }
  if (freqEnd && typeof osc.frequency.linearRampToValueAtTime === 'function') {
    osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
  }
  // 包络：软起振（默认 8ms）→ 指数衰减到接近 0（避免爆音与拖尾）
  const atk = attackSec || 0.008;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  return { osc, gain, atk };
}

/** 播一个音：kind ∈ pick | pass | fail | purr | giggle | chirp。返回是否真的发声 */
function play(kind) {
  if (!enabled) return false;
  const spec = SFX[kind];
  if (!spec) return false;
  const a = ensureCtx();
  if (!a) return false;
  try {
    const now = typeof a.currentTime === 'number' ? a.currentTime : 0;
    // 背景声处理：小老虎叫声占线时，其余玩法音让路（叫声不被混成背景）
    const total = Math.max.apply(null, spec.notes.map(n => n[1] + n[2]));
    if (!spec.voice && now < voiceUntil) return false;
    // iOS / 微信：上下文可能处于 suspended，需在用户手势链上 resume
    if (a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* resume 失败不阻断发声尝试 */ }
    }
    const ot = spec.overtone;
    for (const n of spec.notes) {
      const freq = n[0], delay = n[1], dur = n[2], peak = n[3], freqEnd = n[4];
      const opts = n[5] || {};
      const t0 = now + 0.01 + delay;
      const main = spawnOsc(a, t0, dur, peak, freq, freqEnd, spec.type, opts.attack);
      if (!main) continue;
      main.gain.connect(a.destination);
      main.osc.start(t0);
      main.osc.stop(t0 + dur + 0.02);
      // 泛音副振荡器：ratio 倍频 + 相对音量（拟嗓音质感），与主音同包络
      if (ot && typeof a.createOscillator === 'function') {
        const h = spawnOsc(a, t0, dur, peak * ot.gain, freq * ot.ratio,
          freqEnd ? freqEnd * ot.ratio : 0, spec.type, opts.attack);
        if (h) {
          h.gain.connect(a.destination);
          h.osc.start(t0);
          h.osc.stop(t0 + dur + 0.02);
        }
      }
      // 颤音（音高小幅摆动）：lfo → osc.frequency
      if (opts.vibHz) {
        try {
          const lfo = a.createOscillator(), lg = a.createGain();
          lfo.frequency.value = opts.vibHz;
          lg.gain.value = opts.vibDepth;
          lfo.connect(lg); lg.connect(main.osc.frequency);
          lfo.start(t0); lfo.stop(t0 + dur + 0.02);
        } catch (e) { /* 颤音失败不影响主音 */ }
      }
      // 振幅调制（喉震）：am lfo → gain.gain（26Hz 连通 96Hz 载波 = 猫咕噜）
      if (opts.amHz) {
        try {
          const am = a.createOscillator(), ag = a.createGain();
          am.frequency.value = opts.amHz;
          ag.gain.value = peak * opts.amDepth;
          am.connect(ag); ag.connect(main.gain.gain);
          am.start(t0); am.stop(t0 + dur + 0.02);
        } catch (e) { /* AM 失败不影响主音 */ }
      }
    }
    if (spec.voice) voiceUntil = now + total + 0.05;
    return true;
  } catch (e) {
    failed = true;   // 一次性失败即永久静音，别每帧重试
    return false;
  }
}

/** 测试钩子：注入假上下文（Node 无 WebAudio），不对外暴露于玩法代码 */
function _injectContext(ctx) { ac = ctx || null; failed = !ctx; voiceUntil = -1; }

module.exports = { play, setEnabled, isEnabled, SFX, _injectContext };

});
__reg("js/app/track.js", function (module, exports, require) {
'use strict';
/**
 * 最小埋点集（P0-4）—— 6 个事件，先把"能不能测"这件事解决。
 *
 * 事件契约（键名固定，mp 后台需按同名事件名逐条配置，否则 reportAnalytics 会被静默丢弃）：
 *   fhl_start  开局     mode(1择句/2字块) difficulty(1简/2难) tutorial(0/1) kw(令字索引)
 *   fhl_round  每回合   mode difficulty round kw ok(1/0) reason(枚举) ms(决策毫秒)
 *   fhl_end    局终     mode difficulty result(1胜/2负/3和) hits tiger rounds dur timeouts
 *   fhl_again  再来一局  tutorial(0/1)
 *   fhl_share  分享点击  result hits
 *   fhl_exit   退出     from(1对战返回/2切后台) round
 *   fhl_pet    摸小诗童 zone(1头/2肚/3脚/4爪) scr(1首页/2对局/3结算)
 *
 * 合规铁律（PM 明确要求）：只上报行为与数值，绝不上报任何可识别信息——
 * 无 openid、无昵称、无头像、无设备号、无位置。字符串字段一律截断到 32 字符。
 *
 * 双写策略：
 *   ① wx.reportAnalytics(name, payload)：官方自定义分析，键值只能是 string/number；
 *   ② 本地环形缓冲（≤200 条，仅内存）：调试与"埋点是否真的触发"的现场证据，
 *      dump() 可随时取出——不持久化，避免占用用户存储与合规风险。
 */
const platform = require('../platform');

const EVENTS = ['fhl_start', 'fhl_round', 'fhl_end', 'fhl_again', 'fhl_share', 'fhl_exit'];
const MAX = 200;
let buf = [];

/** 清洗：布尔 → 1/0；数字保留两位；字符串截断；其余丢弃（reportAnalytics 不接受对象） */
function clean(data) {
  const out = {};
  if (!data) return out;
  Object.keys(data).forEach(k => {
    const v = data[k];
    if (v === undefined || v === null) return;
    if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (typeof v === 'number') out[k] = isFinite(v) ? Math.round(v * 100) / 100 : 0;
    else if (typeof v === 'string') { if (v) out[k] = v.slice(0, 32); }
  });
  return out;
}

/**
 * 记录一个事件。name 必须是契约内事件（拼错的直接忽略，避免污染后台事件表）。
 * @returns {{t:number,e:string,d:object}|null}
 */
function track(name, data) {
  if (EVENTS.indexOf(name) === -1) return null;
  const payload = clean(data);
  const ev = { t: Date.now(), e: name, d: payload };
  buf.push(ev);
  if (buf.length > MAX) buf.shift();
  try {
    if (platform.isWx && typeof wx !== 'undefined' && typeof wx.reportAnalytics === 'function') {
      wx.reportAnalytics(name, payload);
    }
  } catch (e) { /* 埋点失败绝不阻断玩法 */ }
  try {
    // 浏览器预览控制台自检用；Node 测试环境（有 process）不打日志，避免污染断言输出
    if (!platform.isWx && typeof process === 'undefined' && typeof console !== 'undefined' && console.log) {
      console.log('[fhl][track]', name, JSON.stringify(payload));
    }
  } catch (e) { /* 无控制台环境忽略 */ }
  return ev;
}

/** 调试导出：本地缓冲快照（不含任何可识别信息） */
function dump() { return buf.map(e => ({ t: e.t, e: e.e, d: Object.assign({}, e.d) })); }
/** 测试用：清空缓冲 */
function reset() { buf = []; }
/** 某事件出现次数（测试/自检用） */
function count(name) { return buf.reduce((n, e) => n + (e.e === name ? 1 : 0), 0); }

module.exports = { track, dump, reset, count, clean, EVENTS };

});
__reg("js/ui/screens/home.js", function (module, exports, require) {
'use strict';
/**
 * 首页（10_ui_spec.md §3 · 2026-11-18 第四次改版：P0-3「首 90 秒」）
 * L0 静态层：宣纸底纹 + 月/远山/云雾景深 + 标题区 + 三枚设置 chip + 唯一主按钮 + 战绩签
 * L1 每帧：小虎全身立绘 idle（呼吸/眨眼）
 * L2 每帧：按下态 tint、首次引导呼吸环、战绩签 toast、花瓣
 *
 * 改版理由（PM 评估 ⑤ 结论）：原首页是「两个模式的说明书」——玩家要先读懂「点字成诗 / 择句接令」
 * 的差别才能开始，首局跳出率高。现在只有一个「开始对诗」，模式/难度/音效降为 chip：
 * 玩家不需要理解任何概念就能开始，第一次点击直接进入 3 回合教学局。
 *
 * 视觉原则（回应"小作坊廉价感"）：
 *   1. 少字：只留功能性短句，去营销词
 *   2. 有材质：宣纸颗粒 + 牌匾内高光 + 双线描边 + 角饰，替代纯色圆角块
 *   3. 有景深：三层山 + 云雾带 + 月晕，替代"两个装饰椭圆"
 */
const layout = require('../layout');
const d = require('../draw');
const { font, resolveTokens } = require('../tokens');
const tiger = require('../tiger');
const pet = require('../pet').create();
const ink = require('../ink');
const platform = require('../../platform');
const store = require('../../app/store');
const sound = require('../../app/sound');
const track = require('../../app/track');
const { T } = require('../tokens');

/** 确定性伪随机（宣纸颗粒用，保证每次烘焙一致） */
function grain(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** 牌匾角饰：四角 L 形细线 */
function cornerMarks(g, x, y, w, h, inset, len, color, lw) {
  g.strokeStyle = color; g.lineWidth = lw;
  g.beginPath();
  // 左上
  g.moveTo(x + inset, y + inset + len); g.lineTo(x + inset, y + inset); g.lineTo(x + inset + len, y + inset);
  // 右上
  g.moveTo(x + w - inset - len, y + inset); g.lineTo(x + w - inset, y + inset); g.lineTo(x + w - inset, y + inset + len);
  // 左下
  g.moveTo(x + inset, y + h - inset - len); g.lineTo(x + inset, y + h - inset); g.lineTo(x + inset + len, y + h - inset);
  // 右下
  g.moveTo(x + w - inset - len, y + h - inset); g.lineTo(x + w - inset, y + h - inset); g.lineTo(x + w - inset, y + h - inset - len);
  g.stroke();
}

/** 牌匾内高光：顶部渐隐白（clip 到牌匾路径，防止溢出圆角） */
function topGloss(g, x, y, w, h, alpha, r) {
  g.save();
  d.rrect(g, x, y, w, h, r); g.clip();
  const grd = d.makeVGrad(g, 0, y, y + h * 0.55, 'rgba(255,255,255,' + alpha + ')', 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(x, y, w, h * 0.55);
  g.restore();
}

/**
 * 分段 chip（模式 / 难度共用）：底槽 + 若干等宽段，选中段朱砂实底。
 * labels 2 段时 x 起点按宽/2 均分，与 layout.home 的热区切分严格一致。
 */
function segChip(g, box, labels, sel, c, S) {
  d.rrect(g, box.x, box.y, box.w, box.h, box.r);
  g.fillStyle = c.surface; g.fill();
  g.lineWidth = 1; g.strokeStyle = c.lineSoft; g.stroke();
  const segW = box.w / labels.length;
  labels.forEach((lb, i) => {
    const on = i === sel;
    if (on) {
      d.rrect(g, box.x + 2 + i * segW, box.y + 2, segW - 4, box.h - 4, box.r - 2);
      g.fillStyle = c.primary; g.fill();
    }
    d.text(g, lb, box.x + segW * (i + 0.5), box.y + box.h / 2 + 1,
      font(600, 14, 'sans'), on ? c.onBrand : c.fg2, { align: 'center' });
  });
}

function HomeScreen(app) {
  let L = null;           // 布局几何
  let L0 = null;          // 静态层离屏
  let pressed = null;     // 按下视觉 tint（计时过期只影响视觉）
  let pressDown = null;   // 按下热区 id（持续到 touchend——修复慢点按无响应）
  let bubbleT = -1;       // 首次引导呼吸环剩余时间
  let toast = null;       // {text, t}——不画悬浮黑气泡，在战绩签数据行轮换显示
  let recTap = 0;         // 战绩签点击轮换计数（仇册提示 ↔ 常规战绩）
  let envSprite = null;   // 季节粒子 sprite（进屏烘焙一次）
  let rec = null;         // 战绩缓存（烘焙/动态层共用）
  const self = {
    id: 'home',
    hotRects: [],
    enter() {
      build();
      // 没玩过教学局就一直引导到主按钮上（完成即消失，不打扰老用户）
      if (!store.isTutorialDone()) { bubbleT = 3; }
      else if (store.isFirstRun()) { bubbleT = 2; }
    },
    leave() { pet.reset(); },
    update(dt) {
      pet.update(dt);
      if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) store.markFirstRunDone(); }
      if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
      if (pressed) { pressed.t -= dt; if (pressed.t <= 0) pressed = null; }
    },
    draw(ctx, t) {
      const { c } = app.tokens;
      // 铺底：L0 可用则 drawImage，不可用直绘背景渐变
      const baked = d.drawBaked(ctx, L0, app.info.W, app.info.H, [c.bg, c.bgEnd]);
      if (!L) return; // 烘焙失败时跳过动态层，避免空引用连环炸
      // 离屏层不可用 → 静态内容整屏直绘（否则只剩小虎，真机黑屏事故根因）
      if (!baked) { L0 = null; drawStatic(ctx); }
      // L2 战绩签数据行（动态：点战绩签时轮换显示连胜纪录，替代悬浮气泡压小虎）
      if (toast || (rec && rec.games > 0)) {
        const ry = L.record.y + 12;
        const capText = toast ? toast.text : `累计 ${rec.games} 局 · 胜 ${rec.wins}`;
        d.text(ctx, capText, L.record.textX, ry + 44, font(400, T.scaled('caption', app.settings.fontScale), 'sans'), c.fg2,
          { maxW: L.record.w - (L.record.textX - L.record.x) - 44 });
      }
      // L1 小虎（2026-11-20 触摸互动：头/肚/脚三区反馈——摇头冒心心 / 摇摆波纹 / 弹跳星花）
      const tDraw = app.settings.reduceMotion ? 0.5 : t;
      const tg = L.tiger;
      const petOff = pet.offset();
      ctx.save();
      const pivX = tg.x + 400 * tg.scale / 2, pivY = tg.y + 560 * tg.scale;
      ctx.translate(pivX + petOff.dx, pivY + petOff.dy);
      ctx.rotate(petOff.rot);
      if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
      ctx.translate(-pivX, -pivY);
      tiger.fullBody(ctx, { cx: tg.x + 400 * tg.scale / 2, y0: tg.y, scale: tg.scale, state: pet.stateOverride() || 'idle', t: tDraw });
      ctx.restore();
      pet.draw(ctx);
      // L2 环境粒子（§4.22 展示②：季节 sprite——春花瓣/夏柳絮/秋落叶/冬雪粒；
      // 数量按设备分档 6/10/14；减弱动效冻结。sprite 烘焙失败回落旧 6 瓣椭圆）
      if (!app.settings.reduceMotion) {
        const sprite = envSprite || (envSprite = ink.bakeParticle(ink.seasonOf(), app.tokens.dark));
        const n = ink.particleCount(platform.deviceTier());
        for (let i = 0; i < n; i++) {
          const s0 = i * 97;
          const px = ((s0 * 13 + t * 14) % (app.info.W + 60)) - 30;
          const py = ((s0 * 29 + t * 20) % (app.info.H + 40)) - 20;
          const sway = Math.sin(t * 1.1 + i * 2.1) * 12;
          if (sprite) {
            ctx.save();
            ctx.translate(px + sway, py);
            ctx.rotate(Math.sin(t * 0.8 + i) * 0.5);
            ctx.drawImage(sprite, -8, -8, 16, 16);
            ctx.restore();
          } else {
            d.ell(ctx, px + sway, py, 6, 3.6, 'rgba(232,132,148,0.30)');
          }
        }
      }
      // 展示②：烛光呼吸（叠在静态基座上，±0.02 alpha · 4s 周期；减弱动效时静止）
      if (!app.settings.reduceMotion) {
        const glow = 0.02 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 4));
        d.ell(ctx, app.info.W * 0.86, app.info.H * 0.80, 110, 86, 'rgba(242,180,90,' + glow.toFixed(3) + ')');
      }
      // L2 首次引导：主按钮呼吸描边环（替代黄色气泡，不压小虎）
      if (bubbleT > 0) {
        const a2 = L.startBtn;
        const pulse = app.settings.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 1.4);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(201,55,44,' + (0.22 + 0.40 * pulse).toFixed(3) + ')';
        d.rrect(ctx, a2.x - 5, a2.y - 5, a2.w + 10, a2.h + 10, a2.r + 5);
        ctx.stroke();
      }
      // L2 按下态 tint
      if (pressed) {
        const r = rectOf(pressed.id);
        if (r) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(r[0], r[1], r[2], r[3]); }
      }
    },
    touch(phase, x, y) {
      if (phase === 'start') {
        const hit = hitTest(x, y);
        // pet.* 不做按下黑罩 tint（摸头时罩黑不萌），也不进 action
        if (hit && hit.indexOf('pet.') !== 0) { pressed = { id: hit, t: 0.12 }; pressDown = hit; }
        else if (hit) { pressDown = hit; }
      } else if (phase === 'end') {
        const hit = hitTest(x, y);
        const was = pressDown;
        pressDown = null;
        pressed = null;
        if (hit && hit === was) {
          if (hit.indexOf('pet.') === 0) {
            // 2026-11-20 触摸互动：摸头/肚/脚 → 动画 + 萌音 + 埋点（fhl_pet）
            const zone = hit.slice(4);
            if (pet.trigger(zone)) {
              sound.play(zone === 'head' ? 'purr' : zone === 'belly' ? 'giggle' : 'chirp');
              track.track('fhl_pet', { zone: zone === 'head' ? 1 : zone === 'belly' ? 2 : 3, scr: 1 });
            }
          } else {
            self.action(hit);
          }
        }
        if (bubbleT > 0) { bubbleT = 0; store.markFirstRunDone(); }
      }
    },
    action(id) {
      if (bubbleT > 0) { bubbleT = 0; store.markFirstRunDone(); }
      if (id === 'home.start') {
        sound.play('pick');
        // 教学局只在"没完成过"时给：这是首 90 秒的唯一入口，不写进设置避免被误关
        app.goto('battle', {
          mode: app.settings.mode || 'choice',
          difficulty: app.settings.difficulty,
          tutorial: !store.isTutorialDone(),
        });
        return;
      }
      if (id === 'home.modeChoice' || id === 'home.modeBlocks') {
        const mode = id === 'home.modeChoice' ? 'choice' : 'blocks';
        if (app.settings.mode !== mode) {
          app.settings.mode = mode;
          store.saveSettings(app.settings);
          build();
        }
        sound.play('pick');
        toast = { text: mode === 'choice' ? '择句接令 · 四句择一' : '点字成诗 · 字块乱序', t: 2.2 };
      } else if (id === 'home.diffEasy' || id === 'home.diffNormal') {
        const diff = id === 'home.diffEasy' ? 'easy' : 'normal';
        if (app.settings.difficulty !== diff) {
          app.settings.difficulty = diff;
          store.saveSettings(app.settings);
          build(); // 重烘焙 chip 选中态
        }
        sound.play('pick');
        // 文案从 16 字缩到 10 字内——原文案在战绩签数据行轮换显示时溢出被裁
        toast = { text: diff === 'easy' ? '简单档：名句 · 15 秒' : '困难档：名篇 · 10 秒', t: 2.2 };
      } else if (id === 'home.sound') {
        app.settings.sound = app.settings.sound === false;
        store.saveSettings(app.settings);
        sound.setEnabled(app.settings.sound !== false);
        build();
        if (app.settings.sound !== false) sound.play('pick');
        toast = { text: app.settings.sound === false ? '音效已关' : '音效已开', t: 2.0 };
      } else if (id === 'home.record') {
        // 轮换展示：有未雪耻仇册时第一次点给仇册（错句复仇入口提示），再点回常规战绩
        const gs = store.grudgeSummary();
        if (gs.pending > 0 && recTap++ % 2 === 0) {
          toast = { text: `仇册 ${gs.pending} 句未雪耻 · 诗童记着呢`, t: 2.4 };
        } else if (rec && rec.games > 0) {
          toast = { text: `连胜纪录 ×${rec.bestCombo}`, t: 2.0 };
        } else {
          toast = { text: '完成一局后这里会有战绩', t: 2.0 };
        }
      }
    },
    invalidate: build,
  };

  function rectOf(id) {
    const map = {
      'home.start': L.startBtn.hot,
      'home.record': L.record.hot,
    };
    const mc = L.modeChip, dc = L.diffChip;
    map['home.modeChoice'] = [mc.x, mc.y, mc.w / 2, mc.h];
    map['home.modeBlocks'] = [mc.x + mc.w / 2, mc.y, mc.w / 2, mc.h];
    map['home.diffEasy'] = [dc.x, dc.y, dc.w / 2, dc.h];
    map['home.diffNormal'] = [dc.x + dc.w / 2, dc.y, dc.w / 2, dc.h];
    map['home.sound'] = [L.soundChip.x, L.soundChip.y, L.soundChip.w, L.soundChip.h];
    return map[id] || null;
  }
  function hitTest(x, y) {
    for (const h of self.hotRects) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return null;
  }

  // 烘焙失败不致命：L0=null 时 draw() 走整屏直绘兜底（drawStatic）
  function build() {
    try {
      rec = store.loadRecord();
      L = layout.home(app.info);
      // 2026-11-20 触摸互动：小虎三区热区追加在列表末尾（按钮/判定热区优先命中）
      const tgBox = { x: L.tiger.x, y: L.tiger.y, w: 400 * L.tiger.scale, h: 560 * L.tiger.scale };
      self.hotRects = L.hotRects.concat(pet.petZones('full', tgBox));
      pet.setBox(tgBox);
      L0 = platform.createOffscreen(Math.round(app.info.W * app.info.dpr), Math.round(app.info.H * app.info.dpr));
      if (!L0) return;
      const g = L0.getContext('2d');
      // 上下文能力自检：缺基础能力时直接放弃离屏，避免「画了但内容不可见」的静默失效
      if (!g || typeof g.fillRect !== 'function' || typeof g.createLinearGradient !== 'function') {
        L0 = null; return;
      }
      g.setTransform(app.info.dpr, 0, 0, app.info.dpr, 0, 0);
      drawStatic(g);
    } catch (e) {
      L0 = null;
      console.error('[fhl] 首页烘焙失败，已降级直绘:', e && (e.stack || e.message) || e);
    }
  }

  // 静态内容绘制：烘焙层（离屏）与直绘兜底共用同一份代码
  function drawStatic(g) {
    const { c } = app.tokens;
    const S = app.settings.fontScale;
    const W = app.info.W, H = app.info.H;

    // ---------- H-01 宣纸底：竖向渐变 + 颗粒 ----------
    const grad = d.makeVGrad(g, 0, 0, H, c.bg, c.bgEnd);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // 宣纸颗粒（确定性，烘焙一次）：暗点 + 亮点交替，alpha 极低 → 纸质感而非噪点
    const rnd = grain(20261118);
    for (let i = 0; i < 1100; i++) {
      const px = rnd() * W, py = rnd() * H;
      g.fillStyle = i % 3 === 0 ? 'rgba(43,35,29,0.030)' : 'rgba(255,255,255,0.045)';
      g.fillRect(px, py, 1.3, 1.3);
    }
    // 四边压暗（暗角，让视线收进中部）
    const vig = d.makeVGrad(g, 0, 0, H * 0.22, 'rgba(43,35,29,0.07)', 'rgba(43,35,29,0)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H * 0.22);
    const vigB = d.makeVGrad(g, 0, H * 0.86, H, 'rgba(43,35,29,0)', 'rgba(43,35,29,0.08)');
    g.fillStyle = vigB; g.fillRect(0, H * 0.86, W, H * 0.14);
    // 展示②（§4.22）：氛围底——细纸纹 + 陈年茶渍 + 静态烛光基座
    // （首页已有自己的 1100 点颗粒 → 纸纹降为 0.5 档叠加；烛光呼吸在动态层叠 delta）
    ink.bakePaperTexture(g, W, H, 0.5, 20261119);
    ink.bakeTeaStains(g, W, H);
    ink.bakeCandleGlow(g, W * 0.86, H * 0.80, Math.min(W, H) * 0.30, 0.07);

    // ---------- H-02 景深：月 + 远山三层 + 云雾 + 光晕 ----------
    d.ell(g, W - 60, 112, 40, 40, 'rgba(242,195,60,0.08)');
    d.ell(g, W - 60, 112, 30, 30, 'rgba(242,195,60,0.12)');
    d.ell(g, W - 60, 112, 20, 20, 'rgba(242,195,60,0.55)');
    d.ell(g, W - 60, 112, 20, 20, null, 'rgba(255,249,236,0.35)', 1);
    // 远山三层（由淡到浓、由高到低）
    g.fillStyle = 'rgba(46,110,142,0.07)';
    g.beginPath();
    g.moveTo(0, H * 0.80);
    g.quadraticCurveTo(W * 0.22, H * 0.70, W * 0.46, H * 0.79);
    g.quadraticCurveTo(W * 0.70, H * 0.87, W, H * 0.78);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(46,110,142,0.11)';
    g.beginPath();
    g.moveTo(0, H * 0.87);
    g.quadraticCurveTo(W * 0.18, H * 0.79, W * 0.42, H * 0.86);
    g.quadraticCurveTo(W * 0.64, H * 0.92, W * 0.82, H * 0.85);
    g.quadraticCurveTo(W * 0.94, H * 0.81, W, H * 0.86);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(43,35,29,0.075)';
    g.beginPath();
    g.moveTo(0, H * 0.93);
    g.quadraticCurveTo(W * 0.3, H * 0.87, W * 0.55, H * 0.945);
    g.quadraticCurveTo(W * 0.78, H * 0.995, W, H * 0.91);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    // 云雾带（山腰横带，柔化山与天的交界）
    const mist = d.makeVGrad(g, 0, H * 0.74, H * 0.84, 'rgba(255,249,236,0.32)', 'rgba(255,249,236,0)');
    g.fillStyle = mist; g.fillRect(0, H * 0.74, W, H * 0.10);
    // 虎后光晕（径向渐变，布局期一次；真机离屏径向渐变不可用 → 跳过）
    const tg = L.tiger;
    try {
      const rg = g.createRadialGradient(W / 2, tg.y + tg.scale * 260, 20, W / 2, tg.y + tg.scale * 260, tg.scale * 230 + 80);
      if (rg && typeof rg.addColorStop === 'function') {
        rg.addColorStop(0, 'rgba(242,195,60,0.16)');
        rg.addColorStop(1, 'rgba(242,195,60,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
      }
    } catch (e) { /* 光晕为装饰，失败不影响主体 */ }
    // 巨字水印「飛」
    g.globalAlpha = 0.045;
    d.text(g, '飛', W / 2, tg.y + tg.scale * 190, font(600, 260, 'serif'), c.fg, { align: 'center' });
    g.globalAlpha = 1;
    // 虎立足墨影（落地感）
    d.ell(g, W / 2, tg.y + tg.scale * 520, tg.scale * 150, tg.scale * 22, 'rgba(43,35,29,0.07)');

    // ---------- H-04 标题（字距 + 「詩」印 + 两侧短划） ----------
    const title = L.title;
    const chars = ['飞', '花', '令'];
    const track = 10;
    const totalW = chars.length * title.size + (chars.length - 1) * track;
    let tx = title.cx - totalW / 2;
    chars.forEach(ch => {
      d.text(g, ch, tx + title.size / 2, title.mid, font(700, title.size, 'serif'), c.fg, { align: 'center' });
      tx += title.size + track;
    });
    // 标题两侧细划（平衡重心）
    g.strokeStyle = 'rgba(43,35,29,0.22)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(title.cx - totalW / 2 - 34, title.mid); g.lineTo(title.cx - totalW / 2 - 14, title.mid);
    g.moveTo(title.cx + totalW / 2 + 34, title.mid); g.lineTo(title.cx + totalW / 2 + 14, title.mid);
    g.stroke();
    // 「詩」印（双框 + 内框，朱砂底）
    d.seal(g, title.cx + totalW / 2 + 16, title.mid - 20, 40, c.primary, 'rgba(255,249,236,0.5)', '詩', font(600, 22, 'serif'), c.onBrand);

    // ---------- H-05 副标题 + 分隔（细线 + 菱形） ----------
    d.text(g, '一句一令 · 与诗童对诗', L.subtitle.cx, L.subtitle.mid, font(400, L.subtitle.size, 'sans'), c.fg2, { align: 'center' });
    const dy = L.subtitle.mid + 22;
    g.strokeStyle = 'rgba(43,35,29,0.20)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L.subtitle.cx - 78, dy); g.lineTo(L.subtitle.cx - 12, dy);
    g.moveTo(L.subtitle.cx + 12, dy); g.lineTo(L.subtitle.cx + 78, dy);
    g.stroke();
    g.beginPath();
    g.moveTo(L.subtitle.cx, dy - 3.5); g.lineTo(L.subtitle.cx + 3.5, dy);
    g.lineTo(L.subtitle.cx, dy + 3.5); g.lineTo(L.subtitle.cx - 3.5, dy); g.closePath();
    g.fillStyle = c.primary; g.fill();

    // ---------- H-05b 三枚 chip：模式 / 难度 / 音效 ----------
    const modeSel = (app.settings.mode || 'choice') === 'blocks' ? 1 : 0;
    segChip(g, L.modeChip, ['择句', '字块'], modeSel, c, S);
    const diffSel = (app.settings.difficulty || 'easy') === 'normal' ? 1 : 0;
    segChip(g, L.diffChip, ['简单', '困难'], diffSel, c, S);
    // 音效 chip：单段开关（开=竹绿字，关=灰），常驻可见——比藏进设置页更符合"默认开"
    const sndOn = app.settings.sound !== false;
    const sb = L.soundChip;
    d.rrect(g, sb.x, sb.y, sb.w, sb.h, sb.r);
    g.fillStyle = sndOn ? c.surfaceAlt : c.surface; g.fill();
    g.lineWidth = 1; g.strokeStyle = c.lineSoft; g.stroke();
    d.text(g, sndOn ? '音效 开' : '音效 关', sb.x + sb.w / 2, sb.y + sb.h / 2 + 1,
      font(600, 14, 'sans'), sndOn ? c.success : c.disabled, { align: 'center' });

    // ---------- H-06 唯一主按钮：开始对诗（朱砂牌匾） ----------
    const a = L.startBtn;
    d.shadow(g, a.x, a.y, a.w, a.h, a.r, 2, c);
    d.rrect(g, a.x, a.y, a.w, a.h, a.r);
    const gradA = d.makeVGrad(g, a.x, a.y, a.y + a.h, c.primaryGrad[0], c.primaryGrad[1]);
    g.fillStyle = gradA; g.fill();
    topGloss(g, a.x, a.y, a.w, a.h, 0.12, a.r);
    // 内细边 + 外描边（厚度感）
    d.rrect(g, a.x + 1.5, a.y + 1.5, a.w - 3, a.h - 3, a.r - 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,249,236,0.30)'; g.stroke();
    d.rrect(g, a.x, a.y, a.w, a.h, a.r);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(120,26,20,0.42)'; g.stroke();
    cornerMarks(g, a.x, a.y, a.w, a.h, 7, 9, 'rgba(255,249,236,0.30)', 1);
    d.text(g, '开始对诗', a.x + a.w / 2, a.y + a.h / 2 + 1, font(600, 34, 'serif'), c.onBrand, { align: 'center' });
    d.chevron(g, a.chev.x, a.chev.y, 'rgba(255,249,236,0.9)', 3);

    // ---------- H-08 战绩签（双行：标题 + 数据） ----------
    const r = L.record;
    const ry = r.y + 12, rh = 64; // 视觉 64 高细签居中于 88 热区（视觉减重，热区不变）
    d.shadow(g, r.x, ry, r.w, rh, 32, 1, c);
    d.rrect(g, r.x, ry, r.w, rh, 32);
    g.fillStyle = c.recordBg; g.fill();
    topGloss(g, r.x, ry, r.w, rh, 0.5, 32);
    d.rrect(g, r.x + 1.5, ry + 1.5, r.w - 3, rh - 3, 30);
    g.lineWidth = 1; g.strokeStyle = 'rgba(43,35,29,0.10)'; g.stroke();
    d.rrect(g, r.x, ry, r.w, rh, 32);
    g.lineWidth = 1; g.strokeStyle = c.lineSoft; g.stroke();
    d.seal(g, r.seal.x + 2, ry + 12, 40, c.primary, 'rgba(255,249,236,0.4)', '绩', font(600, 22, 'serif'), c.onBrand);
    const empty = !rec || rec.games === 0; // F6：原误用 layout 几何盒 r，空态永不出现
    if (empty) {
      d.text(g, '我的战绩 · 暂无', r.textX, ry + 32, font(600, T.scaled('bodyS', S), 'sans'), c.fg2);
    } else {
      // 数据行（累计 X 局 · 胜 Y）改在 draw() 动态绘制：战绩签点击时轮换显示连胜纪录
      d.text(g, '我的战绩', r.textX, ry + 22, font(600, T.scaled('bodyS', S), 'sans'), c.fg);
    }
    d.chevron(g, r.arrow.x, ry + 24, c.fg2, 2.5);
  }

  return self;
}

module.exports = { HomeScreen };

});
__reg("src/data/corpus.js", function (module, exports, require) {
'use strict';
// 本文件由 tools/build/build-corpus.js 生成，禁止手工编辑。重跑构建脚本即可再生成。
// lines[i] = "normKey|sourceIdx|level"，level: e=易(1-2学段) m=中(3-4) h=难(5-6)
// sources[s] = "title|author|dynasty"；诗歌登记表（唯一 id/题名/altTitles）见同目录 poems.js
// norm_key 即句文本（去标点空白全半角后的纯汉字串），全库唯一。
(function () {
  var POOL = ["人","山","风","月","春","花","天","水"];
  var L = ["风吹草低见牛羊|0|m","唧唧复唧唧|1|h","木兰当户织|1|h","不闻机杼声|1|h","惟闻女叹息|1|h","问女何所思|1|h","问女何所忆|1|h","女亦无所思|1|h","女亦无所忆|1|h","昨夜见军帖|1|h","可汗大点兵|1|h","军书十二卷|1|h","卷卷有爷名|1|h","阿爷无大儿|1|h","木兰无长兄|1|h","愿为市鞍马|1|h","从此替爷征|1|h","东市买骏马|1|h","西市买鞍鞯|1|h","南市买辔头|1|h","北市买长鞭|1|h","旦辞爷娘去|1|h","暮宿黄河边|1|h","不闻爷娘唤女声|1|h","旦辞黄河去|1|h","暮至黑山头|1|h","万里赴戎机|1|h","关山度若飞|1|h","朔气传金柝|1|h","寒光照铁衣|1|h","将军百战死|1|h","壮士十年归|1|h","归来见天子|1|h","天子坐明堂|1|h","策勋十二转|1|h","赏赐百千强|1|h","可汗问所欲|1|h","木兰不用尚书郎|1|h","愿驰千里足|1|h","送儿还故乡|1|h","爷娘闻女来|1|h","出郭相扶将|1|h","阿姊闻妹来|1|h","当户理红妆|1|h","小弟闻姊来|1|h","磨刀霍霍向猪羊|1|h","开我东阁门|1|h","坐我西阁床|1|h","脱我战时袍|1|h","著我旧时裳|1|h","当窗理云鬓|1|h","对镜帖花黄|1|h","出门看火伴|1|h","火伴皆惊忙|1|h","同行十二年|1|h","不知木兰是女郎|1|h","雄兔脚扑朔|1|h","雌兔眼迷离|1|h","双兔傍地走|1|h","安能辨我是雄雌|1|h","长命无绝衰|3|m","乃敢与君绝|3|m","陟彼北芒兮|4|m","顾览帝京兮|4|m","宫室崔嵬兮|4|m","人之劬劳兮|4|m","辽辽未央兮|4|m","十五从军征|5|m","八十始得归|5|m","道逢乡里人|5|m","家中有阿谁|5|m","遥看是君家|5|m","松柏冢累累|5|m","兔从狗窦入|5|m","雉从梁上飞|5|m","中庭生旅谷|5|m","井上生旅葵|5|m","舂谷持作饭|5|m","采葵持作羹|5|m","羹饭一时熟|5|m","不知贻阿谁|5|m","出门东向看|5|m","泪落沾我衣|5|m","行行重行行|6|m","与君生别离|6|m","相去万余里|6|m","各在天一涯|6|m","道路阻且长|6|m","会面安可知|6|m","胡马依北风|6|m","越鸟巢南枝|6|m","相去日已远|6|m","衣带日已缓|6|m","浮云蔽白日|6|m","游子不顾返|6|m","思君令人老|6|m","岁月忽已晚|6|m","弃捐勿复道|6|m","努力加餐饭|6|m","青青河畔草|7|m","郁郁园中柳|7|m","盈盈楼上女|7|m","皎皎当窗牖|7|m","娥娥红粉妆|7|m","纤纤出素手|7|m","昔为倡家女|7|m","今为荡子妇|7|m","荡子行不归|7|m","空床难独守|7|m","今日良宴会|8|m","欢乐难具陈|8|m","弹筝奋逸响|8|m","新声妙入神|8|m","令德唱高言|8|m","识曲听其真|8|m","齐心同所愿|8|m","含意俱未申|8|m","西北有高楼|9|m","上与浮云齐|9|m","交疏结绮窗|9|m","阿阁三重阶|9|m","上有弦歌声|9|m","音响一何悲|9|m","谁能为此曲|9|m","无乃杞梁妻|9|m","庭中有奇树|10|m","绿叶发华滋|10|m","攀条折其荣|10|m","将以遗所思|10|m","馨香盈怀袖|10|m","路远莫致之|10|m","此物何足贵|10|m","但感经时违|10|m","驱车上东门|11|m","遥望郭北墓|11|m","白杨何萧萧|11|m","松柏夹广路|11|m","下有陈死人|11|m","杳杳即长暮|11|m","潜寐黄泉下|11|m","千载永不寤|11|m","生年不满百|12|m","常怀千岁忧|12|m","昼短苦夜长|12|m","何不秉烛游|12|m","为乐当及时|12|m","何能待来兹|12|m","愚者爱惜费|12|m","但为后世嗤|12|m","明月何皎皎|13|m","照我罗床帏|13|m","忧愁不能寐|13|m","揽衣起徘徊|13|m","客行虽云乐|13|m","不如早旋归|13|m","出户独彷徨|13|m","愁思当告谁|13|m","我所思兮在太山|14|m","欲往从之梁父艰|14|m","侧身东望涕沾翰|14|m","力拔山兮气盖世|15|m","时不利兮骓不逝|15|m","骓不逝兮可奈何|15|m","虞兮虞兮奈若何|15|m","大风起兮云飞扬|16|m","孔雀东南飞|17|h","五里一徘徊|17|h","十三能织素|17|h","十四学裁衣|17|h","十五弹箜篌|17|h","十六诵诗书|17|h","十七为君妇|17|h","心中常苦悲|17|h","君既为府吏|17|h","守节情不移|17|h","贱妾留空房|17|h","相见常日稀|17|h","鸡鸣入机织|17|h","夜夜不得息|17|h","三日断五匹|17|h","大人故嫌迟|17|h","非为织作迟|17|h","君家妇难为|17|h","妾不堪驱使|17|h","徒留无所施|17|h","便可白公姥|17|h","及时相遣归|17|h","但感物候时|18|m","新裂齐纨素|19|m","皎洁如霜雪|19|m","裁为合欢扇|19|m","团团似明月|19|m","出入君怀袖|19|m","动摇微风发|19|m","常恐秋节至|19|m","凉飙夺炎热|19|m","弃捐箧笥中|19|m","恩情中道绝|19|m","欲归家无人|20|m","欲渡河无船|20|m","心思不能言|20|m","肠中车轮转|20|m","明月皎夜光|21|m","促织鸣东壁|21|m","玉衡指孟冬|21|m","众星何历历|21|m","白露沾野草|21|m","时节忽复易|21|m","秋蝉鸣树间|21|m","玄鸟逝安适|21|m","昔我同门友|21|m","高举振六翮|21|m","不念携手好|21|m","弃我如遗迹|21|m","南箕北有斗|21|m","牵牛不负轭|21|m","良无盘石固|21|m","虚名复何益|21|m","乃在大海南|22|m","何用问遗君|22|m","双珠玳瑁簪|22|m","用玉绍缭之|22|m","闻君有他心|22|m","拉杂摧烧之|22|m","当风扬其灰|22|m","相思与君绝|22|m","兄嫂当知之|22|m","秋风肃肃晨风飔|22|m","东方须臾高知之|22|m","江南可采莲|24|e","莲叶何田田|24|e","鱼戏莲叶间|24|e","鱼戏莲叶东|24|e","鱼戏莲叶西|24|e","鱼戏莲叶南|24|e","鱼戏莲叶北|24|e","涉江采芙蓉|25|m","兰泽多芳草|25|m","采之欲遗谁|25|m","所思在远道|25|m","还顾望旧乡|25|m","长路漫浩浩|25|m","同心而离居|25|m","忧伤以终老|25|m","游子不顾反|26|m","清商随风发|27|m","中曲正徘徊|27|m","一弹再三叹|27|m","慷慨有余哀|27|m","不惜歌者苦|27|m","但伤知音稀|27|m","愿为双鸿鹄|27|m","奋翅起高飞|27|m","人生譬朝露|28|m","居世多屯蹇|28|m","忧艰常早至|28|m","欢会常苦晚|28|m","迢迢牵牛星|29|m","皎皎河汉女|29|m","纤纤擢素手|29|m","札札弄机杼|29|m","终日不成章|29|m","泣涕零如雨|29|m","河汉清且浅|29|m","相去复几许|29|m","盈盈一水间|29|m","脉脉不得语|29|m","青青园中葵|30|m","朝露待日晞|30|m","阳春布德泽|30|m","万物生光辉|30|m","焜黄华叶衰|30|m","百川东到海|30|m","何时复西归|30|m","少壮不努力|30|m","老大徒伤悲|30|m","绵绵思远道|31|m","远道不可思|31|m","宿昔梦见之|31|m","梦见在我傍|31|m","忽觉在他乡|31|m","他乡各异县|31|m","辗转不相见|31|m","枯桑知天风|31|m","海水知天寒|31|m","入门各自媚|31|m","谁肯相为言|31|m","客从远方来|31|m","遗我双鲤鱼|31|m","呼儿烹鲤鱼|31|m","中有尺素书|31|m","长跪读素书|31|m","书中竟何如|31|m","上言加餐食|31|m","下言长相忆|31|m","远水长流洁白鸥|32|m","野梅初绽暗香浮|32|m","孤舟夜宿芦花岸|32|m","一枕秋声入梦来|32|m","滚滚长江东逝水|33|h","是非成败转头空|33|h","青山依旧在|33|h","几度夕阳红|33|h","白发渔樵江渚上|33|h","一壶浊酒喜相逢|33|h","古今多少事|33|h","都付笑谈中|33|h","秋风江口听鸣榔|34|e","远客三更倒客觞|34|e","两岸月明霜已白|34|e","一江风急水犹黄|34|e","十年往事随风过|34|e","一枕归心入梦长|34|e","世路无涯身已老|34|e","青山何处是吾乡|34|e","江水三千里|35|e","家书十五行|35|e","行行无别语|35|e","只道早还乡|35|e","今日复今日|36|m","今日何其少|36|m","今日又不为|36|m","此事何时了|36|m","人生百年几今日|36|m","今日不为真可惜|36|m","若言姑待明朝至|36|m","明朝又有明朝事|36|m","为君聊赋今日诗|36|m","努力请从今日始|36|m","高田如楼梯|37|e","平田如棋局|37|e","白鹭忽飞来|37|e","点破秧针绿|37|e","三年羁旅客|38|m","今日又南冠|38|m","无限河山泪|38|m","谁言天地宽|38|m","已知泉路近|38|m","欲别故乡难|38|m","毅魄归来日|38|m","灵旗空际看|38|m","凿开混沌得乌金|39|m","藏蓄阳和意最深|39|m","爝火燃回春浩浩|39|m","洪炉照破夜沉沉|39|m","鼎彝元赖生成力|39|m","铁石犹存死后心|39|m","但愿苍生俱饱暖|39|m","不辞辛苦出山林|39|m","渡水复渡水|40|e","看花还看花|40|e","春风江上路|40|e","不觉到君家|40|e","春色醉巴陵|41|m","阑干落洞庭|41|m","水吞三楚白|41|m","山接九疑青|41|m","空阔鱼龙舞|41|m","娉婷帝子灵|41|m","何人夜吹笛|41|m","风急雨冥冥|41|m","春风一夜到衡阳|42|e","楚水燕山万里长|42|e","莫道春来便归去|42|e","江南虽好是他乡|42|e","风烟节物眼中稀|43|e","三月人犹恋褚衣|43|e","结就客愁云片段|43|e","唤回乡梦雨霏微|43|e","官船来往乱如麻|44|m","军听了军愁|44|m","民听了民怕|44|m","吹伤了那家|44|m","寂历秋江渔火稀|45|e","起看残月映林微|45|e","波光水鸟惊犹宿|45|e","露冷流萤湿不飞|45|e","白发渔翁老此乡|46|e","芦花深处草为堂|46|e","一壶村酒鲈鱼美|46|e","睡到明朝又何妨|46|e","千锤万凿出深山|47|m","烈火焚烧若等闲|47|m","粉骨碎身浑不怕|47|m","要留清白在人间|47|m","书卷多情似故人|48|m","晨昏忧乐每相亲|48|m","眼前直下三千字|48|m","胸次全无一点尘|48|m","风条雨叶逐风尘|49|e","横惹阶前半面春|49|e","莫道此君无用处|49|e","岁寒曾伴雪中身|49|e","南北驱驰报主情|50|m","江花边草笑平生|50|m","一年三百六十日|50|m","多是横戈马上行|50|m","江干远树浮|51|m","天末孤烟起|51|m","江天自如合|51|m","烟树还相似|51|m","孤烟起新丰|52|m","归雁出吴城|52|m","草低金城雾|52|m","木下玉门风|52|m","玉关道路远|53|m","金陵信使疏|53|m","独下千行泪|53|m","开君万里书|53|m","暮烟起遥岸|54|m","斜日照安流|54|m","一同心赏夕|54|m","暂解去乡忧|54|m","楚材称晋用|55|m","秦臣即赵冠|55|m","离宫延子产|55|m","羁旅接陈完|55|m","一身仕关西|56|m","家族满山东|56|m","二年从车驾|56|m","斋祭甘泉宫|56|m","白云满鄣来|57|m","黄尘暗天起|57|m","关山四面绝|57|m","故乡几千里|57|m","灞涘望长安|58|m","河阳视京县|58|m","白日丽飞甍|58|m","参差皆可见|58|m","余霞散成绮|58|m","澄江静如练|58|m","秋风吹木叶|59|m","还似洞庭波|59|m","常山临代郡|59|m","亭障绕黄河|59|m","客心已百念|60|m","孤游重千里|60|m","江暗雨欲来|60|m","浪白风初起|60|m","山中何所有|61|m","岭上多白云|61|m","只可自怡悦|61|m","不堪持赠君|61|m","折花逢驿使|62|m","寄与陇头人|62|m","江南无所有|62|m","聊赠一枝春|62|m","阳关万里道|63|m","不见一人归|63|m","惟有河边雁|63|m","秋来南向飞|63|m","军歌应唱大刀环|64|m","誓灭胡奴出玉关|64|m","只解沙场为国死|64|m","何须马革裹尸还|64|m","沉沉更鼓急|65|e","渐渐人声绝|65|e","吹灯窗更明|65|e","月照一天雪|65|e","金粉东南十五州|66|m","万重恩怨属名流|66|m","牢盆狎客操全算|66|m","团扇才人踞上游|66|m","避席畏闻文字狱|66|m","著书都为稻粱谋|66|m","田横五百人安在|66|m","难道归来尽列侯|66|m","天山万笏耸琼瑶|67|m","导我西行伴寂寥|67|m","我与山灵相对笑|67|m","满头晴雪共难消|67|m","衙斋卧听萧萧竹|68|m","疑是民间疾苦声|68|m","些小吾曹州县吏|68|m","一枝一叶总关情|68|m","不惜千金买宝刀|69|m","貂裘换酒也堪豪|69|m","一腔热血勤珍重|69|m","洒去犹能化碧涛|69|m","九州生气恃风雷|70|m","万马齐喑究可哀|70|m","我劝天公重抖擞|70|m","不拘一格降人才|70|m","浩荡离愁白日斜|71|m","吟鞭东指即天涯|71|m","落红不是无情物|71|m","化作春泥更护花|71|m","少年哀乐过于人|72|m","歌泣无端字字真|72|m","既壮周旋杂痴黠|72|m","童心来复梦中身|72|m","霜豪掷罢倚天寒|73|m","任作淋漓淡墨看|73|m","何敢自矜医国手|73|m","药方只贩古时丹|73|m","牧童骑黄牛|74|e","歌声振林樾|74|e","意欲捕鸣蝉|74|e","忽然闭口立|74|e","连宵风雨恶|75|e","蓬户不轻开|75|e","山似春归日|75|e","花如客到时|75|e","春风如贵客|76|e","一到便繁华|76|e","来扫千山雪|76|e","归留万国花|76|e","少闻鸡声眠|77|m","老听鸡声起|77|m","千古万代人|77|m","消磨数声里|77|m","人生若只如初见|78|m","何事秋风悲画扇|78|m","等闲变却故人心|78|m","却道故人心易变|78|m","骊山语罢清宵半|78|m","泪雨霖铃终不怨|78|m","何如薄幸锦衣郎|78|m","比翼连枝当日愿|78|m","草长莺飞二月天|79|e","拂堤杨柳醉春烟|79|e","儿童散学归来早|79|e","忙趁东风放纸鸢|79|e","看万山红遍|80|h","万类霜天竞自由|80|h","问苍茫大地|80|h","恰同学少年|80|h","粪土当年万户侯|80|h","到中流击水|80|h","望长城内外|81|h","欲与天公试比高|81|h","看红装素裹|81|h","惜秦皇汉武|81|h","只识弯弓射大雕|81|h","数风流人物|81|h","谁念西风独自凉|82|h","萧萧黄叶闭疏窗|82|h","沉思往事立残阳|82|h","被酒莫惊春睡重|82|h","赌书消得泼茶香|82|h","当时只道是寻常|82|h","望门投止思张俭|83|m","忍死须臾待杜根|83|m","我自横刀向天笑|83|m","去留肝胆两昆仑|83|m","咬定青山不放松|84|m","立根原在破岩中|84|m","千磨万击还坚劲|84|m","任尔东西南北风|84|m","月黑见渔灯|85|e","孤光一点萤|85|e","微微风簇浪|85|e","散作满河星|85|e","白日不到处|86|e","青春恰自来|86|e","苔花如米小|86|e","也学牡丹开|86|e","蝉居最高树|87|h","高树亦无枝|87|h","饮露身何洁|87|h","吟风韵自奇|87|h","绝音人不识|87|h","远响尔何知|87|h","寄语螳螂辈|87|h","休将此意欺|87|h","辛苦最怜天上月|88|m","昔昔都成玦|88|m","若似月轮终皎洁|88|m","不辞冰雪为卿热|88|m","李杜诗篇万口传|89|m","至今已觉不新鲜|89|m","江山代有才人出|89|m","各领风骚数百年|89|m","诗界千年靡靡风|90|m","兵魂销尽国魂空|90|m","集中什九从军乐|90|m","亘古男儿一放翁|90|m","万籁无声夜正中|91|m","月华如水浸帘栊|91|m","闲愁一缕随风去|91|m","化作清光入太空|91|m","力微任重久神疲|92|m","再竭衰庸定不支|92|m","苟利国家生死以|92|m","岂因祸福避趋之|92|m","谪居正是君恩厚|92|m","养拙刚于戍卒宜|92|m","戏与山妻谈故事|92|m","试吟断送老头皮|92|m","爱好由来落笔难|93|m","一诗千改始心安|93|m","阿婆还似初笄女|93|m","头未梳成不许看|93|m","我亦飘零久|94|m","宿昔齐名非忝窃|94|m","身向榆关那畔行|95|m","夜深千帐灯|95|m","聒碎乡心梦不成|95|m","故园无此声|95|m","思亲不断如春草|96|e","一夜西风绿又生|96|e","欲寄归心无处着|96|e","月明满地是乡情|96|e","莫唱当年长恨歌|97|m","人间亦自有银河|97|m","石壕村里夫妻别|97|m","泪比长生殿上多|97|m","万里乘云去复来|98|m","只身东海挟春雷|98|m","忍看图画移颜色|98|m","肯使江山付劫灰|98|m","浊酒不销忧国泪|98|m","救时应仗出群才|98|m","拼将十万头颅血|98|m","须把乾坤力挽回|98|m","红藕香残玉簟秋|99|h","云中谁寄锦书来|99|h","花自飘零水自流|99|h","此情无计可消除|99|h","梅子黄时日日晴|100|m","小溪泛尽却山行|100|m","绿阴不减来时路|100|m","添得黄鹂四五声|100|m","少年不识愁滋味|101|m","为赋新词强说愁|101|m","而今识尽愁滋味|101|m","却道天凉好个秋|101|m","梨花淡白柳深青|102|m","柳絮飞时花满城|102|m","惆怅东栏一株雪|102|m","人生看得几清明|102|m","世味年来薄似纱|103|h","谁令骑马客京华|103|h","小楼一夜听春雨|103|h","深巷明朝卖杏花|103|h","矮纸斜行闲作草|103|h","晴窗细乳戏分茶|103|h","素衣莫起风尘叹|103|h","犹及清明可到家|103|h","去年春恨却来时|104|h","落花人独立|104|h","微雨燕双飞|104|h","琵琶弦上说相思|104|h","当时明月在|104|h","曾照彩云归|104|h","夜饮东坡醒复醉|105|h","家童鼻息已雷鸣|105|h","敲门都不应|105|h","倚杖听江声|105|h","长恨此身非我有|105|h","夜阑风静縠纹平|105|h","小舟从此逝|105|h","江海寄余生|105|h","早岁那知世事艰|106|h","中原北望气如山|106|h","楼船夜雪瓜洲渡|106|h","铁马秋风大散关|106|h","塞上长城空自许|106|h","镜中衰鬓已先斑|106|h","出师一表真名世|106|h","千载谁堪伯仲间|106|h","野水参差落涨痕|107|m","疏林欹倒出霜根|107|m","扁舟一棹归何处|107|m","家在江南黄叶村|107|m","萧萧远树疏林外|108|e","一半秋山带夕阳|108|e","茅檐长扫净无苔|109|m","花木成畦手自栽|109|m","一水护田将绿绕|109|m","两山排闼送青来|109|m","庙堂无策可平戎|110|m","坐使甘泉照火光|110|m","夷甫诸人堪一笑|110|m","更从今去误苍生|110|m","云淡风轻近午天|111|m","傍花随柳过前川|111|m","时人不识余心乐|111|m","将谓偷闲学少年|111|m","爆竹声中一岁除|112|m","春风送暖入屠苏|112|m","千门万户曈曈日|112|m","总把新桃换旧符|112|m","一番洗清秋|113|h","渐霜风凄紧|113|h","苒苒物华休|113|h","惟有长江水|113|h","望故乡渺邈|113|h","叹年来踪迹|113|h","何事苦淹留|113|h","想佳人妆楼颙望|113|h","天际识归舟|113|h","关塞莽然平|114|h","追想当年事|114|h","落日牛羊下|114|h","看名王宵猎|114|h","骑火一川明|114|h","干羽方怀远|114|h","使行人到此|114|h","忠愤气填膺|114|h","黑云翻墨未遮山|115|m","白雨跳珠乱入船|115|m","卷地风来忽吹散|115|m","望湖楼下水如天|115|m","参横斗转欲三更|116|m","苦雨终风也解晴|116|m","云散月明谁点缀|116|m","天容海色本澄清|116|m","古人学问无遗力|117|m","少壮工夫老始成|117|m","纸上得来终觉浅|117|m","绝知此事要躬行|117|m","任宝奁尘满|118|h","念武陵人远|118|h","乳鸭池塘水浅深|119|m","熟梅天气半晴阴|119|m","东园载酒西园醉|119|m","摘尽枇杷一树金|119|m","落日无情最有情|120|e","遍催万树暮蝉鸣|120|e","听来咫尺无寻处|120|e","寻到旁边却不声|120|e","衣上征尘杂酒痕|121|m","远游无处不消魂|121|m","此身合是诗人未|121|m","细雨骑驴入剑门|121|m","少年易老学难成|122|m","一寸光阴不可轻|122|m","未觉池塘春草梦|122|m","阶前梧叶已秋声|122|m","北山输绿涨横陂|123|m","直堑回塘滟滟时|123|m","细数落花因坐久|123|m","缓寻芳草得迟归|123|m","僵卧孤村不自哀|124|m","尚思为国戍轮台|124|m","夜阑卧听风吹雨|124|m","铁马冰河入梦来|124|m","何处望神州|125|h","满眼风光北固楼|125|h","千古兴亡多少事|125|h","不尽长江滚滚流|125|h","年少万兜鍪|125|h","坐断东南战未休|125|h","天下英雄谁敌手|125|h","生子当如孙仲谋|125|h","南浦东冈二月时|126|m","物华撩我有新诗|126|m","含风鸭绿粼粼起|126|m","弄日鹅黄袅袅垂|126|m","驿外断桥边|127|m","寂寞开无主|127|m","已是黄昏独自愁|127|m","更着风和雨|127|m","无意苦争春|127|m","一任群芳妒|127|m","零落成泥碾作尘|127|m","只有香如故|127|m","水是眼波横|128|m","山是眉峰聚|128|m","欲问行人去那边|128|m","眉眼盈盈处|128|m","才始送春归|128|m","又送君归去|128|m","若到江南赶上春|128|m","千万和春住|128|m","缺月挂疏桐|129|h","漏断人初静|129|h","谁见幽人独往来|129|h","缥缈孤鸿影|129|h","惊起却回头|129|h","有恨无人省|129|h","拣尽寒枝不肯栖|129|h","寂寞沙洲冷|129|h","燕子将雏语夏深|130|m","绿槐庭院不多阴|130|m","西窗一雨无人见|130|m","展尽芭蕉数尺心|130|m","度帘幕中间|131|h","又软语商量不定|131|h","爱贴地争飞|131|h","人生到处知何似|132|h","应似飞鸿踏雪泥|132|h","泥上偶然留指爪|132|h","鸿飞那复计东西|132|h","昼出耘田夜绩麻|133|m","村庄儿女各当家|133|m","童孙未解供耕织|133|m","也傍桑阴学种瓜|133|m","梅子金黄杏子肥|134|m","麦花雪白菜花稀|134|m","日长篱落无人过|134|m","唯有蜻蜓蛱蝶飞|134|m","惟有蜻蜓蛱蝶飞|135|m","新筑场泥镜面平|136|m","家家打稻趁霜晴|136|m","笑歌声里轻雷动|136|m","一夜连枷响到明|136|m","怎一个愁字了得|137|h","别院深深夏席清|138|m","石榴开遍透帘明|138|m","树阴满地日当午|138|m","梦觉流莺时一声|138|m","长夏村墟风日清|139|m","檐牙燕雀已生成|139|m","蝶衣晒粉花枝舞|139|m","蛛网惹丝罥落星|139|m","流水阶除静|140|e","孤眠得自由|140|e","月生林欲晓|140|e","雨过夜如秋|140|e","生当作人杰|141|m","死亦为鬼雄|141|m","至今思项羽|141|m","不肯过江东|141|m","萧萧梧叶送寒声|142|m","江上秋风动客情|142|m","知有儿童挑促织|142|m","夜深篱落一灯明|142|m","庭户无人秋月明|143|m","夜霜欲落气先清|143|m","梧桐真不甘衰谢|143|m","数叶迎风尚有声|143|m","腰间羽箭久凋零|144|m","太息燕然未勒铭|144|m","老子犹堪绝大漠|144|m","诸君何至泣新亭|144|m","水调数声持酒听|145|m","午醉醒来愁未醒|145|m","送春春去几时回|145|m","往事后期空记省|145|m","沙上并禽池上暝|145|m","云破月来花弄影|145|m","重重帘幕密遮灯|145|m","明日落红应满径|145|m","一轮秋影转金波|146|m","飞镜又重磨|146|m","把酒问姮娥|146|m","直下看山河|146|m","斫去桂婆娑|146|m","月未到诚斋|147|m","隔一庭修竹|147|m","如今才是十三夜|147|m","月色已如玉|147|m","看十五十六|147|m","试问卷帘人|148|m","兴尽晚回舟|149|m","天质自森森|150|m","孤高几百寻|150|m","凌霄不屈己|150|m","得地本虚心|150|m","岁老根弥壮|150|m","阳骄叶更阴|150|m","明堂思栋宇|150|m","只待此云深|150|m","莫听穿林打叶声|151|h","何妨吟啸且徐行|151|h","竹杖芒鞋轻胜马|151|h","一蓑烟雨任平生|151|h","料峭春风吹酒醒|151|h","山头斜照却相迎|151|h","回首向来萧瑟处|151|h","也无风雨也无晴|151|h","篱落疏疏一径深|152|e","树头新绿未成阴|152|e","儿童急走追黄蝶|152|e","飞入菜花无处寻|152|e","我居北海君南海|153|h","寄雁传书谢不能|153|h","桃李春风一杯酒|153|h","江湖夜雨十年灯|153|h","持家但有四立壁|153|h","治病不蕲三折肱|153|h","想见读书头已白|153|h","隔溪猿哭瘴溪藤|153|h","泉眼无声惜细流|154|e","树阴照水爱晴柔|154|e","小荷才露尖尖角|154|e","早有蜻蜓立上头|154|e","昨夜寒蛩不住鸣|155|h","惊回千里梦|155|h","起来独自绕阶行|155|h","帘外月胧明|155|h","白首为功名|155|h","旧山松竹老|155|h","欲将心事付瑶琴|155|h","弦断有谁听|155|h","众芳摇落独暄妍|156|m","占尽风情向小园|156|m","疏影横斜水清浅|156|m","暗香浮动月黄昏|156|m","霜禽欲下先偷眼|156|m","粉蝶如知合断魂|156|m","卷起千堆雪|157|h","小乔初嫁了|157|h","多情应笑我|157|h","玉鉴琼田三万顷|158|h","表里俱澄澈|158|h","肝肺皆冰雪|158|h","短发萧骚襟袖冷|158|h","万象为宾客|158|h","尽日寻春不见春|159|m","芒鞋踏遍陇头云|159|m","归来笑拈梅花嗅|159|m","春在枝头已十分|159|m","两两归鸿欲破群|160|m","依依还似北归人|160|m","遥知朔漠多风雪|160|m","更待江南半月春|160|m","罗浮山下四时春|161|m","卢橘杨梅次第新|161|m","日啖荔枝三百颗|161|m","不辞长作岭南人|161|m","过春风十里|162|h","尽荠麦青青|162|h","自胡马窥江去后|162|h","纵豆蔻词工|162|h","念桥边红药|162|h","田夫抛秧田妇接|164|m","小儿拔秧大儿插|164|m","笠是兜鍪蓑是甲|164|m","雨从头上湿到胛|164|m","惜春长怕花开早|165|h","天涯芳草无归路|165|h","算只有殷勤|165|h","尽日惹飞絮|165|h","千金纵买相如赋|165|h","玉环飞燕皆尘土|165|h","休去倚危栏|165|h","烟柳断肠处|165|h","数日秋风欺病夫|166|m","尽吹黄叶下庭芜|166|m","林疏放得遥山出|166|m","又被云遮一半无|166|m","黄莺也爱新凉好|167|e","飞过青山影里啼|167|e","东风知我欲山行|168|m","吹断檐间积雨声|168|m","岭上晴云披絮帽|168|m","树头初日挂铜钲|168|m","青苔满地初晴后|169|m","绿树无人昼梦余|169|m","唯有南风旧相识|169|m","偷开门户又翻书|169|m","露侵驼褐晓寒轻|170|m","星斗阑干分外明|170|m","寂寞小桥和梦过|170|m","稻田深处草虫鸣|170|m","金炉香烬漏声残|171|m","剪剪轻风阵阵寒|171|m","春色恼人眠不得|171|m","月移花影上栏杆|171|m","春宵一刻值千金|172|m","花有清香月有阴|172|m","歌管楼台声细细|172|m","秋千院落夜沉沉|172|m","阴阴溪曲绿交加|173|m","小雨翻萍上浅沙|173|m","鹅鸭不知春去尽|173|m","争随流水趁桃花|173|m","胜日寻芳泗水滨|174|m","无边光景一时新|174|m","等闲识得东风面|174|m","万紫千红总是春|174|m","一春略无十日晴|175|m","处处浮云将雨行|175|m","野田春水碧于镜|175|m","人影渡傍鸥不惊|175|m","竹外桃花三两枝|176|m","春江水暖鸭先知|176|m","蒌蒿满地芦芽短|176|m","正是河豚欲上时|176|m","双飞燕子几时回|177|m","夹岸桃花蘸水开|177|m","春雨断桥人不渡|177|m","小舟撑出柳阴来|177|m","急雨打篷声|178|m","聚作水银窝|178|m","毕竟西湖六月中|179|e","风光不与四时同|179|e","接天莲叶无穷碧|179|e","映日荷花别样红|179|e","紫青莼菜卷荷香|180|m","玉雪芹芽拔薤长|180|m","不待春风催暖日|180|m","只消新水满池塘|180|m","清风无力屠得热|181|m","落日着翅飞上山|181|m","人固已惧江海竭|181|m","天岂不惜河汉干|181|m","算几番照我|182|h","不管清寒与攀摘|182|h","都忘却春风词笔|182|h","但怪得竹外疏花|182|h","香冷入瑶席|182|h","叹寄与路遥|182|h","红萼无言耿相忆|182|h","千树压西湖寒碧|182|h","双双瓦雀行书案|183|m","点点杨花入砚池|183|m","闲坐小窗读周易|183|m","不知春去几多时|183|m","游人脚底一声雷|184|m","满座顽云拨不开|184|m","天外黑风吹海立|184|m","浙东飞雨过江来|184|m","风细柳斜斜|185|m","试上超然台上看|185|m","半壕春水一城花|185|m","烟雨暗千家|185|m","酒醒却咨嗟|185|m","休对故人思故国|185|m","且将新火试新茶|185|m","诗酒趁年华|185|m","云树绕堤沙|186|h","怒涛卷霜雪|186|h","可怜今夕月|187|m","是别有人间|187|m","浩浩送中秋|187|m","草满池塘水满陂|188|e","山衔落日浸寒漪|188|e","牧童归去横牛背|188|e","短笛无腔信口吹|188|e","晓带轻烟间杏花|189|m","晚凝深翠拂平沙|189|m","长条别有风流处|189|m","密映钱塘苏小家|189|m","正故国晚秋|190|h","归帆去棹残阳里|190|h","叹门外楼头|190|h","六朝旧事随流水|190|h","但寒烟衰草凝绿|190|h","墙角数枝梅|191|e","凌寒独自开|191|e","遥知不是雪|191|e","为有暗香来|191|e","云里溪桥独占春|192|e","天然玉质晓妆新|192|e","月中疏影霜中韵|192|e","都作人间百倍珍|192|e","闻道梅花坼晓风|193|m","雪堆遍满四山中|193|m","何方可化身千亿|193|m","一树梅花一放翁|193|m","天地有正气|194|h","杂然赋流形|194|h","下则为河岳|194|h","上则为日星|194|h","于人曰浩然|194|h","沛乎塞苍冥|194|h","皇路当清夷|194|h","含和吐明庭|194|h","时穷节乃见|194|h","一一垂丹青|194|h","风住尘香花已尽|195|m","日晚倦梳头|195|m","物是人非事事休|195|m","欲语泪先流|195|m","闻说双溪春尚好|195|m","也拟泛轻舟|195|m","只恐双溪舴艋舟|195|m","昨夜扁舟雨一蓑|196|m","满江风浪夜如何|196|m","今朝试卷孤篷看|196|m","依旧青山绿树多|196|m","明月几时有|197|h","把酒问青天|197|h","今夕是何年|197|h","高处不胜寒|197|h","起舞弄清影|197|h","何似在人间|197|h","何事长向别时圆|197|h","此事古难全|197|h","但愿人长久|197|h","千里共婵娟|197|h","也无人惜从教坠|198|h","梦随风万里|198|h","恨西园落红难缀|198|h","水随天去秋无际|199|h","把吴钩看了|199|h","倩何人唤取|199|h","烽火扬州路|200|h","江上秋风吹白头|201|m","倦游空叹此身浮|201|m","只应且作乘桴客|201|m","安得长为击楫流|201|m","江上往来人|202|m","但爱鲈鱼美|202|m","君看一叶舟|202|m","出没风波里|202|m","十年生死两茫茫|203|h","无处话凄凉|203|h","纵使相逢应不识|203|h","夜来幽梦忽还乡|203|h","惟有泪千行|203|h","料得年年肠断处|203|h","老夫聊发少年狂|204|m","千骑卷平冈|204|m","为报倾城随太守|204|m","酒酣胸胆尚开张|204|m","何日遣冯唐|204|m","会挽雕弓如满月|204|m","江头落日照平沙|205|m","潮退渔船阁岸斜|205|m","白鸟一双临水立|205|m","见人惊起入芦花|205|m","经年尘土满征衣|206|m","特特寻芳上翠微|206|m","好水好山看不足|206|m","马蹄催趁月明归|206|m","城上斜阳画角哀|207|m","沈园非复旧池台|207|m","伤心桥下春波绿|207|m","曾是惊鸿照影来|207|m","梦断香消四十年|208|m","沈园柳老不吹绵|208|m","此身行作稽山土|208|m","犹吊遗踪一泫然|208|m","京口瓜洲一水间|209|m","钟山只隔数重山|209|m","春风又绿江南岸|209|m","明月何时照我还|209|m","自清凉无汗|210|h","水殿风来暗香满|210|h","起来携素手|210|h","时见疏星渡河汉|210|h","试问夜如何|210|h","一曲新词酒一杯|211|h","去年天气旧亭台|211|h","夕阳西下几时回|211|h","无可奈何花落去|211|h","似曾相识燕归来|211|h","小园香径独徘徊|211|h","山下兰芽短浸溪|212|h","松间沙路净无泥|212|h","潇潇暮雨子规啼|212|h","谁道人生无再少|212|h","门前流水尚能西|212|h","休将白发唱黄鸡|212|h","东风袅袅泛崇光|213|m","香雾空蒙月转廊|213|m","只恐夜深花睡去|213|m","故烧高烛照红妆|213|m","春阴垂野草青青|214|m","时有幽花一树明|214|m","晚泊孤舟古祠下|214|m","满川风雨看潮生|214|m","小桃无主自开花|215|m","烟草茫茫带晚鸦|215|m","几处败垣围故井|215|m","向来一一是人家|215|m","寂寞无行路|216|m","若有人知春去处|216|m","溪上青青草|217|m","醉里吴音相媚好|217|m","天接云涛连晓雾|218|h","星河欲转千帆舞|218|h","仿佛梦魂归帝所|218|h","殷勤问我归何处|218|h","我报路长嗟日暮|218|h","学诗谩有惊人句|218|h","九万里风鹏正举|218|h","蓬舟吹取三山去|218|h","塞下秋来风景异|219|h","衡阳雁去无留意|219|h","四面边声连角起|219|h","长烟落日孤城闭|219|h","浊酒一杯家万里|219|h","燕然未勒归无计|219|h","羌管悠悠霜满地|219|h","将军白发征夫泪|219|h","西塞山前白鹭飞|220|m","桃花流水鳜鱼肥|220|m","斜风细雨不须归|220|m","应怜屐齿印苍苔|221|h","小扣柴扉久不开|221|h","春色满园关不住|221|h","一枝红杏出墙来|221|h","莫笑农家腊酒浑|222|m","丰年留客足鸡豚|222|m","山重水复疑无路|222|m","柳暗花明又一村|222|m","聊共引离尊|223|h","流水绕孤村|223|h","销魂当此际|223|h","灯火已黄昏|223|h","三十功名尘与土|224|h","八千里路云和月|224|h","白了少年头|224|h","壮志饥餐胡虏肉|224|h","笑谈渴饮匈奴血|224|h","收拾旧山河|224|h","倦客愁闻归路遥|225|m","眼明飞阁俯长桥|225|m","贪看白鹭横秋浦|225|m","不觉青林没晚潮|225|m","太湖西畔随云去|226|m","商略黄昏雨|226|m","拟共天随住|226|m","残柳参差舞|226|m","一自胡尘入汉关|227|m","十年伊洛路漫漫|227|m","青墩溪畔龙钟客|227|m","独立东风看牡丹|227|m","年年跃马长安市|228|m","客舍似家家似寄|228|m","青钱换酒日无何|228|m","红烛呼卢宵不寐|228|m","易挑锦妇机中字|228|m","难得玉人心下事|228|m","男儿西北有神州|228|m","莫滴水西桥畔泪|228|m","尊前拟把归期说|229|m","欲语春容先惨咽|229|m","人生自是有情痴|229|m","此恨不关风与月|229|m","离歌且莫翻新阕|229|m","一曲能教肠寸结|229|m","直须看尽洛城花|229|m","始共春风容易别|229|m","若言琴上有琴声|230|m","放在匣中何不鸣|230|m","若言声在指头上|230|m","何不于君指上听|230|m","去年元夜时|231|m","花市灯如昼|231|m","月上柳梢头|231|m","人约黄昏后|231|m","今年元夜时|231|m","月与灯依旧|231|m","不见去年人|231|m","泪湿春衫袖|231|m","耕犁千亩实千箱|232|m","力尽筋疲谁复伤|232|m","但得众生皆得饱|232|m","不辞羸病卧残阳|232|m","病骨支离纱帽宽|233|m","孤臣万里客江干|233|m","位卑未敢忘忧国|233|m","事定犹须待阖棺|233|m","天地神灵扶庙社|233|m","京华父老望和銮|233|m","出师一表通今古|233|m","夜半挑灯更细看|233|m","痴儿了却公家事|234|h","快阁东西倚晚晴|234|h","落木千山天远大|234|h","澄江一道月分明|234|h","朱弦已为佳人绝|234|h","青眼聊因美酒横|234|h","万里归船弄长笛|234|h","此心吾与白鸥盟|234|h","飞来山上千寻塔|235|m","闻说鸡鸣见日升|235|m","不畏浮云遮望眼|235|m","自缘身在最高层|235|m","池上碧苔三四点|236|m","叶底黄鹂一两声|236|m","日长飞絮轻|236|m","疑怪昨宵春梦好|236|m","元是今朝斗草赢|236|m","笑从双脸生|236|m","八百里分麾下炙|237|h","五十弦翻塞外声|237|h","沙场秋点兵|237|h","了却君王天下事|237|h","赢得生前身后名|237|h","可怜白发生|237|h","死去元知万事空|238|m","但悲不见九州同|238|m","王师北定中原日|238|m","家祭无忘告乃翁|238|m","夜漏添长抱影悲|239|m","明月无情偏照户|239|m","秋来纨扇合收藏|239|m","何事佳人重感伤|239|m","三万里河东入海|240|m","五千仞岳上摩天|240|m","遗民泪尽胡尘里|240|m","南望王师又一年|240|m","利欲驱人万火牛|241|m","江湖浪迹一沙鸥|241|m","日长似岁闲方觉|241|m","事大如天醉亦休|241|m","闲来无事不从容|242|m","睡觉东窗日已红|242|m","万物静观皆自得|242|m","四时佳兴与人同|242|m","清溪流过碧山头|243|m","空水澄鲜一色秋|243|m","隔断红尘三十里|243|m","白云红叶两悠悠|243|m","黄梅时节家家雨|244|m","青草池塘处处蛙|244|m","有约不来过夜半|244|m","闲敲棋子落灯花|244|m","古木阴中系短篷|245|m","杖藜扶我过桥东|245|m","沾衣欲湿杏花雨|245|m","吹面不寒杨柳风|245|m","一叶渔船两小童|246|e","收篙停棹坐船中|246|e","怪生无雨都张伞|246|e","不是遮头是使风|246|e","重重叠叠上瑶台|247|m","几度呼童扫不开|247|m","刚被太阳收拾去|247|m","却教明月送将来|247|m","侵晓窥檐语|248|h","叶上初阳干宿雨|248|h","一一风荷举|248|h","久作长安旅|248|h","五月渔郎相忆否|248|h","梦入芙蓉浦|248|h","波上寒烟翠|249|h","山映斜阳天接水|249|h","更在斜阳外|249|h","好梦留人睡|249|h","明月楼高休独倚|249|h","化作相思泪|249|h","郁孤台下清江水|250|h","中间多少行人泪|250|h","西北望长安|250|h","可怜无数山|250|h","青山遮不住|250|h","毕竟东流去|250|h","江晚正愁余|250|h","山深闻鹧鸪|250|h","一片能教一断肠|251|h","可堪平砌更堆墙|251|h","飘如迁客来过岭|251|h","坠似骚人去赴湘|251|h","乱点莓苔多莫数|251|h","偶粘衣袖久犹香|251|h","东风谬掌花权柄|251|h","却忌孤高不主张|251|h","雪虐风饕愈凛然|252|h","花中气节最高坚|252|h","过时自合飘零去|252|h","耻向东君更乞怜|252|h","少年听雨歌楼上|253|m","红烛昏罗帐|253|m","壮年听雨客舟中|253|m","断雁叫西风|253|m","而今听雨僧庐下|253|m","鬓已星星也|253|m","悲欢离合总无情|253|m","点滴到天明|253|m","昨日入城市|254|m","归来泪满巾|254|m","遍身罗绮者|254|m","不是养蚕人|254|m","槛菊愁烟兰泣露|255|m","燕子双飞去|255|m","明月不谙离恨苦|255|m","斜光到晓穿朱户|255|m","昨夜西风凋碧树|255|m","望尽天涯路|255|m","欲寄彩笺兼尺素|255|m","山长水阔知何处|255|m","伫倚危楼风细细|256|m","黯黯生天际|256|m","草色烟光残照里|256|m","无言谁会凭阑意|256|m","拟把疏狂图一醉|256|m","强乐还无味|256|m","衣带渐宽终不悔|256|m","为伊消得人憔悴|256|m","庭院深深深几许|257|m","帘幕无重数|257|m","玉勒雕鞍游冶处|257|m","楼高不见章台路|257|m","雨横风狂三月暮|257|m","无计留春住|257|m","泪眼问花花不语|257|m","乱红飞过秋千去|257|m","花褪残红青杏小|258|m","绿水人家绕|258|m","枝上柳绵吹又少|258|m","天涯何处无芳草|258|m","墙里秋千墙外道|258|m","墙里佳人笑|258|m","笑渐不闻声渐悄|258|m","多情却被无情恼|258|m","飞花两岸照船红|259|m","百里榆堤半日风|259|m","卧看满天云不动|259|m","不知云与我俱东|259|m","稻花香里说丰年|260|m","旧时茅店社林边|260|m","山围故国绕清江|261|m","怒涛寂寞打孤城|261|m","半亩方塘一鉴开|262|m","天光云影共徘徊|262|m","问渠那得清如许|262|m","为有源头活水来|262|m","昨夜江边春水生|263|m","蒙冲巨舰一毛轻|263|m","向来枉费推移力|263|m","此日中流自在行|263|m","当年万里觅封侯|264|h","匹马戍梁州|264|h","尘暗旧貂裘|264|h","自古功名亦苦辛|265|m","行藏终欲付何人|265|m","当时黮闇犹承误|265|m","末俗纷纭更乱真|265|m","甚矣吾衰矣|266|h","我见青山多妩媚|266|h","一尊搔首东窗里|266|h","江左沉酣求名者|266|h","不恨古人吾不见|266|h","绿树听鹈鴂|267|h","啼到春归无寻处|267|h","马上琵琶关塞黑|267|h","将军百战身名裂|267|h","易水萧萧西风冷|267|h","啼鸟还知如许恨|267|h","北望神州路|268|m","记得太行山百万|268|m","君去京东豪杰喜|268|m","下拜真吾父|268|m","荷尽已无擎雨盖|269|m","菊残犹有傲霜枝|269|m","一年好景君须记|269|m","最是橙黄橘绿时|269|m","草薰风暖摇征辔|270|m","离愁渐远渐无穷|270|m","迢迢不断如春水|270|m","楼高莫近危阑倚|270|m","平芜尽处是春山|270|m","行人更在春山外|270|m","桃源望断无寻处|271|m","可堪孤馆闭春寒|271|m","杜鹃声里斜阳暮|271|m","砌成此恨无重数|271|m","郴江幸自绕郴山|271|m","为谁流下潇湘去|271|m","卜宅新息仅留期|272|m","更作留侯计亦迟|272|m","黄阁风烟那复问|272|m","青山泉石本无期|272|m","莫言下岭便无难|273|m","赚得行人空喜欢|273|m","正入万山圈子里|273|m","一山放过一山拦|273|m","辛苦遭逢起一经|274|h","干戈寥落四周星|274|h","山河破碎风飘絮|274|h","身世浮沉雨打萍|274|h","惶恐滩头说惶恐|274|h","零丁洋里叹零丁|274|h","人生自古谁无死|274|h","留取丹心照汗青|274|h","三月残花落更开|275|m","小檐日日燕飞来|275|m","子规夜半犹啼血|275|m","不信东风唤不回|275|m","薄雾浓云愁永昼|276|h","瑞脑销金兽|276|h","佳节又重阳|276|h","半夜凉初透|276|h","东篱把酒黄昏后|276|h","有暗香盈袖|276|h","莫道不销魂|276|h","人比黄花瘦|276|h","群芳过后西湖好|277|m","垂柳阑干尽日风|277|m","笙歌散尽游人去|277|m","双燕归来细雨中|277|m","一天秋色冷晴湾|278|h","无数峰峦远近间|278|h","闲上山来看野水|278|h","忽于水底见青山|278|h","满城春色宫墙柳|279|h","泪痕红浥鲛绡透|279|h","涧水无声绕竹流|280|m","竹西花草弄春柔|280|m","茅檐相对坐终日|280|m","一鸟不鸣山更幽|280|m","梅子留酸软齿牙|281|m","芭蕉分绿与窗纱|281|m","日长睡起无情思|281|m","闲看儿童捉柳花|281|m","满川风雨独凭栏|282|m","绾结湘娥十二鬟|282|m","可惜不当湖水面|282|m","银山堆里看青山|282|m","一雨池塘水面平|283|m","淡磨明镜照檐楹|283|m","东风忽起垂杨舞|283|m","更作荷心万点声|283|m","竟无语凝噎|284|h","暮霭沉沉楚天阔|284|h","多情自古伤离别|284|h","冷落清秋节|284|h","便纵有千种风情|284|h","更与何人说|284|h","梅雪争春未肯降|285|m","骚人阁笔费评章|285|m","梅须逊雪三分白|285|m","雪却输梅一段香|285|m","有梅无雪不精神|286|m","有雪无诗俗了人|286|m","日暮诗成天又雪|286|m","与梅并作十分春|286|m","凌波不过横塘路|287|m","锦瑟华年谁与度|287|m","只有春知处|287|m","飞云冉冉蘅皋暮|287|m","彩笔新题断肠句|287|m","试问闲愁都几许|287|m","梅子黄时雨|287|m","东风夜放花千树|288|h","宝马雕车香满路|288|h","一夜鱼龙舞|288|h","蛾儿雪柳黄金缕|288|h","笑语盈盈暗香去|288|h","众里寻他千百度|288|h","灯火阑珊处|288|h","山外青山楼外楼|289|m","西湖歌舞几时休|289|m","暖风熏得游人醉|289|m","直把杭州作汴州|289|m","寺里山因花得名|290|m","繁英不见草纵横|290|m","栽培剪伐须勤力|290|m","花易凋零草易生|290|m","横看成岭侧成峰|291|m","远近高低各不同|291|m","不识庐山真面目|291|m","只缘身在此山中|291|m","水光潋滟晴方好|293|m","山色空蒙雨亦奇|293|m","欲把西湖比西子|293|m","淡妆浓抹总相宜|293|m","金风玉露一相逢|294|h","便胜却人间无数|294|h","两情若是久长时|294|h","又岂在朝朝暮暮|294|h","彩袖殷勤捧玉钟|295|m","当年拚却醉颜红|295|m","舞低杨柳楼心月|295|m","歌尽桃花扇底风|295|m","几回魂梦与君同|295|m","今宵剩把银釭照|295|m","犹恐相逢是梦中|295|m","陌上柔桑破嫩芽|296|m","东邻蚕种已生些|296|m","平冈细草鸣黄犊|296|m","斜日寒林点暮鸦|296|m","青旗沽酒有人家|296|m","城中桃李愁风雨|296|m","春在溪头荠菜花|296|m","日暮鸟雀稀|297|m","稚子呼牛归|297|m","住处无利害|297|m","勿言翁独非|297|m","雨歇杨林东渡头|299|m","永和三日荡轻舟|299|m","故人家在桃花岸|299|m","直到门前溪水流|299|m","沅湘流不尽|300|m","屈子怨何深|300|m","日暮秋风起|300|m","萧萧枫树林|300|m","不见李生久|301|m","佯狂真可哀|301|m","世人皆欲杀|301|m","吾意独怜才|301|m","敏捷诗千首|301|m","飘零酒一杯|301|m","匡山读书处|301|m","头白好归来|301|m","人事有代谢|302|m","往来成古今|302|m","江山留胜迹|302|m","我辈复登临|302|m","水落鱼梁浅|302|m","天寒梦泽深|302|m","羊公碑尚在|302|m","读罢泪沾襟|302|m","将军魏武之子孙|303|h","于今为庶为清门|303|h","英雄割据虽已矣|303|h","文采风流今尚存|303|h","学书初学卫夫人|303|h","但恨无过王右军|303|h","丹青不知老将至|303|h","富贵于我如浮云|303|h","开元之中常引见|303|h","承恩数上南薰殿|303|h","凌烟功臣少颜色|303|h","将军下笔开生面|303|h","良骥头上盘戏龙|303|h","一洗万古凡马空|303|h","为有云屏无限娇|304|m","凤城寒尽怕春宵|304|m","无端嫁得金龟婿|304|m","辜负香衾事早朝|304|m","三月三日天气新|305|h","长安水边多丽人|305|h","态浓意远淑且真|305|h","肌理细腻骨肉匀|305|h","绣罗衣裳照暮春|305|h","蹙金孔雀银麒麟|305|h","头上何所有|305|h","翠微盍叶垂鬓唇|305|h","背后何所见|305|h","珠压腰衱稳称身|305|h","就中云幕椒房亲|305|h","赐名大国虢与秦|305|h","紫驼之峰出翠釜|305|h","水精之盘行素鳞|305|h","犀箸厌饫久未下|305|h","鸾刀缕切空纷纶|305|h","黄门飞鞚不动尘|305|h","御厨络绎送八珍|305|h","箫鼓哀吟感鬼神|305|h","宾从杂遝实要津|305|h","后来鞍马何逡巡|305|h","当轩下马入锦茵|305|h","杨花雪落覆白苹|305|h","青鸟飞去衔红巾|305|h","炙手可热势绝伦|305|h","慎莫近前丞相嗔|305|h","朱雀桥边野草花|307|m","乌衣巷口夕阳斜|307|m","旧时王谢堂前燕|307|m","飞入寻常百姓家|307|m","向晚意不适|308|m","驱车登古原|308|m","夕阳无限好|308|m","只是近黄昏|308|m","老去悲秋强自宽|309|m","兴来今日尽君欢|309|m","羞将短发还吹帽|309|m","笑倩旁人为正冠|309|m","蓝水远从千涧落|309|m","玉山高并两峰寒|309|m","明年此会知谁健|309|m","醉把茱萸仔细看|309|m","独在异乡为异客|310|m","每逢佳节倍思亲|310|m","遥知兄弟登高处|310|m","遍插茱萸少一人|310|m","九月九日眺山川|311|m","归心归望积风烟|311|m","他乡共酌金花酒|311|m","万里同悲鸿雁天|311|m","七夕今宵看碧霄|312|m","牵牛织女渡河桥|312|m","家家乞巧望秋月|312|m","穿尽红丝几万条|312|m","绿遍山原白满川|313|m","子规声里雨如烟|313|m","乡村四月闲人少|313|m","才了蚕桑又插田|313|m","长镵长镵白木柄|314|h","我生托子以为命|314|h","黄精无苗山雪盛|314|h","短衣数挽不掩胫|314|h","此时与子空归来|314|h","男呻女吟四壁静|314|h","邻里为我色惆怅|314|h","二月二日江上行|315|m","东风日暖闻吹笙|315|m","花须柳眼各无赖|315|m","紫蝶黄蜂俱有情|315|m","此地别燕丹|316|m","壮士发冲冠|316|m","昔时人已没|316|m","今日水犹寒|316|m","东西那有碍|317|e","出处岂虚心|317|e","晓入洞庭阔|317|e","春归云梦深|317|e","烽火照西京|318|m","心中自不平|318|m","牙璋辞凤阙|318|m","铁骑绕龙城|318|m","雪暗凋旗画|318|m","风多杂鼓声|318|m","宁为百夫长|318|m","胜作一书生|318|m","青海长云暗雪山|319|m","孤城遥望玉门关|319|m","黄沙百战穿金甲|319|m","不破楼兰终不还|319|m","琵琶起舞换新声|320|m","总是关山旧别情|320|m","撩乱边愁听不尽|320|m","高高秋月照长城|320|m","大漠风尘日色昏|321|m","红旗半卷出辕门|321|m","前军夜战洮河北|321|m","已报生擒吐谷浑|321|m","九日驱驰一日闲|322|m","寻君不遇又空还|322|m","怪来诗思清人骨|322|m","门对寒流雪满山|322|m","二月卖新丝|323|m","五月粜新谷|323|m","医得眼前疮|323|m","剜却心头肉|323|m","我愿君王心|323|m","化作光明烛|323|m","不照绮罗筵|323|m","只照逃亡屋|323|m","单车欲问边|324|h","属国过居延|324|h","征蓬出汉塞|324|h","归雁入胡天|324|h","大漠孤烟直|324|h","长河落日圆|324|h","萧关逢候骑|324|h","都护在燕然|324|h","紫陌红尘拂面来|325|m","无人不道看花回|325|m","玄都观里桃千树|325|m","尽是刘郎去后栽|325|m","功盖三分国|326|m","名成八阵图|326|m","江流石不转|326|m","遗恨失吞吴|326|m","种花满西园|327|m","花发青楼道|327|m","花下一禾生|327|m","去之为恶草|327|m","凉月如眉挂柳湾|328|m","越中山色镜中看|328|m","兰溪三日桃花雨|328|m","半夜鲤鱼来上滩|328|m","明月出天山|329|h","苍茫云海间|329|h","长风几万里|329|h","吹度玉门关|329|h","行人弓箭各在腰|330|h","耶娘妻子走相送|330|h","尘埃不见咸阳桥|330|h","牵衣顿足拦道哭|330|h","哭声直上干云霄|330|h","道旁过者问行人|330|h","行人但云点行频|330|h","或从十五北防河|330|h","便至四十西营田|330|h","去时里正与裹头|330|h","归来头白还戍边|330|h","边庭流血成海水|330|h","武皇开边意未已|330|h","千村万落生荆杞|330|h","纵有健妇把锄犁|330|h","禾生陇亩无东西|330|h","况复秦兵耐苦战|330|h","被驱不异犬与鸡|330|h","长者虽有问|330|h","役夫敢申恨|330|h","且如今年冬|330|h","未休关西卒|330|h","县官急索租|330|h","租税从何出|330|h","信知生男恶|330|h","反是生女好|330|h","生女犹得嫁比邻|330|h","生男埋没随百草|330|h","古来白骨无人收|330|h","新鬼烦冤旧鬼哭|330|h","天阴雨湿声啾啾|330|h","百亩庭中半是苔|331|m","桃花净尽菜花开|331|m","种桃道士归何处|331|m","前度刘郎今又来|331|m","去岁曾经此县城|332|m","县民无口不冤声|332|m","今来县宰加朱绂|332|m","便是生灵血染成|332|m","骝马新跨白玉鞍|333|m","战罢沙场月色寒|333|m","城头铁鼓声犹震|333|m","匣里金刀血未干|333|m","夜半呼儿趁晓耕|334|m","羸牛无力渐艰行|334|m","时人不识农家苦|334|m","将谓田中谷自生|334|m","黄河远上白云间|335|m","一片孤城万仞山|335|m","羌笛何须怨杨柳|335|m","春风不度玉门关|335|m","葡萄美酒夜光杯|336|m","欲饮琵琶马上催|336|m","醉卧沙场君莫笑|336|m","古来征战几人回|336|m","客去波平槛|337|m","蝉休露满枝|337|m","永怀当此节|337|m","倚立自移时|337|m","北斗兼春远|337|m","南陵寓使迟|337|m","天涯占梦数|337|m","疑误有新知|337|m","秦时明月汉时关|338|m","万里长征人未还|338|m","但使龙城飞将在|338|m","不教胡马度阴山|338|m","居延城外猎天骄|339|m","白草连天野火烧|339|m","暮云空碛时驱马|339|m","秋日平原好射雕|339|m","护羌校尉朝乘障|339|m","破虏将军夜渡辽|339|m","玉靶角弓珠勒马|339|m","汉家将赐霍嫖姚|339|m","嫩箨香苞初出林|340|m","於陵论价重如金|340|m","皇都陆海应无数|340|m","忍剪凌云一寸心|340|m","澹然空水对斜晖|341|m","曲岛苍茫接翠微|341|m","波上马嘶看棹去|341|m","柳边人歇待船归|341|m","霜华净天末|342|e","雾色锁江干|342|e","风度蝉声远|342|e","云开雁路残|342|e","千里黄云白日曛|343|e","北风吹雁雪纷纷|343|e","莫愁前路无知己|343|e","天下谁人不识君|343|e","六翮飘飖私自怜|344|e","一离京洛十余年|344|e","丈夫贫贱应未足|344|e","今日相逢无酒钱|344|e","挽弓当挽强|345|m","用箭当用长|345|m","射人先射马|345|m","擒贼先擒王|345|m","杀人亦有限|345|m","列国自有疆|345|m","苟能制侵陵|345|m","岂在多杀伤|345|m","十年磨一剑|346|m","霜刃未曾试|346|m","今日把示君|346|m","谁有不平事|346|m","残阳西入崦|347|m","茅屋访孤僧|347|m","落叶人何在|347|m","寒云路几层|347|m","独敲初夜磬|347|m","闲倚一枝藤|347|m","世界微尘里|347|m","吾宁爱与憎|347|m","中庭地白树栖鸦|348|m","冷露无声湿桂花|348|m","今夜月明人尽望|348|m","不知秋思落谁家|348|m","伐薪烧炭南山中|349|h","满面尘灰烟火色|349|h","两鬓苍苍十指黑|349|h","卖炭得钱何所营|349|h","身上衣裳口中食|349|h","可怜身上衣正单|349|h","心忧炭贱愿天寒|349|h","夜来城外一尺雪|349|h","晓驾炭车辗冰辙|349|h","牛困人饥日已高|349|h","市南门外泥中歇|349|h","翩翩两骑来是谁|349|h","黄衣使者白衫儿|349|h","手把文书口称敕|349|h","回车叱牛牵向北|349|h","宫使驱将惜不得|349|h","半匹红绡一丈绫|349|h","系向牛头充炭直|349|h","南浦凄凄别|350|e","西风袅袅秋|350|e","一看肠一断|350|e","好去莫回头|350|e","澹澹长江水|351|e","悠悠远客情|351|e","落花相与恨|351|e","到地一无声|351|e","武陵溪口驻扁舟|352|m","溪水随君向北流|352|m","行到荆门上三峡|352|m","莫将孤月对猿愁|352|m","堂前扑枣任西邻|353|m","无食无儿一妇人|353|m","不为困穷宁有此|353|m","只缘恐惧转须亲|353|m","即防远客虽多事|353|m","便插疏篱却甚真|353|m","已诉征求贫到骨|353|m","正思戎马泪盈巾|353|m","白日登山望烽火|354|m","黄昏饮马傍交河|354|m","行人刁斗风沙暗|354|m","公主琵琶幽怨多|354|m","虽复沉埋无所用|355|m","犹能夜夜气冲天|355|m","男儿事长征|356|m","少小幽燕客|356|m","赌胜马蹄下|356|m","由来轻七尺|356|m","小时不识月|357|e","呼作白玉盘|357|e","又疑瑶台镜|357|e","飞在青云端|357|e","孔明庙前有老柏|358|h","柯如青铜根如石|358|h","霜皮溜雨四十围|358|h","黛色参天二千尺|358|h","君臣已与时际会|358|h","树木犹为人爱惜|358|h","云来气接巫峡长|358|h","月出寒通雪山白|358|h","忆昨路绕锦亭东|358|h","先主武侯同閟宫|358|h","崔嵬枝干郊原古|358|h","窈窕丹青户牖空|358|h","落落盘踞虽得地|358|h","冥冥孤高多烈风|358|h","扶持自是神明力|358|h","正直原因造化功|358|h","大厦如倾要梁栋|358|h","万牛回首丘山重|358|h","不露文章世已惊|358|h","未辞剪伐谁能送|358|h","苦心未免容蝼蚁|358|h","香叶终经宿鸾凤|358|h","志士幽人莫怨嗟|358|h","古来材大难为用|358|h","自恨寻芳到已迟|359|m","往年曾见未开时|359|m","如今风摆花狼藉|359|m","绿叶成阴子满枝|359|m","高卧南斋时|360|m","开帷月初吐|360|m","清辉淡水木|360|m","演漾在窗户|360|m","苒苒几盈虚|360|m","澄澄变今古|360|m","美人清江畔|360|m","是夜越吟苦|360|m","千里其如何|360|m","微风吹兰杜|360|m","有客有客字子美|361|h","白头乱发垂过耳|361|h","岁拾橡栗随狙公|361|h","天寒日暮山谷里|361|h","中原无书归不得|361|h","手脚冻皴皮肉死|361|h","悲风为我从天来|361|h","危冠广袖楚宫妆|362|m","独步闲庭逐夜凉|362|m","自把玉钗敲砌竹|362|m","清歌一曲月如霜|362|m","鸣筝金粟柱|363|e","素手玉房前|363|e","欲得周郎顾|363|e","时时误拂弦|363|e","蔡女昔造胡笳声|364|m","一弹一十有八拍|364|m","胡人落泪沾边草|364|m","汉使断肠对归客|364|m","蜀僧抱绿绮|365|m","西下峨眉峰|365|m","为我一挥手|365|m","如听万壑松|365|m","客心洗流水|365|m","余响入霜钟|365|m","不觉碧山暮|365|m","秋云暗几重|365|m","高秋夜分后|366|e","远客雁来时|366|e","明月余清影|366|e","秋风生桂枝|366|e","独有宦游人|367|m","偏惊物候新|367|m","云霞出海曙|367|m","梅柳渡江春|367|m","淑气催黄鸟|367|m","晴光转绿蘋|367|m","胡人吹笛戍楼间|368|m","楼上萧条海月闲|368|m","借问落梅凡几曲|368|m","从风一夜满关山|368|m","鸡鸣紫陌曙光寒|369|m","莺啭皇州春色阑|369|m","金阙晓钟开万户|369|m","玉阶仙仗拥千官|369|m","花迎剑佩星初落|369|m","柳拂旌旗露未干|369|m","独有凤凰池上客|369|m","阳春一曲和皆难|369|m","绛帻鸡人报晓筹|370|m","尚衣方进翠云裘|370|m","九天阊阖开宫殿|370|m","万国衣冠拜冕旒|370|m","日色才临仙掌动|370|m","香烟欲傍衮龙浮|370|m","朝罢须裁五色诏|370|m","佩声归到凤池头|370|m","尚有绨袍赠|371|m","应怜范叔寒|371|m","不知天下士|371|m","犹作布衣看|371|m","群山万壑赴荆门|372|m","生长明妃尚有村|372|m","一去紫台连朔漠|372|m","独留青冢向黄昏|372|m","画图省识春风面|372|m","环珮空归夜月魂|372|m","千载琵琶作胡语|372|m","分明怨恨曲中论|372|m","支离东北风尘际|373|m","漂泊西南天地间|373|m","三峡楼台淹日月|373|m","五溪衣服共云山|373|m","羯胡事主终无赖|373|m","词客哀时且未还|373|m","庾信平生最萧瑟|373|m","暮年诗赋动江关|373|m","摇落深知宋玉悲|374|m","风流儒雅亦吾师|374|m","怅望千秋一洒泪|374|m","萧条异代不同时|374|m","江山故宅空文藻|374|m","云雨荒台岂梦思|374|m","最是楚宫俱泯灭|374|m","舟人指点到今疑|374|m","诸葛大名垂宇宙|375|m","宗臣遗像肃清高|375|m","三分割据纡筹策|375|m","万古云霄一羽毛|375|m","伯仲之间见伊吕|375|m","指挥若定失萧曹|375|m","运移汉祚终难复|375|m","志决身歼军务劳|375|m","蜀主窥吴幸三峡|376|m","崩年亦在永安宫|376|m","翠华想像空山里|376|m","玉殿虚无野寺中|376|m","古庙杉松巢水鹤|376|m","岁时伏腊走村翁|376|m","武侯祠屋常邻近|376|m","一体君臣祭祀同|376|m","碧玉妆成一树高|377|e","万条垂下绿丝绦|377|e","不知细叶谁裁出|377|e","二月春风似剪刀|377|e","逐舞飘轻袖|379|e","传歌共绕梁|379|e","动枝生乱影|379|e","吹花送远香|379|e","曲项向天歌|380|e","白毛浮绿水|380|e","红掌拨清波|380|e","一上高城万里愁|381|h","蒹葭杨柳似汀洲|381|h","溪云初起日沉阁|381|h","山雨欲来风满楼|381|h","鸟下绿芜秦苑夕|381|h","蝉鸣黄叶汉宫秋|381|h","行人莫问当年事|381|h","故国东来渭水流|381|h","少陵野老吞声哭|382|h","春日潜行曲江曲|382|h","江头宫殿锁千门|382|h","细柳新蒲为谁绿|382|h","忆昔霓旌下南苑|382|h","苑中万物生颜色|382|h","昭阳殿里第一人|382|h","同辇随君侍君侧|382|h","辇前才人带弓箭|382|h","白马嚼啮黄金勒|382|h","翻身向天仰射云|382|h","一笑正坠双飞翼|382|h","明眸皓齿今何在|382|h","血污游魂归不得|382|h","清渭东流剑阁深|382|h","去住彼此无消息|382|h","人生有情泪沾臆|382|h","江水江花岂终极|382|h","黄昏胡骑尘满城|382|h","欲往城南望城北|382|h","长安城头头白乌|383|h","夜飞延秋门上呼|383|h","又向人家啄大屋|383|h","屋底达官走避胡|383|h","金鞭断折九马死|383|h","骨肉不待同驰驱|383|h","腰下宝玦青珊瑚|383|h","可怜王孙泣路隅|383|h","问之不肯道姓名|383|h","但道困苦乞奴卢|383|h","已经百日窜荆棘|383|h","身上无有完肌肤|383|h","高帝子孙尽隆准|383|h","龙种自与常人殊|383|h","豺狼在邑龙在野|383|h","王孙善保千金躯|383|h","不敢长语临交衢|383|h","且为王孙立斯须|383|h","昨夜东风吹血腥|383|h","东来橐驼满旧都|383|h","朔方健儿好身手|383|h","昔何勇锐今何愚|383|h","窃闻天子已传位|383|h","圣德北服南单于|383|h","花门剺面请雪耻|383|h","慎勿出口他人狙|383|h","哀哉王孙慎勿疏|383|h","五陵佳气无时无|383|h","北斗七星高|384|m","哥舒夜带刀|384|m","至今窥牧马|384|m","不敢过临洮|384|m","晨起动征铎|385|m","客行悲故乡|385|m","鸡声茅店月|385|m","人迹板桥霜|385|m","槲叶落山路|385|m","枳花明驿墙|385|m","因思杜陵梦|385|m","凫雁满回塘|385|m","少小离家老大回|386|m","乡音无改鬓毛衰|386|m","儿童相见不相识|386|m","笑问客从何处来|386|m","离别家乡岁月多|387|m","近来人事半消磨|387|m","惟有门前镜湖水|387|m","春风不改旧时波|387|m","西陆蝉声唱|388|m","南冠客思深|388|m","不堪玄鬓影|388|m","来对白头吟|388|m","露重飞难进|388|m","风多响易沉|388|m","无人信高洁|388|m","谁为表予心|388|m","四郊未宁静|389|h","垂老不得安|389|h","子孙阵亡尽|389|h","焉用身独完|389|h","投杖出门去|389|h","同行为辛酸|389|h","幸有牙齿存|389|h","所悲骨髓干|389|h","男儿既介胄|389|h","长揖别上官|389|h","老妻卧路啼|389|h","岁暮衣裳单|389|h","孰知是死别|389|h","且复伤其寒|389|h","此去必不归|389|h","还闻劝加餐|389|h","土门壁甚坚|389|h","杏园度亦难|389|h","势异邺城下|389|h","纵死时犹宽|389|h","人生有离合|389|h","岂择衰盛端|389|h","忆昔少壮日|389|h","迟回竟长叹|389|h","万国尽征戍|389|h","烽火被冈峦|389|h","积尸草木腥|389|h","流血川原丹|389|h","何乡为乐土|389|h","安敢尚盘桓|389|h","弃绝蓬室居|389|h","塌然摧肺肝|389|h","诗家清景在新春|390|m","绿柳才黄半未匀|390|m","若待上林花似锦|390|m","出门俱是看花人|390|m","酒旗相望大堤头|391|m","堤下连樯堤上楼|391|m","日暮行人争渡急|391|m","桨声幽轧满中流|391|m","汉家旌帜满阴山|392|m","不遣胡儿匹马还|392|m","愿得此身长报国|392|m","何须生入玉门关|392|m","蝉鸣空桑林|393|m","八月萧关道|393|m","出塞入塞寒|393|m","处处黄芦草|393|m","从来幽并客|393|m","皆共尘沙老|393|m","莫学游侠儿|393|m","矜夸紫骝好|393|m","月黑雁飞高|394|m","单于夜遁逃|394|m","欲将轻骑逐|394|m","大雪满弓刀|394|m","林暗草惊风|395|m","将军夜引弓|395|m","平明寻白羽|395|m","没在石棱中|395|m","玉帛朝回望帝乡|396|m","乌孙归去不称王|396|m","天涯静处无征战|396|m","兵气销为日月光|396|m","鹫翎金仆姑|397|m","燕尾绣蝥弧|397|m","独立扬新令|397|m","千营共一呼|397|m","回乐烽前沙似雪|398|h","受降城外月如霜|398|h","不知何处吹芦管|398|h","一夜征人尽望乡|398|h","危楼高百尺|399|e","手可摘星辰|399|e","不敢高声语|399|e","恐惊天上人|399|e","山寺钟鸣昼已昏|400|m","渔梁渡头争渡喧|400|m","人随沙岸向江村|400|m","余亦乘舟归鹿门|400|m","鹿门月照开烟树|400|m","忽到庞公栖隐处|400|m","岩扉松径长寂寥|400|m","惟有幽人自来去|400|m","君问归期未有期|401|m","巴山夜雨涨秋池|401|m","何当共剪西窗烛|401|m","却话巴山夜雨时|401|m","已讶衾枕冷|402|e","复见窗户明|402|e","夜深知雪重|402|e","时闻折竹声|402|e","人间四月芳菲尽|403|m","山寺桃花始盛开|403|m","长恨春归无觅处|403|m","不知转入此中来|403|m","凉风起天末|404|m","君子意如何|404|m","鸿雁几时到|404|m","江湖秋水多|404|m","文章憎命达|404|m","魑魅喜人过|404|m","应共冤魂语|404|m","投诗赠汨罗|404|m","春日在天涯|405|m","天涯日又斜|405|m","莺啼如有泪|405|m","为湿最高花|405|m","渭水自萦秦塞曲|406|m","黄山旧绕汉宫斜|406|m","銮舆迥出千门柳|406|m","阁道回看上苑花|406|m","云里帝城双凤阙|406|m","雨中春树万人家|406|m","为乘阳气行时令|406|m","不是宸游玩物华|406|m","东望望春春可怜|407|e","更逢晴日柳含烟|407|e","纨袴不饿死|408|h","儒冠多误身|408|h","丈人试静听|408|h","贱子请具陈|408|h","甫昔少年日|408|h","早充观国宾|408|h","读书破万卷|408|h","下笔如有神|408|h","赋料扬雄敌|408|h","诗看子建亲|408|h","李邕求识面|408|h","王翰愿为邻|408|h","自谓颇挺出|408|h","立登要路津|408|h","致君尧舜上|408|h","再使风俗淳|408|h","此意竟萧条|408|h","行歌非隐沦|408|h","骑驴三十载|408|h","旅食京华春|408|h","朝扣富儿门|408|h","暮随肥马尘|408|h","残杯与冷炙|408|h","到处潜悲辛|408|h","乳燕入巢笋成竹|409|m","谁家二女种新谷|409|m","无人无牛不及犁|409|m","持刀斫地翻作泥|409|m","云母屏风烛影深|410|m","长河渐落晓星沉|410|m","嫦娥应悔偷灵药|410|m","碧海青天夜夜心|410|m","明朝驿使发|411|m","一夜絮征袍|411|m","素手抽针冷|411|m","那堪把剪刀|411|m","裁缝寄远道|411|m","几日到临洮|411|m","镜湖三百里|412|m","菡萏发荷花|412|m","五月西施采|412|m","人看隘若耶|412|m","回舟不待月|412|m","归去越王家|412|m","秦地罗敷女|413|m","采桑绿水边|413|m","素手青条上|413|m","红妆白日鲜|413|m","蚕饥妾欲去|413|m","五马莫留连|413|m","长安一片月|414|m","万户捣衣声|414|m","秋风吹不尽|414|m","总是玉关情|414|m","何日平胡虏|414|m","良人罢远征|414|m","孤雁不饮啄|415|m","飞鸣声念群|415|m","谁怜一片影|415|m","相失万重云|415|m","望尽似犹见|415|m","哀多如更闻|415|m","野鸦无意绪|415|m","鸣噪自纷纷|415|m","迢递高城百尺楼|416|h","绿杨枝外尽汀洲|416|h","贾生年少虚垂涕|416|h","王粲春来更远游|416|h","兰陵美酒郁金香|417|m","玉碗盛来琥珀光|417|m","但使主人能醉客|417|m","不知何处是他乡|417|m","舍南舍北皆春水|418|h","但见群鸥日日来|418|h","花径不曾缘客扫|418|h","蓬门今始为君开|418|h","盘飧市远无兼味|418|h","樽酒家贫只旧醅|418|h","肯与邻翁相对饮|418|h","隔篱呼取尽余杯|418|h","昨日之日不可留|419|h","今日之日多烦忧|419|h","长风万里送秋雁|419|h","对此可以酣高楼|419|h","蓬莱文章建安骨|419|h","中间小谢又清发|419|h","俱怀逸兴壮思飞|419|h","欲上青天揽明月|419|h","抽刀断水水更流|419|h","举杯消愁愁更愁|419|h","人生在世不称意|419|h","明朝散发弄扁舟|419|h","故国三千里|420|m","深宫二十年|420|m","一声何满子|420|m","双泪落君前|420|m","清秋幕府井梧寒|421|m","独宿江城蜡炬残|421|m","永夜角声悲自语|421|m","中天月色好谁看|421|m","风尘荏苒音书绝|421|m","关塞萧条行路难|421|m","已忍伶俜十年事|421|m","强移栖息一枝安|421|m","移舟泊烟渚|422|m","日暮客愁新|422|m","野旷天低树|422|m","江清月近人|422|m","山暝听猿愁|423|m","沧江急夜流|423|m","风鸣两岸叶|423|m","月照一孤舟|423|m","建德非吾土|423|m","维扬忆旧游|423|m","还将两行泪|423|m","遥寄海西头|423|m","清溪深不测|424|m","隐处唯孤云|424|m","松际露微月|424|m","清光犹为君|424|m","竹坞无尘水槛清|425|m","相思迢递隔重城|425|m","秋阴不散霜飞晚|425|m","留得枯荷听雨声|425|m","联步趋丹陛|426|m","分曹限紫微|426|m","晓随天仗入|426|m","暮惹御香归|426|m","白发悲花落|426|m","青云羡鸟飞|426|m","圣朝无阙事|426|m","自觉谏书稀|426|m","青山隐隐水迢迢|427|m","秋尽江南草未凋|427|m","二十四桥明月夜|427|m","玉人何处教吹箫|427|m","去年花里逢君别|428|m","今日花开又一年|428|m","世事茫茫难自料|428|m","春愁黯黯独成眠|428|m","寒月沉沉洞房静|429|m","真珠帘外梧桐影|429|m","秋霜欲下手先知|429|m","灯底裁缝剪刀冷|429|m","春城无处不飞花|430|m","寒食东风御柳斜|430|m","日暮汉宫传蜡烛|430|m","轻烟散入五侯家|430|m","清溪一道穿桃李|431|m","演漾绿蒲涵白芷|431|m","溪上人家凡几家|431|m","落花半落东流水|431|m","蹴踘屡过飞鸟上|431|m","秋千竞出垂杨里|431|m","少年欢乐日已老|431|m","谁能今朝更如此|431|m","一路经行处|432|m","莓苔见履痕|432|m","白云依静渚|432|m","春草闭闲门|432|m","过雨看松色|432|m","随山到水源|432|m","溪花与禅意|432|m","相对亦忘言|432|m","松下问童子|433|e","言师采药去|433|e","只在此山中|433|e","云深不知处|433|e","我本渔樵孟诸野|434|m","一生自是悠悠者|434|m","乍可狂歌草泽中|434|m","宁堪作吏风尘下|434|m","清时有味是无能|435|m","闲爱孤云静爱僧|435|m","欲把一麾江海去|435|m","乐游原上望昭陵|435|m","奔流到海不复回|436|h","朝如青丝暮成雪|436|h","人生得意须尽欢|436|h","莫使金樽空对月|436|h","天生我材必有用|436|h","千金散尽还复来|436|h","烹羊宰牛且为乐|436|h","会须一饮三百杯|436|h","与君歌一曲|436|h","请君为我倾耳听|436|h","钟鼓馔玉不足贵|436|h","但愿长醉不复醒|436|h","古来圣贤皆寂寞|436|h","惟有饮者留其名|436|h","陈王昔时宴平乐|436|h","斗酒十千恣欢谑|436|h","主人何为言少钱|436|h","径须沽取对君酌|436|h","呼儿将出换美酒|436|h","与尔同销万古愁|436|h","佳辰强饮食犹寒|437|m","隐几萧条戴鹖冠|437|m","春水船如天上坐|437|m","老年花似雾中看|437|m","娟娟戏蝶过闲幔|437|m","片片轻鸥下急湍|437|m","云白山青万余里|437|m","愁看直北是长安|437|m","自小刺头深草里|438|m","而今渐觉出蓬蒿|438|m","时人不识凌云木|438|m","直待凌云始道高|438|m","花雪随风不厌看|439|m","更多还肯失林峦|439|m","愁人正在书窗下|439|m","一片飞来一片寒|439|m","长江悲已滞|440|e","万里念将归|440|e","况属高风晚|440|e","山山黄叶飞|440|e","夫因兵死守蓬茅|441|m","麻苎衣衫鬓发焦|441|m","桑柘废来犹纳税|441|m","田园荒后尚征苗|441|m","时挑野菜和根煮|441|m","旋斫生柴带叶烧|441|m","任是深山更深处|441|m","也应无计避征徭|441|m","问余何意栖碧山|442|m","笑而不答心自闲|442|m","桃花流水窅然去|442|m","别有天地非人间|442|m","寂寞掩柴扉|443|m","苍茫对落晖|443|m","鹤巢松树遍|443|m","人访荜门稀|443|m","绿竹含新粉|443|m","红莲落故衣|443|m","渡头烟火起|443|m","处处采菱归|443|m","空山新雨后|444|m","天气晚来秋|444|m","明月松间照|444|m","清泉石上流|444|m","竹喧归浣女|444|m","莲动下渔舟|444|m","随意春芳歇|444|m","王孙自可留|444|m","梁园日暮乱飞鸦|445|m","极目萧条三两家|445|m","庭树不知人去尽|445|m","春来还发旧时花|445|m","远上寒山石径斜|446|m","白云生处有人家|446|m","停车坐爱枫林晚|446|m","霜叶红于二月花|446|m","弥年不得意|447|m","新岁又如何|447|m","念昔同游者|447|m","而今有几多|447|m","以闲为自在|447|m","将寿补蹉跎|447|m","春色无情故|447|m","幽居亦见过|447|m","北阙休上书|448|m","南山归敝庐|448|m","不才明主弃|448|m","多病故人疏|448|m","白发催年老|448|m","青阳逼岁除|448|m","永怀愁不寐|448|m","松月夜窗虚|448|m","十年曾一别|449|m","征路此相逢|449|m","马首向何处|449|m","夕阳千万峰|449|m","一封朝奏九重天|450|h","夕贬潮州路八千|450|h","欲为圣明除弊事|450|h","肯将衰朽惜残年|450|h","云横秦岭家何在|450|h","雪拥蓝关马不前|450|h","知汝远来应有意|450|h","好收吾骨瘴江边|450|h","碧阑干外绣帘垂|451|m","猩色屏风画折枝|451|m","八尺龙须方锦褥|451|m","已凉天气未寒时|451|m","贵贱虽异等|452|e","出门皆有营|452|e","独无外物牵|452|e","遂此幽居情|452|e","西登香炉峰|453|m","南见瀑布水|453|m","挂流三百丈|453|m","喷壑数十里|453|m","欻如飞电来|453|m","隐若白虹起|453|m","初惊河汉落|453|m","半洒云天里|453|m","仰观势转雄|453|m","壮哉造化功|453|m","海风吹不断|453|m","江月照还空|453|m","我本楚狂人|454|h","凤歌笑孔丘|454|h","手持绿玉杖|454|h","朝别黄鹤楼|454|h","五岳寻仙不辞远|454|h","一生好入名山游|454|h","庐山秀出南斗傍|454|h","屏风九叠云锦张|454|h","影落明湖青黛光|454|h","金阙前开二峰长|454|h","银河倒挂三石梁|454|h","香炉瀑布遥相望|454|h","回崖沓嶂凌苍苍|454|h","翠影红霞映朝日|454|h","鸟飞不到吴天长|454|h","登高壮观天地间|454|h","大江茫茫去不还|454|h","黄云万里动风色|454|h","白波九道流雪山|454|h","好为庐山谣|454|h","兴因庐山发|454|h","闲窥石镜清我心|454|h","谢公行处苍苔没|454|h","早服还丹无世情|454|h","琴心三叠道初成|454|h","遥见仙人彩云里|454|h","手把芙蓉朝玉京|454|h","先期汗漫九垓上|454|h","愿接卢敖游太清|454|h","遥遥去巫峡|455|e","望望下章台|455|e","巴国山川尽|455|e","荆门烟雾开|455|e","泠泠七弦上|456|m","静听松风寒|456|m","古调虽自爱|456|m","今人多不弹|456|m","清川带长薄|457|m","车马去闲闲|457|m","流水如有意|457|m","暮禽相与还|457|m","荒城临古渡|457|m","落日满秋山|457|m","迢递嵩高下|457|m","归来且闭关|457|m","海燕虽微眇|458|m","乘春亦暂来|458|m","岂知泥滓贱|458|m","只见玉堂开|458|m","东来万里客|459|m","乱定几年归|459|m","肠断江城雁|459|m","高高正北飞|459|m","漠漠秋云起|460|e","稍稍夜寒生|460|e","但觉衣裳湿|460|e","无点亦无声|460|e","定定住天涯|461|m","依依向物华|461|m","寒梅最堪恨|461|m","常作去年花|461|m","风景旧曾谙|462|m","日出江花红胜火|462|m","春来江水绿如蓝|462|m","能不忆江南|462|m","最忆是杭州|463|e","山寺月中寻桂子|463|e","郡亭枕上看潮头|463|e","何日更重游|463|e","美人卷珠帘|464|m","深坐蹙蛾眉|464|m","但见泪痕湿|464|m","不知心恨谁|464|m","锄禾日当午|465|e","汗滴禾下土|465|e","谁知盘中餐|465|e","粒粒皆辛苦|465|e","春种一粒粟|466|e","秋收万颗子|466|e","四海无闲田|466|e","农夫犹饿死|466|e","兰叶春葳蕤|467|m","桂华秋皎洁|467|m","欣欣此生意|467|m","自尔为佳节|467|m","谁知林栖者|467|m","闻风坐相悦|467|m","草木有本心|467|m","何求美人折|467|m","兰若生春夏|468|m","芊蔚何青青|468|m","幽独空林色|468|m","朱蕤冒紫茎|468|m","迟迟白日晚|468|m","袅袅秋风生|468|m","岁华尽摇落|468|m","芳意竟何成|468|m","庾信文章老更成|469|m","凌云健笔意纵横|469|m","今人嗤点流传赋|469|m","不觉前贤畏后生|469|m","王杨卢骆当时体|470|m","轻薄为文哂未休|470|m","尔曹身与名俱灭|470|m","不废江河万古流|470|m","胡马大宛名|471|m","锋棱瘦骨成|471|m","竹批双耳峻|471|m","风入四蹄轻|471|m","所向无空阔|471|m","真堪托死生|471|m","骁腾有如此|471|m","万里可横行|471|m","青天有月来几时|472|h","我今停杯一问之|472|h","人攀明月不可得|472|h","月行却与人相随|472|h","皎如飞镜临丹阙|472|h","绿烟灭尽清辉发|472|h","但见宵从海上来|472|h","宁知晓向云间没|472|h","白兔捣药秋复春|472|h","嫦娥孤栖与谁邻|472|h","今人不见古时月|472|h","今月曾经照古人|472|h","古人今人若流水|472|h","共看明月皆如此|472|h","唯愿当歌对酒时|472|h","月光长照金樽里|472|h","今代麒麟阁|473|h","何人第一功|473|h","君王自神武|473|h","驾驭必英雄|473|h","开府当朝杰|473|h","论兵迈古风|473|h","先锋百战在|473|h","略地两隅空|473|h","青海无传箭|473|h","天山早挂弓|473|h","廉颇仍走敌|473|h","魏绛已和戎|473|h","每惜河湟弃|473|h","新兼节制通|473|h","智谋垂睿想|473|h","出入冠诸公|473|h","日月低秦树|473|h","乾坤绕汉宫|473|h","胡人愁逐北|473|h","宛马又从东|473|h","受命边沙远|473|h","归来御席同|473|h","轩墀曾宠鹤|473|h","畋猎旧非熊|473|h","茅土加名数|473|h","山河誓始终|473|h","策行遗战伐|473|h","契合动昭融|473|h","勋业青冥上|473|h","交亲气概中|473|h","未为珠履客|473|h","已见白头翁|473|h","壮节初题柱|473|h","生涯独转蓬|473|h","几年春草歇|473|h","今日暮途穷|473|h","军事留孙楚|473|h","行间识吕蒙|473|h","防身一长剑|473|h","将欲倚崆峒|473|h","开帘见新月|474|m","便即下阶拜|474|m","细语人不闻|474|m","北风吹裙带|474|m","芙蓉阙下会千官|475|m","紫禁朱樱出上兰|475|m","才是寝园春荐后|475|m","非关御苑鸟衔残|475|m","归鞍竞带青丝笼|475|m","中使频倾赤玉盘|475|m","饱食不须愁内热|475|m","大官还有蔗浆寒|475|m","兔丝附蓬麻|476|h","引蔓故不长|476|h","嫁女与征夫|476|h","不如弃路旁|476|h","结发为君妻|476|h","席不暖君床|476|h","暮婚晨告别|476|h","无乃太匆忙|476|h","君行虽不远|476|h","守边赴河阳|476|h","妾身未分明|476|h","何以拜姑嫜|476|h","父母养我时|476|h","日夜令我藏|476|h","生女有所归|476|h","鸡狗亦得将|476|h","君今往死地|476|h","沉痛迫中肠|476|h","誓欲随君去|476|h","形势反苍黄|476|h","勿为新婚念|476|h","努力事戎行|476|h","妇人在军中|476|h","兵气恐不扬|476|h","自嗟贫家女|476|h","久致罗襦裳|476|h","罗襦不复施|476|h","对君洗红妆|476|h","仰视百鸟飞|476|h","大小必双翔|476|h","人事多错迕|476|h","与君永相望|476|h","三日入厨下|477|e","洗手作羹汤|477|e","未谙姑食性|477|e","先遣小姑尝|477|e","客行新安道|478|h","喧呼闻点兵|478|h","借问新安吏|478|h","县小更无丁|478|h","府帖昨夜下|478|h","次选中男行|478|h","中男绝短小|478|h","何以守王城|478|h","肥男有母送|478|h","瘦男独伶俜|478|h","白水暮东流|478|h","青山犹哭声|478|h","莫自使眼枯|478|h","收汝泪纵横|478|h","眼枯即见骨|478|h","天地终无情|478|h","我军取相州|478|h","日夕望其平|478|h","岂意贼难料|478|h","归军星散营|478|h","就粮近故垒|478|h","练卒依旧京|478|h","掘壕不到水|478|h","牧马役亦轻|478|h","况乃王师顺|478|h","抚养甚分明|478|h","送行勿泣血|478|h","仆射如父兄|478|h","乡心新岁切|479|m","天畔独潸然|479|m","老至居人下|479|m","春归在客先|479|m","岭猿同旦暮|479|m","江柳共风烟|479|m","新晴原野旷|480|m","极目无氛垢|480|m","郭门临渡头|480|m","村树连溪口|480|m","白水明田家|480|m","碧峰出山后|480|m","农月无闲人|480|m","倾家事南亩|480|m","细草微风岸|481|m","危樯独夜舟|481|m","星垂平野阔|481|m","月涌大江流|481|m","名岂文章著|481|m","官应老病休|481|m","飘飘何所似|481|m","天地一沙鸥|481|m","寂寞天宝后|482|h","园庐但蒿藜|482|h","我里百余家|482|h","世乱各东西|482|h","存者无消息|482|h","死者为尘泥|482|h","贱子因阵败|482|h","归来寻旧蹊|482|h","久行见空巷|482|h","日瘦气惨凄|482|h","但对狐与狸|482|h","竖毛怒我啼|482|h","四邻何所有|482|h","一二老寡妻|482|h","宿鸟恋本枝|482|h","安辞且穷栖|482|h","方春独荷锄|482|h","日暮还灌畦|482|h","县吏知我至|482|h","召令习鼓鞞|482|h","虽从本州役|482|h","内顾无所携|482|h","近行止一身|482|h","远去终转迷|482|h","家乡既荡尽|482|h","远近理亦齐|482|h","永痛长病母|482|h","五年委沟溪|482|h","生我不得力|482|h","终身两酸嘶|482|h","人生无家别|482|h","何以为蒸黎|482|h","相见时难别亦难|483|h","东风无力百花残|483|h","春蚕到死丝方尽|483|h","蜡炬成灰泪始干|483|h","晓镜但愁云鬓改|483|h","夜吟应觉月光寒|483|h","蓬山此去无多路|483|h","青鸟殷勤为探看|483|h","昨夜星辰昨夜风|484|h","画楼西畔桂堂东|484|h","身无彩凤双飞翼|484|h","心有灵犀一点通|484|h","隔座送钩春酒暖|484|h","分曹射覆蜡灯红|484|h","嗟余听鼓应官去|484|h","走马兰台类转蓬|484|h","朝辞白帝彩云间|485|m","千里江陵一日还|485|m","两岸猿声啼不住|485|m","轻舟已过万重山|485|m","木落雁南度|486|m","北风江上寒|486|m","我家襄水曲|486|m","遥隔楚云端|486|m","乡泪客中尽|486|m","孤帆天际看|486|m","迷津欲有问|486|m","平海夕漫漫|486|m","天街小雨润如酥|487|m","草色遥看近却无|487|m","最是一年春好处|487|m","绝胜烟柳满皇都|487|m","一树寒梅白玉条|488|m","迥临村路傍溪桥|488|m","不知近水花先发|488|m","疑是经冬雪未销|488|m","屋上春鸠鸣|489|m","村边杏花白|489|m","持斧伐远扬|489|m","荷锄觇泉脉|489|m","归燕识故巢|489|m","旧人看新历|489|m","临觞忽不御|489|m","惆怅远行客|489|m","杨柳阴阴细雨晴|490|m","残花落尽见流莺|490|m","春风一夜吹香梦|490|m","梦逐春风到洛城|490|m","银烛吐青烟|491|e","金樽对绮筵|491|e","离堂思琴瑟|491|e","别路绕山川|491|e","好雨知时节|492|e","当春乃发生|492|e","随风潜入夜|492|e","润物细无声|492|e","野径云俱黑|492|e","江船火独明|492|e","晓看红湿处|492|e","花重锦官城|492|e","早被婵娟误|493|m","欲妆临镜慵|493|m","承恩不在貌|493|m","教妾若为容|493|m","风暖鸟声碎|493|m","日高花影重|493|m","年年越溪女|493|m","相忆采芙蓉|493|m","燕草如碧丝|494|m","秦桑低绿枝|494|m","当君怀归日|494|m","是妾断肠时|494|m","春风不相识|494|m","何事入罗帏|494|m","纱窗日落渐黄昏|495|m","金屋无人见泪痕|495|m","寂寞空庭春欲晚|495|m","梨花满地不开门|495|m","打起黄莺儿|496|m","莫教枝上啼|496|m","啼时惊妾梦|496|m","不得到辽西|496|m","春眠不觉晓|497|e","处处闻啼鸟|497|e","夜来风雨声|497|e","花落知多少|497|e","国破山河在|498|h","城春草木深|498|h","感时花溅泪|498|h","恨别鸟惊心|498|h","烽火连三月|498|h","家书抵万金|498|h","白头搔更短|498|h","浑欲不胜簪|498|h","洞房昨夜春风起|499|m","故人尚隔湘江水|499|m","枕上片时春梦中|499|m","行尽江南数千里|499|m","春江潮水连海平|500|h","海上明月共潮生|500|h","滟滟随波千万里|500|h","何处春江无月明|500|h","江流宛转绕芳甸|500|h","月照花林皆似霰|500|h","空里流霜不觉飞|500|h","汀上白沙看不见|500|h","江天一色无纤尘|500|h","皎皎空中孤月轮|500|h","江畔何人初见月|500|h","江月何年初照人|500|h","人生代代无穷已|500|h","江月年年望相似|500|h","不知江月待何人|500|h","但见长江送流水|500|h","白云一片去悠悠|500|h","青枫浦上不胜愁|500|h","谁家今夜扁舟子|500|h","何处相思明月楼|500|h","可怜楼上月徘徊|500|h","应照离人妆镜台|500|h","玉户帘中卷不去|500|h","捣衣砧上拂还来|500|h","此时相望不相闻|500|h","愿逐月华流照君|500|h","鸿雁长飞光不度|500|h","鱼龙潜跃水成文|500|h","昨夜闲潭梦落花|500|h","可怜春半不还家|500|h","江水流春去欲尽|500|h","江潭落月复西斜|500|h","斜月沉沉藏海雾|500|h","碣石潇湘无限路|500|h","不知乘月几人归|500|h","落月摇情满江树|500|h","幽意无断绝|501|m","此去随所偶|501|m","晚风吹行舟|501|m","花路入溪口|501|m","际夜转西壑|501|m","隔山望南斗|501|m","潭烟飞溶溶|501|m","林月低向后|501|m","生事且弥漫|501|m","愿为持竿叟|501|m","宜阳城下草萋萋|502|m","涧水东流复向西|502|m","芳树无人花自落|502|m","春山一路鸟空啼|502|m","寒食月明雨|503|m","落花香满泥|503|m","佳人持锦字|503|m","无雁寄辽西|503|m","怅卧新春白袷衣|504|m","白门寥落意多违|504|m","红楼隔雨相望冷|504|m","珠箔飘灯独自归|504|m","春雪满空来|505|e","触处似花开|505|e","不知园里树|505|e","若个是真梅|505|e","新年都未有芳华|506|m","二月初惊见草芽|506|m","白雪却嫌春色晚|506|m","故穿庭树作飞花|506|m","草树知春不久归|507|h","百般红紫斗芳菲|507|h","杨花榆荚无才思|507|h","惟解漫天作雪飞|507|h","深居俯夹城|508|m","春去夏犹清|508|m","天意怜幽草|508|m","人间重晚晴|508|m","故乡杳无际|509|e","日暮且孤征|509|e","川原迷旧国|509|e","道路入边城|509|e","一道残阳铺水中|510|m","半江瑟瑟半江红|510|m","可怜九月初三夜|510|m","露似真珠月似弓|510|m","数里闻寒水|511|e","山家少四邻|511|e","怪禽啼旷野|511|e","落日恐行人|511|e","浮香绕曲岸|512|e","圆影覆华池|512|e","常恐秋风早|512|e","飘零君不知|512|e","花间一壶酒|513|m","独酌无相亲|513|m","举杯邀明月|513|m","对影成三人|513|m","月上随人意|514|e","江边一院清|514|e","明河净无声|514|e","更深月色半人家|515|e","北斗阑干南斗斜|515|e","今夜偏知春气暖|515|e","虫声新透绿窗纱|515|e","今夜鄜州月|516|e","闺中只独看|516|e","遥怜小儿女|516|e","未解忆长安|516|e","香雾云鬟湿|516|e","清辉玉臂寒|516|e","何时倚虚幌|516|e","双照泪痕干|516|e","戍鼓断人行|517|h","边秋一雁声|517|h","露从今夜白|517|h","月是故乡明|517|h","有弟皆分散|517|h","无家问死生|517|h","寄书长不达|517|h","况乃未休兵|517|h","贱妾留南楚|518|m","征夫向北燕|518|m","三秋方一日|518|m","少别比千年|518|m","天门中断楚江开|519|m","碧水东流至此回|519|m","两岸青山相对出|519|m","孤帆一片日边来|519|m","岱宗夫如何|520|h","齐鲁青未了|520|h","造化钟神秀|520|h","阴阳割昏晓|520|h","荡胸生曾云|520|h","决眦入归鸟|520|h","会当凌绝顶|520|h","一览众山小|520|h","庐山东南五老峰|521|m","青天削出金芙蓉|521|m","九江秀色可揽结|521|m","吾将此地巢云松|521|m","日照香炉生紫烟|522|e","遥看瀑布挂前川|522|e","飞流直下三千尺|522|e","疑是银河落九天|522|e","海上生明月|523|m","天涯共此时|523|m","情人怨遥夜|523|m","竟夕起相思|523|m","灭烛怜光满|523|m","披衣觉露滋|523|m","不堪盈手赠|523|m","还寝梦佳期|523|m","时难年荒世业空|524|m","弟兄羁旅各西东|524|m","田园寥落干戈后|524|m","骨肉流离道路中|524|m","吊影分为千里雁|524|m","辞根散作秋蓬飞|524|m","共看明月应垂泪|524|m","一夜乡心五处同|524|m","湖光秋月两相和|525|m","潭面无风镜未磨|525|m","遥望洞庭山水翠|525|m","白银盘里一青螺|525|m","八月湖水平|526|m","涵虚混太清|526|m","气蒸云梦泽|526|m","波撼岳阳城|526|m","欲济无舟楫|526|m","端居耻圣明|526|m","坐观垂钓者|526|m","徒有羡鱼情|526|m","燕台一去客心惊|527|m","箬鼓喧喧汉将营|527|m","万里寒光生积雪|527|m","三边曙色动危旌|527|m","沙场烽火侵胡月|527|m","海畔云山拥蓟城|527|m","少小虽非投笔吏|527|m","论功还欲请长缨|527|m","冷烛无烟绿蜡干|528|m","芳心犹卷怯春寒|528|m","一缄书札藏何事|528|m","会被东风暗拆看|528|m","闻道黄龙戍|529|m","频年不解兵|529|m","可怜闺里月|529|m","长在汉家营|529|m","吴丝蜀桐张高秋|530|h","空山凝云颓不流|530|h","江娥啼竹素女愁|530|h","李凭中国弹箜篌|530|h","昆山玉碎凤凰叫|530|h","芙蓉泣露香兰笑|530|h","十二门前融冷光|530|h","二十三丝动紫皇|530|h","女娲炼石补天处|530|h","石破天惊逗秋雨|530|h","梦入神山教神妪|530|h","老鱼跳波瘦蛟舞|530|h","吴质不眠倚桂树|530|h","露脚斜飞湿寒兔|530|h","霜草苍苍虫切切|531|m","村南村北行人绝|531|m","独出门前望野田|531|m","月明荞麦花如雪|531|m","塞北梅花羌笛吹|532|m","淮南桂树小山词|532|m","请君莫奏前朝曲|532|m","听唱新翻杨柳枝|532|m","月落乌啼霜满天|533|m","江枫渔火对愁眠|533|m","姑苏城外寒山寺|533|m","夜半钟声到客船|533|m","曾逐东风拂舞筵|534|m","乐游春苑断肠天|534|m","如何肯到清秋日|534|m","已带斜阳又带蝉|534|m","渔舟逐水爱山春|535|h","两岸桃花夹古津|535|h","坐看红树不知远|535|h","行尽青溪不见人|535|h","山口潜行始隈隩|535|h","山开旷望旋平陆|535|h","遥看一处攒云树|535|h","近入千家散花竹|535|h","樵客初传汉姓名|535|h","居人未改秦衣服|535|h","居人共住武陵源|535|h","还从物外起田园|535|h","月明松下房栊静|535|h","日出云中鸡犬喧|535|h","惊闻俗客争来集|535|h","竞引还家问都邑|535|h","平明闾巷扫花开|535|h","薄暮渔樵乘水入|535|h","初因避地去人间|535|h","及至成仙遂不还|535|h","峡里谁知有人事|535|h","世中遥望空云山|535|h","不疑灵境难闻见|535|h","尘心未尽思乡县|535|h","出洞无论隔山水|535|h","辞家终拟长游衍|535|h","自谓经过旧不迷|535|h","安知峰壑今来变|535|h","当时只记入山深|535|h","青溪几度到云林|535|h","春来遍是桃花水|535|h","不辨仙源何处寻|535|h","数萼初含雪|536|e","孤标画本难|536|e","香中别有韵|536|e","清极不知寒|536|e","梅岭花初发|537|m","天山雪未开|537|m","雪处疑花满|537|m","花边似雪回|537|m","老兔寒蟾泣天色|538|m","云楼半开壁斜白|538|m","玉轮轧露湿团光|538|m","鸾珮相逢桂香陌|538|m","海客谈瀛洲|539|h","烟涛微茫信难求|539|h","越人语天姥|539|h","云霞明灭或可睹|539|h","天姥连天向天横|539|h","势拔五岳掩赤城|539|h","天台四万八千丈|539|h","对此欲倒东南倾|539|h","我欲因之梦吴越|539|h","一夜飞度镜湖月|539|h","湖月照我影|539|h","送我至剡溪|539|h","谢公宿处今尚在|539|h","渌水荡漾清猿啼|539|h","脚著谢公屐|539|h","身登青云梯|539|h","半壁见海日|539|h","空中闻天鸡|539|h","千岩万转路不定|539|h","迷花倚石忽已暝|539|h","熊咆龙吟殷岩泉|539|h","栗深林兮惊层巅|539|h","青冥浩荡不见底|539|h","日月照耀金银台|539|h","霓为衣兮风为马|539|h","虎鼓瑟兮鸾回车|539|h","仙之人兮列如麻|539|h","世间行乐亦如此|539|h","古来万事东流水|539|h","别君去兮何时还|539|h","且放白鹿青崖间|539|h","须行即骑访名山|539|h","使我不得开心颜|539|h","客路青山外|540|h","行舟绿水前|540|h","潮平两岸阔|540|h","风正一帆悬|540|h","海日生残夜|540|h","江春入旧年|540|h","乡书何处达|540|h","归雁洛阳边|540|h","楚塞三湘接|541|m","荆门九派通|541|m","江流天地外|541|m","山色有无中|541|m","郡邑浮前浦|541|m","波澜动远空|541|m","襄阳好风日|541|m","留醉与山翁|541|m","天秋月又满|542|e","城阙夜千重|542|e","还作江南会|542|e","翻疑梦里逢|542|e","江送巴南水|543|e","山横塞北云|543|e","津亭秋月夜|543|e","谁见泣离群|543|e","千里莺啼绿映红|544|m","水村山郭酒旗风|544|m","南朝四百八十寺|544|m","多少楼台烟雨中|544|m","嫁得瞿塘贾|545|m","朝朝误妾期|545|m","早知潮有信|545|m","嫁与弄潮儿|545|m","岐王宅里寻常见|546|h","崔九堂前几度闻|546|h","正是江南好风景|546|h","落花时节又逢君|546|h","钓罢归来不系船|547|m","江村月落正堪眠|547|m","纵然一夜风吹去|547|m","只在芦花浅水边|547|m","江汉思归客|548|m","乾坤一腐儒|548|m","片云天共远|548|m","永夜月同孤|548|m","落日心犹壮|548|m","秋风病欲苏|548|m","古来存老马|548|m","不必取长途|548|m","黄四娘家花满蹊|549|m","千朵万朵压枝低|549|m","留连戏蝶时时舞|549|m","自在娇莺恰恰啼|549|m","咫尺愁风雨|550|e","匡庐不可登|550|e","只疑云雾窟|550|e","犹有六朝僧|550|e","千山鸟飞绝|551|e","万径人踪灭|551|e","孤舟蓑笠翁|551|e","独钓寒江雪|551|e","小娃撑小艇|552|e","偷采白莲回|552|e","不解藏踪迹|552|e","浮萍一道开|552|e","北风吹白云|553|e","万里渡河汾|553|e","心绪逢摇落|553|e","秋声不可闻|553|e","烟笼寒水月笼沙|554|m","夜泊秦淮近酒家|554|m","商女不知亡国恨|554|m","隔江犹唱后庭花|554|m","渭水清无淀|555|m","春流两岸平|555|m","忽看千骑出|555|m","共喜一舟行|555|m","映日同云气|555|m","随风散雨声|555|m","方知帝城远|555|m","宛在水中央|555|m","泾溪石险人兢慎|556|m","终岁不闻倾覆人|556|m","却是平流无石处|556|m","时时闻说有沉沦|556|m","中兴诸将收山东|557|h","捷书夜报清昼同|557|h","河广传闻一苇过|557|h","胡危命在破竹中|557|h","祗残邺城不日得|557|h","独任朔方无限功|557|h","万户千门皆漏声|557|h","攀龙附凤势莫当|557|h","天下尽化为侯王|557|h","汝等岂知蒙帝力|557|h","时来不得夸身强|557|h","关中既留萧丞相|557|h","幕下复用张子房|557|h","张公一生江海客|557|h","身长九尺须眉苍|557|h","征起适遇风云会|557|h","扶颠始知筹策良|557|h","青袍白马更何有|557|h","后汉今周喜再昌|557|h","寸地尺天皆入贡|557|h","奇祥异瑞争来送|557|h","不知何国致白环|557|h","复道诸山得银瓮|557|h","隐士休歌紫芝曲|557|h","词人解撰河清颂|557|h","田家望望惜雨干|557|h","布谷处处催春种|557|h","淇上健儿归莫懒|557|h","城南思妇愁多梦|557|h","安得壮士挽天河|557|h","净洗甲兵长不用|557|h","洛阳女儿对门居|558|h","才可颜容十五余|558|h","良人玉勒乘骢马|558|h","侍女金盘脍鲤鱼|558|h","画阁朱楼尽相望|558|h","红桃绿柳垂檐向|558|h","罗帷送上七香车|558|h","宝扇迎归九华帐|558|h","狂夫富贵在青春|558|h","意气骄奢剧季伦|558|h","自怜碧玉亲教舞|558|h","不惜珊瑚持与人|558|h","春窗曙灭九微火|558|h","九微片片飞花琐|558|h","戏罢曾无理曲时|558|h","妆成祗是熏香坐|558|h","城中相识尽繁华|558|h","日夜经过赵李家|558|h","谁怜越女颜如玉|558|h","贫贱江头自浣纱|558|h","九曲黄河万里沙|559|m","浪淘风簸自天涯|559|m","如今直上银河去|559|m","同到牵牛织女家|559|m","帘外雨潺潺|560|m","罗衾不耐五更寒|560|m","梦里不知身是客|560|m","独自莫凭栏|560|m","别时容易见时难|560|m","流水落花春去也|560|m","莫道谗言如浪深|561|m","莫言迁客似沙沉|561|m","千淘万漉虽辛苦|561|m","吹尽狂沙始到金|561|m","江汉曾为客|562|m","相逢每醉还|562|m","浮云一别后|562|m","流水十年间|562|m","欢笑情如旧|562|m","萧疏鬓已斑|562|m","何因不归去|562|m","淮上有秋山|562|m","旅泊青山夜|563|e","荒庭白露秋|563|e","洞房悬月影|563|e","高枕听江流|563|e","触目柔肠断|564|m","砌下落梅如雪乱|564|m","清明时节雨纷纷|565|m","路上行人欲断魂|565|m","借问酒家何处有|565|m","牧童遥指杏花村|565|m","林卧愁春尽|566|m","开轩览物华|566|m","忽逢青鸟使|566|m","邀入赤松家|566|m","丹灶初开火|566|m","仙桃正发花|566|m","童颜若可驻|566|m","何惜醉流霞|566|m","渔翁夜傍西岩宿|567|m","晓汲清湘燃楚竹|567|m","烟销日出不见人|567|m","欸乃一声山水绿|567|m","回看天际下中流|567|m","岩上无心云相逐|567|m","岭外音书断|568|m","经冬复历春|568|m","近乡情更怯|568|m","不敢问来人|568|m","迟日园林悲昔游|569|m","今春花鸟作边愁|569|m","独怜京国人南窜|569|m","不似湘江水北流|569|m","山随平野尽|570|h","江入大荒流|570|h","月下飞天镜|570|h","云生结海楼|570|h","仍怜故乡水|570|h","万里送行舟|570|h","渭城朝雨浥轻尘|571|e","客舍青青柳色新|571|e","劝君更尽一杯酒|571|e","西出阳关无故人|571|e","斜光照墟落|572|m","穷巷牛羊归|572|m","野老念牧童|572|m","倚杖候荆扉|572|m","雉雊麦苗秀|572|m","蚕眠桑叶稀|572|m","田夫荷锄至|572|m","相见语依依|572|m","即此羡闲逸|572|m","怅然吟式微|572|m","慈母手中线|573|m","游子身上衣|573|m","临行密密缝|573|m","意恐迟迟归|573|m","谁言寸草心|573|m","报得三春晖|573|m","岑参兄弟皆好奇|574|h","携我远来游渼陂|574|h","天地黤惨忽异色|574|h","波涛万顷堆琉璃|574|h","琉璃汗漫泛舟入|574|h","事殊兴极忧思集|574|h","鼍作鲸吞不复知|574|h","恶风白浪何不及|574|h","主人锦帆相为开|574|h","舟子喜甚无氛埃|574|h","凫鹥满散陂不及|574|h","菱叶荷花静如拭|574|h","宛在中流渤澥清|574|h","下归无极终南黑|574|h","半陂以南纯浸山|574|h","动影袅窕冲融间|574|h","船舷暝戛云际寺|574|h","水面月出蓝田关|574|h","此时骊龙亦吐珠|574|h","冯夷击鼓群龙趋|574|h","湘妃汉女出歌舞|574|h","金支翠旗光有无|574|h","咫尺但愁雷雨至|574|h","苍茫不晓神灵意|574|h","少壮几时奈老何|574|h","向来哀乐何其多|574|h","万丈红泉落|575|e","迢迢半紫氛|575|e","奔流下杂树|575|e","洒落出重云|575|e","篱外谁家不系船|576|m","春风吹入钓鱼湾|576|m","小童疑是有村客|576|m","急向柴门去却关|576|m","独怜幽草涧边生|577|m","上有黄鹂深树鸣|577|m","春潮带雨晚来急|577|m","野渡无人舟自横|577|m","滕王高阁临江渚|578|m","佩玉鸣鸾罢歌舞|578|m","画栋朝飞南浦云|578|m","珠帘暮卷西山雨|578|m","闲云潭影日悠悠|578|m","物换星移几度秋|578|m","阁中帝子今何在|578|m","槛外长江空自流|578|m","沈约怜何逊|579|m","延年毁谢庄|579|m","清新俱有得|579|m","名誉底相伤|579|m","江月去人只数尺|580|m","风灯照夜欲三更|580|m","沙头宿鹭联拳静|580|m","船尾跳鱼拨剌鸣|580|m","士卒何草草|581|h","筑城潼关道|581|h","大城铁不如|581|h","小城万丈余|581|h","借问潼关吏|581|h","修关还备胡|581|h","要我下马行|581|h","为我指山隅|581|h","连云列战格|581|h","飞鸟不能逾|581|h","胡来但自守|581|h","岂复忧西都|581|h","丈人视要处|581|h","窄狭容单车|581|h","艰难奋长戟|581|h","万古用一夫|581|h","哀哉桃林战|581|h","百万化为鱼|581|h","请嘱防关将|581|h","慎勿学哥舒|581|h","湖南为客动经春|582|m","燕子衔泥两度新|582|m","旧入故园尝识主|582|m","如今社日远看人|582|m","可怜处处巢居室|582|m","何异飘飘托此身|582|m","暂语船樯还起去|582|m","穿花贴水益沾巾|582|m","汉家烟尘在东北|583|h","汉将辞家破残贼|583|h","男儿本自重横行|583|h","天子非常赐颜色|583|h","摐金伐鼓下榆关|583|h","旌旆逶迤碣石间|583|h","校尉羽书飞瀚海|583|h","单于猎火照狼山|583|h","山川萧条极边土|583|h","胡骑凭陵杂风雨|583|h","战士军前半死生|583|h","美人帐下犹歌舞|583|h","大漠穷秋塞草腓|583|h","孤城落日斗兵稀|583|h","身当恩遇常轻敌|583|h","力尽关山未解围|583|h","铁衣远戍辛勤久|583|h","玉箸应啼别离后|583|h","少妇城南欲断肠|583|h","征人蓟北空回首|583|h","边庭飘飖那可度|583|h","绝域苍茫更何有|583|h","杀气三时作阵云|583|h","寒声一夜传刁斗|583|h","相看白刃血纷纷|583|h","死节从来岂顾勋|583|h","至今犹忆李将军|583|h","卢家少妇郁金堂|584|m","海燕双栖玳瑁梁|584|m","九月寒砧催木叶|584|m","十年征戍忆辽阳|584|m","众鸟高飞尽|585|m","孤云独去闲|585|m","相看两不厌|585|m","只有敬亭山|585|m","昨夜裙带解|586|m","今朝蟢子飞|586|m","铅华不可弃|586|m","莫是藁砧归|586|m","浔阳江头夜送客|587|h","枫叶荻花秋瑟瑟|587|h","主人下马客在船|587|h","举酒欲饮无管弦|587|h","醉不成欢惨将别|587|h","别时茫茫江浸月|587|h","忽闻水上琵琶声|587|h","主人忘归客不发|587|h","千呼万唤始出来|587|h","犹抱琵琶半遮面|587|h","转轴拨弦三两声|587|h","未成曲调先有情|587|h","弦弦掩抑声声思|587|h","似诉平生不得志|587|h","低眉信手续续弹|587|h","说尽心中无限事|587|h","轻拢慢捻抹复挑|587|h","初为霓裳后六幺|587|h","大弦嘈嘈如急雨|587|h","小弦切切如私语|587|h","嘈嘈切切错杂弹|587|h","大珠小珠落玉盘|587|h","间关莺语花底滑|587|h","幽咽泉流冰下难|587|h","冰泉冷涩弦凝绝|587|h","凝绝不通声暂歇|587|h","别有幽愁暗恨生|587|h","此时无声胜有声|587|h","银瓶乍破水浆迸|587|h","铁骑突出刀枪鸣|587|h","曲终收拨当心画|587|h","四弦一声如裂帛|587|h","东船西舫悄无言|587|h","唯见江心秋月白|587|h","自言本是京城女|587|h","家在虾蟆陵下住|587|h","十三学得琵琶成|587|h","名属教坊第一部|587|h","曲罢曾教善才服|587|h","妆成每被秋娘妒|587|h","五陵年少争缠头|587|h","一曲红绡不知数|587|h","今年欢笑复明年|587|h","秋月春风等闲度|587|h","弟走从军阿姨死|587|h","暮去朝来颜色故|587|h","门前冷落鞍马稀|587|h","老大嫁作商人妇|587|h","商人重利轻别离|587|h","前月浮梁买茶去|587|h","去来江口守空船|587|h","绕船月明江水寒|587|h","夜深忽梦少年事|587|h","梦啼妆泪红阑干|587|h","我闻琵琶已叹息|587|h","又闻此语重唧唧|587|h","同是天涯沦落人|587|h","相逢何必曾相识|587|h","我从去年辞帝京|587|h","谪居卧病浔阳城|587|h","浔阳地僻无音乐|587|h","终岁不闻丝竹声|587|h","住近湓江地低湿|587|h","黄芦苦竹绕宅生|587|h","其间旦暮闻何物|587|h","杜鹃啼血猿哀鸣|587|h","春江花朝秋月夜|587|h","往往取酒还独倾|587|h","岂无山歌与村笛|587|h","呕哑嘲哳难为听|587|h","今夜闻君琵琶语|587|h","如听仙乐耳暂明|587|h","莫辞更坐弹一曲|587|h","为君翻作琵琶行|587|h","感我此言良久立|587|h","却坐促弦弦转急|587|h","凄凄不似向前声|587|h","满座重闻皆掩泣|587|h","座中泣下谁最多|587|h","江州司马青衫湿|587|h","送客湓浦口|588|h","铮铮然有京都声|588|h","本长安倡女|588|h","使快弹数曲|588|h","今漂沦憔悴|588|h","予出官二年|588|h","凡六百一十六言|588|h","冰簟银床梦不成|589|m","碧天如水夜云轻|589|m","雁声远过潇湘去|589|m","十二楼中月自明|589|m","父耕原上田|590|m","子劚山下荒|590|m","六月禾未秀|590|m","官家已修仓|590|m","远看山有色|591|e","近听水无声|591|e","春去花还在|591|e","人来鸟不惊|591|e","素练风霜起|592|m","苍鹰画作殊|592|m","㧐身思狡兔|592|m","侧目似愁胡|592|m","绦镟光堪摘|592|m","轩楹势可呼|592|m","何当击凡鸟|592|m","毛血洒平芜|592|m","寂寂竟何待|593|m","朝朝空自归|593|m","欲寻芳草去|593|m","惜与故人违|593|m","当路谁相假|593|m","知音世所稀|593|m","只应守寂寞|593|m","还掩故园扉|593|m","物外山川近|594|e","晴初景霭新|594|e","芳郊花柳遍|594|e","何处不宜春|594|e","昔闻洞庭水|595|h","今上岳阳楼|595|h","吴楚东南坼|595|h","乾坤日夜浮|595|h","亲朋无一字|595|h","老病有孤舟|595|h","戎马关山北|595|h","凭轩涕泗流|595|h","前不见古人|596|h","后不见来者|596|h","城上高楼接大荒|597|h","海天愁思正茫茫|597|h","惊风乱飐芙蓉水|597|h","密雨斜侵薜荔墙|597|h","岭树重遮千里目|597|h","江流曲似九回肠|597|h","共来百越文身地|597|h","犹自音书滞一乡|597|h","花近高楼伤客心|598|m","万方多难此登临|598|m","锦江春色来天地|598|m","玉垒浮云变古今|598|m","北极朝廷终不改|598|m","西山寇盗莫相侵|598|m","可怜后主还祠庙|598|m","日暮聊为梁甫吟|598|m","踏阁攀林恨不同|599|m","楚云沧海思无穷|599|m","数家砧杵秋山下|599|m","一郡荆榛寒雨中|599|m","风急天高猿啸哀|600|h","渚清沙白鸟飞回|600|h","无边落木萧萧下|600|h","不尽长江滚滚来|600|h","万里悲秋常作客|600|h","百年多病独登台|600|h","艰难苦恨繁霜鬓|600|h","潦倒新停浊酒杯|600|h","白日依山尽|601|e","黄河入海流|601|e","欲穷千里目|601|e","更上一层楼|601|e","天平山上白云泉|602|m","云自无心水自闲|602|m","何必奔冲山下去|602|m","更添波浪向人间|602|m","白帝城中云出门|603|m","白帝城下雨翻盆|603|m","高江急峡雷霆斗|603|m","古木苍藤日月昏|603|m","戎马不如归马逸|603|m","千家今有百家存|603|m","哀哀寡妇诛求尽|603|m","恸哭秋原何处村|603|m","北风卷地白草折|604|h","胡天八月即飞雪|604|h","忽如一夜春风来|604|h","千树万树梨花开|604|h","散入珠帘湿罗幕|604|h","狐裘不暖锦衾薄|604|h","将军角弓不得控|604|h","都护铁衣冷难着|604|h","瀚海阑干百丈冰|604|h","愁云惨淡万里凝|604|h","中军置酒饮归客|604|h","胡琴琵琶与羌笛|604|h","纷纷暮雪下辕门|604|h","风掣红旗冻不翻|604|h","轮台东门送君去|604|h","去时雪满天山路|604|h","山回路转不见君|604|h","雪上空留马行处|604|h","忆年十五心尚孩|605|h","健如黄犊走复来|605|h","庭前八月梨枣熟|605|h","一日上树能千回|605|h","即今倏忽已五十|605|h","坐卧只多少行立|605|h","强将笑语供主人|605|h","悲见生涯百忧集|605|h","入门依旧四壁空|605|h","老妻睹我颜色同|605|h","痴儿不知父子礼|605|h","叫怒索饭啼门东|605|h","暮投石壕村|607|h","有吏夜捉人|607|h","老翁逾墙走|607|h","老妇出门看|607|h","吏呼一何怒|607|h","妇啼一何苦|607|h","听妇前致词|607|h","三男邺城戍|607|h","一男附书至|607|h","二男新战死|607|h","存者且偷生|607|h","死者长已矣|607|h","室中更无人|607|h","惟有乳下孙|607|h","老妪力虽衰|607|h","请从吏夜归|607|h","急应河阳役|607|h","犹得备晨炊|607|h","夜久语声绝|607|h","如闻泣幽咽|607|h","天明登前途|607|h","独与老翁别|607|h","山围故国周遭在|608|h","潮打空城寂寞回|608|h","淮水东边旧时月|608|h","夜深还过女墙来|608|h","走马西来欲到天|609|m","辞家见月两回圆|609|m","今夜不知何处宿|609|m","平沙万里绝人烟|609|m","孤灯伴残月|610|e","客梦未全忘|610|e","香灯伴残梦|610|e","楚国在天涯|610|e","禹庙空山里|611|m","秋风落日斜|611|m","荒庭垂橘柚|611|m","古屋画龙蛇|611|m","云气嘘青壁|611|m","江声走白沙|611|m","早知乘四载|611|m","疏凿控三巴|611|m","曾经沧海难为水|612|m","除却巫山不是云|612|m","取次花丛懒回顾|612|m","半缘修道半缘君|612|m","玉露凋伤枫树林|613|m","巫山巫峡气萧森|613|m","江间波浪兼天涌|613|m","塞上风云接地阴|613|m","丛菊两开他日泪|613|m","孤舟一系故园心|613|m","寒衣处处催刀尺|613|m","白帝城高急暮砧|613|m","银烛秋光冷画屏|614|m","轻罗小扇扑流萤|614|m","天阶夜色凉如水|614|m","坐看牵牛织女星|614|m","怀君属秋夜|615|e","散步咏凉天|615|e","空山松子落|615|e","幽人应未眠|615|e","洛阳城里见秋风|616|m","欲作家书意万重|616|m","复恐匆匆说不尽|616|m","行人临发又开封|616|m","古台摇落后|617|m","秋日望乡心|617|m","野寺来人少|617|m","云峰隔水深|617|m","夕阳依旧垒|617|m","寒磬满空林|617|m","白发三千丈|618|m","缘愁似个长|618|m","不知明镜里|618|m","何处得秋霜|618|m","北山白云里|619|m","隐者自怡悦|619|m","相望试登高|619|m","心随雁飞灭|619|m","愁因薄暮起|619|m","兴是清秋发|619|m","时见归村人|619|m","沙行渡头歇|619|m","天边树若荠|619|m","江畔洲如月|619|m","何当载酒来|619|m","共醉重阳节|619|m","江城如画里|620|m","山晓望晴空|620|m","两水夹明镜|620|m","双桥落彩虹|620|m","人烟寒橘柚|620|m","秋色老梧桐|620|m","谁念北楼上|620|m","临风怀谢公|620|m","自古逢秋悲寂寥|621|m","我言秋日胜春朝|621|m","晴空一鹤排云上|621|m","便引诗情到碧霄|621|m","雨霁长空荡涤清|622|m","远山初出未知名|622|m","夜来江上秋无价|622|m","说与舟人不解情|622|m","何处秋风至|623|m","萧萧送雁群|623|m","朝来入庭树|623|m","孤客最先闻|623|m","一丘常欲卧|624|m","三径苦无资|624|m","北土非吾愿|624|m","东林怀我师|624|m","黄金燃桂尽|624|m","壮志逐年衰|624|m","日夕凉风至|624|m","闻蝉但益悲|624|m","积雨空林烟火迟|625|m","蒸藜炊黍饷东菑|625|m","漠漠水田飞白鹭|625|m","阴阴夏木啭黄鹂|625|m","山中习静观朝槿|625|m","松下清斋折露葵|625|m","野老与人争席罢|625|m","海鸥何事更相疑|625|m","远书归梦两悠悠|626|m","只有空床敌素秋|626|m","阶下青苔与红树|626|m","雨中寥落月中愁|626|m","杨柳青青江水平|627|m","闻郎江上踏歌声|627|m","东边日出西边雨|627|m","道是无晴却有晴|627|m","独坐幽篁里|628|e","弹琴复长啸|628|e","深林人不知|628|e","明月来相照|628|e","松叶堪为酒|629|e","春来酿几多|629|e","不辞山路远|629|e","踏雪也相过|629|e","猿鸟犹疑畏简书|630|h","风云常为护储胥|630|h","徒令上将挥神笔|630|h","终见降王走传车|630|h","晓迎秋露一枝新|631|m","不占园中最上春|631|m","桃李无言又何在|631|m","向风偏笑艳阳人|631|m","择茧缲丝清水煮|632|m","拣丝练线红蓝染|632|m","染为红线红于蓝|632|m","织作披香殿上毯|632|m","中岁颇好道|633|m","晚家南山陲|633|m","兴来每独往|633|m","胜事空自知|633|m","行到水穷处|633|m","坐看云起时|633|m","偶然值林叟|633|m","谈笑无还期|633|m","太乙近天都|634|m","连山接海隅|634|m","白云回望合|634|m","青霭入看无|634|m","分野中峰变|634|m","阴晴众壑殊|634|m","欲投人处宿|634|m","隔水问樵夫|634|m","终南阴岭秀|635|e","积雪浮云端|635|e","林表明霁色|635|e","城中增暮寒|635|e","结客少年场|636|m","春风满路香|636|m","韩魏多奇节|636|m","齐鲁富文章|636|m","两个黄鹂鸣翠柳|637|m","一行白鹭上青天|637|m","窗含西岭千秋雪|637|m","门泊东吴万里船|637|m","迟日江山丽|638|e","春风花草香|638|e","泥融飞燕子|638|e","沙暖睡鸳鸯|638|e","江碧鸟逾白|639|e","山青花欲燃|639|e","今春看又过|639|e","何日是归年|639|e","眼见客愁愁不醒|640|m","无赖春色到江亭|640|m","即遣花开深造次|640|m","便教莺语太丁宁|640|m","熟知茅斋绝低小|641|e","江上燕子故来频|641|e","衔泥点污琴书内|641|e","更接飞虫打着人|641|e","少年十五二十时|642|h","步行夺得胡马骑|642|h","射杀山中白额虎|642|h","肯数邺下黄须儿|642|h","一身转战三千里|642|h","一剑曾当百万师|642|h","汉兵奋迅如霹雳|642|h","虏骑崩腾畏蒺藜|642|h","卫青不败由天幸|642|h","李广无功缘数奇|642|h","自从弃置便衰朽|642|h","世事蹉跎成白首|642|h","昔时飞箭无全目|642|h","今日垂杨生左肘|642|h","路旁时卖故侯瓜|642|h","门前学种先生柳|642|h","茫茫九道流雪山|642|h","誓令疏勒出飞泉|642|h","不似颍川空使酒|642|h","贺兰山下阵如云|642|h","羽檄交驰日夕闻|642|h","节使三河募年少|642|h","诏书五道出将军|642|h","试拂铁衣如雪色|642|h","聊持宝剑动星文|642|h","愿得燕弓射大将|642|h","耻令越甲鸣吾君|642|h","莫嫌旧日云中守|642|h","犹堪一战立功勋|642|h","自君之出矣|643|m","不复理残机|643|m","思君如满月|643|m","夜夜减清辉|643|m","得即高歌失即休|644|m","多愁多恨亦悠悠|644|m","今朝有酒今朝醉|644|m","明日愁来明日愁|644|m","寒雨连江夜入吴|645|m","平明送客楚山孤|645|m","洛阳亲友如相问|645|m","一片冰心在玉壶|645|m","旧苑荒台杨柳新|646|m","菱歌清唱不胜春|646|m","只今惟有西江月|646|m","曾照吴王宫里人|646|m","苏武魂销汉使前|647|h","古祠高树两茫然|647|h","云边雁断胡天月|647|h","陇上羊归塞草烟|647|h","苏溪亭上草漫漫|648|m","谁倚东风十二阑|648|m","燕子不归春事晚|648|m","一汀烟雨杏花寒|648|m","八月秋高风怒号|649|h","卷我屋上三重茅|649|h","茅飞渡江洒江郊|649|h","高者挂罥长林梢|649|h","下者飘转沉塘坳|649|h","忍能对面为盗贼|649|h","公然抱茅入竹去|649|h","唇焦口燥呼不得|649|h","归来倚杖自叹息|649|h","俄顷风定云墨色|649|h","秋天漠漠向昏黑|649|h","布衾多年冷似铁|649|h","娇儿恶卧踏里裂|649|h","床头屋漏无干处|649|h","雨脚如麻未断绝|649|h","自经丧乱少睡眠|649|h","长夜沾湿何由彻|649|h","安得广厦千万间|649|h","风雨不动安如山|649|h","秋丛绕舍似陶家|650|m","遍绕篱边日渐斜|650|m","不是花中偏爱菊|650|m","此花开尽更无花|650|m","待到秋来九月八|651|m","我花开后百花杀|651|m","冲天香阵透长安|651|m","满城尽带黄金甲|651|m","小山重叠金明灭|652|m","鬓云欲度香腮雪|652|m","懒起画蛾眉|652|m","弄妆梳洗迟|652|m","照花前后镜|652|m","花面交相映|652|m","新帖绣罗襦|652|m","双双金鹧鸪|652|m","营州少年厌原野|653|m","狐裘蒙茸猎城下|653|m","虏酒千钟不醉人|653|m","胡儿十岁能骑马|653|m","高阁客竟去|654|h","小园花乱飞|654|h","参差连曲陌|654|h","迢递送斜晖|654|h","肠断未忍扫|654|h","眼穿仍欲归|654|h","芳心向春尽|654|h","所得是沾衣|654|h","春花秋月何时了|655|h","往事知多少|655|h","小楼昨夜又东风|655|h","雕栏玉砌应犹在|655|h","只是朱颜改|655|h","问君能有几多愁|655|h","粉色全无饥色加|656|m","岂知人世有荣华|656|m","年年道我蚕辛苦|656|m","底事浑身着苎麻|656|m","天下英雄气|657|m","千秋尚凛然|657|m","势分三足鼎|657|m","业复五铢钱|657|m","得相能开国|657|m","生儿不像贤|657|m","凄凉蜀故妓|657|m","来舞魏宫前|657|m","丞相祠堂何处寻|658|h","锦官城外柏森森|658|h","映阶碧草自春色|658|h","隔叶黄鹂空好音|658|h","三顾频烦天下计|658|h","两朝开济老臣心|658|h","出师未捷身先死|658|h","长使英雄泪满襟|658|h","客心争日月|659|e","来往预期程|659|e","秋风不相待|659|e","先至洛阳城|659|e","难于上青天|660|h","蚕丛及鱼凫|660|h","开国何茫然|660|h","尔来四万八千岁|660|h","不与秦塞通人烟|660|h","西当太白有鸟道|660|h","可以横绝峨眉巅|660|h","地崩山摧壮士死|660|h","猿猱欲度愁攀援|660|h","青泥何盘盘|660|h","百步九折萦岩峦|660|h","扪参历井仰胁息|660|h","以手抚膺坐长叹|660|h","问君西游何时还|660|h","畏途巉岩不可攀|660|h","但见悲鸟号古木|660|h","雄飞雌从绕林间|660|h","又闻子规啼夜月|660|h","使人听此凋朱颜|660|h","连峰去天不盈尺|660|h","飞湍瀑流争喧豗|660|h","砯崖转石万壑雷|660|h","其险也如此|660|h","剑阁峥嵘而崔嵬|660|h","所守或匪亲|660|h","化为狼与豺|660|h","锦城虽云乐|660|h","不如早还家|660|h","侧身西望长咨嗟|660|h","不论平地与山尖|661|m","无限风光尽被占|661|m","采得百花成蜜后|661|m","为谁辛苦为谁甜|661|m","本以高难饱|662|h","徒劳恨费声|662|h","五更疏欲断|662|h","一树碧无情|662|h","薄宦梗犹泛|662|h","故园芜已平|662|h","烦君最相警|662|h","我亦举家清|662|h","垂緌饮清露|663|h","流响出疏桐|663|h","居高声自远|663|h","非是藉秋风|663|h","强欲登高去|664|h","无人送酒来|664|h","遥怜故园菊|664|h","应傍战场开|664|h","寥落古行宫|665|m","宫花寂寞红|665|m","白头宫女在|665|m","闲坐说玄宗|665|m","金樽清酒斗十千|666|m","玉盘珍羞直万钱|666|m","停杯投箸不能食|666|m","拔剑四顾心茫然|666|m","欲渡黄河冰塞川|666|m","将登太行雪满山|666|m","闲来垂钓碧溪上|666|m","忽复乘舟梦日边|666|m","长风破浪会有时|666|m","直挂云帆济沧海|666|m","大道如青天|668|h","我独不得出|668|h","羞逐长安社中儿|668|h","赤鸡白雉赌梨栗|668|h","弹剑作歌奏苦声|668|h","曳裾王门不称情|668|h","淮阴市井笑韩信|668|h","汉朝公卿忌贾生|668|h","拥篲折节无嫌猜|668|h","剧辛乐毅感恩分|668|h","输肝剖胆效英才|668|h","昭王白骨萦蔓草|668|h","谁人更扫黄金台|668|h","王濬楼船下益州|669|m","金陵王气黯然收|669|m","千寻铁锁沉江底|669|m","一片降幡出石头|669|m","人世几回伤往事|669|m","山形依旧枕寒流|669|m","今逢四海为家日|669|m","故垒萧萧芦荻秋|669|m","家国兴亡自有时|670|m","吴人何苦怨西施|670|m","西施若解倾吴国|670|m","越国亡来又是谁|670|m","艳色天下重|671|m","西施宁久微|671|m","朝为越溪女|671|m","暮作吴宫妃|671|m","贱日岂殊众|671|m","贵来方悟稀|671|m","邀人傅脂粉|671|m","不自著罗衣|671|m","君宠益娇态|671|m","君怜无是非|671|m","当时浣纱伴|671|m","莫得同车归|671|m","持谢邻家子|671|m","效颦安可希|671|m","宰嚭亡吴国|672|m","西施陷恶名|672|m","浣纱春水急|672|m","似有不平声|672|m","昔有佳人公孙氏|673|h","一舞剑器动四方|673|h","观者如山色沮丧|673|h","天地为之久低昂|673|h","㸌如羿射九日落|673|h","矫如群帝骖龙翔|673|h","来如雷霆收震怒|673|h","罢如江海凝清光|673|h","绛唇珠袖两寂寞|673|h","晚有弟子传芬芳|673|h","临颍美人在白帝|673|h","妙舞此曲神扬扬|673|h","与余问答既有以|673|h","感时抚事增惋伤|673|h","先帝侍女八千人|673|h","公孙剑器初第一|673|h","五十年间似反掌|673|h","风尘澒洞昏王室|673|h","梨园弟子散如烟|673|h","女乐余姿映寒日|673|h","金粟堆南木已拱|673|h","瞿唐石城草萧瑟|673|h","玳筵急管曲复终|673|h","乐极哀来月东出|673|h","老夫不知其所往|673|h","足茧荒山转愁疾|673|h","田家少闲月|674|h","五月人倍忙|674|h","夜来南风起|674|h","小麦覆陇黄|674|h","妇姑荷箪食|674|h","童稚携壶浆|674|h","相随饷田去|674|h","丁壮在南冈|674|h","足蒸暑土气|674|h","背灼炎天光|674|h","力尽不知热|674|h","但惜夏日长|674|h","复有贫妇人|674|h","抱子在其旁|674|h","右手秉遗穗|674|h","左臂悬敝筐|674|h","听其相顾言|674|h","闻者为悲伤|674|h","家田输税尽|674|h","拾此充饥肠|674|h","今我何功德|674|h","曾不事农桑|674|h","吏禄三百石|674|h","岁晏有余粮|674|h","念此私自愧|674|h","尽日不能忘|674|h","绕池闲步看鱼游|675|m","正值儿童弄钓舟|675|m","一种爱鱼心各异|675|m","我来施食尔垂钩|675|m","风劲角弓鸣|676|m","将军猎渭城|676|m","草枯鹰眼疾|676|m","雪尽马蹄轻|676|m","忽过新丰市|676|m","还归细柳营|676|m","回看射雕处|676|m","千里暮云平|676|m","劳歌一曲解行舟|678|m","红叶青山水急流|678|m","日暮酒醒人已远|678|m","满天风雨下西楼|678|m","翻手作云覆手雨|679|h","纷纷轻薄何须数|679|h","此道今人弃如土|679|h","宣室求贤访逐臣|680|h","贾生才调更无伦|680|h","可怜夜半虚前席|680|h","不问苍生问鬼神|680|h","离离原上草|681|e","一岁一枯荣|681|e","野火烧不尽|681|e","春风吹又生|681|e","远芳侵古道|681|e","晴翠接荒城|681|e","又送王孙去|681|e","萋萋满别情|681|e","楚江微雨里|682|m","建业暮钟时|682|m","漠漠帆来重|682|m","冥冥鸟去迟|682|m","海门深不见|682|m","浦树远含滋|682|m","稻粱犹足活诸雏|683|m","妒敌专场好自娱|683|m","可要五更惊稳梦|683|m","不辞风雪为阳乌|683|m","多情却似总无情|684|m","唯觉樽前笑不成|684|m","蜡烛有心还惜别|684|m","替人垂泪到天明|684|m","娉娉袅袅十三余|685|m","豆蔻梢头二月初|685|m","春风十里扬州路|685|m","卷上珠帘总不如|685|m","江海相逢客恨多|686|m","秋风一叶度关河|686|m","李白乘舟将欲行|687|e","忽闻岸上踏歌声|687|e","桃花潭水深千尺|687|e","不及汪伦送我情|687|e","锦城丝管日纷纷|688|m","半入江风半入云|688|m","此曲只应天上有|688|m","人间能得几回闻|688|m","知君书记本翩翩|689|m","为许从戎赴朔边|689|m","红粉楼中应计日|689|m","燕支山下莫经年|689|m","枿坐云游出世尘|690|m","兼无瓶钵可随身|690|m","逢人不说人间事|690|m","便是人间无事人|690|m","折戟沉沙铁未销|691|h","自将磨洗认前朝|691|h","东风不与周郎便|691|h","铜雀春深锁二乔|691|h","平沙莽莽黄入天|692|h","轮台九月风夜吼|692|h","一川碎石大如斗|692|h","随风满地石乱走|692|h","匈奴草黄马正肥|692|h","金山西见烟尘飞|692|h","汉家大将西出师|692|h","将军金甲夜不脱|692|h","半夜军行戈相拨|692|h","风头如刀面如割|692|h","马毛带雪汗气蒸|692|h","五花连钱旋作冰|692|h","幕中草檄砚水凝|692|h","虏骑闻之应胆慑|692|h","料知短兵不敢接|692|h","车师西门伫献捷|692|h","越王勾践破吴归|693|m","义士还乡尽锦衣|693|m","宫女如花满春殿|693|m","只今惟有鹧鸪飞|693|m","一从归白社|694|m","不复到青门|694|m","时倚檐前树|694|m","远看原上村|694|m","青菰临水拔|694|m","白鸟向山翻|694|m","寂寞於陵子|694|m","桔槔方灌园|694|m","寒山转苍翠|695|m","秋水日潺湲|695|m","倚杖柴门外|695|m","临风听暮蝉|695|m","渡头余落日|695|m","墟里上孤烟|695|m","复值接舆醉|695|m","狂歌五柳前|695|m","轻舟南垞去|696|m","北垞淼难即|696|m","隔浦望人家|696|m","遥遥不相识|696|m","木末芙蓉花|697|m","山中发红萼|697|m","涧户寂无人|697|m","纷纷开且落|697|m","溪水无情似有情|698|m","入山三日得同行|698|m","岭头便是分头处|698|m","惜别潺湲一夜声|698|m","长安回望绣成堆|699|h","山顶千门次第开|699|h","一骑红尘妃子笑|699|h","无人知是荔枝来|699|h","故人具鸡黍|700|m","邀我至田家|700|m","绿树村边合|700|m","青山郭外斜|700|m","开轩面场圃|700|m","把酒话桑麻|700|m","待到重阳日|700|m","还来就菊花|700|m","曾于青史见遗文|701|m","今日飘蓬过此坟|701|m","词客有灵应识我|701|m","霸才无主始怜君|701|m","不知香积寺|702|m","数里入云峰|702|m","古木无人径|702|m","深山何处钟|702|m","泉声咽危石|702|m","日色冷青松|702|m","薄暮空潭曲|702|m","安禅制毒龙|702|m","洞房昨夜停红烛|703|m","待晓堂前拜舅姑|703|m","妆罢低声问夫婿|703|m","画眉深浅入时无|703|m","荒戍落黄叶|704|m","浩然离故关|704|m","高风汉祖庙|704|m","秋日楚王台|704|m","江上几人在|704|m","天涯孤棹还|704|m","君到姑苏见|705|m","人家尽枕河|705|m","古宫闲地少|705|m","水港小桥多|705|m","夜市卖菱藕|705|m","春船载绮罗|705|m","遥知未眠月|705|m","乡思在渔歌|705|m","别路云初起|706|e","离亭叶正稀|706|e","所嗟人异雁|706|e","不作一行归|706|e","下马饮君酒|707|m","问君何所之|707|m","君言不得意|707|m","归卧南山陲|707|m","但去莫复问|707|m","白云无尽时|707|m","青山横北郭|708|h","白水绕东城|708|h","此地一为别|708|h","孤蓬万里征|708|h","浮云游子意|708|h","落日故人情|708|h","挥手自兹去|708|h","萧萧班马鸣|708|h","巢父掉头不肯住|709|h","东将入海随烟雾|709|h","诗卷长留天地间|709|h","钓竿欲拂珊瑚树|709|h","深山大泽龙蛇远|709|h","春寒野阴风景暮|709|h","蓬莱织女回云车|709|h","指点虚无是征路|709|h","自是君身有仙骨|709|h","世人那得知其故|709|h","惜君只欲苦死留|709|h","富贵何如草头露|709|h","蔡侯静者意有余|709|h","清夜置酒临前除|709|h","罢琴惆怅月照席|709|h","几岁寄我空中书|709|h","南寻吴越并海峤|709|h","北过大梁逢故人|709|h","长笛一声乱愁思|709|h","乘舟木叶下纷纷|709|h","万里辞家事鼓鼙|710|m","金陵驿路楚云西|710|m","江春不肯留行客|710|m","草色青青送马蹄|710|m","城阙辅三秦|711|m","风烟望五津|711|m","与君离别意|711|m","同是宦游人|711|m","海内存知己|711|m","天涯若比邻|711|m","无为在歧路|711|m","儿女共沾巾|711|m","沅水通波接武冈|712|m","送君不觉有离伤|712|m","青山一道同云雨|712|m","明月何曾是两乡|712|m","巴陵一望洞庭秋|713|m","日见孤峰水上浮|713|m","闻道神仙不可接|713|m","心随湖水共悠悠|713|m","万壑树参天|714|m","千山响杜鹃|714|m","山中一夜雨|714|m","树杪百重泉|714|m","汉女输橦布|714|m","巴人讼芋田|714|m","文翁翻教授|714|m","不敢倚先贤|714|m","苍苍竹林寺|715|e","杳杳钟声晚|715|e","荷笠带斜阳|715|e","青山独归远|715|e","圣代无隐者|716|m","英灵尽来归|716|m","遂令东山客|716|m","不得顾采薇|716|m","既至金门远|716|m","孰云吾道非|716|m","江淮度寒食|716|m","京洛缝春衣|716|m","置酒长安道|716|m","同心与我违|716|m","行当浮桂棹|716|m","未几拂荆扉|716|m","远树带行客|716|m","孤城当落晖|716|m","吾谋适不用|716|m","勿谓知音稀|716|m","朝闻游子唱离歌|717|m","昨夜微霜初渡河|717|m","鸿雁不堪愁里听|717|m","云山况是客中过|717|m","醉别江楼橘柚香|718|m","江风引雨入舟凉|718|m","忆君遥在潇湘月|718|m","愁听清猿梦里长|718|m","故园东望路漫漫|719|h","双袖龙钟泪不干|719|h","马上相逢无纸笔|719|h","凭君传语报平安|719|h","日暮苍山远|720|e","天寒白屋贫|720|e","柴门闻犬吠|720|e","风雪夜归人|720|e","弄石临溪坐|721|e","寻花绕寺行|721|e","时时闻鸟语|721|e","处处是泉声|721|e","落魄江南载酒行|722|m","楚腰纤细掌中轻|722|m","十年一觉扬州梦|722|m","赢得青楼薄幸名|722|m","北邙山上列坟茔|723|m","万古千秋对洛城|723|m","城中日夕歌钟起|723|m","山上唯闻松柏声|723|m","巴山楚水凄凉地|724|h","二十三年弃置身|724|h","怀旧空吟闻笛赋|724|h","到乡翻似烂柯人|724|h","沉舟侧畔千帆过|724|h","病树前头万木春|724|h","今日听君歌一曲|724|h","暂凭杯酒长精神|724|h","晚年惟好静|725|m","万事不关心|725|m","自顾无长策|725|m","空知返旧林|725|m","松风吹解带|725|m","山月照弹琴|725|m","君问穷通理|725|m","渔歌入浦深|725|m","诸公衮衮登台省|726|h","广文先生官独冷|726|h","甲第纷纷厌粱肉|726|h","广文先生饭不足|726|h","先生有道出羲皇|726|h","先生有才过屈宋|726|h","德尊一代常坎坷|726|h","名垂万古知何用|726|h","杜陵野客人更嗤|726|h","被褐短窄鬓如丝|726|h","日籴太仓五升米|726|h","时赴郑老同襟期|726|h","得钱即相觅|726|h","醉酒更同归|726|h","情亲故旧谁肯来|726|h","相访柴门独老妻|726|h","不须闻此意惨怆|726|h","生前相遇且衔杯|726|h","陆机二十作文赋|727|h","汝更小年能缀文|727|h","总角草书又神速|727|h","世上儿子徒纷纷|727|h","骅骝作驹已汗血|727|h","鸷鸟举翮连青云|727|h","词源倒流三峡水|727|h","笔阵独扫千人军|727|h","只今年才十六七|727|h","射策君门期第一|727|h","旧穿杨叶真自知|727|h","暂蹶霜蹄未为失|727|h","偶然擢秀非难取|727|h","会是排风有毛质|727|h","汝身已见唾成珠|727|h","汝伯何由发如漆|727|h","春光淡沱秦东亭|727|h","渚蒲牙白水荇青|727|h","风吹客衣日杲杲|727|h","树搅离思花冥冥|727|h","酒尽沙头双玉瓶|727|h","众宾皆醉我独醒|727|h","乃知贫贱别更苦|727|h","吞声踯躅涕泪零|727|h","荷叶罗裙一色裁|728|m","芙蓉向脸两边开|728|m","乱入池中看不见|728|m","闻歌始觉有人来|728|m","猿啼客散暮江头|729|m","人自伤心水自流|729|m","同作逐臣君更远|729|m","青山万里一孤舟|729|m","东皋薄暮望|730|h","徙倚欲何依|730|h","树树皆秋色|730|h","山山唯落晖|730|h","牧人驱犊返|730|h","猎马带禽归|730|h","相顾无相识|730|h","长歌怀采薇|730|h","劝君莫惜金缕衣|731|m","劝君惜取少年时|731|m","花开堪折直须折|731|m","莫待无花空折枝|731|m","繁华事散逐香尘|732|m","流水无情草自春|732|m","日暮东风怨啼鸟|732|m","落花犹似坠楼人|732|m","孤山寺北贾亭西|733|h","水面初平云脚低|733|h","几处早莺争暖树|733|h","谁家新燕啄春泥|733|h","乱花渐欲迷人眼|733|h","浅草才能没马蹄|733|h","最爱湖东行不足|733|h","绿杨阴里白沙堤|733|h","锦瑟无端五十弦|734|h","一弦一柱思华年|734|h","庄生晓梦迷蝴蝶|734|h","望帝春心托杜鹃|734|h","沧海月明珠有泪|734|h","蓝田日暖玉生烟|734|h","此情可待成追忆|734|h","只是当时已惘然|734|h","奉帚平明金殿开|735|m","暂将团扇共徘徊|735|m","玉颜不及寒鸦色|735|m","犹带昭阳日影来|735|m","长安大道连狭斜|736|m","青牛白马七香车|736|m","玉辇纵横过主第|736|m","金鞭络绎向侯家|736|m","客从东方来|737|m","衣上灞陵雨|737|m","问客何为来|737|m","采山因买斧|737|m","妾发初覆额|738|h","折花门前剧|738|h","郎骑竹马来|738|h","绕床弄青梅|738|h","同居长干里|738|h","两小无嫌猜|738|h","十四为君妇|738|h","羞颜未尝开|738|h","低头向暗壁|738|h","千唤不一回|738|h","十五始展眉|738|h","愿同尘与灰|738|h","常存抱柱信|738|h","岂上望夫台|738|h","十六君远行|738|h","瞿塘滟滪堆|738|h","五月不可触|738|h","猿声天上哀|738|h","门前迟行迹|738|h","一一生绿苔|738|h","苔深不能扫|738|h","落叶秋风早|738|h","八月蝴蝶黄|738|h","双飞西园草|738|h","感此伤妾心|738|h","坐愁红颜老|738|h","早晚下三巴|738|h","预将书报家|738|h","相迎不道远|738|h","直至长风沙|738|h","汉皇重色思倾国|739|h","御宇多年求不得|739|h","杨家有女初长成|739|h","养在深闺人未识|739|h","天生丽质难自弃|739|h","一朝选在君王侧|739|h","回眸一笑百媚生|739|h","六宫粉黛无颜色|739|h","春寒赐浴华清池|739|h","温泉水滑洗凝脂|739|h","侍儿扶起娇无力|739|h","始是新承恩泽时|739|h","云鬓花颜金步摇|739|h","芙蓉帐暖度春宵|739|h","春宵苦短日高起|739|h","从此君王不早朝|739|h","承欢侍宴无闲暇|739|h","春从春游夜专夜|739|h","后宫佳丽三千人|739|h","三千宠爱在一身|739|h","金屋妆成娇侍夜|739|h","玉楼宴罢醉和春|739|h","姊妹弟兄皆列土|739|h","可怜光彩生门户|739|h","遂令天下父母心|739|h","不重生男重生女|739|h","骊宫高处入青云|739|h","仙乐风飘处处闻|739|h","缓歌慢舞凝丝竹|739|h","尽日君王看不足|739|h","渔阳鼙鼓动地来|739|h","惊破霓裳羽衣曲|739|h","九重城阙烟尘生|739|h","千乘万骑西南行|739|h","翠华摇摇行复止|739|h","西出都门百余里|739|h","六军不发无奈何|739|h","宛转蛾眉马前死|739|h","花钿委地无人收|739|h","翠翘金雀玉搔头|739|h","君王掩面救不得|739|h","回看血泪相和流|739|h","黄埃散漫风萧索|739|h","云栈萦纡登剑阁|739|h","峨嵋山下少人行|739|h","旌旗无光日色薄|739|h","蜀江水碧蜀山青|739|h","圣主朝朝暮暮情|739|h","行宫见月伤心色|739|h","夜雨闻铃肠断声|739|h","天旋地转回龙驭|739|h","到此踌躇不能去|739|h","马嵬坡下泥土中|739|h","不见玉颜空死处|739|h","君臣相顾尽沾衣|739|h","东望都门信马归|739|h","归来池苑皆依旧|739|h","太液芙蓉未央柳|739|h","芙蓉如面柳如眉|739|h","对此如何不泪垂|739|h","春风桃李花开日|739|h","秋雨梧桐叶落时|739|h","西宫南内多秋草|739|h","落叶满阶红不扫|739|h","梨园弟子白发新|739|h","椒房阿监青娥老|739|h","夕殿萤飞思悄然|739|h","孤灯挑尽未成眠|739|h","迟迟钟鼓初长夜|739|h","耿耿星河欲曙天|739|h","鸳鸯瓦冷霜华重|739|h","翡翠衾寒谁与共|739|h","悠悠生死别经年|739|h","魂魄不曾来入梦|739|h","临邛道士鸿都客|739|h","能以精诚致魂魄|739|h","为感君王辗转思|739|h","遂教方士殷勤觅|739|h","排空驭气奔如电|739|h","升天入地求之遍|739|h","上穷碧落下黄泉|739|h","两处茫茫皆不见|739|h","忽闻海上有仙山|739|h","山在虚无缥缈间|739|h","楼阁玲珑五云起|739|h","其中绰约多仙子|739|h","中有一人字太真|739|h","雪肤花貌参差是|739|h","金阙西厢叩玉扃|739|h","转教小玉报双成|739|h","闻道汉家天子使|739|h","九华帐里梦魂惊|739|h","揽衣推枕起徘徊|739|h","珠箔银屏迤逦开|739|h","云鬓半偏新睡觉|739|h","花冠不整下堂来|739|h","风吹仙袂飘飘举|739|h","犹似霓裳羽衣舞|739|h","玉容寂寞泪阑干|739|h","梨花一枝春带雨|739|h","含情凝睇谢君王|739|h","一别音容两渺茫|739|h","昭阳殿里恩爱绝|739|h","蓬莱宫中日月长|739|h","回头下望人寰处|739|h","不见长安见尘雾|739|h","惟将旧物表深情|739|h","钿合金钗寄将去|739|h","钗留一股合一扇|739|h","钗擘黄金合分钿|739|h","但教心似金钿坚|739|h","天上人间会相见|739|h","临别殷勤重寄词|739|h","词中有誓两心知|739|h","七月七日长生殿|739|h","夜半无人私语时|739|h","在天愿作比翼鸟|739|h","在地愿为连理枝|739|h","天长地久有时尽|739|h","此恨绵绵无绝期|739|h","晨征犯烟磴|740|e","夕憩在云关|740|e","晚风清近壑|740|e","新月照澄湾|740|e","绿蚁新醅酒|741|e","红泥小火炉|741|e","晚来天欲雪|741|e","能饮一杯无|741|e","闺中少妇不知愁|742|m","春日凝妆上翠楼|742|m","忽见陌头杨柳色|742|m","悔教夫婿觅封侯|742|m","月落星稀天欲明|743|m","孤灯未灭梦难成|743|m","披衣更向门前望|743|m","不忿朝来鹊喜声|743|m","剑外忽传收蓟北|744|m","初闻涕泪满衣裳|744|m","却看妻子愁何在|744|m","漫卷诗书喜欲狂|744|m","白日放歌须纵酒|744|m","青春作伴好还乡|744|m","即从巴峡穿巫峡|744|m","便下襄阳向洛阳|744|m","杨花落尽子规啼|745|h","闻道龙标过五溪|745|h","我寄愁心与明月|745|h","随君直到夜郎西|745|h","岁暮阴阳催短景|746|m","天涯霜雪霁寒宵|746|m","五更鼓角声悲壮|746|m","三峡星河影动摇|746|m","野哭千家闻战伐|746|m","夷歌数处起渔樵|746|m","卧龙跃马终黄土|746|m","人事音书漫寂寥|746|m","旅馆寒灯独不眠|747|m","客心何事转凄然|747|m","故乡今夜思千里|747|m","霜鬓明朝又一年|747|m","旅馆谁相问|748|e","寒灯独可亲|748|e","一年将尽夜|748|e","万里未归人|748|e","紫泉宫殿锁烟霞|749|h","欲取芜城作帝家|749|h","玉玺不缘归日角|749|h","锦帆应是到天涯|749|h","黑云压城城欲摧|750|h","甲光向日金鳞开|750|h","角声满天秋色里|750|h","塞上燕脂凝夜紫|750|h","雨里鸡鸣一两家|751|m","竹溪村路板桥斜|751|m","妇姑相唤浴蚕去|751|m","闲着中庭栀子花|751|m","尽道丰年瑞|752|m","丰年事若何|752|m","长安有贫者|752|m","为瑞不宜多|752|m","初闻征雁已无蝉|753|m","百尺楼高水接天|753|m","青女素娥俱耐冷|753|m","月中霜里斗婵娟|753|m","言入黄花川|754|m","每逐青溪水|754|m","随山将万转|754|m","趣途无百里|754|m","声喧乱石中|754|m","色静深松里|754|m","漾漾泛菱荇|754|m","澄澄星鹭起|754|m","我心素已闲|754|m","清川澹如此|754|m","请留盘石上|754|m","垂钓将已矣|754|m","床前明月光|755|e","疑是地上霜|755|e","举头望明月|755|e","低头思故乡|755|e","国初已来画鞍马|756|h","神妙独数江都王|756|h","将军得名三十载|756|h","人间又见真乘黄|756|h","曾貌先帝照夜白|756|h","龙池十日飞霹雳|756|h","内府殷红玛瑙盘|756|h","婕妤传诏才人索|756|h","盘赐将军拜舞归|756|h","轻纨细绮相追飞|756|h","贵戚权门得笔迹|756|h","始觉屏障生光辉|756|h","昔日太宗拳毛騧|756|h","近时郭家狮子花|756|h","今之新图有二马|756|h","复令识者久叹嗟|756|h","此皆骑战一敌万|756|h","缟素漠漠开风沙|756|h","其余七匹亦殊绝|756|h","迥若寒空动烟雪|756|h","霜蹄蹴踏长楸间|756|h","马官厮养森成列|756|h","可怜九马争神骏|756|h","顾视清高气深稳|756|h","借问苦心爱者谁|756|h","后有韦讽前支遁|756|h","忆昔巡幸新丰宫|756|h","翠华拂天来向东|756|h","腾骧磊落三万匹|756|h","皆与此图筋骨同|756|h","自从献宝朝河宗|756|h","无复射蛟江水中|756|h","龙媒去尽鸟呼风|756|h","日暮秋烟起|757|m","胜败兵家事不期|758|m","包羞忍耻是男儿|758|m","江东子弟多才俊|758|m","卷土重来未可知|758|m","闲居少邻并|759|m","草径入荒园|759|m","鸟宿池边树|759|m","僧敲月下门|759|m","过桥分野色|759|m","移石动云根|759|m","暂去还来此|759|m","幽期不负言|759|m","清晨入古寺|760|h","初日照高林|760|h","曲径通幽处|760|h","禅房花木深|760|h","山光悦鸟性|760|h","潭影空人心|760|h","万籁此都寂|760|h","但余钟磬音|760|h","松下茅亭五月凉|761|m","汀沙云树晚苍苍|761|m","行人无限秋风思|761|m","隔水青山似故乡|761|m","飒飒西风满院栽|762|m","蕊寒香冷蝶难来|762|m","他年我若为青帝|762|m","报与桃花一处开|762|m","去年今日此门中|763|m","人面桃花相映红|763|m","人面不知何处去|763|m","桃花依旧笑春风|763|m","金陵津渡小山楼|764|m","一宿行人自可愁|764|m","潮落夜江斜月里|764|m","两三星火是瓜洲|764|m","世人结交须黄金|765|m","黄金不多交不深|765|m","纵令然诺暂相许|765|m","终是悠悠行路心|765|m","解落三秋叶|766|e","能开二月花|766|e","过江千尺浪|766|e","入竹万竿斜|766|e","凄凉宝剑篇|767|h","羁泊欲穷年|767|h","黄叶仍风雨|767|h","青楼自管弦|767|h","新知遭薄俗|767|h","旧好隔良缘|767|h","心断新丰酒|767|h","销愁斗几千|767|h","望君烟水阔|768|m","挥手泪沾巾|768|m","飞鸟没何处|768|m","青山空向人|768|m","长江一帆远|768|m","落日五湖春|768|m","海外徒闻更九州|769|h","他生未卜此生休|769|h","空闻虎旅传宵柝|769|h","无复鸡人报晓筹|769|h","此日六军同驻马|769|h","当时七夕笑牵牛|769|h","如何四纪为天子|769|h","不及卢家有莫愁|769|h","玄宗回马杨妃死|770|m","云雨难忘日月新|770|m","终是圣明天子事|770|m","景阳宫井又何人|770|m","大漠沙如雪|771|m","燕山月似钩|771|m","何当金络脑|771|m","快走踏清秋|771|m","此马非凡马|772|m","房星本是星|772|m","向前敲瘦骨|772|m","犹自带铜声|772|m","龙脊贴连钱|773|m","银蹄白踏烟|773|m","无人织锦韂|773|m","谁为铸金鞭|773|m","人闲桂花落|774|e","夜静春山空|774|e","月出惊山鸟|774|e","时鸣春涧中|774|e","买得晨鸡共结交|775|m","言交退食未相抛|775|m","知时每报凌晨唱|775|m","解语曾闻半夜号|775|m","空山不见人|776|e","但闻人语响|776|e","返景入深林|776|e","复照青苔上|776|e","昔人已乘黄鹤去|777|h","此地空余黄鹤楼|777|h","黄鹤一去不复返|777|h","白云千载空悠悠|777|h","晴川历历汉阳树|777|h","芳草萋萋鹦鹉洲|777|h","日暮乡关何处是|777|h","烟波江上使人愁|777|h","故人西辞黄鹤楼|778|m","烟花三月下扬州|778|m","孤帆远影碧空尽|778|m","唯见长江天际流|778|m","煮豆持作羹|779|e","漉菽以为汁|779|e","萁在釜下燃|779|e","豆在釜中泣|779|e","本自同根生|779|e","相煎何太急|779|e","饥来驱我去|780|m","不知竟何之|780|m","行行至斯里|780|m","叩门拙言辞|780|m","主人解余意|780|m","遗赠岂虚来|780|m","谈谐终日夕|780|m","觞至辄倾杯|780|m","情欣新知欢|780|m","言咏遂赋诗|780|m","感子漂母惠|780|m","愧我非韩才|780|m","衔戢知何谢|780|m","冥报以相贻|780|m","燕丹善养士|781|h","志在报强嬴|781|h","招集百夫良|781|h","岁暮得荆卿|781|h","君子死知己|781|h","提剑出燕京|781|h","素骥鸣广陌|781|h","慷慨送我行|781|h","雄发指危冠|781|h","猛气冲长缨|781|h","饮饯易水上|781|h","四座列群英|781|h","渐离击悲筑|781|h","宋意唱高声|781|h","萧萧哀风逝|781|h","淡淡寒波生|781|h","商音更流涕|781|h","羽奏壮士惊|781|h","心知去不归|781|h","且有后世名|781|h","登车何时顾|781|h","飞盖入秦庭|781|h","凌厉越万里|781|h","逶迤过千城|781|h","图穷事自至|781|h","豪主正怔营|781|h","惜哉剑术疏|781|h","奇功遂不成|781|h","其人虽已没|781|h","千载有余情|781|h","凄厉岁云暮|782|m","拥褐曝前轩|782|m","南圃无遗秀|782|m","枯条盈北园|782|m","倾壶绝余沥|782|m","窥灶不见烟|782|m","诗书塞座外|782|m","日昃不遑研|782|m","闲居非陈厄|782|m","窃有愠见言|782|m","何以慰吾怀|782|m","赖古多此贤|782|m","人生归有道|783|m","衣食固其端|783|m","孰是都不营|783|m","而以求自安|783|m","开春理常业|783|m","岁功聊可观|783|m","晨出肆微勤|783|m","日入负耒还|783|m","山中饶霜露|783|m","风气亦先寒|783|m","田家岂不苦|783|m","弗获辞此难|783|m","四体诚乃疲|783|m","庶无异患干|783|m","盥濯息檐下|783|m","斗酒散襟颜|783|m","遥遥沮溺心|783|m","千载乃相关|783|m","但愿长如此|783|m","躬耕非所叹|783|m","少无适俗韵|784|m","性本爱丘山|784|m","误落尘网中|784|m","一去三十年|784|m","羁鸟恋旧林|784|m","池鱼思故渊|784|m","开荒南野际|784|m","守拙归园田|784|m","方宅十余亩|784|m","草屋八九间|784|m","榆柳荫后檐|784|m","桃李罗堂前|784|m","暧暧远人村|784|m","依依墟里烟|784|m","狗吠深巷中|784|m","鸡鸣桑树颠|784|m","户庭无尘杂|784|m","虚室有余闲|784|m","久在樊笼里|784|m","复得返自然|784|m","种豆南山下|785|m","草盛豆苗稀|785|m","晨兴理荒秽|785|m","带月荷锄归|785|m","道狭草木长|785|m","夕露沾我衣|785|m","衣沾不足惜|785|m","但使愿无违|785|m","荣荣窗下兰|788|m","密密堂前柳|788|m","初与君别时|788|m","不谓行当久|788|m","出门万里客|788|m","中道逢嘉友|788|m","未言心相醉|788|m","不在接杯酒|788|m","兰枯柳亦衰|788|m","遂令此言负|788|m","多谢诸少年|788|m","相知不忠厚|788|m","意气倾人命|788|m","离隔复何有|788|m","漫漫秋夜长|789|m","烈烈北风凉|789|m","展转不能寐|789|m","披衣起彷徨|789|m","彷徨忽已久|789|m","白露沾我裳|789|m","俯视清水波|789|m","仰看明月光|789|m","天汉回西流|789|m","三五正纵横|789|m","草虫鸣何悲|789|m","孤雁独南翔|789|m","郁郁多悲思|789|m","绵绵思故乡|789|m","愿飞安得翼|789|m","欲济河无梁|789|m","向风长叹息|789|m","断绝我中肠|789|m","人生无根蒂|790|m","飘如陌上尘|790|m","分散逐风转|790|m","此已非常身|790|m","落地为兄弟|790|m","何必骨肉亲|790|m","得欢当作乐|790|m","斗酒聚比邻|790|m","盛年不重来|790|m","一日难再晨|790|m","及时当勉励|790|m","岁月不待人|790|m","秋风萧瑟天气凉|791|h","草木摇落露为霜|791|h","群燕辞归鹄南翔|791|h","念君客游思断肠|791|h","慊慊思归恋故乡|791|h","君何淹留寄他方|791|h","贱妾茕茕守空房|791|h","忧来思君不敢忘|791|h","不觉泪下沾衣裳|791|h","援琴鸣弦发清商|791|h","短歌微吟不能长|791|h","明月皎皎照我床|791|h","星汉西流夜未央|791|h","牵牛织女遥相望|791|h","尔独何辜限河梁|791|h","在昔闻南亩|792|m","当年竟未践|792|m","屡空既有人|792|m","春兴岂自免|792|m","夙晨装吾驾|792|m","启涂情已缅|792|m","鸟哢欢新节|792|m","泠风送余善|792|m","寒草被荒蹊|792|m","地为罕人远|792|m","是以植杖翁|792|m","悠然不复返|792|m","即理愧通识|792|m","所保讵乃浅|792|m","白马饰金羁|793|h","连翩西北驰|793|h","借问谁家子|793|h","幽并游侠儿|793|h","少小去乡邑|793|h","扬声沙漠垂|793|h","宿昔秉良弓|793|h","楛矢何参差|793|h","控弦破左的|793|h","右发摧月支|793|h","仰手接飞猱|793|h","俯身散马蹄|793|h","狡捷过猴猿|793|h","勇剽若豹螭|793|h","边城多警急|793|h","虏骑数迁移|793|h","羽檄从北来|793|h","厉马登高堤|793|h","长驱蹈匈奴|793|h","左顾凌鲜卑|793|h","弃身锋刃端|793|h","性命安可怀|793|h","父母且不顾|793|h","何言子与妻|793|h","名编壮士籍|793|h","不得中顾私|793|h","捐躯赴国难|793|h","视死忽如归|793|h","昔欲居南村|795|m","非为卜其宅|795|m","闻多素心人|795|m","乐与数晨夕|795|m","怀此颇有年|795|m","今日从兹役|795|m","弊庐何必广|795|m","取足蔽床席|795|m","邻曲时时来|795|m","抗言谈在昔|795|m","奇文共欣赏|795|m","疑义相与析|795|m","春秋多佳日|796|m","登高赋新诗|796|m","过门更相呼|796|m","有酒斟酌之|796|m","农务各自归|796|m","闲暇辄相思|796|m","相思则披衣|796|m","言笑无厌时|796|m","此理将不胜|796|m","无为忽去兹|796|m","衣食当须纪|796|m","力耕不吾欺|796|m","美女妖且闲|797|h","采桑歧路间|797|h","柔条纷冉冉|797|h","落叶何翩翩|797|h","攘袖见素手|797|h","皓腕约金环|797|h","头上金爵钗|797|h","腰佩翠琅玕|797|h","明珠交玉体|797|h","珊瑚间木难|797|h","罗衣何飘飖|797|h","轻裾随风还|797|h","顾盼遗光彩|797|h","长啸气若兰|797|h","行徒用息驾|797|h","休者以忘餐|797|h","借问女安居|797|h","乃在城南端|797|h","青楼临大巷|797|h","幽门结重关|797|h","容华耀朝日|797|h","谁不希令颜|797|h","媒氏何所营|797|h","玉帛不时安|797|h","佳人慕高义|797|h","求贤良独难|797|h","众人徒嗷嗷|797|h","安知彼所观|797|h","盛年处房室|797|h","中夜起长叹|797|h","关东有义士|798|m","兴兵讨群凶|798|m","初期会盟津|798|m","乃心在咸阳|798|m","军合力不齐|798|m","踌躇而雁行|798|m","势利使人争|798|m","嗣还自相戕|798|m","淮南弟称号|798|m","刻玺于北方|798|m","铠甲生虮虱|798|m","万姓以死亡|798|m","白骨露于野|798|m","千里无鸡鸣|798|m","生民百遗一|798|m","念之断人肠|798|m","孟夏草木长|800|m","绕屋树扶疏|800|m","众鸟欣有托|800|m","吾亦爱吾庐|800|m","既耕亦已种|800|m","时还读我书|800|m","穷巷隔深辙|800|m","颇回故人车|800|m","欢言酌春酒|800|m","摘我园中蔬|800|m","微雨从东来|800|m","好风与之俱|800|m","泛览周王传|800|m","流观山海图|800|m","俯仰终宇宙|800|m","不乐复何如|800|m","精卫衔微木|801|m","将以填沧海|801|m","刑天舞干戚|801|m","猛志固常在|801|m","同物既无虑|801|m","化去不复悔|801|m","徒设在昔心|801|m","良辰讵可待|801|m","白发被两鬓|802|m","肌肤不复实|802|m","虽有五男儿|802|m","总不好纸笔|802|m","阿舒已二八|802|m","懒惰故无匹|802|m","阿宣行志学|802|m","而不爱文术|802|m","雍端年十三|802|m","不识六与七|802|m","通子垂九龄|802|m","但觅梨与栗|802|m","天运苟如此|802|m","且进杯中物|802|m","谒帝承明庐|803|h","逝将归旧疆|803|h","清晨发皇邑|803|h","日夕过首阳|803|h","伊洛广且深|803|h","欲济川无梁|803|h","泛舟越洪涛|803|h","怨彼东路长|803|h","顾瞻恋城阙|803|h","引领情内伤|803|h","太谷何寥廓|803|h","山树郁苍苍|803|h","霖雨泥我涂|803|h","流潦浩纵横|803|h","中逵绝无轨|803|h","改辙登高冈|803|h","修坂造云日|803|h","我马玄以黄|803|h","结庐在人境|804|m","而无车马喧|804|m","问君何能尔|804|m","心远地自偏|804|m","采菊东篱下|804|m","悠然见南山|804|m","山气日夕佳|804|m","飞鸟相与还|804|m","此中有真意|804|m","欲辨已忘言|804|m","秋菊有佳色|805|m","裛露掇其英|805|m","泛此忘忧物|805|m","远我遗世情|805|m","一觞虽独进|805|m","杯尽壶自倾|805|m","日入群动息|805|m","归鸟趋林鸣|805|m","啸傲东轩下|805|m","聊复得此生|805|m","故人赏我趣|806|m","挈壶相与至|806|m","班荆坐松下|806|m","数斟已复醉|806|m","父老杂乱言|806|m","觞酌失行次|806|m","不觉知有我|806|m","安知物为贵|806|m","悠悠迷所留|806|m","酒中有深味|806|m","若有人兮山之阿|808|h","被薜荔兮带女萝|808|h","既含睇兮又宜笑|808|h","子慕予兮善窈窕|808|h","乘赤豹兮从文狸|808|h","辛夷车兮结桂旗|808|h","被石兰兮带杜衡|808|h","折芳馨兮遗所思|808|h","路险难兮独后来|808|h","表独立兮山之上|808|h","云容容兮而在下|808|h","杳冥冥兮羌昼晦|808|h","东风飘兮神灵雨|808|h","留灵修兮憺忘归|808|h","岁既晏兮孰华予|808|h","采三秀兮于山间|808|h","石磊磊兮葛蔓蔓|808|h","怨公子兮怅忘归|808|h","君思我兮不得闲|808|h","山中人兮芳杜若|808|h","饮石泉兮荫松柏|808|h","君思我兮然疑作|808|h","雷填填兮雨冥冥|808|h","猿啾啾兮狖夜鸣|808|h","风飒飒兮木萧萧|808|h","思公子兮徒离忧|808|h","帝力于我何有哉|810|e","操吴戈兮被犀甲|811|h","车错毂兮短兵接|811|h","旌蔽日兮敌若云|811|h","矢交坠兮士争先|811|h","凌余阵兮躐余行|811|h","左骖殪兮右刃伤|811|h","霾两轮兮絷四马|811|h","援玉枹兮击鸣鼓|811|h","天时怼兮威灵怒|811|h","严杀尽兮弃原野|811|h","出不入兮往不反|811|h","平原忽兮路超远|811|h","带长剑兮挟秦弓|811|h","首身离兮心不惩|811|h","诚既勇兮又以武|811|h","终刚强兮不可凌|811|h","身既死兮神以灵|811|h","魂魄毅兮为鬼雄|811|h","曰遂古之初|817|h","风萧萧兮易水寒|820|m","投我以木瓜|821|m","报之以琼琚|821|m","永以为好也|821|m","投我以木桃|821|m","报之以琼瑶|821|m","投我以木李|821|m","报之以琼玖|821|m","纷其可喜兮|822|h","姱而不丑兮|822|h","岂不可喜兮|822|h","廓其无求兮|822|h","横而不流兮|822|h","终不失过兮|822|h","梗其有理兮|822|h","置以为像兮|822|h","袅袅兮秋风|824|h","洞庭波兮木叶下|824|h","沅有芷兮澧有兰|824|h","思公子兮未敢言|824|h","荒忽兮远望|824|h","帝高阳之苗裔兮|826|h","摄提贞于孟陬兮|826|h","皇览揆余初度兮|826|h","字余曰灵均|826|h","扈江离与辟芷兮|826|h","汩余若将不及兮|826|h","恐年岁之不吾与|826|h","朝搴阰之木兰兮|826|h","日月忽其不淹兮|826|h","惟草木之零落兮|826|h","不抚壮而弃秽兮|826|h","何不改此度|826|h","乘骐骥以驰骋兮|826|h","宛在水中坻|827|h","宛在水中沚|827|h","俟我于城隅|829|m","匪女之为美|829|m","以燕乐嘉宾之心|830|h","寄与多情客|832|m","料峭春风寒|832|m","独自凭栏久|832|m","归期何太晚|832|m","美人自刎乌江岸|833|m","战火曾烧赤壁山|833|m","将军空老玉门关|833|m","读书人一声长叹|833|m","老瓦盆边笑呵呵|834|m","他出一对鸡|834|m","我出一个鹅|834|m","往常得兴时|835|m","一扫无瑕疵|835|m","我家洗砚池头树|836|m","朵朵花开淡墨痕|836|m","不要人夸好颜色|836|m","只留清气满乾坤|836|m","道是春归人未归|837|m","几日添憔悴|837|m","一春鱼雁无消息|837|m","则见双燕斗衔泥|837|m","两三航未曾着岸|842|m","落花水香茅舍晚|842|m","断桥头卖鱼人散|842|m","山河表里潼关路|843|m","伤心秦汉经行处|843|m","当时奢侈今何处|844|m","只见草萧疏|844|m","至今遗恨迷烟树|844|m","列国周齐秦汉楚|844|m","都变做了土|844|m","对青山强整乌纱|845|m","人老去西风白发|845|m","蝶愁来明日黄花|845|m","醒时诗酒醉时歌|846|m","瑶琴不理抛书卧|846|m","一声梧叶一声秋|847|m","一点芭蕉一点愁|847|m","三更归梦三更后|847|m","叹新丰逆旅淹留|847|m","枕上十年事|847|m","江南二老忧|847|m","冬前冬后几村庄|848|m","溪北溪南两履霜|848|m","树头树底孤山上|848|m","忽相逢缟袂绡裳|848|m","挂绝壁松枯倒倚|849|m","落残霞孤鹜齐飞|849|m","四围不尽山|849|m","一望无穷水|849|m","散西风满天秋意|849|m","夜静云帆月影低|849|m","载我在潇湘画里|849|m","瓦盆边浊酒生涯|850|m","醉里乾坤大|850|m","壶中日月长|850|m","问人间谁是英雄|851|m","有酾酒临江|851|m","更惊起南阳卧龙|851|m","便成名八阵图中|851|m","动高吟楚客秋风|852|m"];
  var S = ["敕勒歌|北朝民歌|北朝","木兰诗|北朝民歌|北朝","木兰辞|佚名|北朝","上邪|汉乐府|汉","五噫歌|梁鸿|汉","十五从军征|佚名|汉","古诗十九首（其一）|佚名|汉","古诗十九首（其二）|佚名|汉","古诗十九首（其四）|佚名|汉","古诗十九首（其五）|佚名|汉","古诗十九首（其九）|佚名|汉","古诗十九首（其十三）|佚名|汉","古诗十九首（其十五）|佚名|汉","古诗十九首（其十九）|佚名|汉","四愁诗（其一）|张衡|汉","垓下歌|项羽|汉","大风歌|刘邦|汉","孔雀东南飞|汉乐府|汉","庭中有奇树|汉乐府|汉","怨歌行|班婕妤|汉","悲歌|佚名|汉","明月皎夜光|汉乐府|汉","有所思|佚名|汉","有所思|汉乐府|汉","江南|汉乐府|汉","涉江采芙蓉|汉乐府|汉","行行重行行|汉乐府|汉","西北有高楼|汉乐府|汉","赠妇诗（其一）|秦嘉|汉","迢迢牵牛星|汉乐府|汉","长歌行|汉乐府|汉","饮马长城窟行|汉乐府|汉","上京舟中|杨慎|明","临江仙|杨慎|明","九日渡江|李东阳|明","京师得家书|袁凯|明","今日诗|文嘉|明","出郊|杨慎|明","别云间|夏完淳|明","咏煤炭|于谦|明","寻胡隐君|高启|明","岳阳楼|杨基|明","春雁|王恭|明","暮春|朱弁|明","朝天子·咏喇叭|王磐|明","江宿|汤显祖|明","渔家|孙蕡|明","石灰吟|于谦|明","观书|于谦|明","题竹|刘基|明","马上作|戚继光|明","之零陵郡次新亭|范云|南北朝","别诗|范云|南北朝","寄王琳|庾信|南北朝","慈姥矶|何逊|南北朝","拟咏怀|庾信|南北朝","数名诗|鲍照|南北朝","断句|刘昶|南北朝","晚登三山还望京邑|谢朓|南北朝","渡河北|王褒|南北朝","相送|何逊|南北朝","答诏问|陶弘景|南北朝","赠范晔诗|陆凯|南北朝","重别周尚书|庾信|南北朝","出塞|徐锡麟|清","十二月十五夜|袁枚|清","咏史|龚自珍|清","塞外杂咏|林则徐|清","墨竹图题诗|郑燮|清","对酒|秋瑾|清","己亥杂诗(九州生气恃风雷)|龚自珍|清","己亥杂诗(浩荡离愁白日斜)|龚自珍|清","己亥杂诗(少年哀乐过于人)|龚自珍|清","己亥杂诗(霜豪掷罢倚天寒)|龚自珍|清","所见|袁枚|清","推窗|袁枚|清","春风|袁枚|清","晓窗|魏源|清","木兰词|纳兰性德|清","村居|高鼎|清","沁园春·长沙|毛泽东|清","沁园春·雪|毛泽东|清","浣溪沙|纳兰性德|清","狱中题壁|谭嗣同|清","竹石|郑燮|清","舟夜书所见|查慎行|清","苔|袁枚|清","蝉|袁枚|清","蝶恋花|纳兰性德|清","论诗|赵翼|清","读陆放翁集|梁启超|清","赋得对月|万梦丹|清","赴戍登程口占示家人|林则徐|清","遣兴|袁枚|清","金缕曲|顾贞观|清","长相思|纳兰性德|清","题临淮方教未申之思堂|袁枚|清","马嵬|袁枚|清","黄海舟中日人索句并见日俄战争地图|秋瑾|清","一剪梅|李清照|宋","三衢道中|曾几|宋","丑奴儿·书博山道中壁|辛弃疾|宋","东栏梨花|苏轼|宋","临安春雨初霁|陆游|宋","临江仙|晏几道|宋","临江仙|苏轼|宋","书愤|陆游|宋","书李世南所画秋景二首（其一）|苏轼|宋","书河上亭壁|寇准|宋","书湖阴先生壁|王安石|宋","伤春|陈与义|宋","偶成|程颢|宋","元日|王安石|宋","八声甘州|柳永|宋","六州歌头|张孝祥|宋","六月二十七日望湖楼醉书|苏轼|宋","六月二十日夜渡海|苏轼|宋","冬夜读书示子聿|陆游|宋","凤凰台上忆吹箫|李清照|宋","初夏游张园|戴敏|宋","初秋行圃|杨万里|宋","剑门道中遇微雨|陆游|宋","劝学诗|朱熹|宋","北山|王安石|宋","十一月四日风雨大作|陆游|宋","南乡子·登京口北固亭有怀|辛弃疾|宋","南浦|王安石|宋","卜算子·咏梅|陆游|宋","卜算子·送鲍浩然之浙东|王观|宋","卜算子·黄州定慧院寓居作|苏轼|宋","即事|汪藻|宋","双双燕·咏燕|史达祖|宋","和子由渑池怀旧|苏轼|宋","四时田园杂兴（其一）|范成大|宋","四时田园杂兴（其二）|范成大|宋","四时田园杂兴（其二十五）|范成大|宋","四时田园杂兴（其四十四）|范成大|宋","声声慢|李清照|宋","夏意|苏舜钦|宋","夏日三首（其一）|张耒|宋","夏日怀友|徐玑|宋","夏日绝句|李清照|宋","夜书所见|叶绍翁|宋","夜坐|张耒|宋","夜泊水村|陆游|宋","天仙子|张先|宋","太常引·建康中秋夜为吕叔潜赋|辛弃疾|宋","好事近|杨万里|宋","如梦令|李清照|宋","如梦令·常记溪亭日暮|李清照|宋","孤桐|王安石|宋","定风波|苏轼|宋","宿新市徐公店|杨万里|宋","寄黄几复|黄庭坚|宋","小池|杨万里|宋","小重山|岳飞|宋","山园小梅|林逋|宋","念奴娇·赤壁怀古|苏轼|宋","念奴娇·过洞庭|张孝祥|宋","悟道诗|某尼|宋","惠崇春江晚景（其二）|苏轼|宋","惠州一绝|苏轼|宋","扬州慢|姜夔|宋","扬州慢·淮左名都|姜夔|宋","插秧歌|杨万里|宋","摸鱼儿|辛弃疾|宋","数日|赵师秀|宋","新凉|徐玑|宋","新城道中（其一）|苏轼|宋","新晴|刘攽|宋","早行|陈与义|宋","春夜|王安石|宋","春宵|苏轼|宋","春日|晁冲之|宋","春日|朱熹|宋","春日|汪藻|宋","春江晚景|苏轼|宋","春游湖|徐俯|宋","昭君怨·咏荷上雨|杨万里|宋","晓出净慈寺送林子方|杨万里|宋","晚春田园杂兴|范成大|宋","暑旱苦热|王令|宋","暗香|姜夔|宋","暮春即事|叶采|宋","有美堂暴雨|苏轼|宋","望江南·超然台作|苏轼|宋","望海潮|柳永|宋","木兰花慢|辛弃疾|宋","村晚|雷震|宋","柳|寇准|宋","桂枝香·金陵怀古|王安石|宋","梅花|王安石|宋","梅花|陈焕|宋","梅花绝句|陆游|宋","正气歌（节选）|文天祥|宋","武陵春|李清照|宋","水口行舟|朱熹|宋","水调歌头·明月几时有|苏轼|宋","水龙吟·次韵章质夫杨花词|苏轼|宋","水龙吟·登建康赏心亭|辛弃疾|宋","永遇乐·京口北固亭怀古|辛弃疾|宋","江上|王安石|宋","江上渔者|范仲淹|宋","江城子·乙卯正月二十日夜记梦|苏轼|宋","江城子·密州出猎|苏轼|宋","江村晚眺|戴复古|宋","池州翠微亭|岳飞|宋","沈园二首（其一）|陆游|宋","沈园二首（其二）|陆游|宋","泊船瓜洲|王安石|宋","洞仙歌|苏轼|宋","浣溪沙|晏殊|宋","浣溪沙|苏轼|宋","海棠|苏轼|宋","淮中晚泊犊头|苏舜钦|宋","淮村兵后|戴复古|宋","清平乐|黄庭坚|宋","清平乐·村居|辛弃疾|宋","渔家傲|李清照|宋","渔家傲·秋思|范仲淹|宋","渔歌子|张志和|宋","游园不值|叶绍翁|宋","游山西村|陆游|宋","满庭芳|秦观|宋","满江红|岳飞|宋","澄迈驿通潮阁二首（其一）|苏轼|宋","点绛唇|姜夔|宋","牡丹|陈与义|宋","玉楼春|刘克庄|宋","玉楼春|欧阳修|宋","琴诗|苏轼|宋","生查子·元夕|欧阳修|宋","病牛|李纲|宋","病起书怀|陆游|宋","登快阁|黄庭坚|宋","登飞来峰|王安石|宋","破阵子|晏殊|宋","破阵子·为陈同甫赋壮词以寄之|辛弃疾|宋","示儿|陆游|宋","秋夜|朱淑真|宋","秋夜将晓出篱门迎凉有感|陆游|宋","秋思|陆游|宋","秋日|程颢|宋","秋月|程颢|宋","约客|赵师秀|宋","绝句|释志南|宋","舟过安仁|杨万里|宋","花影|苏轼|宋","苏幕遮|周邦彦|宋","苏幕遮|范仲淹|宋","菩萨蛮·书江西造口壁|辛弃疾|宋","落梅|刘克庄|宋","落梅|陆游|宋","虞美人·听雨|蒋捷|宋","蚕妇|张俞|宋","蝶恋花|晏殊|宋","蝶恋花|柳永|宋","蝶恋花|欧阳修|宋","蝶恋花·春景|苏轼|宋","襄邑道中|陈与义|宋","西江月·夜行黄沙道中|辛弃疾|宋","西河·金陵怀古|周邦彦|宋","观书有感|朱熹|宋","观书有感（其二）|朱熹|宋","诉衷情|陆游|宋","读史|王安石|宋","贺新郎|辛弃疾|宋","贺新郎·别茂嘉十二弟|辛弃疾|宋","贺新郎·送陈真州子华|刘克庄|宋","赠刘景文|苏轼|宋","踏莎行|欧阳修|宋","踏莎行·郴州旅舍|秦观|宋","过新息留示乡人任大中|苏轼|宋","过松源晨炊漆公店|杨万里|宋","过零丁洋|文天祥|宋","送春|王令|宋","醉花阴|李清照|宋","采桑子|欧阳修|宋","野望|翁卷|宋","钗头凤|陆游|宋","钟山即事|王安石|宋","闲居初夏午睡起|杨万里|宋","雨中登岳阳楼望君山|黄庭坚|宋","雨后池上|刘攽|宋","雨霖铃|柳永|宋","雪梅|卢梅坡|宋","雪梅（其二）|卢梅坡|宋","青玉案|贺铸|宋","青玉案·元夕|辛弃疾|宋","题临安邸|林升|宋","题花山寺壁|苏舜钦|宋","题西林壁|苏轼|宋","题青阳山庄|苏轼|宋","饮湖上初晴后雨|苏轼|宋","鹊桥仙|秦观|宋","鹧鸪天|晏几道|宋","鹧鸪天|辛弃疾|宋","丁寓田家有赠|王维|唐","三台令|戴叔伦|唐","三日寻李九庄|常建|唐","三闾庙|戴叔伦|唐","不见|杜甫|唐","与诸子登岘山|孟浩然|唐","丹青引赠曹霸将军|杜甫|唐","为有|李商隐|唐","丽人行|杜甫|唐","乌夜啼|李煜|唐","乌衣巷|刘禹锡|唐","乐游原|李商隐|唐","九日蓝田崔氏庄|杜甫|唐","九月九日忆山东兄弟|王维|唐","九月九日玄武山旅眺|卢照邻|唐","乞巧|林杰|唐","乡村四月|白居易|唐","乾元中寓居同谷县作歌七首·其二|杜甫|唐","二月二日|李商隐|唐","于易水送人|骆宾王|唐","云|杜牧|唐","从军行|杨炯|唐","从军行|王昌龄|唐","从军行（其二）|王昌龄|唐","从军行（其五）|王昌龄|唐","休假日访王侍御不遇|韦应物|唐","伤田家|聂夷中|唐","使至塞上|王维|唐","元和十年自朗州至京戏赠看花诸君子|刘禹锡|唐","八阵图|杜甫|唐","公子家|聂夷中|唐","兰溪棹歌|戴叔伦|唐","关山月|李白|唐","兵车行|杜甫|唐","再游玄都观|刘禹锡|唐","再经胡城县|杜荀鹤|唐","军行|李白|唐","农家|颜仁郁|唐","凉州词|王之涣|唐","凉州词|王翰|唐","凉思|李商隐|唐","出塞|王昌龄|唐","出塞作|王维|唐","初食笋呈座中|李商隐|唐","利州南渡|温庭筠|唐","别人|王勃|唐","别董大|高适|唐","别董大（其二）|高适|唐","前出塞|杜甫|唐","剑客|贾岛|唐","北青萝|李商隐|唐","十五夜望月|王建|唐","卖炭翁|白居易|唐","南浦别|白居易|唐","南行别弟|韦承庆|唐","卢溪别人|王昌龄|唐","又呈吴郎|杜甫|唐","古从军行|李颀|唐","古剑篇|郭震|唐","古意|李颀|唐","古朗月行（节选）|李白|唐","古柏行|杜甫|唐","叹花|杜牧|唐","同从弟南斋玩月忆山阴崔少府|王昌龄|唐","同谷七歌·其一|杜甫|唐","听张立本女吟|高适|唐","听筝|李端|唐","听董大弹胡笳声兼语弄寄房给事|李颀|唐","听蜀僧濬弹琴|李白|唐","和康五庭芝望月|杜审言|唐","和晋陵陆丞早春游望|杜审言|唐","和王七玉门关听吹笛|高适|唐","和贾舍人早朝大明宫之作|岑参|唐","和贾舍人早朝大明宫之作|王维|唐","咏史|高适|唐","咏怀古迹·其三|杜甫|唐","咏怀古迹五首·其一|杜甫|唐","咏怀古迹五首·其二|杜甫|唐","咏怀古迹五首·其五|杜甫|唐","咏怀古迹五首·其四|杜甫|唐","咏柳|贺知章|唐","咏田家|聂夷中|唐","咏风|虞世南|唐","咏鹅|骆宾王|唐","咸阳城东楼|许浑|唐","哀江头|杜甫|唐","哀王孙|杜甫|唐","哥舒歌|西鄙人|唐","商山早行|温庭筠|唐","回乡偶书|贺知章|唐","回乡偶书（其二）|贺知章|唐","在狱咏蝉|骆宾王|唐","垂老别|杜甫|唐","城东早春|杨巨源|唐","堤上行三首·其一|刘禹锡|唐","塞上曲|戴叔伦|唐","塞上曲|王昌龄|唐","塞下曲|卢纶|唐","塞下曲（其二）|卢纶|唐","塞下曲|常建|唐","塞下曲六首·其一|卢纶|唐","夜上受降城闻笛|李益|唐","夜宿山寺|李白|唐","夜归鹿门歌|孟浩然|唐","夜雨寄北|李商隐|唐","夜雪|白居易|唐","大林寺桃花|白居易|唐","天末怀李白|杜甫|唐","天涯|李商隐|唐","奉和圣制从蓬莱向兴庆阁道中留春雨中春望之作应制|王维|唐","奉和春日幸望春宫应制|苏颋|唐","奉赠韦左丞丈二十二韵|杜甫|唐","女耕田行|戴叔伦|唐","嫦娥|李商隐|唐","子夜吴歌·冬歌|李白|唐","子夜吴歌·夏歌|李白|唐","子夜吴歌·春歌|李白|唐","子夜吴歌·秋歌|李白|唐","孤雁|杜甫|唐","安定城楼|李商隐|唐","客中行|李白|唐","客至|杜甫|唐","宣州谢脁楼饯别校书叔云|李白|唐","宫词|张祜|唐","宿府|杜甫|唐","宿建德江|孟浩然|唐","宿桐庐江寄广陵旧游|孟浩然|唐","宿王昌龄隐居|常建|唐","宿骆氏亭寄怀崔雍崔衮|李商隐|唐","寄左省杜拾遗|岑参|唐","寄扬州韩绰判官|杜牧|唐","寄李儋元锡|韦应物|唐","寒闺怨|白居易|唐","寒食|韩翃|唐","寒食城东即事|王维|唐","寻南溪常山道人隐居|刘长卿|唐","寻隐者不遇|贾岛|唐","封丘作|高适|唐","将赴吴兴登乐游原一绝|杜牧|唐","将进酒|李白|唐","小寒食舟中作|杜甫|唐","小松|杜荀鹤|唐","小雪|戴叔伦|唐","山中|王勃|唐","山中寡妇|杜荀鹤|唐","山中问答|李白|唐","山居即事|王维|唐","山居秋暝|王维|唐","山房春事|岑参|唐","山行|杜牧|唐","岁夜咏怀|刘禹锡|唐","岁暮归南山|孟浩然|唐","岭上逢久别者又别|权德舆|唐","左迁至蓝关示侄孙湘|韩愈|唐","已凉|韩偓|唐","幽居|韦应物|唐","庐山瀑布|李白|唐","庐山谣寄卢侍御虚舟|李白|唐","度荆门望楚|陈子昂|唐","弹琴|刘长卿|唐","归嵩山作|王维|唐","归燕诗|张九龄|唐","归雁|杜甫|唐","微雨夜行|白居易|唐","忆梅|李商隐|唐","忆江南|白居易|唐","忆江南（其二）|白居易|唐","怨情|李白|唐","悯农（其二）|李绅|唐","悯农（其一）|李绅|唐","感遇|张九龄|唐","感遇三十八首（其二）|陈子昂|唐","戏为六绝句·其一|杜甫|唐","戏为六绝句·其二|杜甫|唐","房兵曹胡马|杜甫|唐","把酒问月|李白|唐","投赠哥舒开府翰二十韵|杜甫|唐","拜新月|李端|唐","敕赐百官樱桃|王维|唐","新婚别|杜甫|唐","新嫁娘词|王建|唐","新安吏|杜甫|唐","新年作|刘长卿|唐","新晴野望|王维|唐","旅夜书怀|杜甫|唐","无家别|杜甫|唐","无题|李商隐|唐","无题·昨夜星辰昨夜风|李商隐|唐","早发白帝城|李白|唐","早寒江上有怀|孟浩然|唐","早春呈水部张十八员外|韩愈|唐","早梅|张谓|唐","春中田园作|王维|唐","春兴|武元衡|唐","春夜别友人|陈子昂|唐","春夜喜雨|杜甫|唐","春宫怨|杜荀鹤|唐","春思|李白|唐","春怨|刘方平|唐","春怨|金昌绪|唐","春晓|孟浩然|唐","春望|杜甫|唐","春梦|岑参|唐","春江花月夜|张若虚|唐","春泛若耶溪|綦毋潜|唐","春行即兴|李华|唐","春闺|崔道融|唐","春雨|李商隐|唐","春雪|东方虬|唐","春雪|韩愈|唐","晚春|韩愈|唐","晚晴|李商隐|唐","晚次乐乡县|陈子昂|唐","暮江吟|白居易|唐","暮过山村|贾岛|唐","曲池荷|卢照邻|唐","月下独酌|李白|唐","月夕|崔道融|唐","月夜|刘方平|唐","月夜|杜甫|唐","月夜忆舍弟|杜甫|唐","有所思|杨炯|唐","望天门山|李白|唐","望岳|杜甫|唐","望庐山五老峰|李白|唐","望庐山瀑布|李白|唐","望月怀远|张九龄|唐","望月有感|白居易|唐","望洞庭|刘禹锡|唐","望洞庭湖赠张丞相|孟浩然|唐","望蓟门|祖咏|唐","未展芭蕉|钱珝|唐","杂诗三首（其三）|沈佺期|唐","李凭箜篌引|李贺|唐","村夜|白居易|唐","杨柳枝词九首·其一|刘禹锡|唐","枫桥夜泊|张继|唐","柳|李商隐|唐","桃源行|王维|唐","梅花|崔道融|唐","梅花落|卢照邻|唐","梦天|李贺|唐","梦游天姥吟留别|李白|唐","次北固山下|王湾|唐","汉江临泛|王维|唐","江乡故人偶集客舍|戴叔伦|唐","江亭夜月送别|王勃|唐","江南春|杜牧|唐","江南曲|李益|唐","江南逢李龟年|杜甫|唐","江村即事|司空曙|唐","江汉|杜甫|唐","江畔独步寻花|杜甫|唐","江行无题|钱珝|唐","江雪|柳宗元|唐","池上|白居易|唐","汾上惊秋|苏颋|唐","泊秦淮|杜牧|唐","泛渭州|王维|唐","泾溪|杜荀鹤|唐","洗兵马|杜甫|唐","洛阳女儿行|王维|唐","浪淘沙|刘禹锡|唐","浪淘沙|李煜|唐","浪淘沙·其八|刘禹锡|唐","淮上喜会梁川故人|韦应物|唐","深渡驿|张说|唐","清平乐·别来春半|李煜|唐","清明|杜牧|唐","清明日宴梅道士房|孟浩然|唐","渔翁|柳宗元|唐","渡汉江|宋之问|唐","渡湘江|杜审言|唐","渡荆门送别|李白|唐","渭城曲|王维|唐","渭川田家|王维|唐","游子吟|孟郊|唐","渼陂行|杜甫|唐","湖口望庐山瀑布水|张九龄|唐","溪居即事|崔道融|唐","滁州西涧|韦应物|唐","滕王阁诗|王勃|唐","漫成|李商隐|唐","漫成一首|杜甫|唐","潼关吏|杜甫|唐","燕子来舟中作|杜甫|唐","燕歌行|高适|唐","独不见|沈佺期|唐","独坐敬亭山|李白|唐","玉台体|权德舆|唐","琵琶行|白居易|唐","琵琶行并序|白居易|唐","瑶瑟怨|温庭筠|唐","田家|聂夷中|唐","画|王维|唐","画鹰|杜甫|唐","留别王侍御维|孟浩然|唐","登城春望|王勃|唐","登岳阳楼|杜甫|唐","登幽州台歌|陈子昂|唐","登柳州城楼寄漳汀封连四州|柳宗元|唐","登楼|杜甫|唐","登楼寄王卿|韦应物|唐","登高|杜甫|唐","登鹳雀楼|王之涣|唐","白云泉|白居易|唐","白帝|杜甫|唐","白雪歌送武判官归京|岑参|唐","百忧集行|杜甫|唐","相见欢|李煜|唐","石壕吏|杜甫|唐","石头城|刘禹锡|唐","碛中作|岑参|唐","碧涧驿晓思|温庭筠|唐","禹庙|杜甫|唐","离思五首（其四）|元稹|唐","秋兴八首·其一|杜甫|唐","秋夕|杜牧|唐","秋夜寄邱员外|韦应物|唐","秋思|张籍|唐","秋日登吴公台上寺远眺|刘长卿|唐","秋浦歌|李白|唐","秋登万山寄张五|孟浩然|唐","秋登宣城谢脁北楼|李白|唐","秋词|刘禹锡|唐","秋霁|崔道融|唐","秋风引|刘禹锡|唐","秦中感秋寄远上人|孟浩然|唐","积雨辋川庄作|王维|唐","端居|李商隐|唐","竹枝词|刘禹锡|唐","竹里馆|王维|唐","答陆澧|朱放|唐","筹笔驿|李商隐|唐","紫薇花|杜牧|唐","红线毯|白居易|唐","终南别业|王维|唐","终南山|王维|唐","终南望余雪|祖咏|唐","结客少年场行|虞世南|唐","绝句|杜甫|唐","绝句二首（其一）|杜甫|唐","绝句二首·其二|杜甫|唐","绝句漫兴九首·其一|杜甫|唐","绝句漫兴九首·其三|杜甫|唐","老将行|王维|唐","自君之出矣|张九龄|唐","自遣|罗隐|唐","芙蓉楼送辛渐|王昌龄|唐","苏台览古|李白|唐","苏武庙|温庭筠|唐","苏溪亭|戴叔伦|唐","茅屋为秋风所破歌|杜甫|唐","菊花|元稹|唐","菊花|黄巢|唐","菩萨蛮|温庭筠|唐","营州歌|高适|唐","落花|李商隐|唐","虞美人|李煜|唐","蚕妇|杜荀鹤|唐","蜀先主庙|刘禹锡|唐","蜀相|杜甫|唐","蜀道后期|张说|唐","蜀道难|李白|唐","蜂|罗隐|唐","蝉|李商隐|唐","蝉|虞世南|唐","行军九日思长安故园|岑参|唐","行宫|元稹|唐","行路难|李白|唐","行路难（其一）|李白|唐","行路难·其二|李白|唐","西塞山怀古|刘禹锡|唐","西施|罗隐|唐","西施咏|王维|唐","西施滩|崔道融|唐","观公孙大娘弟子舞剑器行|杜甫|唐","观刈麦|白居易|唐","观游鱼|白居易|唐","观猎|王维|唐","调笑令·胡马|韦应物|唐","谢亭送别|许浑|唐","贫交行|杜甫|唐","贾生|李商隐|唐","赋得古原草送别|白居易|唐","赋得暮雨送李胄|韦应物|唐","赋得鸡|李商隐|唐","赠别|杜牧|唐","赠别二首·其一|杜牧|唐","赠少年|温庭筠|唐","赠汪伦|李白|唐","赠花卿|杜甫|唐","赠苏书记|杜审言|唐","赠质上人|杜荀鹤|唐","赤壁|杜牧|唐","走马川行奉送封大夫出师西征|岑参|唐","越中览古|李白|唐","辋川闲居|王维|唐","辋川闲居赠裴秀才迪|王维|唐","辋川集·南垞|王维|唐","辋川集·辛夷坞|王维|唐","过分水岭|温庭筠|唐","过华清宫|杜牧|唐","过故人庄|孟浩然|唐","过陈琳墓|温庭筠|唐","过香积寺|王维|唐","近试上张水部|朱庆馀|唐","送人东游|温庭筠|唐","送人游吴|杜荀鹤|唐","送兄|七岁女|唐","送别|王维|唐","送友人|李白|唐","送孔巢父谢病归游江东兼呈李白|杜甫|唐","送李判官之润州行营|刘长卿|唐","送杜少府之任蜀州|王勃|唐","送柴侍御|王昌龄|唐","送梁六自洞庭山|张说|唐","送梓州李使君|王维|唐","送灵澈上人|刘长卿|唐","送綦毋潜落第还乡|王维|唐","送魏万之京|李颀|唐","送魏二|王昌龄|唐","逢入京使|岑参|唐","逢雪宿芙蓉山主人|刘长卿|唐","遗爱寺|白居易|唐","遣怀|杜牧|唐","邙山|沈佺期|唐","酬乐天扬州初逢席上见赠|刘禹锡|唐","酬张少府|王维|唐","醉时歌|杜甫|唐","醉歌行|杜甫|唐","采莲曲|王昌龄|唐","重送裴郎中贬吉州|刘长卿|唐","野望|王绩|唐","金缕衣|杜秋娘|唐","金谷园|杜牧|唐","钱塘湖春行|白居易|唐","锦瑟|李商隐|唐","长信怨|王昌龄|唐","长安古意|卢照邻|唐","长安遇冯著|韦应物|唐","长干行·其一|李白|唐","长恨歌|白居易|唐","长柳|王勃|唐","问刘十九|白居易|唐","闺怨|王昌龄|唐","闺情|李端|唐","闻官军收河南河北|杜甫|唐","闻王昌龄左迁龙标遥有此寄|李白|唐","阁夜|杜甫|唐","除夜作|高适|唐","除夜宿石头驿|戴叔伦|唐","隋宫|李商隐|唐","雁门太守行|李贺|唐","雨过山村|王建|唐","雪|罗隐|唐","霜月|李商隐|唐","青溪|王维|唐","静夜思|李白|唐","韦讽录事宅观曹将军画马图|杜甫|唐","题三闾大夫庙|戴叔伦|唐","题乌江亭|杜牧|唐","题李凝幽居|贾岛|唐","题破山寺后禅院|常建|唐","题稚川山水|戴叔伦|唐","题菊花|黄巢|唐","题都城南庄|崔护|唐","题金陵渡|张祜|唐","题长安壁主人|张谓|唐","风|李峤|唐","风雨|李商隐|唐","饯别王十一南游|刘长卿|唐","马嵬二首·其二|李商隐|唐","马嵬坡|郑畋|唐","马诗二十三首（其五）|李贺|唐","马诗二十三首（其四）|李贺|唐","马诗二十三首（其一）|李贺|唐","鸟鸣涧|王维|唐","鸡|崔道融|唐","鹿柴|王维|唐","黄鹤楼|崔颢|唐","黄鹤楼送孟浩然之广陵|李白|唐","七步诗|曹植|魏晋","乞食|陶渊明|魏晋","咏荆轲|陶渊明|魏晋","咏贫士|陶渊明|魏晋","庚戌岁九月中于西田获早稻|陶渊明|魏晋","归园田居(其一)|陶渊明|魏晋","归园田居(其三)|陶渊明|魏晋","归园田居（其三）|陶渊明|魏晋","归鸟|陶渊明|魏晋","拟古|陶渊明|魏晋","杂诗|曹丕|魏晋","杂诗|陶渊明|魏晋","燕歌行|曹丕|魏晋","癸卯岁始春怀古田舍|陶渊明|魏晋","白马篇|曹植|魏晋","短歌行|曹操|魏晋","移居|陶渊明|魏晋","移居(其二)|陶渊明|魏晋","美女篇|曹植|魏晋","蒿里行|曹操|魏晋","观沧海|曹操|魏晋","读山海经|陶渊明|魏晋","读山海经·其十|陶渊明|魏晋","责子|陶渊明|魏晋","赠白马王彪|曹植|魏晋","饮酒(其五)|陶渊明|魏晋","饮酒(其四)|陶渊明|魏晋","饮酒(其十四)|陶渊明|魏晋","龟虽寿|曹操|魏晋","九歌·山鬼|屈原|先秦","关雎|佚名|先秦","击壤歌|佚名|先秦","国殇|屈原|先秦","国风·桃夭|诗经|先秦","国风·相鼠|诗经|先秦","国风·采薇|诗经|先秦","国风·黍离|诗经|先秦","大雅·文王|诗经|先秦","天问(节选)|屈原|先秦","小雅·鹿鸣|诗经|先秦","弹歌|佚名|先秦","易水歌|荆轲|先秦","木瓜|佚名|先秦","橘颂|屈原|先秦","氓|佚名|先秦","湘夫人|屈原|先秦","硕鼠|诗经|先秦","离骚(节选)|屈原|先秦","蒹葭|佚名|先秦","采薇|佚名|先秦","静女|佚名|先秦","鹿鸣|佚名|先秦","黍离|佚名|先秦","凭栏人|姚燧|元","卖花声·怀古|张可久|元","四块玉·闲适|关汉卿|元","塞鸿秋|贯云石|元","墨梅|王冕|元","大德歌·春|关汉卿|元","天净沙·冬|白朴|元","天净沙·春|白朴|元","天净沙·秋|白朴|元","天净沙·秋思|马致远|元","寿阳曲·远浦帆归|马致远|元","山坡羊·潼关怀古|张养浩|元","山坡羊·骊山怀古|张养浩|元","折桂令|张可久|元","殿前欢|阿里西瑛|元","水仙子·夜雨|徐再思|元","水仙子·寻梅|乔吉|元","沉醉东风·秋景|白朴|元","沉醉东风·闲居|卢挚|元","蟾宫曲|阿鲁威|元","蟾宫曲·扬州|阿鲁威|元"];
  // —— 索引派生（确定性，与句库一一对应）——
  // char_index: 字 -> 句下标数组（即句 id）；norm_index: normKey -> 句下标；author_index: 作者 -> 句下标数组
  var C = {}, N = {}, A = {};
  L.forEach(function (entry, i) {
    var f = entry.split('|');
    N[f[0]] = i;
    for (var j = 0; j < f[0].length; j++) {
      var ch = f[0].charAt(j);
      (C[ch] = C[ch] || []).push(i);
    }
    var author = S[+f[1]].split('|')[1];
    (A[author] = A[author] || []).push(i);
  });
  module.exports = {
    version: 'v0.1',
    pool: POOL,
    lines: L,
    sources: S,
    char_index: C,
    norm_index: N,
    author_index: A
  };
})();

});
__reg("src/judge.js", function (module, exports, require) {
'use strict';
/**
 * 飞花令 v0.1 判定引擎（纯函数，零依赖，CommonJS）
 * ==============================================================
 * 玩家接龙判定：给定候选句、关键字、已用句集合、字池，返回判定结果。
 *
 * 规则（v1.4 锁定）：
 *  - 一句 = 单句：候选句先做 norm_key 归一（去标点/空白/全半角差异，仅保留汉字）
 *  - 只认库内句：norm_key 必须能在语料句库命中（norm_index 全等匹配，绝无模糊匹配）
 *  - 必须含本轮关键字（字池 8 字：人山风月春花天水）
 *  - REPEAT_LIMIT = 1：同一句每人限一次；usedKeys 为全局已用 norm_key 集合，
 *    一句被任何人用过即全员不可再出（全局去重即蕴含每人去重）
 *
 * reason 枚举：
 *  OK            通过
 *  FORMAT_ERROR  格式错误（空串 / 归一后非 5、7 言 / 非字符串）
 *  INVALID_KEYWORD 关键字不合法（不在字池 / 非单字）
 *  NOT_IN_CORPUS 非库内句（杜撰、或库外真实诗句）
 *  NO_KEYWORD    不含关键字
 *  DUPLICATE     重复（该句已在 usedKeys 中）
 */

const corpus = require('./data/corpus');

const POOL = corpus.pool;                       // ['人','山','风','月','春','花','天','水']
const REPEAT_LIMIT = 1;                         // v1.4：同一句每人限一次
const ALLOWED_LEN = [5, 7];                     // 仅 5/7 言句进句库，判定口径一致

/** norm_key：去标点/空白/全半角差异，仅保留汉字（全半角数字字母一律剔除） */
function normKey(s) {
  return (String(s || '').match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) || []).join('');
}

// norm_index 运行时构建：normKey -> 句下标（构建脚本保证全库唯一，CI 独立校验）
const NORM_INDEX = new Map();
corpus.lines.forEach((entry, i) => {
  const key = entry.slice(0, entry.indexOf('|'));
  NORM_INDEX.set(key, i);
});

/** usedKeys 兼容 Set / 数组 / 对象map，元素统一做 norm_key 归一 */
function toKeySet(usedKeys) {
  const set = new Set();
  if (!usedKeys) return set;
  if (usedKeys instanceof Set) {
    usedKeys.forEach(k => set.add(normKey(k)));
  } else if (Array.isArray(usedKeys)) {
    usedKeys.forEach(k => set.add(normKey(k)));
  } else if (typeof usedKeys === 'object') {
    Object.keys(usedKeys).forEach(k => set.add(normKey(k)));
  }
  return set;
}

/**
 * 判定一条候选句
 * @param {string} candidate  候选句原文（可含标点/空格/全半角差异）
 * @param {string} keyword    本轮关键字（字池单字）
 * @param {Set|Array|Object} usedKeys 全局已用句 norm_key 集合
 * @param {string[]} [pool]   字池，默认语料内置 8 字池
 * @returns {{pass: boolean, reason: string, lineId?: number}}
 */
function judge(candidate, keyword, usedKeys, pool) {
  const key = normKey(candidate);

  // 1) 格式：非空且归一后必须是 5/7 言（与句库口径一致）
  if (typeof candidate !== 'string' || !key) {
    return { pass: false, reason: 'FORMAT_ERROR' };
  }
  if (ALLOWED_LEN.indexOf(key.length) === -1) {
    return { pass: false, reason: 'FORMAT_ERROR' };
  }

  // 2) 关键字合法性：必须为字池中的单字
  const activePool = Array.isArray(pool) && pool.length ? pool : POOL;
  if (typeof keyword !== 'string' || [...keyword].length !== 1 || activePool.indexOf(keyword) === -1) {
    return { pass: false, reason: 'INVALID_KEYWORD' };
  }

  // 3) 库内句：norm_key 全等命中（绝不模糊匹配，近似句互不干扰）
  const lineId = NORM_INDEX.get(key);
  if (lineId === undefined) {
    return { pass: false, reason: 'NOT_IN_CORPUS' };
  }

  // 4) 含关键字
  if (key.indexOf(keyword) === -1) {
    return { pass: false, reason: 'NO_KEYWORD' };
  }

  // 5) 重复：v1.4 全局去重（usedKeys 内出现即拒，同一句每人限一次被全局去重覆盖）
  if (toKeySet(usedKeys).has(key)) {
    return { pass: false, reason: 'DUPLICATE' };
  }

  return { pass: true, reason: 'OK', lineId };
}

module.exports = { judge, normKey, POOL, REPEAT_LIMIT, ALLOWED_LEN, corpus };

});
__reg("js/game/candidates.js", function (module, exports, require) {
'use strict';
/**
 * 候选生成（v1.4 §2.3 四类干扰口径 + 名家经典偏好，2026-11-18 二次修订）
 * 铁律：候选只负责降门槛，玩家点选/拼句结果必须完整跑 judge()，不得"点选即合法"。
 *
 * ★ 经典偏好：正确句/AI 手牌优先抽「名家/名篇」白名单（教材级常见诗词），
 *   白名单内不足 6 句才放宽到全库——回应"诗词库优先经典"的产品要求。
 *
 * 点选接句：4 卡 = 1 正确 + 3 干扰，干扰项必须 judge 判不通过（挑战性保证）：
 *   - noKw：库内真实名句但【不含关键字】→ judge NO_KEYWORD（迷惑性最高）
 *   - fake：库外拼合句（含关键字，生成期校验 norm_index 不命中）→ NOT_IN_CORPUS
 *   - dup 已废弃（2026-11-18 用户反馈「还是有重复」）：已用句一律不进选项
 *   生成期逐条用 judge 复核干扰项必须 fail，任何意外放行的干扰直接弃用。
 *
 * 字块拼句：5 言 → 5 正 + 3 干扰；7 言 → 7 正 + 1 干扰（均为 8 块 4×2）。
 *   干扰字优先取自常用字表（拒绝生僻字），且满足不变量：
 *   ★ 任何含干扰块的 5/7 字排列，norm_key 都不得命中句库（拼错必判 NOT_IN_CORPUS）。
 *
 * rng 可注入（mulberry32 种子）保证测试确定性；线上传 Math.random。
 */
const { judge, corpus, normKey, POOL } = require('../../src/judge');

/** mulberry32：可复现伪随机 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const lineText = i => corpus.lines[i].split('|')[0];

// ---------------- 名家经典白名单 ----------------
// 教材级常见诗词作者（覆盖小学到高中必背 + 飞花令节目高频作者）
const FAMOUS_AUTHORS = new Set([
  '李白', '杜甫', '白居易', '王维', '孟浩然', '王昌龄', '王之涣', '杜牧', '李商隐',
  '岑参', '高适', '刘禹锡', '柳宗元', '韩愈', '孟郊', '贾岛', '贺知章', '张继',
  '李绅', '骆宾王', '张九龄', '崔颢', '韦应物', '刘长卿', '卢纶', '李益', '金昌绪',
  '王翰', '王建', '张籍', '元稹', '李贺', '杜秋娘', '陈子昂', '李峤',
  '苏轼', '辛弃疾', '李清照', '陆游', '王安石', '欧阳修', '范仲淹', '晏殊', '晏几道',
  '柳永', '秦观', '杨万里', '范成大', '朱熹', '叶绍翁', '林升', '翁卷', '雷震',
  '文天祥', '于谦', '郑燮', '纳兰性德', '龚自珍', '袁枚', '高鼎', '查慎行',
  '陶渊明', '屈原', '曹操', '曹植', '李煜', '温庭筠', '李煜',
  '汉乐府', '北朝民歌', '诗经', '南朝乐府',
]);
// 佚名/集体作品的题名白名单
const FAMOUS_TITLES = new Set([
  '木兰诗', '敕勒歌', '江南', '长歌行', '七步诗', '回乡偶书', '咏柳', '凉州词',
  '出塞', '从军行', '芙蓉楼送辛渐', '鹿柴', '竹里馆', '送元二使安西',
  '九月九日忆山东兄弟', '静夜思', '望庐山瀑布', '赠汪伦', '黄鹤楼送孟浩然之广陵',
  '早发白帝城', '望天门山', '春夜喜雨', '绝句', '春望', '江畔独步寻花', '游子吟',
  '江雪', '池上', '小池', '晓出净慈寺送林子方', '宿新市徐公店', '春日', '观书有感',
  '题临安邸', '游园不值', '村居', '所见', '竹石', '石灰吟', '过零丁洋', '己亥杂诗',
  '山行', '清明', '江南春', '泊秦淮', '秋夕', '商山早行', '无题', '锦瑟',
  '登鹳雀楼', '春晓', '悯农', '咏鹅', '相思', '关雎', '蒹葭',
]);
function sourceOf(i) { return corpus.sources[+corpus.lines[i].split('|')[1]] || ''; }
function isFamous(i) {
  const s = sourceOf(i).split('|');
  return FAMOUS_AUTHORS.has(s[1]) || FAMOUS_TITLES.has(s[0]);
}

// ---------------- 教材名篇（第一优先层）----------------
// 题名泛匹配会误伤冷门同题诗（如陈焕《梅花》），故对易撞名的题名用「题名|作者」精确配对。
// 命中此层的句子 = 教材必背/大众熟知的热门经典，正确句/拼句目标/AI 手牌最优先从这里抽。
const HOT_TITLES = new Set([
  // —— 小学必背（题名唯一性高，泛匹配安全）——
  '静夜思', '春晓', '望庐山瀑布', '赠汪伦', '黄鹤楼送孟浩然之广陵', '早发白帝城', '望天门山',
  '春夜喜雨', '绝句', '春望', '江畔独步寻花', '江雪', '池上', '小池', '晓出净慈寺送林子方',
  '宿新市徐公店', '观书有感', '题临安邸', '游园不值', '村居', '所见', '竹石', '石灰吟',
  '过零丁洋', '己亥杂诗', '山行', '清明', '江南春', '泊秦淮', '秋夕', '商山早行', '登鹳雀楼',
  '悯农', '咏鹅', '游子吟', '回乡偶书', '咏柳', '凉州词', '芙蓉楼送辛渐', '鹿柴', '竹里馆',
  '送元二使安西', '九月九日忆山东兄弟', '木兰诗', '敕勒歌', '江南', '长歌行', '七步诗',
  '枫桥夜泊', '忆江南', '暮江吟', '浪淘沙', '竹枝词', '乌衣巷', '望洞庭', '秋词', '泊船瓜洲',
  '书湖阴先生壁', '元日', '登飞来峰', '饮湖上初晴后雨', '题西林壁', '夏日绝句', '示儿',
  '秋夜将晓出篱门迎凉有感', '十一月四日风雨大作', '游山西村', '临安春雨初霁', '雪梅',
  '宿建德江', '过故人庄', '望洞庭湖赠张丞相', '早寒江上有怀', '次北固山下', '送杜少府之任蜀州',
  '使至塞上', '闻王昌龄左迁龙标遥有此寄', '渡荆门送别', '行路难', '将进酒', '蜀道难',
  '月下独酌', '望月怀远', '黄鹤楼', '登岳阳楼', '旅夜书怀', '登高', '望岳', '赋得古原草送别',
  '钱塘湖春行', '卖炭翁', '观刈麦', '雁门太守行', '赤壁', '夜雨寄北', '嫦娥', '霜月',
  '夜宿山寺', '独坐敬亭山', '秋浦歌', '送友人', '宣州谢朓楼饯别校书叔云', '宣州谢脁楼饯别校书叔云',
  '题都城南庄', '再游玄都观', '石头城', '白雪歌送武判官归京', '别董大', '逢入京使',
  '山居秋暝', '终南别业', '汉江临泛', '新晴野望', '归嵩山作', '鸟鸣涧', '天净沙', '山坡羊',
  '晚春', '大林寺桃花', '菊花', '蜂', '画', '风', '村晚', '舟夜书所见', '夜书所见',
  '论诗', '冬夜读书示子聿', '观书', '对酒', '苔', '咏煤炭', '送灵澈上人', '归雁',
  // —— 初高中必背 + 大众熟知词牌（易撞名，用「题名|作者」精确配对）——
  '水调歌头|苏轼', '念奴娇|苏轼', '江城子|苏轼', '卜算子|苏轼', '卜算子|陆游', '定风波|苏轼',
  '浣溪沙|晏殊', '浣溪沙|苏轼', '浣溪沙|纳兰性德', '蝶恋花|晏殊', '蝶恋花|柳永',
  '蝶恋花|欧阳修', '蝶恋花|纳兰性德', '清平乐|辛弃疾', '清平乐|黄庭坚', '破阵子|辛弃疾',
  '破阵子|晏殊', '西江月|辛弃疾', '青玉案|辛弃疾', '贺新郎|辛弃疾', '丑奴儿|辛弃疾',
  '菩萨蛮|辛弃疾', '菩萨蛮|温庭筠', '虞美人|李煜', '相见欢|李煜', '浪淘沙令|李煜',
  '一剪梅|李清照', '醉花阴|李清照', '如梦令|李清照', '渔家傲|李清照', '渔家傲|范仲淹',
  '苏幕遮|范仲淹', '苏幕遮|周邦彦', '武陵春|李清照', '点绛唇|姜夔', '满江红|岳飞',
  '无题|李商隐', '锦瑟|李商隐', '出塞|王昌龄', '从军行|王昌龄', '从军行|杨炯',
  '凉州词|王之涣', '凉州词|王翰', '梅花|王安石', '春日|朱熹', '绝句|杜甫', '绝句|释志南',
  '绝句二首|杜甫', '杂诗|曹丕', '杂诗|陶渊明', '送别|王维', '马诗|李贺',
  '长恨歌|白居易', '琵琶行|白居易', '子夜吴歌|李白', '关山月|李白',
]);
function isHot(i) {
  const s = sourceOf(i).split('|');
  return HOT_TITLES.has(s[0]) || HOT_TITLES.has(s[0] + '|' + s[1]);
}

// ---------------- 核心名句（第零层，逐句人工精选）----------------
// 教训（2026-11-18 真机三图反馈）：题名级白名单挡不住长诗冷句——《长恨歌》120 句全在层内，
// 「回头下望人寰处」「主人何为言少钱」也会被抽到。本层只收真正耳熟能详的名句，
// 全部经 build 时校验在库且含对应令字；正确句/拼句目标/AI 手牌第零优先从这里抽。
const FAMOUS_LINES = {
  人: ['要留清白在人间','人生自古谁无死','物是人非事事休','谁道人生无再少','为伊消得人憔悴','人比黄花瘦','暖风熏得游人醉','遍插茱萸少一人','古来征战几人回','万里长征人未还','天下谁人不识君','恐惊天上人','人间四月芳菲尽','江清月近人','人生得意须尽欢','白云生处有人家','对影成三人','万径人踪灭','路上行人欲断魂','同是天涯沦落人','人面桃花相映红','人面不知何处去','人闲桂花落','空山不见人','但闻人语响','故人西辞黄鹤楼','烟波江上使人愁','岁月不待人','乱花渐欲迷人眼','深林人不知','落日故人情','故人具鸡黍','生当作人杰','试问卷帘人','昔人已乘黄鹤去','夜半无人私语时','天上人间会相见'],
  山: ['咬定青山不放松','千锤万凿出深山','山外青山楼外楼','不识庐山真面目','只缘身在此山中','山重水复疑无路','山色空蒙雨亦奇','青海长云暗雪山','明月出天山','一片孤城万仞山','不教胡马度阴山','巴山夜雨涨秋池','却话巴山夜雨时','山寺桃花始盛开','空山新雨后','远上寒山石径斜','轻舟已过万重山','国破山河在','两岸青山相对出','一览众山小','遥望洞庭山水翠','姑苏城外寒山寺','水村山郭酒旗风','千山鸟飞绝','白日依山尽','山回路转不见君','平明送客楚山孤','青山郭外斜','远看山有色','夜静春山空','月出惊山鸟','山随平野尽','只有敬亭山','飞来山上千寻塔','山河破碎风飘絮','我见青山多妩媚','关山度若飞'],
  风: ['夜来风雨声','随风潜入夜','春风又绿江南岸','二月春风似剪刀','春风不度玉门关','忽如一夜春风来','北风卷地白草折','长风破浪会有时','东风无力百花残','东风不与周郎便','桃花依旧笑春风','吹面不寒杨柳风','忙趁东风放纸鸢','春风吹又生','风吹草低见牛羊','北风吹雁雪纷纷','暖风熏得游人醉','风景旧曾谙','小楼昨夜又东风','风住尘香花已尽','昨夜西风凋碧树','也无风雨也无晴','等闲识得东风面','春风送暖入屠苏','潭面无风镜未磨','风正一帆悬','风急天高猿啸哀','任尔东西南北风','长风几万里'],
  月: ['床前明月光','举头望明月','海上生明月','举杯邀明月','月落乌啼霜满天','秦时明月汉时关','明月松间照','明月何时照我还','八千里路云和月','春花秋月何时了','月涌大江流','我寄愁心与明月','烟花三月下扬州','露似真珠月似弓','湖光秋月两相和','烟笼寒水月笼沙','明月来相照','月出惊山鸟','江清月近人','别时茫茫江浸月','唯见江心秋月白','莫使金樽空对月','欲上青天揽明月','霜叶红于二月花','烽火连三月','可怜九月初三夜','明月几时有','沧海月明珠有泪'],
  春: ['春眠不觉晓','春风又绿江南岸','春色满园关不住','万紫千红总是春','春风送暖入屠苏','春蚕到死丝方尽','春来江水绿如蓝','当春乃发生','城春草木深','春风不度玉门关','二月春风似剪刀','报得三春晖','忽如一夜春风来','春风吹又生','桃花依旧笑春风','长恨春归无觅处','夜静春山空','春花秋月何时了','流水落花春去也','铜雀春深锁二乔','谁家新燕啄春泥','春潮带雨晚来急','病树前头万木春','阳春布德泽','梅雪争春未肯降','春去花还在','春宵一刻值千金','春城无处不飞花'],
  花: ['花落知多少','感时花溅泪','花重锦官城','黄四娘家花满蹊','桃花潭水深千尺','乱花渐欲迷人眼','采得百花成蜜后','千树万树梨花开','映日荷花别样红','飞入菜花无处寻','人闲桂花落','烟花三月下扬州','牧童遥指杏花村','隔江犹唱后庭花','日出江花红胜火','霜叶红于二月花','无可奈何花落去','柳暗花明又一村','花自飘零水自流','朱雀桥边野草花','人面桃花相映红','桃花依旧笑春风','东风无力百花残','不是花中偏爱菊','我花开后百花杀','春去花还在','花间一壶酒','沾衣欲湿杏花雨','竹外桃花三两枝','稻花香里说丰年'],
  天: ['疑是银河落九天','天门中断楚江开','天生我材必有用','天涯若比邻','天涯共此时','月落乌啼霜满天','一行白鹭上青天','曲项向天歌','恐惊天上人','野旷天低树','接天莲叶无穷碧','天光云影共徘徊','望尽天涯路','天下谁人不识君','归雁入胡天','碧海青天夜夜心','天阶夜色凉如水','江流天地外','唯见长江天际流','欲上青天揽明月','风急天高猿啸哀','天地一沙鸥','同是天涯沦落人','在天愿作比翼鸟','天长地久有时尽','草长莺飞二月天'],
  水: ['白毛浮绿水','桃花潭水深千尺','烟笼寒水月笼沙','水光潋滟晴方好','山重水复疑无路','花自飘零水自流','春来江水绿如蓝','抽刀断水水更流','一道残阳铺水中','碧水东流至此回','遥望洞庭山水翠','水村山郭酒旗风','行到水穷处','近听水无声','门前流水尚能西','为有源头活水来','胜日寻芳泗水滨','天阶夜色凉如水','八月湖水平','仍怜故乡水','水面初平云脚低','树阴照水爱晴柔','一水护田将绿绕','京口瓜洲一水间','流水落花春去也'],
};
const TOP_LINE_SET = new Set(
  Object.keys(FAMOUS_LINES).flatMap(ch =>
    FAMOUS_LINES[ch].filter(t => t.indexOf(ch) !== -1 && corpus.norm_index[normKey(t)] !== undefined)
  )
);
function isTop(i) { return TOP_LINE_SET.has(lineText(i)); }

/** 干扰字常用字表（拼句干扰块专用，杜绝生僻字） */
const COMMON_DISTRACT = [
  '云', '江', '雪', '夜', '心', '秋', '柳', '舟', '霜', '雁', '灯', '空',
  '林', '声', '鸟', '啼', '门', '树', '楼', '台', '客', '清', '波', '明',
  '白', '千', '里', '孤', '帆', '岸', '村', '烟', '雨', '桥', '钟', '梦',
  '笛', '酒', '歌', '舞', '城', '宫', '衣', '马',
].filter(ch => POOL.indexOf(ch) === -1);

/** 字池中某字剩余可用句（未用、含字） */
function remaining(corpus, keyword, usedKeys) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  return (corpus.char_index[keyword] || []).filter(i => !used.has(lineText(i)));
}

/**
 * 挑一条正确句（未用、含关键字）。
 * easy 档：核心名句层内优先五言（更好认好拼）。困难档：核心名句层内优先七言
 * （2026-11-20 真机复盘二改——「教材名篇冷句」路线被真机打回，困难 ≠ 冷僻）。
 * 每档四级经典偏好（≥6 句才整层采用，不足逐层下沉，保证永不空池）：
 *   tier0 核心名句（isTop，人工精选）/ tier1 教材名篇（isHot）/ tier2 名家名篇（isFamous）/ tier3 全库兜底
 */
function pickCorrect(keyword, usedKeys, rng, preferFamous, easy) {
  const pool = remaining(corpus, keyword, usedKeys);
  if (!pool.length) return null;
  if (preferFamous !== false) {
    const top = pool.filter(isTop);
    if (easy) {
      // 简单档：核心名句层内再优先五言短句（更好认好拼）
      const top5 = top.filter(i => lineText(i).length === 5);
      if (top5.length >= 6) return top5[Math.floor(rng() * top5.length)];
      if (top.length >= 6) return top[Math.floor(rng() * top.length)];
      const hot = pool.filter(isHot);
      if (hot.length >= 6) return hot[Math.floor(rng() * hot.length)];
    } else {
      // 困难档（2026-11-20 真机复盘二改）：首版「绕开 tier0 从教材名篇起步」被真机打回——
      // HOT_TITLES 是题名级白名单，整首《登岳阳楼》《浪淘沙》都在层内，抽出的
      // 「戎马关山北」「昔闻洞庭水」「照花前后镜」是玩家根本没背过的冷句，
      // 择句模式里无法与假句区分，实际体验是"一题都答不出来"。困难 ≠ 冷僻。
      // 现改为 tier0 核心名句内**七言优先**：认句更难 + 字块模式多两块要拼；
      // 五言核心名句留给简单档。教材名篇冷句降为 tier0 耗尽后的兜底。
      const top7 = top.filter(i => lineText(i).length === 7);
      if (top7.length >= 6) return top7[Math.floor(rng() * top7.length)];
      if (top.length >= 6) return top[Math.floor(rng() * top.length)];
      const hot = pool.filter(isHot);
      if (hot.length >= 6) return hot[Math.floor(rng() * hot.length)];
    }
    const fam = pool.filter(isFamous);
    if (fam.length >= 6) return fam[Math.floor(rng() * fam.length)];
    if (top.length >= 6) return top[Math.floor(rng() * top.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

/** 关键字邻域字池：含关键字句子中的真实汉字（排除本句已用字）——干扰字兜底池 */
function neighborhoodChars(keyword, excludeSet, rng) {
  const ids = (corpus.char_index[keyword] || []).slice();
  const chars = [];
  const step = Math.max(1, Math.floor(ids.length / 40));
  for (let i = 0; i < ids.length; i += step) {
    for (const ch of lineText(ids[Math.floor(rng() * ids.length)])) {
      if (!excludeSet.has(ch) && chars.indexOf(ch) === -1) chars.push(ch);
    }
  }
  return chars;
}

/** 干扰字候选池：常用字优先，邻域兜底；排除本句字 */
function distractPool(keyword, inSentence, rng) {
  const out = COMMON_DISTRACT.filter(ch => !inSentence.has(ch));
  for (const ch of neighborhoodChars(keyword, inSentence, rng)) {
    if (out.indexOf(ch) === -1 && COMMON_DISTRACT.indexOf(ch) === -1) out.push(ch);
  }
  return out;
}

/**
 * ★ 字块不变量校验：8 块多重集（句字 + 干扰字）中，任何 5/7 字排列若含干扰字，
 * 其 norm_key 不得命中句库。递归枚举（P(8,7)+ΣC(8,5)·5! ≈ 4.7 万节点，毫秒级）。
 * @returns {boolean} true = 存在违例排列（不可用）
 */
function hasForbiddenArrangement(multiset, sentence) {
  const n = multiset.length;
  const used = new Array(n).fill(false);
  let violation = false;
  function dfs(path) {
    if (violation) return;
    const len = path.length;
    if (len === 5 || len === 7) {
      const key = path.join('');
      if (key !== sentence && corpus.norm_index[key] !== undefined) { violation = true; return; }
    }
    if (len === 7) return; // 8 块最长只查到 7（库内句长只有 5/7）
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; path.push(multiset[i]);
      dfs(path);
      path.pop(); used[i] = false;
      if (violation) return;
    }
  }
  dfs([]);
  return violation;
}

/**
 * 生成库外假句（含关键字、5/7 言、norm_key 不命中）。
 * 2026-11-18 P0（产品评估实测：原实现拼随机常用字，可读性差且生成常失败，
 * 导致 100% 回合只有 1 个含令字选项 → 「择句」退化成找字测试）：
 * 改为「名句改字」——从含令字的真实名句出发，邻字互换或替换一个非令字，
 * 造出读起来像诗但库里没有的伪句。玩家必须真的认得这句诗才能分辨。
 */
function genFakeLine(keyword, exclude, rng) {
  const ids = corpus.char_index[keyword] || [];
  const tiers = [
    ids.filter(isTop),
    ids.filter(isHot),
    ids.filter(isFamous),
    ids,
  ];
  for (const tier of tiers) {
    if (!tier.length) continue;
    for (let g = 0; g < 60; g++) {
      const src = lineText(tier[Math.floor(rng() * tier.length)]);
      const arr = src.split('');
      let cand = null;
      if (rng() < 0.5) {
        // 邻字互换（语序错乱）：最像"记错了"的错法
        const poss = [];
        for (let i = 0; i < arr.length - 1; i++) if (arr[i] !== arr[i + 1]) poss.push(i);
        if (!poss.length) continue;
        const i = poss[Math.floor(rng() * poss.length)];
        const t = arr.slice();
        const tmp = t[i]; t[i] = t[i + 1]; t[i + 1] = tmp;
        cand = t.join('');
      } else {
        // 替换一个非令字为常用字（一字之差）
        const idxs = [];
        for (let i = 0; i < arr.length; i++) if (arr[i] !== keyword) idxs.push(i);
        if (!idxs.length) continue;
        const i = idxs[Math.floor(rng() * idxs.length)];
        const pool = COMMON_DISTRACT.filter(ch => ch !== keyword && arr.indexOf(ch) === -1);
        if (!pool.length) continue;
        const t = arr.slice();
        t[i] = pool[Math.floor(rng() * pool.length)];
        cand = t.join('');
      }
      if (!cand || cand === src) continue;
      if (cand.indexOf(keyword) === -1) continue;
      if (cand.length !== 5 && cand.length !== 7) continue;
      if (corpus.norm_index[normKey(cand)] !== undefined) continue;
      if (exclude.has(cand)) continue;
      return cand;
    }
  }
  return null;
}

/**
 * 字块拼句：5 言 → 5 正 + 3 干扰；7 言 → 7 正 + 1 干扰
 * 目标句名家优先；干扰字常用字优先、不入本句、互不重复；组合需通过 ★ 不变量校验
 * 返回 { lineIdx, sentence, blocks: [{char, distractor}] }
 */
function genBlocks(keyword, usedKeys, rng, easy) {
  // 毒句重试（2026-11-20）：个别句（如「只缘身在此山中」）与库内大量真句共享常用字组合，
  // 加任何干扰字都有违例排列 → 干扰字选不满。此时把该句加入局部已用集合换句重试，
  // 不动调用方的全局 usedKeys。此前一次失败直接返回 null，blocks 模式会提前进 poolEmpty。
  const localUsed = new Set(usedKeys instanceof Set ? usedKeys : new Set(usedKeys));
  for (let attempt = 0; attempt < 4; attempt++) {
    const correctIdx = pickCorrect(keyword, localUsed, rng, undefined, easy);
    if (correctIdx == null) return null;
    const sentence = lineText(correctIdx);
    const nDistract = sentence.length === 5 ? 3 : 1;
    const inSentence = new Set(sentence);
    const hood = shuffled(distractPool(keyword, inSentence, rng), rng);

    const chosen = [];
    let cursor = 0;
    let guard = 0;
    while (chosen.length < nDistract && guard < 200) {
      guard++;
      const ch = hood[cursor++ % hood.length];
      if (chosen.indexOf(ch) !== -1) continue;
      // 试探：当前组合 + 该字是否仍满足不变量
      const trial = chosen.concat(ch);
      const multiset = sentence.split('').concat(trial);
      if (hasForbiddenArrangement(multiset, sentence)) continue; // 该字引入违例排列，弃用
      chosen.push(ch);
    }
    if (chosen.length >= nDistract) {
      const blocks = shuffled(
        sentence.split('').map(ch => ({ char: ch, distractor: false }))
          .concat(chosen.map(ch => ({ char: ch, distractor: true }))),
        rng
      );
      return { lineIdx: correctIdx, sentence, blocks, src: sourceOf(correctIdx) };
    }
    localUsed.add(sentence); // 毒句：换一句重试
  }
  return null; // 连续 4 句均不可组块（理论极罕见）
}

/**
 * 点选接句候选：1 正确 + 3 干扰（candidateCount 可配置）
 * ★ 干扰项必须 judge 判不通过——noKw(不含字真句) / dup(已用句) / fake(库外拼合句)
 * 生成期逐条 judge 复核，意外放行的干扰弃用并回填
 * 返回 { correctIdx, options: [{text, kind, lineIdx?}], correctPos }
 * kind: 'correct' | 'noKw' | 'dup' | 'fake'
 */
function genChoiceCandidates(keyword, usedKeys, rng, candidateCount, easy) {
  const N = candidateCount || 4;
  const correctIdx = pickCorrect(keyword, usedKeys, rng, undefined, easy);
  if (correctIdx == null) return null;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  const correctText = lineText(correctIdx);
  const seen = new Set([correctText]);
  const opts = [];

  // 2026-11-18 用户反馈「还是有重复」：dup 干扰（已用句出现在选项）被玩家理解为
  // 题目重复——已用句一律不再进入选项，干扰只从 noKw / fake 生成。
  // judge 对已用句的 DUPLICATE 拦截仍在（字块手拼、AI 出句等路径完整跑 judge）。

  // ★ 2026-11-18 P0 可判别性修复：伪句必出（简单 1 个 / 普通 2 个），
  //   保证每回合 ≥2 个选项含令字——否则"找带关键字那张卡"就能全对，
  //   玩法退化成找字测试（产品评估实测 100% 回合只有 1 个含字选项）。
  const fakeTarget = Math.min(N - 1, easy ? 1 : 2);
  const fakeExclude = new Set([...seen, ...used]);
  for (let i = 0; i < fakeTarget; i++) {
    const fake = genFakeLine(keyword, fakeExclude, rng);
    if (!fake) break;
    fakeExclude.add(fake); seen.add(fake);
    opts.push({ text: fake, kind: 'fake' });
  }

  // noKw 迷惑项：库内真实句但不含关键字（先名篇，再名家，最后放宽）
  function pushNoKw(strict) {
    for (let g = 0; g < 80; g++) {
      const i = Math.floor(rng() * corpus.lines.length);
      const t = lineText(i);
      if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
      if (t.length !== 5 && t.length !== 7) continue;
      if (strict && !isFamous(i)) continue;
      seen.add(t); opts.push({ text: t, kind: 'noKw' });
      return true;
    }
    return false;
  }
  function pushNoKwHot() {
    for (let g = 0; g < 120; g++) {
      const i = Math.floor(rng() * corpus.lines.length);
      const t = lineText(i);
      if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
      if (t.length !== 5 && t.length !== 7) continue;
      if (!isHot(i)) continue;
      seen.add(t); opts.push({ text: t, kind: 'noKw' });
      return true;
    }
    return false;
  }
  while (opts.length < N - 1) {
    if (pushNoKwHot()) continue;
    if (pushNoKw(true)) continue;
    if (pushNoKw(false)) continue;
    break;
  }

  // 3) fake 补足：库外拼合句（含关键字）
  while (opts.length < N - 1) {
    const fake = genFakeLine(keyword, seen, rng);
    if (!fake) break;
    seen.add(fake); opts.push({ text: fake, kind: 'fake' });
  }

  // 4) 生成期铁证：干扰项必须 judge fail；意外放行的弃用（理论不可达，防手滑）
  const pool = corpus.pool || POOL;
  const verified = opts.filter(o => !judge(o.text, keyword, used, pool).pass);
  while (verified.length < N - 1) {
    const fake = genFakeLine(keyword, seen, rng);
    if (!fake) break;
    seen.add(fake); verified.push({ text: fake, kind: 'fake' });
  }

  const all = [{ text: correctText, kind: 'correct', lineIdx: correctIdx }].concat(verified);
  const order = shuffled(all, rng);
  return { correctIdx, options: order, correctPos: order.findIndex(o => o.kind === 'correct') };
}

// ---------------- 教学局（P0-3「首 90 秒」）----------------
/**
 * 3 回合教学局：固定令字「月」，三句全是国民级名句。
 * 递进设计（不解释规则，用三次体验教完规则）：
 *   第 1 回合 把答案念给玩家听 → 必成，建立"我点一下就对"的手感；
 *   第 2 回合 只给出处（作者《诗题》）→ 玩家自己想起原句，学会用提示；
 *   第 3 回合 不给提示 + 诗童必失手 → 第一次"赢"的哇时刻，同时暴露"假句"存在。
 * fake 全部是「正确的邻字互换」（床前明月光 → 床前月光明），
 * 让玩家在第 1 回合就看见「长得像但不是原句」的干扰项——这是 P0-1 后的核心玩法。
 */
const TUTORIAL_ROUNDS = [
  { line: '床前明月光', fake: '床前月光明', hint: '第一句我念给你听：床前明月光', tip: '对 · 每回合你和诗童各接一句' },
  { line: '海上生明月', fake: '海上明月生', hint: '出自 张九龄《望月怀远》', tip: '有改过字的假句，要选真句' },
  { line: '月落乌啼霜满天', fake: '月落乌啼满天霜', hint: '最后一句，靠你自己', tip: '诗童没接上 · 教学局完成' },
];

/** 取一条库内真句但不含令字（noKw 干扰），名篇优先 */
function pickNoKw(keyword, seen, rng, strict) {
  for (let g = 0; g < 120; g++) {
    const i = Math.floor(rng() * corpus.lines.length);
    const t = lineText(i);
    if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
    if (t.length !== 5 && t.length !== 7) continue;
    if (strict && !isHot(i) && !isFamous(i)) continue;
    return t;
  }
  return null;
}

/**
 * 生成教学局第 step（0 基）回合的选项。
 * 返回与 genChoiceCandidates 同形：{ correctIdx, options:[{text,kind}], correctPos, tutorial:{step,hint,tip} }
 * 库内缺句（理论不可达）返回 null，调用方回落常规发牌。
 */
function genTutorialRound(step, keyword, usedKeys, rng) {
  const spec = TUTORIAL_ROUNDS[Math.max(0, Math.min(TUTORIAL_ROUNDS.length - 1, step | 0))];
  const correctIdx = corpus.norm_index[normKey(spec.line)];
  if (correctIdx === undefined) return null;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys || []);
  if (used.has(spec.line)) return null; // 该句已用（教学局不会发生，防御式）

  const opts = [{ text: spec.line, kind: 'correct', lineIdx: correctIdx }];
  const seen = new Set([spec.line]);

  // 伪句：库外改字句（含令字）；万一与库撞名则临时生成
  let fake = spec.fake;
  if (!fake || corpus.norm_index[normKey(fake)] !== undefined || seen.has(fake)) {
    fake = genFakeLine(keyword, seen, rng);
  }
  if (fake) { seen.add(fake); opts.push({ text: fake, kind: 'fake' }); }

  // 两条 noKw 真句（不含令字），名篇/名家优先，保证"每个选项都像诗"
  let noKw = pickNoKw(keyword, seen, rng, true);
  if (noKw) { seen.add(noKw); opts.push({ text: noKw, kind: 'noKw' }); }
  noKw = pickNoKw(keyword, seen, rng, false);
  if (noKw) { seen.add(noKw); opts.push({ text: noKw, kind: 'noKw' }); }

  const order = shuffled(opts, rng);
  return {
    correctIdx,
    options: order,
    correctPos: order.findIndex(o => o.kind === 'correct'),
    tutorial: { step: step + 1, hint: spec.hint, tip: spec.tip, line: spec.line },
  };
}

module.exports = { mulberry32, shuffled, pickCorrect, remaining, neighborhoodChars, distractPool, hasForbiddenArrangement, genChoiceCandidates, genBlocks, genFakeLine, genTutorialRound, TUTORIAL_ROUNDS, lineText, isFamous, isHot, isTop, FAMOUS_LINES, COMMON_DISTRACT };

});
__reg("js/game/ai.js", function (module, exports, require) {
'use strict';
/**
 * AI 陪练（v1.4 §2.6 平衡七条）
 * 1. 开局有限手牌：新手 5 / 普通 8 / 高手 12
 * 2. 难度 = 手牌数 + 失误率(20%/10%/5%) + 思考时长三参数
 * 3. AI 回合也有 10s 上限（思考时长 ≤2s，正常不触顶）
 * 4. 与玩家共用全局 usedKeys
 * 5. 回合上限 12（match.js 管）；6. 换字重置手牌与 usedKeys（match.js 管）；7. 拟人延迟不参与平衡
 */
const { pickCorrect, remaining, isFamous, isHot, isTop, shuffled } = require('./candidates');
const { corpus } = require('../../src/judge');

const LEVELS = {
  rookie:  { hand: 5,  errorRate: 0.20, thinkMin: 1.2, thinkMax: 2.0, label: '新手' },
  normal:  { hand: 8,  errorRate: 0.10, thinkMin: 0.8, thinkMax: 1.5, label: '困难' },
  expert:  { hand: 12, errorRate: 0.05, thinkMin: 0.3, thinkMax: 0.8, label: '高手' },
};
const lineText = i => corpus.lines[i].split('|')[0];

function create(level, keyword, rng, difficulty) {
  const cfg = LEVELS[level] || LEVELS.normal;
  return {
    cfg,
    level,
    rng,
    difficulty: difficulty || 'mixed',
    hand: deal(cfg.hand, keyword, [], rng, difficulty || 'mixed'),
  };
}

/**
 * 按关键字+难度发牌：从未用、含字的池里抽 handSize 句。
 * difficulty: 'e'|'m'|'h' 按学段三档过滤；'mixed' 不限档。
 * 档内不足则逐级放宽到全档（v1.4 §2.6 池空兜底精神，禁止 random([])）。
 */
function deal(handSize, keyword, usedKeys, rng, difficulty) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  const byLevel = lv => (corpus.char_index[keyword] || [])
    .filter(i => !used.has(lineText(i)) && (lv === undefined || corpus.lines[i].split('|')[2] === lv));
  let pool = byLevel(difficulty && difficulty !== 'mixed' ? difficulty : undefined);
  if (pool.length < handSize) pool = byLevel(undefined); // 档内不足放宽
  // ★ 四级经典偏好：AI 手牌优先装核心名句 → 教材名篇 → 名家 → 其余（诗童出句应为热门经典）
  const top = pool.filter(isTop);
  const hot = pool.filter(i => !isTop(i) && isHot(i));
  const fam = pool.filter(i => !isTop(i) && !isHot(i) && isFamous(i));
  const rest = pool.filter(i => !isTop(i) && !isHot(i) && !isFamous(i));
  const ordered = shuffled(top, rng).concat(shuffled(hot, rng)).concat(shuffled(fam, rng)).concat(shuffled(rest, rng));
  return ordered.slice(0, handSize);
}

/**
 * AI 出手。
 * @returns {{action:'play', lineIdx, thinkSec} | {action:'fail', thinkSec} | {action:'exhausted'}}
 *  - 手牌空 → exhausted（诗童接不上 → 结算）
 *  - 命中失误率 → fail（出干扰性质失败，该回合失手）
 *  - 正常 → play：出一句未用手牌（AI 点选也完整走 judge 由 match 校验）
 */
function act(ai, keyword, usedKeys, elapsed) {
  const { rng, cfg } = ai;
  // 手牌里被玩家先出掉的句要剔除（共用 usedKeys）
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  ai.hand = ai.hand.filter(i => !used.has(lineText(i)));
  if (!ai.hand.length) {
    // 手牌耗尽尝试从池里补一张（v1.4 §2.6.1 出完即判接不上；这里按池兜底防误杀）
    const more = deal(1, keyword, usedKeys, rng, ai.difficulty);
    if (more.length) ai.hand = more;
    else return { action: 'exhausted' };
  }
  const thinkSec = cfg.thinkMin + rng() * (cfg.thinkMax - cfg.thinkMin);
  if (elapsed > 10) return { action: 'fail', thinkSec: Math.min(thinkSec, 0.5) }; // AI 超时同分支
  if (rng() < cfg.errorRate) return { action: 'fail', thinkSec };
  const j = Math.floor(rng() * ai.hand.length);
  const lineIdx = ai.hand[j];
  ai.hand.splice(j, 1);
  return { action: 'play', lineIdx, thinkSec };
}

module.exports = { LEVELS, create, deal, act };

});
__reg("js/game/match.js", function (module, exports, require) {
'use strict';
/**
 * 对局状态机（v1.4 §2.2/§2.6 + 10_ui_spec.md §4.7）
 * 纯逻辑、update(dt) 驱动（无真实定时器），Node 可测。
 *
 * 相位流：
 * reveal(0.8s, 倒计时不启动) → player(10/15s 决策期) → judge(本地 1 帧)
 *   → playerFeedback(过 0.8s / 失败 1.6s) → aiThink(AI 思考) → aiFeedback(1.0s)
 *   → [回合 <12] reveal … ｜ [回合=12] result
 * 结束分支：玩家超时 → 本回合判负分（诗童 +1）后继续；AI 手牌耗尽 → 玩家胜；
 *   池空 → poolEmpty 等待换字确认；12 回合满 → 按接对数判定。
 * 判定铁律：玩家点选/拼句结果必须完整跑 judge()，不跳过。
 */
const { judge, corpus, POOL, normKey } = require('../../src/judge');
const C = require('./candidates');
const aiLib = require('./ai');

const lineText = i => corpus.lines[i].split('|')[0];
const DUR = { reveal: 0.8, pass: 0.8, fail: 1.6, aiShow: 1.0 };

function pickKeyword(rng, excludeKeywords) {
  // 修复（2026-11-18 用户反馈「题目会重复」）：原实现确定性取句量最多的字，
  // 导致每局开局关键字都相同。改为：排除跨局近期用字后，在可用量达标的字里真随机。
  const excl = excludeKeywords instanceof Set ? excludeKeywords : new Set(excludeKeywords || []);
  let cands = POOL.filter(ch => !excl.has(ch) && (corpus.char_index[ch] || []).length >= 6);
  if (!cands.length) cands = POOL.filter(ch => (corpus.char_index[ch] || []).length >= 6);
  if (!cands.length) cands = POOL.slice();
  return cands[Math.floor(rng() * cands.length)];
}

function suggestKeyword(usedKeys) {
  let best = null, bestN = 0;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  for (const ch of POOL) {
    const n = C.remaining(corpus, ch, used).length;
    if (n > bestN) { bestN = n; best = ch; }
  }
  return best;
}

class Match {
  constructor(opts) {
    const o = opts || {};
    this.rng = C.mulberry32(o.seed != null ? o.seed : (Math.random() * 0xFFFFFFFF) >>> 0);
    const tutorial = !!o.tutorial;
    this.cfg = {
      mode: tutorial ? 'choice' : (o.mode || 'choice'), // 教学局只用点选（字块没有"念给你听"的余地）
      roundMax: o.roundMax != null ? o.roundMax : (tutorial ? 3 : 12),
      // easy 档：15s 决策期 + 新手 AI + 名句五言优先（用户口径 2026-11-18「难度按熟悉程度分级」）
      difficulty: o.difficulty || 'normal',
      tutorial,
      // 教学局给 20s：第一次上手的人要读选项、看提示，15s 不够（P0-3 首局完成率 ≥65% 的前提）
      timerSec: o.timerSec != null ? o.timerSec : (tutorial ? 20 : (o.difficulty === 'easy' ? 15 : 10)),
      aiLevel: o.aiLevel || (o.difficulty === 'easy' ? 'rookie' : 'normal'),
      aiDifficulty: o.aiDifficulty || 'mixed',         // 幽灵出句难度：e/m/h/mixed（关键字+难度）
      candidateCount: o.candidateCount || 4,           // 裁决：v0.1 锁 4
    };
    // 教学局固定令字「月」：三句教学名句全部含月，且「月」本身就是最熟悉的令字
    this.keyword = o.keyword || (tutorial ? '月' : pickKeyword(this.rng, o.excludeKeywords));
    this.tutorialHint = null;           // 教学局当前回合提示（给答案 / 给出处 / 靠自己）
    this.tutorialTip = null;            // 教学局接对后的规则小贴士
    this.usedKeys = new Set();          // 全局已用句（玩家 + AI 共用，v1.4 §2.6.4）
    // 本局已展示文本（2026-11-20 真机复盘）：选项/题句/AI 出句只要亮过就记录——
    // 失手回合的正解与干扰项不走 usedKeys，若无此集合会随后续回合/AI 补牌再次出现，
    // 玩家视角即"同一局出现重复题目"。生成器与 AI 补牌统一经 _genUsed()/_actUsed() 避开。
    this.shown = new Set();
    this.ai = aiLib.create(this.cfg.aiLevel, this.keyword, this.rng, this.cfg.aiDifficulty);
    this.roundSeq = 0;                  // 已完成回合数
    this.playerHits = 0; this.tigerHits = 0;
    this.timeouts = 0;                  // 玩家超时回合数（本回合判负分，不终局）
    this.skipAITurn = false;            // 超时回合跳过诗童出句
    this.combo = 0; this.maxCombo = 0;
    this.reactSum = 0; this.reactN = 0;
    this.lastPlayerLine = null; this.lastTigerLine = null;
    this.phase = 'idle'; this.phaseT = 0;
    this.candidates = null; this.blocks = null;
    this.pending = null;                // 判定前暂存
    this.feedback = null;               // {kind:'pass'|'fail'|'timeout'|'aiFail'|'aiPlay'|'exhausted', reason, text, pos}
    this.outcome = null;                // {result:'win'|'loss'|'draw', reason, stats}
    // 错句复仇（2026-11-19 PM 唯一推荐概念，MVP）：
    // grudgeLines = 开局传入的「已熟成待甩错句」（store.grudgeRipe()，纯逻辑层不读存储）
    this.grudgeLines = Array.isArray(o.grudgeLines) ? o.grudgeLines.slice(0, 5) : [];
    this.grudgeNew = [];                // 本局玩家失手回合的正解（结算后入册）
    this.revengePlays = 0;              // 本局已甩错句数（≤2，防刷屏）
    this.revengeRound = null;           // {text, avenged}——诗童甩出错句后待玩家雪耻的回合
    this.revengeKills = [];             // 本局雪耻成功的错句文本（结算回写仇册）
    this._dealRound();
  }

  // ---------- 内部 ----------
  /**
   * 生成器用已用集合（2026-11-20 真机复盘）：叠加 AI 当前手牌（开局即发、不走 usedKeys，
   * 不预留会被题句/干扰项撞上）+ 本局已展示文本（失手正解/干扰项只展示不消费，会复现）。
   */
  _genUsed() {
    const s = new Set(this.usedKeys);
    // 教学局是手写三回合脚本（固定教学句），AI 手牌预留不适用——叠加会把
    // 「海上生明月」级教学句判成已用，genTutorialRound 回落常规发牌、提示过期
    // （2026-11-20 冒烟抓到：第 2 回合提示复读第 1 回合）。
    if (!this.cfg.tutorial) {
      ((this.ai && this.ai.hand) || []).forEach(i => s.add(lineText(i)));
    }
    this.shown.forEach(t => s.add(t));
    return s;
  }

  /** AI 补牌/滤手牌用：usedKeys ∪ 已展示（不含手牌自身，act 内部管理手牌） */
  _actUsed() {
    const s = new Set(this.usedKeys);
    this.shown.forEach(t => s.add(t));
    return s;
  }

  /** 登记本回合已展示内容：选项全文（choice/tutorial）或拼句目标（blocks） */
  _markShown() {
    if (this.candidates && this.candidates.options) {
      this.candidates.options.forEach(o => this.shown.add(o.text));
    } else if (this.blocks && this.blocks.sentence) {
      this.shown.add(this.blocks.sentence);
    }
  }

  _dealRound() {
    const easy = this.cfg.difficulty === 'easy';
    const genUsed = this._genUsed();
    if (this.cfg.mode === 'choice') {
      if (this.cfg.tutorial) {
        // 教学局：手写三回合（给答案 → 给出处 → 靠自己），失败才回落常规发牌
        const t = C.genTutorialRound(this.roundSeq, this.keyword, genUsed, this.rng);
        if (t) {
          this.candidates = t;
          this.tutorialHint = t.tutorial.hint;
          this.tutorialTip = t.tutorial.tip;
        } else {
          this.candidates = C.genChoiceCandidates(this.keyword, genUsed, this.rng, this.cfg.candidateCount, easy);
        }
      } else {
        this.candidates = C.genChoiceCandidates(this.keyword, genUsed, this.rng, this.cfg.candidateCount, easy);
      }
    } else {
      this.blocks = C.genBlocks(this.keyword, genUsed, this.rng, easy);
      this.candidates = this.blocks ? { correctIdx: this.blocks.lineIdx } : null;
    }
    if (!this.candidates) { this.phase = 'poolEmpty'; this.phaseT = 0; return; }
    this._markShown();
    this.skipAITurn = false;
    this._enter('reveal');
  }
  _enter(phase) { this.phase = phase; this.phaseT = 0; }
  _accept(lineIdx) {
    const t = lineText(lineIdx);
    this.usedKeys.add(t);
    return t;
  }
  /** 玩家失手（错选/拼错/超时）→ 本回合正解入「错句」清单（教学局不入册） */
  _noteGrudge() {
    if (this.cfg.tutorial) return;
    let t = null;
    if (this.cfg.mode === 'choice' && this.candidates && this.candidates.correctPos != null) {
      t = this.candidates.options[this.candidates.correctPos] && this.candidates.options[this.candidates.correctPos].text;
    } else if (this.blocks && this.blocks.sentence) {
      t = this.blocks.sentence;
    }
    if (t && !this.grudgeNew.includes(t)) this.grudgeNew.push(t);
  }
  /** 挑一句待甩错句：含当前令字、未用过、且当前没有悬着的雪耻回合 */
  _pickGrudge() {
    if (!this.grudgeLines.length || this.revengePlays >= 2 || this.revengeRound) return null;
    for (const text of this.grudgeLines) {
      if (this.usedKeys.has(text)) continue;
      if (this.shown.has(text)) continue;      // 本局已亮过的内容不重复甩
      if (text.indexOf(this.keyword) === -1) continue;
      const idx = corpus.norm_index[normKey(text)];
      if (idx == null) continue;               // 理论不会发生（错句皆库内句），防御
      return { action: 'play', lineIdx: +idx, thinkSec: 1.2, grudge: true };
    }
    return null;
  }
  _toResult(result, reason) {
    const avg = this.reactN ? +(this.reactSum / this.reactN).toFixed(1) : 0;
    this.outcome = {
      result, reason,
      tutorial: this.cfg.tutorial,
      stats: { hits: this.playerHits, tigerHits: this.tigerHits, maxCombo: this.maxCombo,
               avgReact: avg, rounds: this.roundSeq, timeouts: this.timeouts, keyword: this.keyword,
               // 错句复仇：入册前剔除当局已被玩家自己接上的句（失手后补接的不算仇）
               revenge: { kills: this.revengeKills.length, killedTexts: this.revengeKills.slice(),
                          newGrudge: this.grudgeNew.filter(t => !this.usedKeys.has(t)) } },
    };
    this._enter('result');
  }
  _afterPlayerFeedback() {
    // 2026-11-18 P0-3「哇时刻」：教学局最后一回合让诗童必失手——
    // 玩家第一次看到"它也会接不上"，同时第一次赢，建立继续玩的动机。
    if (this.cfg.tutorial && this.roundSeq >= this.cfg.roundMax - 1) {
      this.pendingAI = { action: 'skip', thinkSec: 0.8 };
      this._enter('aiThink');
      return;
    }
    // 玩家回合结束 → AI 回合（错句复仇：优先甩仇册错句，压过普通出句）
    const act = this._pickGrudge() || aiLib.act(this.ai, this.keyword, this._actUsed(), this.phaseT);
    this.pendingAI = act;
    if (act.action === 'exhausted') { this._toResult('win', 'aiExhausted'); return; }
    this._enter('aiThink');
  }
  _finishRound() {
    this.roundSeq++;
    if (this.roundSeq >= this.cfg.roundMax) { this._judgeFinal(); return; }
    this._dealRound();
  }
  _judgeFinal() {
    if (this.playerHits > this.tigerHits) this._toResult('win', 'roundsFull');
    else if (this.playerHits < this.tigerHits) this._toResult('loss', 'roundsFull');
    else this._toResult('draw', 'roundsFull');
  }

  // ---------- 驱动 ----------
  update(dt) {
    if (this.phase === 'result' || this.phase === 'idle') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'reveal':
        if (this.phaseT >= DUR.reveal) this._enter('player');
        break;
      case 'player': {
        const left = this.cfg.timerSec - this.phaseT;
        if (left <= 0) {
          // 2026-11-18 P0（产品评估：一次失误归零对 40+ 用户是劝退设计）：
          // 超时不再整局判负，改为【本回合判负分】——诗童 +1，玩家连对清零，
          // 直接跳过 AI 回合进入下一回合，对局继续到 12 回合或池空。
          this.feedback = { kind: 'fail', reason: 'TIMEOUT', text: null };
          this._noteGrudge();
          this.combo = 0;
          this.tigerHits++;
          this.timeouts++;
          this.skipAITurn = true;
          this._enter('playerFeedback');
        }
        break;
      }
      case 'playerFeedback':
        if (this.phaseT >= (this.feedback && this.feedback.kind === 'pass' ? DUR.pass : DUR.fail)) {
          if (this.skipAITurn) { this.skipAITurn = false; this._finishRound(); }
          else this._afterPlayerFeedback();
        }
        break;
      case 'aiThink':
        if (this.phaseT >= (this.pendingAI.thinkSec || 1)) {
          const act = this.pendingAI;
          if (act.action === 'play') {
            // 2026-11-18 重大修复：原实现先 _accept（入 usedKeys）再 judge——
            // AI 句自己撞自己的 DUPLICATE，诗童每句必败（用户实测 7 回合 0 接对）。
            // 与玩家路径同序：先判，过判再入 usedKeys。
            const t = lineText(act.lineIdx);
            const r = judge(t, this.keyword, this.usedKeys, POOL);
            if (r.pass) {
              this._accept(act.lineIdx);
              this.tigerHits++; this.combo = 0;
              this.lastTigerLine = t;
              this.feedback = { kind: 'aiPlay', reason: 'OK', text: t, grudge: !!act.grudge };
              // 甩出错句 → 挂起雪耻回合：玩家下一次接对即反杀翻倍
              if (act.grudge) { this.revengePlays++; this.revengeRound = { text: t, avenged: false }; }
            } else {
              this.shown.add(t); // AI 失手句也已亮给玩家，后续不再复用
              this.feedback = { kind: 'aiFail', reason: r.reason, text: t };
            }
          } else {
            this.feedback = { kind: 'aiFail', reason: 'TIMEOUT', text: null };
          }
          this._enter('aiFeedback');
        }
        break;
      case 'aiFeedback':
        if (this.phaseT >= DUR.aiShow) this._finishRound();
        break;
      default: break;
    }
  }

  // ---------- 玩家输入（点选/拼句都必须完整跑 judge） ----------
  _judgeAndRecord(text, extra0) {
    const react = Math.max(0, this.cfg.timerSec - (this.cfg.timerSec - this.phaseT));
    this.reactSum += this.phaseT; this.reactN++;
    const r = judge(text, this.keyword, this.usedKeys, POOL);
    if (r.pass) {
      this.usedKeys.add(text);
      this.playerHits++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.lastPlayerLine = text;
      const extra = extra0 || {};
      // 错句复仇反杀：诗童甩出的错句被接上 → 本回合得分翻倍 + 雪耻标记
      if (this.revengeRound && !this.revengeRound.avenged) {
        this.revengeRound.avenged = true;
        this.playerHits++;                    // 翻倍 = 正常 +1 再奖 +1
        this.revengeKills.push(this.revengeRound.text);
        extra.revenge = true;
        this.revengeRound = null;
      }
      this.feedback = Object.assign({ kind: 'pass', reason: 'OK', text }, extra);
    } else {
      this.combo = 0;
      this._noteGrudge();
      this.feedback = Object.assign({ kind: 'fail', reason: r.reason, text }, extra0 || {});
    }
    this._enter('playerFeedback');
    return r;
  }
  /** 点选接句：pos = 候选卡下标 */
  submitChoice(pos) {
    if (this.phase !== 'player' || !this.candidates) return { pass: false, reason: 'INVALID_STATE' };
    const opt = this.candidates.options[pos];
    if (!opt) return { pass: false, reason: 'INVALID_STATE' };
    return this._judgeAndRecord(opt.text, { pos });
  }
  /** 字块拼句：UI 组好整句提交 */
  submitBlocksText(text) {
    if (this.phase !== 'player') return { pass: false, reason: 'INVALID_STATE' };
    return this._judgeAndRecord(text, {});
  }

  // ---------- 池空兜底（v1.4 §2.6：放宽难度→换字→判接不上；禁止 random([]) 崩溃） ----------
  confirmSwitch() {
    if (this.phase !== 'poolEmpty') return false;
    const next = suggestKeyword(this.usedKeys);
    if (!next || next === this.keyword) { // 全池尽 → 判 AI 接不上
      this._toResult('win', 'poolExhausted');
      return true;
    }
    this.keyword = next;
    this.ai = aiLib.create(this.cfg.aiLevel, next, this.rng, this.cfg.aiDifficulty); // v1.4 §2.6.6 换字重置手牌
    this.usedKeys = new Set();                                 // 与手牌一并重置
    this.revengeRound = null;                                  // 悬着的雪耻回合随旧字上下文一并作废
    this._dealRound();
    return true;
  }

  // ---------- UI 快照 ----------
  snapshot() {
    return {
      phase: this.phase,
      phaseT: this.phaseT,
      mode: this.cfg.mode,
      keyword: this.keyword,
      round: this.roundSeq + (this.phase === 'idle' ? 0 : 1),
      roundMax: this.cfg.roundMax,
      timeLeft: this.phase === 'player' ? Math.max(0, this.cfg.timerSec - this.phaseT) : null,
      playerHits: this.playerHits, tigerHits: this.tigerHits,
      combo: this.combo,
      usedKeys: this.usedKeys,
      // 2026-11-18 玩法可读性：携带 kind（'correct'|'noKw'|'dup'|'fake'），
      // dup 选项 UI 可提前标注「已用」角标——玩家无需记忆历史回合也能理解判定
      candidates: (this.cfg.mode === 'choice' && this.candidates) ? this.candidates.options.map(o => ({ text: o.text, kind: o.kind })) : null,
      blocks: this.blocks,
      feedback: this.feedback,
      lastSentence: this.lastTigerLine || this.lastPlayerLine,
      suggestKeyword: this.phase === 'poolEmpty' ? suggestKeyword(this.usedKeys) : null,
      // 教学局上下文（提示行/贴士；非教学局为 null，UI 不额外渲染）
      tutorial: this.cfg.tutorial
        ? { step: Math.min(this.roundSeq + 1, this.cfg.roundMax), total: this.cfg.roundMax, hint: this.tutorialHint, tip: this.tutorialTip }
        : null,
      // 错句复仇：甩出错句后挂起的雪耻回合（上句区「仇册」签 + 反杀翻倍 UI 依据）
      revenge: this.revengeRound ? { text: this.revengeRound.text, avenged: this.revengeRound.avenged } : null,
      outcome: this.outcome,
    };
  }
}

module.exports = { Match, DUR, POOL };

});
__reg("js/ui/screens/battle.js", function (module, exports, require) {
'use strict';
/**
 * 对局页（10_ui_spec.md §4，两模式共用 B0–B3，B4 分模式）
 * L0 静态层：背景 + 顶部条/令区/上句条边框 + 关键字印章 + B4 框架（每回合重绘一次）
 * L1 每帧：小虎半身像（裁切窗）
 * L2 每帧：倒计时/血条/已选字/按下态/判定反馈/浮字/错因 pill/池空弹条/出字亮相蒙版
 * 红线：决策期零干扰动效（唯一动效 = 小虎呼吸眨眼 + 倒计时整数秒跳变 + 1Hz 台阶环）
 */
const layout = require('../layout');
const d = require('../draw');
const { font, T } = require('../tokens');
const tiger = require('../tiger');
const ink = require('../ink');
const platform = require('../../platform');
const store = require('../../app/store');
const sound = require('../../app/sound');
const track = require('../../app/track');
const pet = require('../pet').create();
const { Match } = require('../../game/match');

// 错因 pill 映射表 v2（10_ui_spec.md §11.3 D1 裁决定稿；文案逐字对齐，勿自拟）
const REASON_TEXT = {
  NO_KEYWORD: null, // 按本轮实际字动态生成：不含「X」字
  NOT_IN_CORPUS: '非认证诗句',
  FORMAT_ERROR: '这句不完整',
  INVALID_KEYWORD: '令字有误',
  DUPLICATE: '这句用过了',
  TIMEOUT: '超时 · 本回合判负',
};
function reasonTextOf(reason, keyword) {
  if (reason === 'NO_KEYWORD') return `不含「${keyword}」字`;
  return REASON_TEXT[reason] || '非认证诗句';
}

/**
 * 盖章冲击位移曲线（px）：单周期正弦 × 线性衰减，只走"下沉 → 回位 → 微回弹 → 停"一遍。
 * p=0 → 0；p≈0.25 → +1.2（落下）；p=0.5 → 0（触底）；p≈0.75 → -0.4（回弹）；p=1 → 0。
 *
 * 2026-11-19 真机反馈「选对时晃动有点晕」：旧实现是每 25ms 把整屏左右硬切到 ±1.2px 的
 * 往复方波——水平往复 + 20Hz 硬切换是晕动最敏感的刺激形态，眼睛被迫整屏追着来回跑。
 * 现改为单次冲击：只有垂直分量（盖章本来就是垂直方向的力），一个来回就收住，
 * 观感是一声"咚"而不是"抖"。返回标量 = 结构上排除了横向抖动。
 */
const SHAKE_DUR = 0.13;
function shakeOffset(tSec) {
  if (!(tSec < SHAKE_DUR)) return 0;   // 含 tSec>=DUR 与 NaN：一律无位移
  const p = tSec / SHAKE_DUR;
  return Math.sin(p * Math.PI * 2) * 1.6 * (1 - p);
}

function BattleScreen(app, params) {
  const tutorial = !!(params && params.tutorial);
  // 教学局只用点选：字块模式没有「念给你听」的余地，且拼字对第一次上手门槛过高
  const mode = tutorial ? 'choice' : ((params && params.mode) || 'choice');
  const difficulty = (params && params.difficulty) || app.settings.difficulty || 'easy';
  // 开局排除最近 2 局用过的令字（防「每局都同一个字」的重复体感）
  const match = new Match({
    mode, difficulty, tutorial,
    aiLevel: difficulty === 'easy' ? 'rookie' : 'normal',
    seed: (Math.random() * 0xFFFFFFFF) >>> 0,
    excludeKeywords: store.recentKeywords(),
    // 错句复仇 MVP（2026-11-19）：已熟成的仇册错句交给诗童（教学局不带）
    grudgeLines: tutorial ? [] : store.grudgeRipe(),
  });
  const self = {
    id: 'battle', hotRects: [],
    match, mode, tutorial,
  };

  let L = null; let L0 = null;
  let pressed = null;     // 按下视觉 tint（计时过期只影响视觉，不影响判定）
  let pressDown = null;   // 按下热区 id（持续到 touchend——修复 120ms 过期导致慢点按无响应）
  let seq = [];           // 字块模式：已选块下标
  let floatFx = null;     // {text, x, y, t}
  let pillT = -1;         // 错因/教学贴士 pill 动画 0..1.6s
  let urgentFlashT = -1;  // 超时边框闪 1 次
  let lastShown = '';     // 上句区文本
  let revealedRound = -1; // 已烘焙的回合标记
  let resultDelayT = -1;  // F2：结算转场延迟计时（-1 = 未触发）
  let resultGone = false; // F2：转场去重
  let playerElapsed = 0;  // 本回合决策耗时（埋点 fhl_round.ms）
  let endTracked = false; // 局终埋点去重
  const startAt = Date.now(); // 开局时间戳（埋点 fhl_end.dur）
  // 展示①（§4.22）：朱批笔触 + 印章 / 墨渍 / 已定格烙印清单 / 纸面震动
  let strokeFx = null;    // {t, stroke, seal, x,y,w,h, sealX,sealY}
  let blotFx = null;      // {x, y, t} 失手墨点（晕开成墨渍残留）
  let settledFx = [];     // 动画播完的烙印（每帧单次 drawImage 重绘）
  let shakeT = -1;        // 盖章帧纸面震动

  function shared() { return layout.battleShared(app.info); }
  function b4() { return mode === 'blocks' ? layout.battleBlocks(app.info, L) : layout.battleChoice(app.info, L); }
  function rev() { return layout.reveal(app.info); }

  /** 判定落地：错因/贴士 pill、浮字 +1、音效、回合埋点（touch 回调内直呼 + update 兜超时） */
  function _afterJudge(snap) {
    const fb = match.feedback || {};
    const s = snap || match.snapshot();
    // 埋点：每回合一条（模式/难度/回合/令字/对错/原因/决策毫秒）
    track.track('fhl_round', {
      mode: mode === 'choice' ? 1 : 2,
      difficulty: difficulty === 'easy' ? 1 : 2,
      round: Math.min(match.roundSeq + 1, match.cfg.roundMax),
      kw: s.keyword,
      ok: fb.kind === 'pass' ? 1 : 0,
      reason: fb.reason || 'UNKNOWN',
      ms: Math.round(playerElapsed * 1000),
      rev: fb.revenge ? 1 : 0,
    });
    playerElapsed = 0;
    const { c } = app.tokens;
    const cards = b4().cards || [];
    if (fb.kind === 'fail') {
      pillT = 0; sound.play('fail');
      // 展示①：失手墨点——落在错选卡/预览槽下缘，晕开成墨渍残留（本回合内的「伤疤」）
      const target = mode === 'choice' ? (fb.pos != null && cards[fb.pos] ? cards[fb.pos] : null) : b4().preview;
      if (target && !blotFx) {
        blotFx = { x: target.x + target.w * (0.30 + 0.4 * Math.random()), y: target.y + target.h - 10, t: 0 };
      }
    }
    if (fb.kind === 'pass') {
      const pos = fb.pos != null ? fb.pos : 0;
      const y = mode === 'choice' ? (cards[pos] ? cards[pos].y : cards[0].y) : b4().preview.y;
      // 错句复仇反杀：+2 飘字 + 金色雪耻 pill
      floatFx = { text: fb.revenge ? '+2' : '+1', x: 44, y, t: 0 };
      sound.play('pass');
      if (fb.revenge) pillT = 0;
      // 教学局：接对后用同一条 pill 位播规则贴士（不额外占版面）
      else if (s.tutorial) pillT = 0;
      // 展示①：朱批笔触划过答案 + 印章盖下（离屏不可用时优雅跳过）
      const target = mode === 'choice' ? (cards[pos] || cards[0]) : b4().preview;
      if (target && !strokeFx) {
        const sw = Math.max(60, target.w - 16), shh = Math.max(24, target.h * 0.5);
        strokeFx = {
          t: 0,
          stroke: ink.bakeStroke(sw, shh, fb.revenge ? 'rgba(217,164,65,0.92)' : 'rgba(201,55,44,0.85)', c.bg),
          seal: ink.bakeSeal(fb.revenge ? '雪耻' : '妙', 56),
          x: target.x + 8, y: target.y + target.h / 2 - shh / 2, w: sw, h: shh,
          sealX: target.x + target.w - 62, sealY: target.y - 12,
        };
      }
    }
  }

  self.enter = function () {
    bake();
    // 埋点 fhl_start：开局（模式/难度/是否教学局 + 令字）
    track.track('fhl_start', {
      mode: mode === 'choice' ? 1 : 2,
      difficulty: difficulty === 'easy' ? 1 : 2,
      tutorial: tutorial ? 1 : 0,
      kw: match.keyword,
    });
  };
  self.leave = function () { };
  self.invalidate = function () { bake(); };

  self.update = function (dt) {
    pet.update(dt);
    const prevPhase = match.phase;
    if (match.phase === 'player') playerElapsed += dt;
    match.update(dt);
    const snap = match.snapshot();
    // 上句区文本
    lastShown = snap.lastSentence || '';
    // 反馈动画计时 + 音效 + 埋点（fhl_round）
    // 2026-11-18 修复（真机时序）：触摸事件在两帧之间到达——submitChoice 在 touch 回调里
    // 就把相位切成 playerFeedback，下一帧 prevPhase 已是 playerFeedback，转场块永不命中，
    // 浮字/错因 pill/音效/埋点全部丢失（教学局贴士 pill 同灭）。现由 _afterJudge 在
    // touch 回调内直接触发；本块只兜 match 内部转场（超时判负分这一条路径）。
    if (match.phase === 'playerFeedback' && prevPhase !== 'playerFeedback') {
      _afterJudge(snap);
    }
    // 诗童回合：出句=落子轻响；接不上=上行轻音（玩家得益，听感不能是"失败音"）
    if (match.phase === 'aiFeedback' && prevPhase !== 'aiFeedback') {
      const fb = match.feedback || {};
      sound.play(fb.kind === 'aiFail' ? 'pass' : 'pick');
    }
    if (pillT >= 0) { pillT += dt; if (pillT > 1.6) pillT = -1; }
    if (floatFx) { floatFx.t += dt; if (floatFx.t > 0.8) floatFx = null; }
    // 展示①：笔触/印章/墨渍/震动计时（笔触 260ms 揭开 → 印章 200ms 盖下 → 烙印定格）
    if (strokeFx) {
      const prevT = strokeFx.t;
      strokeFx.t += dt;
      if (prevT < 0.26 && strokeFx.t >= 0.26) shakeT = 0;   // 印章落下的那一帧
      if (strokeFx.t >= 0.5) {
        if (strokeFx.seal) settledFx.push({ seal: strokeFx.seal, x: strokeFx.sealX, y: strokeFx.sealY });
        strokeFx = null;
      }
    }
    if (blotFx) {
      blotFx.t += dt;
      if (blotFx.t >= 0.6) { settledFx.push({ blot: { x: blotFx.x, y: blotFx.y } }); blotFx = null; }
    }
    if (shakeT >= 0) { shakeT += dt; if (shakeT > SHAKE_DUR) shakeT = -1; }
    if (match.feedback && match.feedback.reason === 'TIMEOUT') urgentFlashT = 0;
    if (urgentFlashT >= 0) { urgentFlashT += dt; if (urgentFlashT > 0.18) urgentFlashT = -1; }
    if (pressed) { pressed.t -= dt; if (pressed.t <= 0) pressed = null; }
    // F2：match 出结果后延迟 400ms 转场结算（让 facepalm/cheer 先露脸），去重防重复 goto
    if (snap.outcome && !resultGone) {
      if (resultDelayT < 0) resultDelayT = 0;
      resultDelayT += dt;
      if (resultDelayT >= 0.4) {
        resultGone = true;
        // 埋点 fhl_end（局终）：胜负/接对数/回合数/时长/超时
        if (!endTracked) {
          endTracked = true;
          track.track('fhl_end', {
            mode: mode === 'choice' ? 1 : 2,
            difficulty: difficulty === 'easy' ? 1 : 2,
            result: snap.outcome.result === 'win' ? 1 : snap.outcome.result === 'loss' ? 2 : 3,
            hits: snap.outcome.stats.hits || 0,
            tiger: snap.outcome.stats.tigerHits || 0,
            rounds: snap.outcome.stats.rounds || 0,
            dur: Math.round((Date.now() - startAt) / 1000),
            timeouts: snap.outcome.stats.timeouts || 0,
            // 错句复仇：雪耻数 / 新入仇册数（行为数值，无文本）
            rev: (snap.outcome.stats.revenge && snap.outcome.stats.revenge.kills) || 0,
            grudge: (snap.outcome.stats.revenge && snap.outcome.stats.revenge.newGrudge.length) || 0,
          });
        }
        if (app.goto) app.goto('result', {
          outcome: snap.outcome,
          lastPlayerLine: match.lastPlayerLine,
          lastTigerLine: match.lastTigerLine,
          mode,
        });
        return;
      }
    }
    // 新回合 → 重置本回合交互状态（2026-11-18 修复：旧回合选中态残留到新回合字块上，
    // 且点不了——seq 残留使新块误判已用）→ 重建静态层
    if (match.phase === 'reveal' && revealedRound !== match.roundSeq) {
      revealedRound = match.roundSeq;
      seq = []; pillT = -1; floatFx = null;
      // 展示①：上一回合的朱批/墨渍/印章不带到新回合（卷面整洁，批注属于那一回合）
      strokeFx = null; blotFx = null; settledFx = []; shakeT = -1;
      bake();
    }
  };

  // ---------------- 绘制 ----------------
  self.draw = function (ctx, t) {
    const { c } = app.tokens;
    const S = app.settings.fontScale;
    const snap = match.snapshot();
    const baked = d.drawBaked(ctx, L0, app.info.W, app.info.H, [c.bg, c.bgEnd]);
    if (!baked && L) { L0 = null; try { drawStatic(ctx); } catch (e) { /* 直绘兜底自身失败不阻断动态层 */ } }
    drawDynamic(ctx, snap, t, S, c);

    // 出字亮相全屏蒙版（du.reveal 800ms；减弱动效仅 alpha）
    if (snap.phase === 'reveal') {
      const p = Math.min(snap.phaseT / T.du.reveal, 1);
      let alpha = 0.96;
      if (p < 0.15) alpha = 0.96 * (p / 0.15);
      else if (p > 0.81) alpha = 0.96 * (1 - (p - 0.81) / 0.19);
      const rm = app.settings.reduceMotion;
      const scaleP = rm ? 1 : 0.92 + 0.08 * Math.min(p / 0.15, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.mask; ctx.fillRect(0, 0, app.info.W, app.info.H);
      const rv = rev();
      ctx.globalAlpha = Math.min(1, alpha * 1.1);
      d.text(ctx, '令', rv.label.cx, rv.label.mid, font(600, 22, 'sans'), c.primary, { align: 'center' });
      ctx.save();
      ctx.translate(rv.char.cx, rv.char.mid);
      ctx.scale(scaleP, scaleP);
      ctx.fillStyle = c.fg;
      ctx.font = font(700, T.fs.hero, 'serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(snap.keyword, 0, 0);
      ctx.restore();
      ctx.fillStyle = c.gold;
      ctx.fillRect(rv.lineTop.x, rv.lineTop.y, rv.lineTop.w, 1);
      ctx.fillRect(rv.lineBottom.x, rv.lineBottom.y, rv.lineBottom.w, 1);
      // 2026-11-18 玩法可读性：每回合亮相蒙版带一行规则（不占对局布局，
      // 玩家在 0.8s 亮相期内自然复习规则——真机反馈「这个到底是怎么玩的」）
      // 2026-11-18 玩法可读性 + 可判别性改版：选项里现在有"改字伪句"干扰，
      // 规则行必须点明「要选真句」，否则玩家不知道凭什么排除（20 字以内防溢出）
      const ruleText = mode === 'choice'
        ? `含「${snap.keyword}」的真句 · 用过的不能重复`
        : `拼含「${snap.keyword}」的诗句 · 用过的不能重复`;
      d.text(ctx, ruleText,
        app.info.W / 2, rv.lineBottom.y + 40, font(400, 21, 'sans'), c.fg2, { align: 'center', maxW: app.info.W - 24 });
      ctx.restore();
    }
  };

  function drawDynamic(ctx, snap, t, S, c) {
    const sh = shared(), b4l = b4();
    // 展示①：盖章帧纸面震动（只震动态层，烘焙底不重绘）
    // 2026-11-19 真机反馈「选对时晃动有点晕」：原实现是每 25ms 把整屏左右硬切到 ±1.2px 的
    // 往复方波——水平往复 + 20Hz 硬切换正是晕动最敏感的刺激形态，且 HUD/按钮一起跳，
    // 眼睛要整屏追着来回跑。现改为「一次冲击 + 阻尼回位」：单周期正弦只走一个来回，
    // 线性衰减把回弹压到 1/4，横向位移归零（盖章是垂直方向的力），130ms 收住。
    // 观感是一声"咚"，不是抖动。减弱动效时直接不震。
    const shake = (!app.settings.reduceMotion && shakeT >= 0) ? shakeOffset(shakeT) : 0;
    if (shake) { ctx.save(); ctx.translate(0, shake); }
    // 小虎半身像（L1，每帧；2026-11-20 触摸互动：摸头摇头/挠爪弹跳）
    pet.setBox(sh.bustWin);
    const tDraw = app.settings.reduceMotion ? 0.5 : t;
    const petOff = pet.offset();
    ctx.save();
    const petPivX = sh.bustWin.x + sh.bustWin.w / 2, petPivY = sh.bustWin.y + sh.bustWin.h;
    ctx.translate(petPivX + petOff.dx, petPivY + petOff.dy);
    ctx.rotate(petOff.rot);
    if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
    ctx.translate(-petPivX, -petPivY);
    tiger.bust(ctx, { win: sh.bustWin, state: pet.stateOverride() || tigerState(snap), t: tDraw });
    ctx.restore();
    pet.draw(ctx);

    // 倒计时：环内数字一体单元，置于胶囊菜单左侧（2026-11-18 真机：原贴屏缘数字撞胶囊）
    // 2026-11-19 UI 评审 D：紧急态（≤3s）加 1Hz 呼吸——外环线宽 3.4↔4.3 正弦 + 环内红晕底
    const tr = sh.timerRing;
    const urgentNow = snap.phase === 'player' && snap.timeLeft != null && Math.ceil(snap.timeLeft) <= 3;
    const breathe = (!app.settings.reduceMotion && urgentNow)
      ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2) : 0.5;
    ctx.beginPath(); ctx.arc(tr.cx, tr.cy, tr.r, 0, Math.PI * 2);
    ctx.lineWidth = urgentNow ? 3.4 + 0.9 * breathe : 4; ctx.strokeStyle = c.track; ctx.stroke();
    if (urgentNow) {
      ctx.beginPath(); ctx.arc(tr.cx, tr.cy, tr.r - 4, 0, Math.PI * 2);
      ctx.fillStyle = hexA(c.danger, 0.06); ctx.fill();
    }
    if (snap.phase === 'player' && snap.timeLeft != null) {
      const secs = Math.ceil(snap.timeLeft);
      const urgent = secs <= 3;
      const frac = Math.max(0, Math.min(1, secs / match.cfg.timerSec));
      ctx.beginPath();
      ctx.arc(tr.cx, tr.cy, tr.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.lineWidth = 4; ctx.strokeStyle = urgent ? c.danger : c.secondary; ctx.stroke();
      d.text(ctx, String(secs), tr.cx, tr.cy, font(600, 24, 'sans'), urgent ? c.danger : c.fg, { align: 'center' });
    } else {
      d.text(ctx, String(match.cfg.timerSec), tr.cx, tr.cy, font(400, 22, 'sans'), c.disabled, { align: 'center' });
    }
    if (urgentFlashT >= 0) {
      ctx.lineWidth = T.st.mid; ctx.strokeStyle = c.danger;
      d.rrect(ctx, tr.cx - tr.r - 8, tr.cy - tr.r - 8, tr.r * 2 + 16, tr.r * 2 + 16, 10); ctx.stroke();
    }
    // 回合 pill
    d.text(ctx, `${Math.min(snap.round, snap.roundMax)}/${snap.roundMax}`,
      sh.roundPill.x + sh.roundPill.w / 2, sh.roundPill.y + 16, font(400, T.scaled('label', S), 'sans'), c.fg2, { align: 'center' });

    // 血条 + 连胜（数字双编码）
    const cap = Math.max(snap.roundMax, 1);
    d.bar(ctx, sh.playerBar.x, sh.playerBar.y, sh.playerBar.w, sh.playerBar.h, snap.playerHits / cap, c.barPlayer, c.track, c.lineSoft, 6);
    d.bar(ctx, sh.rivalBar.x, sh.rivalBar.y, sh.rivalBar.w, sh.rivalBar.h, snap.tigerHits / cap, c.barRival, c.track, c.lineSoft, 6);
    d.text(ctx, `我 ${snap.playerHits}`, sh.playerLabel.x, sh.playerLabel.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
    d.text(ctx, `诗童 ${snap.tigerHits}`, sh.rivalLabel.x, sh.rivalLabel.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
    for (let i = 0; i < 3; i++) {
      const filled = i < Math.min(snap.combo, 3);
      ctx.beginPath();
      ctx.arc(sh.comboDots.x + i * (sh.comboDots.size + sh.comboDots.gap) + 5, sh.comboDots.y + 5, 5, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = c.reward; ctx.fill(); }
      // 2026-11-19 UI 评审 D：空心圈原来与实心圈同色描边，语义不清（看不出连到第几个）
      // → 未连成改为 25% 透明描边，进度一眼可辨
      else { ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(c.reward, 0.25); ctx.stroke(); }
    }
    if (snap.combo >= 3) {
      d.text(ctx, `×${snap.combo}`, sh.comboDots.x + 3 * (sh.comboDots.size + sh.comboDots.gap) + 8, sh.comboDots.y + 5,
        font(600, T.scaled('caption', S), 'sans'), c.fg);
    }

    // 上句区（B3）
    if (mode === 'choice') {
      const tb = b4l.thinBar;
      // 教学局提示行优先（P0-3）：第 1 回合把答案念给玩家听，第 2 回合只给出处，
      // 第 3 回合靠自己——三次体验把「认真句」的规则教完，不用一段说明文字。
      if (snap.tutorial && snap.tutorial.hint && (snap.phase === 'player' || snap.phase === 'playerFeedback')) {
        d.text(ctx, snap.tutorial.hint, tb.x, tb.y + 11, font(400, 20, 'sans'), c.secondary, { maxW: tb.w });
      } else if (snap.phase === 'aiThink') {
        const dots = '.'.repeat(1 + Math.floor(snap.phaseT / 0.2) % 3);
        d.text(ctx, '诗童 沉吟中' + dots, tb.x, tb.y + 11, font(400, 22, 'sans'), c.fg2, { maxW: tb.w });
      } else if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiPlay') {
        const rev = snap.revenge && !snap.revenge.avenged;
        d.text(ctx, (rev ? '【仇册】诗童 · ' : '诗童 · ') + snap.feedback.text, tb.x, tb.y + 11,
          font(400, 22, 'sans'), rev ? c.danger : c.fg2, { maxW: tb.w });
      } else if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiFail') {
        d.text(ctx, '诗童 没接上', tb.x, tb.y + 11, font(400, 22, 'sans'), c.success, { maxW: tb.w });
      } else if (lastShown) {
        // 悬着的雪耻回合：上一拍诗童甩了你的错句，提示持续可见直到你接上
        const rev = snap.revenge && !snap.revenge.avenged;
        d.text(ctx, (rev ? '【仇册】诗童 · ' : '诗童 · ') + lastShown, tb.x, tb.y + 11,
          font(400, 22, 'sans'), rev ? c.danger : c.fg2, { maxW: tb.w });
      }
    } else {
      const lb = sh.lastBar;
      // 2026-11-18 玩法可读性改版：字块模式出句条改为「接令提示区」——
      // 原「诗童出句/尚未出句」不传达规则，用户不知道该拼什么（真机反馈）。
      // 第一行固定规则；第二行：决策期显示目标提示（简单档=目标句全文可照拼，
      // 普通档=作者《诗题》），诗童出句/接句动态仅在 ai 阶段占第二行。
      d.text(ctx, `本令需含「${snap.keyword}」字`, lb.x + 16, lb.y + 17,
        font(400, T.scaled('caption', S), 'sans'), c.fg2);
      let lineTxt = '', lineCol = c.fg2;
      if (snap.phase === 'aiThink') {
        lineTxt = '诗童 沉吟中' + '.'.repeat(1 + Math.floor(snap.phaseT / 0.2) % 3);
      } else if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiPlay') {
        lineTxt = (snap.revenge && !snap.revenge.avenged ? '【仇册】诗童接：' : '诗童接：') + snap.feedback.text;
        if (snap.revenge && !snap.revenge.avenged) lineCol = c.danger;
      } else if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiFail') {
        lineTxt = '诗童没接上'; lineCol = c.success;
      } else if (snap.blocks) {
        // 2026-11-18 用户反馈：简单档直接给目标句全文=把答案写出来，不合适。
        // 两档统一只给「作者《诗题》」——玩家自己想起名句才有游戏性。
        const p = snap.blocks.src ? snap.blocks.src.split('|') : [];
        if (p[1] && p[0]) {
          lineTxt = '提示：' + p[1] + '《' + p[0] + '》';
        } else {
          lineTxt = '拼出含「' + snap.keyword + '」的诗句';
        }
        lineCol = c.fg;
      } else {
        lineTxt = '准备中';
      }
      // 2026-11-19 UI 评审 B：长书名固定 28px 会中途省略成《汉江临泛…》（真机截图实锤）
      // → 三档自适应降字号（28→24→20），全 fit 才采用；仍超宽才在最小字号下省略兜底
      let hintFs = T.scaled('bodyS', S);
      if (d.textWidth(ctx, lineTxt, font(400, hintFs, 'serif')) > lb.w - 32) {
        hintFs = [24, 20].find(fs => d.textWidth(ctx, lineTxt, font(400, fs, 'serif')) <= lb.w - 32) || 20;
      }
      d.text(ctx, lineTxt, lb.x + 16, lb.y + lb.h - 17, font(400, hintFs, 'serif'), lineCol, { maxW: lb.w - 32 });
    }

    // B4 分模式动态
    if (mode === 'blocks') drawBlocks(ctx, snap, S, c); else drawChoice(ctx, snap, S, c);

    // 判定反馈 ✓/✕（仅反馈相位）
    if (snap.feedback && (snap.phase === 'playerFeedback')) {
      const ok = snap.feedback.kind === 'pass';
      const mark = ok ? '✓' : '✕';
      const col = ok ? c.success : c.danger;
      // 2026-11-18：超时没有 pos（不是某张卡答错），不能把 ✕ 标到第 1 张卡上
      if (mode === 'choice' && snap.feedback.pos != null) {
        const cd = b4l.cards[snap.feedback.pos];
        d.text(ctx, mark, cd.x + cd.w - 28, cd.y + 44, font(700, 32, 'sans'), col, { align: 'center' });
      }
      // 浮字：朱批红 '+1' / 雪耻金 '+2'（du.base 上浮 40px 淡出）
      if (ok && floatFx) {
        const p = floatFx.t / 0.8;
        ctx.globalAlpha = 1 - p;
        const rev2 = floatFx.text === '+2';
        d.text(ctx, floatFx.text || '+1', floatFx.x, floatFx.y - 40 * p, font(700, rev2 ? 32 : 28, 'serif'), rev2 ? c.gold : c.primary, { align: 'center' });
        ctx.globalAlpha = 1;
      }
    }
    // 错因 pill：自带 1.6s 计时，不再受反馈相位门控（原 fail 相位结束转 aiThink 后
    // pill 被连带隐藏——玩家还没看清「这句用过了」就消失，玩法困惑来源之一）
    if (pillT >= 0 && snap.feedback && snap.feedback.kind === 'fail') {
      {
        const ep = b4l.errorPill;
        const slide = Math.min(pillT / (T.du.fast / 1000), 1);
        const y = ep.fromY + (ep.y - ep.fromY) * slide;
        const alpha = pillT > 1.3 ? Math.max(0, 1 - (pillT - 1.3) / 0.3) : 1;
        ctx.globalAlpha = alpha;
        d.rrect(ctx, ep.x, y, ep.w, ep.h, ep.r);
        ctx.fillStyle = hexA(c.danger, 0.08); ctx.fill();
        d.text(ctx, reasonTextOf(snap.feedback.reason, snap.keyword), ep.x + ep.w / 2, y + ep.h / 2,
          font(600, 22, 'sans'), c.danger, { align: 'center' });
        ctx.globalAlpha = 1;
      }
    }

    // 教学局贴士 pill（接对后 1.6s，复用错因 pill 的几何位置，竹绿 → 不新增版面）
    if (pillT >= 0 && snap.tutorial && snap.tutorial.tip && snap.feedback && snap.feedback.kind === 'pass') {
      const ep = b4l.errorPill;
      const slide = Math.min(pillT / (T.du.fast / 1000), 1);
      const y = ep.fromY + (ep.y - ep.fromY) * slide;
      const alpha = pillT > 1.3 ? Math.max(0, 1 - (pillT - 1.3) / 0.3) : 1;
      ctx.globalAlpha = alpha;
      d.rrect(ctx, ep.x, y, ep.w, ep.h, ep.r);
      ctx.fillStyle = hexA(c.success, 0.10); ctx.fill();
      d.text(ctx, snap.tutorial.tip, ep.x + ep.w / 2, y + ep.h / 2,
        font(600, 20, 'sans'), c.success, { align: 'center', maxW: ep.w - 16 });
      ctx.globalAlpha = 1;
    }

    // 雪耻 pill（反杀成功后 1.6s，复用错因 pill 几何位，金色——收藏/成就语义色）
    if (pillT >= 0 && snap.feedback && snap.feedback.kind === 'pass' && snap.feedback.revenge) {
      const ep = b4l.errorPill;
      const slide = Math.min(pillT / (T.du.fast / 1000), 1);
      const y = ep.fromY + (ep.y - ep.fromY) * slide;
      const alpha = pillT > 1.3 ? Math.max(0, 1 - (pillT - 1.3) / 0.3) : 1;
      ctx.globalAlpha = alpha;
      d.rrect(ctx, ep.x, y, ep.w, ep.h, ep.r);
      ctx.fillStyle = hexA(c.gold, 0.12); ctx.fill();
      d.text(ctx, '雪耻！这句从此翻篇 · 得分翻倍', ep.x + ep.w / 2, y + ep.h / 2,
        font(600, 20, 'sans'), c.gold, { align: 'center', maxW: ep.w - 16 });
      ctx.globalAlpha = 1;
    }

    // 展示①：朱批笔触（clip 揭开烘焙层）+ 印章盖下 + 墨渍晕开 + 已定格烙印
    if (strokeFx && strokeFx.stroke) {
      const p = Math.min(strokeFx.t / 0.26, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(strokeFx.x - 2, strokeFx.y - 6, strokeFx.w * p + 6, strokeFx.h + 12);
      ctx.clip();
      ctx.drawImage(strokeFx.stroke, strokeFx.x, strokeFx.y, strokeFx.w, strokeFx.h);
      ctx.restore();
    }
    if (strokeFx && strokeFx.seal && strokeFx.t >= 0.26) {
      const sp = Math.min((strokeFx.t - 0.26) / 0.2, 1);
      const back = 1 + 2.70158 * Math.pow(sp - 1, 3) + 1.70158 * Math.pow(sp - 1, 2); // easeOutBack 过冲
      const size = 56 * Math.max(0.2, 1.6 - 0.6 * back);
      ctx.save();
      ctx.globalAlpha = Math.min(1, sp * 2.5);
      ctx.translate(strokeFx.sealX + 28, strokeFx.sealY + 28);
      ctx.rotate(-0.105 * sp);   // 随盖下转 -6°
      ctx.drawImage(strokeFx.seal, -size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (blotFx) drawBlot(ctx, blotFx.x, blotFx.y, Math.min(blotFx.t / 0.6, 1), false);
    for (let i = 0; i < settledFx.length; i++) {
      const fx = settledFx[i];
      if (fx.seal) ctx.drawImage(fx.seal, fx.x, fx.y, 56, 56);
      else if (fx.blot) drawBlot(ctx, fx.blot.x, fx.blot.y, 1, true);
    }

    // 池空弹条（决策层兜底）
    if (snap.phase === 'poolEmpty') {
      const y = app.info.H / 2 - 60;
      d.rrect(ctx, 12, y, app.info.W - 24, 64, 14);
      ctx.fillStyle = c.surface; ctx.fill();
      ctx.lineWidth = T.st.thin; ctx.strokeStyle = c.lineStrong; ctx.stroke();
      d.text(ctx, `此令已尽，换「${snap.suggestKeyword || '月'}」`, app.info.W / 2, y + 22,
        font(600, 24, 'serif'), c.fg, { align: 'center' });
      d.text(ctx, '点按任意处继续', app.info.W / 2, y + 46, font(400, 18, 'sans'), c.fg2, { align: 'center' });
    }

    // 按下态 tint
    if (pressed) {
      const r = rectOf(pressed.id, b4l);
      if (r) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    }
    if (shake) ctx.restore();
  }

  /** 失手墨渍：radial 渐变晕开；Proxy/无渐变环境扁平兜底（residue = 定格残渍） */
  function drawBlot(ctx, x, y, p, residue) {
    const r = 4 + 8 * p;
    const a = residue ? 0.10 : 0.80 - 0.55 * p;
    let grad = null;
    try {
      if (typeof ctx.createRadialGradient === 'function') grad = ctx.createRadialGradient(x, y, 1, x, y, r);
    } catch (e) { grad = null; }
    if (grad && typeof grad.addColorStop === 'function') {
      grad.addColorStop(0, 'rgba(43,35,29,' + a.toFixed(3) + ')');
      grad.addColorStop(0.75, 'rgba(43,35,29,' + (a * 0.55).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(43,35,29,0)');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = 'rgba(43,35,29,' + (a * 0.6).toFixed(3) + ')';
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (!residue) {
      // 偏心小圆：不规则墨缘
      ctx.beginPath(); ctx.arc(x + r * 0.45, y + r * 0.3, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(43,35,29,' + (a * 0.7).toFixed(3) + ')'; ctx.fill();
    }
  }

  // 字块拼句动态：已选字预览 + 已用块置灰 + 按钮状态
  function drawBlocks(ctx, snap, S, c) {
    const b = b4();
    // 预览条
    const target = snap.blocks ? snap.blocks.sentence.length : 5;
    let px = b.preview.x + 16;
    for (let i = 0; i < target; i++) {
      const ch = i < seq.length ? snap.blocks.blocks[seq[i]].char : '▢';
      d.text(ctx, ch, px, b.preview.y + 28, font(600, T.scaled('h2', S), 'serif'),
        i < seq.length ? c.fg : c.disabled);
      px += T.scaled('h2', S) + 10;
    }
    // 已用块置灰（覆盖烘焙的常态块）
    const usedSet = new Set(seq);
    snap.blocks && snap.blocks.blocks.forEach((blk, i) => {
      if (!usedSet.has(i)) return;
      const cell = b.cells[i];
      d.rrect(ctx, cell.vis.x, cell.vis.y, cell.vis.w, cell.vis.h, cell.vis.r);
      ctx.fillStyle = 'rgba(43,35,29,0.06)'; ctx.fill();
      ctx.lineWidth = T.st.hair; ctx.strokeStyle = c.lineSoft; ctx.stroke();
      d.text(ctx, blk.char, cell.x + cell.w / 2, cell.vis.y + cell.vis.h / 2, font(600, T.scaled('h2', S), 'serif'), c.disabled, { align: 'center' });
    });
    // 按钮态
    const canSubmit = seq.length === target;
    drawBtn(ctx, b.undoBtn, '撤销', seq.length ? c.secondary : c.disabled, c.surface, seq.length > 0, c);
    drawBtn(ctx, b.clearBtn, '清空', seq.length ? c.secondary : c.disabled, c.surface, seq.length > 0, c);
    // 提交：渐变主按钮，禁用填 track
    const sb = b.submitBtn;
    if (canSubmit && snap.phase === 'player') {
      d.shadow(ctx, sb.x, sb.y, sb.w, sb.h, sb.r, 2, c);
      // 2026-11-18 修复：原 submitGrad() 在离屏 L0 的 ctx 上创建渐变、却在主画布 ctx
      // 使用——跨上下文 CanvasGradient 真机失效，fillStyle 赋值无效沿用上一笔深灰，
      // 可提交态看起来仍是深灰不可点。改为在当前 ctx 即时创建（makeVGrad 自带纯色兜底）。
      // 2026-11-18 用户指定：主按钮色由朱砂改为翠绿（successGrad），与令字印章朱砂区分。
      d.gradBtn(ctx, d.makeVGrad(ctx, sb.x, sb.y, sb.y + sb.h, c.successGrad[0], c.successGrad[1]), sb.x, sb.y, sb.w, sb.h, sb.r);
      ctx.lineWidth = T.st.thin; ctx.strokeStyle = c.success; d.rrect(ctx, sb.x, sb.y, sb.w, sb.h, sb.r); ctx.stroke();
      d.text(ctx, '提交', sb.x + sb.w / 2, sb.y + 44, font(600, T.scaled('h2', S), 'serif'), c.onBrand, { align: 'center' });
    } else {
      d.rrect(ctx, sb.x, sb.y, sb.w, sb.h, sb.r);
      ctx.fillStyle = c.track; ctx.fill();
      d.text(ctx, '提交', sb.x + sb.w / 2, sb.y + 44, font(600, T.scaled('h2', S), 'serif'), c.disabled, { align: 'center' });
    }
  }
  function drawBtn(ctx, box, label, color, fill, enabled, c) {
    d.rrect(ctx, box.x, box.y, box.w, box.h, box.r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = T.st.thin; ctx.strokeStyle = enabled ? color : c.disabled; ctx.stroke();
    d.text(ctx, label, box.x + box.w / 2, box.y + 44, font(600, T.scaled('h2', app.settings.fontScale), 'serif'), enabled ? color : c.disabled, { align: 'center' });
  }

  // 点选接句动态：候选句文字 + 关键字预高亮 + 干扰项揭示 + 「已用」角标
  function drawChoice(ctx, snap, S, c) {
    const b = b4();
    if (!snap.candidates) return;
    // 2026-11-18：非玩家回合（reveal/aiThink/aiFeedback）选项整体置灰——
    // 用户问「诗童思考时我是否还能选择」：不能，这是诗童的回合；置灰让规则可见
    const dim = snap.phase !== 'player' && snap.phase !== 'playerFeedback';
    if (dim) ctx.globalAlpha = 0.45;
    snap.candidates.forEach((opt, i) => {
      const cd = b.cards[i];
      if (!cd) return;
      // 判定中/反馈蒙版
      if (snap.phase === 'playerFeedback' && snap.feedback.pos === i) {
        d.rrect(ctx, cd.x, cd.y, cd.w, cd.h, cd.r);
        ctx.fillStyle = 'rgba(255,249,236,0.72)'; ctx.fill();
      }
      // 序号（二次改版：实色圆 + 反白数字）
      ctx.beginPath(); ctx.arc(cd.num.x, cd.num.y, cd.num.r, 0, Math.PI * 2);
      ctx.fillStyle = c.secondary; ctx.fill();
      d.text(ctx, String(i + 1), cd.num.x, cd.num.y + 1, font(600, T.scaled('label', S), 'sans'), c.onBrand, { align: 'center' });
      // 句子：单行省略号（2026-11-18 用户反馈：关键字不刻意标红，整句统一色）
      drawSentence(ctx, opt.text, cd, snap.keyword, S, c);
    });
    if (dim) ctx.globalAlpha = 1;
  }
  function drawSentence(ctx, text, cd, keyword, S, c) {
    const f = font(600, T.scaled('h2', S), 'serif');
    const maxW = cd.text.w;
    const w = d.textWidth(ctx, text, f);
    let shown = text;
    if (w > maxW) shown = d.truncate(ctx, text, f, maxW - 2);
    // 2026-11-18 用户反馈：包含的关键字不刻意标红——印章已表明令字，整句统一墨色更干净
    d.text(ctx, shown, cd.text.x, cd.y + 44, f, c.fg);
    void keyword;
  }

  function tigerState(snap) {
    if (snap.phase === 'playerFeedback' && snap.feedback) {
      if (snap.feedback.kind === 'pass') return snap.combo >= 3 ? 'cheer' : 'clap';
      return 'facepalm';
    }
    if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiFail') return 'cheer';
    if (snap.phase === 'poolEmpty') return 'idle';
    return 'idle';
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------- 交互 ----------------
  function rectOf(id, b4l) {
    const sh = shared();
    const map = { 'battle.back': sh.back.hot };
    if (mode === 'blocks') {
      map['battle.undo'] = [b4l.undoBtn.x, b4l.undoBtn.y, b4l.undoBtn.w, b4l.undoBtn.h];
      map['battle.clear'] = [b4l.clearBtn.x, b4l.clearBtn.y, b4l.clearBtn.w, b4l.clearBtn.h];
      map['battle.submit'] = [b4l.submitBtn.x, b4l.submitBtn.y, b4l.submitBtn.w, b4l.submitBtn.h];
      const snap = match.snapshot();
      if (snap.blocks) snap.blocks.blocks.forEach((blk, i) => { map['battle.cell.' + i] = [b4l.cells[i].x, b4l.cells[i].y, b4l.cells[i].w, b4l.cells[i].h]; });
    } else {
      b4l.cards.forEach((cd, i) => { map['battle.card.' + i] = [cd.x, cd.y, cd.w, cd.h]; });
    }
    return map[id] || null;
  }
  function hitTest(x, y) {
    const sh = shared();
    // 返回热区在上方优先（列表顺序遮挡）
    for (const h of self.hotRects) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    // 池空弹条全屏可点
    if (match.phase === 'poolEmpty') return 'battle.poolContinue';
    return null;
  }

  self.touch = function (phase, x, y) {
    if (phase === 'start') {
      const hit = hitTest(x, y);
      if (hit && hit.indexOf('pet.') === 0) { pressDown = hit; return; } // pet 不做黑罩 tint
      if (hit && hit !== 'battle.poolContinue') { pressed = { id: hit, t: 0.12 }; pressDown = hit; }
      return;
    }
    const hit = hitTest(x, y);
    const was = pressDown;
    pressDown = null;
    pressed = null;
    if (!hit || hit !== was) return;
    if (hit.indexOf('pet.') === 0) {
      // 2026-11-20 触摸互动：摸头/爪 → 动画 + 萌音 + 埋点（任何相位都可摸，抢答期也无妨）
      const zone = hit.slice(4);
      if (pet.trigger(zone)) {
        sound.play(zone === 'head' ? 'purr' : 'chirp');
        track.track('fhl_pet', { zone: zone === 'head' ? 1 : 4, scr: 2 });
      }
      return;
    }
    const snap = match.snapshot();
    if (hit === 'battle.back') {
      // 埋点 fhl_exit（主动退出对局）
      track.track('fhl_exit', { from: 1, round: Math.min(match.roundSeq + 1, match.cfg.roundMax) });
      app.goto('home', {});
      return;
    }
    if (snap.phase === 'poolEmpty') { match.confirmSwitch(); return; }
    if (snap.phase !== 'player') return; // 决策期外禁点
    // 落子音：字块点选 / 卡片点选 / 撤销 / 清空 / 提交，同一轻响（不区分，避免决策期音效干扰）
    if (hit === 'battle.undo') { seq.pop(); sound.play('pick'); return; }
    if (hit === 'battle.clear') { seq = []; sound.play('pick'); return; }
    if (hit.startsWith('battle.cell.')) {
      const i = +hit.split('.')[2];
      const at = seq.indexOf(i);
      if (at >= 0) seq.splice(at, 1); // 再点已选块取消选择
      else if (seq.length < snap.blocks.sentence.length) seq.push(i);
      sound.play('pick');
      return;
    }
    if (hit === 'battle.submit') {
      const text = seq.map(i => snap.blocks.blocks[i].char).join('');
      const r = match.submitBlocksText(text);
      if (!r.pass) seq = []; // 失败清空待重拼
      _afterJudge();         // 真机时序：相位已在 touch 回调内切换，必须就地触发反馈
      return;
    }
    if (hit.startsWith('battle.card.')) {
      match.submitChoice(+hit.split('.')[2]);
      // 点卡即判定：直接播 pass/fail 反馈音（不再叠落子音，两音连播会糊）
      _afterJudge();
      return;
    }
  };

  // ---------------- 静态层烘焙 ----------------
  // 烘焙失败不致命：L0=null 走 drawBaked 直绘兜底
  function bake() {
    try { bakeImpl(); } catch (e) { L0 = null; console.error('[fhl] 对局页烘焙失败，已降级直绘:', e && (e.stack || e.message) || e); }
  }
  function bakeImpl() {
    const { c } = app.tokens;
    const S = app.settings.fontScale;
    const W = app.info.W, H = app.info.H;
    const sh = shared();
    L = sh;
    L._b4 = b4();
    const snap = match.snapshot();
    const hot = [];
    hot.push({ id: 'battle.back', x: sh.back.hot[0], y: sh.back.hot[1], w: sh.back.hot[2], h: sh.back.hot[3] });
    if (mode === 'blocks' && snap.blocks) {
      snap.blocks.blocks.forEach((blk, i) => {
        const cell = L._b4.cells[i];
        hot.push({ id: 'battle.cell.' + i, x: cell.x, y: cell.y, w: cell.w, h: cell.h });
      });
      ['undo', 'clear', 'submit'].forEach(n => {
        const box = L._b4[n + 'Btn'];
        hot.push({ id: 'battle.' + n, x: box.x, y: box.y, w: box.w, h: box.h });
      });
    } else if (mode === 'choice' && snap.candidates) {
      L._b4.cards.forEach((cd, i) => hot.push({ id: 'battle.card.' + i, x: cd.x, y: cd.y, w: cd.w, h: cd.h }));
    }
    // 2026-11-20 触摸互动：半身像 头/爪 两区追加末尾（决策热区优先；任何相位都可摸）
    hot.push(...pet.petZones('bust', sh.bustWin));
    self.hotRects = hot;

    L0 = platform.createOffscreen(Math.round(W * app.info.dpr), Math.round(H * app.info.dpr));
    if (!L0) return;
    const g = L0.getContext('2d');
    if (!g || typeof g.fillRect !== 'function' || typeof g.createLinearGradient !== 'function') { L0 = null; return; }
    g.setTransform(app.info.dpr, 0, 0, app.info.dpr, 0, 0);
    drawStatic(g);
  }

  // 静态内容：烘焙层与整屏直绘兜底共用（离屏不可用时对局页才不会只剩小虎）
  function drawStatic(g) {
    const { c } = app.tokens;
    const S = app.settings.fontScale;
    const W = app.info.W, H = app.info.H;
    const sh = shared();
    const snap = match.snapshot();
    // 背景
    const grad = d.makeVGrad(g, 0, 0, H, c.bg, c.bgEnd);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // 展示②（§4.22）：氛围底——纸纹 + 陈年茶渍（只进静态烘焙；battle 决策期零干扰红线，
    // 粒子/烛光呼吸等动态氛围只上 home/result）
    ink.bakePaperTexture(g, W, H, 1.0);
    ink.bakeTeaStains(g, W, H);
    // B1 返回
    g.beginPath(); g.arc(sh.back.x, sh.back.y, sh.back.r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(43,35,29,0.06)'; g.fill();
    d.text(g, '‹', sh.back.x, sh.back.y + 2, font(400, 32, 'sans'), c.fg, { align: 'center' });
    // B1 回合 pill
    d.rrect(g, sh.roundPill.x, sh.roundPill.y, sh.roundPill.w, sh.roundPill.h, sh.roundPill.r);
    g.fillStyle = c.surfaceAlt; g.fill();
    // B2 关键字印章卡（二次改版：真印章质感——朱砂渐变底 + 白字）
    const sc = sh.sealCard;
    d.shadow(g, sc.x, sc.y, sc.w, sc.h, sc.r, 2, c);
    d.rrect(g, sc.x, sc.y, sc.w, sc.h, sc.r);
    const sealGrad = d.makeVGrad(g, sc.x, sc.y, sc.y + sc.h, c.primaryGrad[0], c.primaryGrad[1]);
    g.fillStyle = sealGrad; g.fill();
    g.lineWidth = T.st.mid; g.strokeStyle = c.primaryGrad[1]; g.stroke();
    d.rrect(g, sc.inner.x, sc.inner.y, sc.inner.w, sc.inner.h, sc.inner.r);
    g.lineWidth = T.st.hair; g.strokeStyle = 'rgba(255,249,236,0.45)'; g.stroke();
    d.text(g, snap.keyword, sh.keyword.cx, sh.keyword.mid, font(700, T.fs.keyword, 'serif'), c.onBrand, { align: 'center' });
    // B3 上句条（blocks 模式画框；choice 模式只有细字条）
    if (mode === 'blocks') {
      const lb = sh.lastBar;
      d.rrect(g, lb.x, lb.y, lb.w, lb.h, lb.r); g.fillStyle = c.surfaceAlt; g.fill();
    }
    // B4 静态框架
    if (mode === 'blocks') {
      const b = L._b4;
      d.rrect(g, b.preview.x, b.preview.y, b.preview.w, b.preview.h, b.preview.r);
      g.fillStyle = c.surfaceAlt; g.fill();
      g.lineWidth = T.st.hair; g.strokeStyle = c.lineSoft; g.stroke();
      // 全部字块按未用态烘焙
      if (snap.blocks) {
        snap.blocks.blocks.forEach((blk, i) => {
          const cell = b.cells[i];
          if (!cell) return;
          d.shadow(g, cell.vis.x, cell.vis.y, cell.vis.w, cell.vis.h, cell.vis.r, 1, c);
          d.rrect(g, cell.vis.x, cell.vis.y, cell.vis.w, cell.vis.h, cell.vis.r);
          g.fillStyle = c.surface; g.fill();
          g.lineWidth = T.st.thin; g.strokeStyle = c.lineStrong; g.stroke();
          d.text(g, blk.char, cell.x + cell.w / 2, cell.vis.y + cell.vis.h / 2, font(600, T.scaled('h2', S), 'serif'), c.fg, { align: 'center' });
        });
      }
    } else {
      const b = L._b4;
      b.cards.forEach((cd) => {
        d.shadow(g, cd.x, cd.y, cd.w, cd.h, cd.r, 1, c);
        d.rrect(g, cd.x, cd.y, cd.w, cd.h, cd.r);
        g.fillStyle = c.surface; g.fill();
        g.lineWidth = T.st.thin; g.strokeStyle = c.lineStrong; g.stroke();
      });
    }
  }

  return self;
}

// shakeOffset 为纯函数，仅导出给回归测试锁定"一次冲击、无横向往复"的形状不变量
module.exports = { BattleScreen, REASON_TEXT, reasonTextOf, shakeOffset };

});
__reg("js/ui/screens/result.js", function (module, exports, require) {
'use strict';
/**
 * 结算页（10_ui_spec.md §5）
 * L0 静态层：背景（偏亮 4%）+ 回顾卡框 + 按钮框架
 * L1 每帧：小虎全身立绘（胜 cheer / 负 facepalm / 和 idle）
 * L2 每帧：结果字入场动画（alpha 0→1 + y+12→0）、副标题、回顾内容、战绩保存失败细条
 */
const layout = require('../layout');
const d = require('../draw');
const { font, T } = require('../tokens');
const tiger = require('../tiger');
const ink = require('../ink');
const platform = require('../../platform');
const store = require('../../app/store');
const track = require('../../app/track');
const sound = require('../../app/sound');
const pet = require('../pet').create();

function ResultScreen(app, params) {
  const outcome = (params && params.outcome) || { result: 'draw', stats: { hits: 0, tigerHits: 0, maxCombo: 0, avgReact: 0, rounds: 0, keyword: '花' } };
  const lastPlayer = (params && params.lastPlayerLine) || '';
  const lastTiger = (params && params.lastTigerLine) || '';
  // 教学局（P0-3）：文案与主按钮都换成「继续对诗」，把玩家直接送进正式对局，而不是回到首页重新选择
  const tutorial = !!outcome.tutorial;

  let L = null; let L0 = null;
  let pressed = null;     // 按下视觉 tint
  let pressDown = null;   // 按下热区 id（持续到 touchend——修复慢点按无响应）
  let enterT = 0;         // 入场动画计时
  let warnT = -1;         // 战绩未保存细条
  let saved = true;
  let toast = null;

  // 判胜负原因（2026-11-18 用户「判胜负怎么判断的看不明白」）：
  const MAP = {
    win: { char: '胜', color: c => c.primary, state: 'cheer' },
    loss: { char: '负', color: c => c.danger, state: 'facepalm' },
    draw: { char: '和', color: c => c.success, state: 'idle' },
  };
  const m = MAP[outcome.result] || MAP.draw;
  function reasonText() {
    const s = outcome.stats;
    const REASON = {
      roundsFull: `${s.rounds || 12} 回合满 · 接对多者胜`,
      playerTimeout: '决策超时 · 判负',
      aiExhausted: '诗童接不上 · 判胜',
      poolExhausted: '诗句用尽 · 判胜',
    };
    return REASON[outcome.reason] || '';
  }
  function shareTitle() {
    const s = outcome.stats;
    // 2026-11-18：原文案「赢了对决/等你来复仇/等你来挑战 →」含竞技挑衅与引导点击符号，
    // 有触发平台「诱导分享」风控的风险 → 改为中性描述
    const verb = outcome.result === 'win' ? '占得先机' : outcome.result === 'loss' ? '略逊一筹' : '战成平手';
    return `飞花令对诗：我接对 ${s.hits || 0} 句，${verb}`;
  }

  const self = {
    id: 'result', hotRects: [],
    enter() {
      saved = store.applyOutcome(outcome);
      if (!saved) warnT = 2;
      build();
    },
    leave() { pet.reset(); },
    invalidate: build,
    update(dt) {
      pet.update(dt);
      enterT += dt;
      if (warnT > 0) { warnT -= dt; if (warnT <= 0) warnT = -1; }
      if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
      if (pressed) { pressed.t -= dt; if (pressed.t <= 0) pressed = null; }
    },
    draw(ctx, t) {
      const { c } = app.tokens;
      const S = app.settings.fontScale;
      const baked = d.drawBaked(ctx, L0, app.info.W, app.info.H, [c.bg, c.bgEnd]);
      if (!L) return; // 烘焙失败时跳过动态层，避免空引用连环炸
      if (!baked) { L0 = null; try { drawStatic(ctx); } catch (e) { /* 直绘兜底失败不阻断动态层 */ } }
      const st = app.settings.reduceMotion ? 0.5 : t;
      // 2026-11-20 触摸互动：小虎绘制包 offset（摸头摇头/摸肚摇摆/摸脚弹跳）
      const tg2 = L.tiger;
      const petOff = pet.offset();
      ctx.save();
      const pivX2 = tg2.x + 400 * tg2.scale / 2, pivY2 = tg2.y + 560 * tg2.scale;
      ctx.translate(pivX2 + petOff.dx, pivY2 + petOff.dy);
      ctx.rotate(petOff.rot);
      if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
      ctx.translate(-pivX2, -pivY2);
      tiger.fullBody(ctx, { cx: L.tiger.x + 400 * L.tiger.scale / 2, y0: L.tiger.y, scale: L.tiger.scale, state: pet.stateOverride() || m.state, t: st });
      ctx.restore();
      pet.draw(ctx);

      // 入场动画（du.slow 420ms：alpha 0→1 + y+12→0；减弱动效只 alpha 180ms）
      const dur = app.settings.reduceMotion ? 0.18 : T.du.slow / 1000;
      const p = Math.min(enterT / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      ctx.save();
      ctx.globalAlpha = ease;
      const dy = app.settings.reduceMotion ? 0 : 12 * (1 - ease);
      // 结果字（96px；「胜」时 2px 金方框，不实底）
      const rc = L.resultChar;
      if (outcome.result === 'win') {
        ctx.lineWidth = 2; ctx.strokeStyle = c.gold;
        ctx.strokeRect(rc.cx - 48.5, rc.mid - 48.5 + dy, 97, 97);
      }
      d.text(ctx, m.char, rc.cx, rc.mid + dy, font(700, T.fs.result, 'serif'), m.color(c), { align: 'center' });
      // 2026-11-19 UI 评审 F：结果字下的装饰短横线，压住大字重心（随胜负同色）
      if (p > 0.6) {
        ctx.globalAlpha = ease * 0.8;
        d.rrect(ctx, L.charLine.x, L.charLine.y + dy, L.charLine.w, L.charLine.h, 2);
        ctx.fillStyle = m.color(c); ctx.fill();
        ctx.globalAlpha = ease;
      }
      // 比分行 + 统计行（2026-11-18 判胜负可读性改版：先给比分，再给明细）
      // 2026-11-18 修复：rounds=0 时「本局未接出诗句」与比分行画在同一 mid 位置直接叠字
      // （真机截图实锤）→ 两者互斥：未接出诗句时不画比分行
      const s = outcome.stats;
      if (tutorial) {
        // 教学局：先肯定"你完成了"，再给比分——第一屏的正反馈不该是冷冰冰的 3:2
        d.text(ctx, `教学局完成 · 你接对 ${s.hits || 0} 句`, L.subtitle.cx, L.subtitle.mid + dy,
          font(600, T.scaled('bodyS', S), 'sans'), c.fg, { align: 'center' });
      } else if (s.rounds === 0) {
        d.text(ctx, '本局未接出诗句', L.subtitle.cx, L.subtitle.mid + dy,
          font(400, T.scaled('bodyS', S), 'sans'), c.fg2, { align: 'center' });
      } else {
        d.text(ctx, `我 ${s.hits || 0} : ${s.tigerHits || 0} 诗童`, L.subtitle.cx, L.subtitle.mid + dy,
          font(600, T.scaled('bodyS', S), 'sans'), c.fg, { align: 'center' });
      }
      // 错句复仇（2026-11-19）：优先展示雪耻；无雪耻且有新错句入册则提示入册数
      let revText = '';
      const rv = s.revenge || {};
      if (rv.kills > 0) revText = ` · 雪耻 ${rv.kills}`;
      else if (rv.newGrudge && rv.newGrudge.length > 0) revText = ` · 入册 ${rv.newGrudge.length}`;
      // 2026-11-20 真机截图二改：首版自适应降字号仍被截（「错…」）——18/16 两档都放不下
      // 全量文案（字数随超时/雪耻/入册浮动到 8 段）。双管齐下：① 文案压缩
      // （最高连对→连对 / 平均→均时 / 错句入册 N 句→入册 N，省 5 个全角位）；
      // ② 兜底档下探 15px；maxW 省略仅作极端兜底。
      const statsText = `接对 ${s.hits || 0} · 连对 ${s.maxCombo || 0} · 均时 ${s.avgReact || '—'}s`
        + (s.timeouts ? ` · 超时 ${s.timeouts}` : '') + revText;
      let statsFs = T.scaled('caption', S);
      if (d.textWidth(ctx, statsText, font(400, statsFs, 'sans')) > app.info.W - 24) {
        statsFs = [18, 16, 15].find(fs => d.textWidth(ctx, statsText, font(400, fs, 'sans')) <= app.info.W - 24) || 15;
      }
      d.text(ctx, statsText, L.subtitle.cx, L.statsMid + dy, font(400, statsFs, 'sans'), c.fg2, { align: 'center', maxW: app.info.W - 24 });
      // 回顾卡内容
      d.seal(ctx, L.miniSeal.x, L.miniSeal.y, L.miniSeal.size, c.primary, 'rgba(255,249,236,0.35)',
        s.keyword, font(600, 38, 'serif'), c.onBrand);
      d.text(ctx, '我', L.rowMe.label.x, L.rowMe.label.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
      d.text(ctx, lastPlayer || '—', L.rowMe.text.x, L.rowMe.text.y + 14, font(400, 24, 'serif'), c.fg, { maxW: L.rowMe.text.w });
      d.text(ctx, '诗童', L.rowTiger.label.x, L.rowTiger.label.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
      d.text(ctx, lastTiger || '—', L.rowTiger.text.x, L.rowTiger.text.y + 14, font(400, 24, 'serif'), c.fg, { maxW: L.rowTiger.text.w });
      // 判定原因行（回顾卡底部）
      const rt = reasonText();
      if (rt) d.text(ctx, '判定：' + rt, L.review.x + L.review.w / 2, L.reasonMid, font(400, T.scaled('caption', S), 'sans'), c.fg2, { align: 'center' });
      // 按钮文字
      // 2026-11-18 修复：三按钮宽 90px 不随字号档缩放，h2 在大字号档（1.5×）
      // 时「回首页」溢出按钮贴屏缘（真机截图）→ 按钮内文字固定 20px（3 字 60px < 可用 78px）
      d.text(ctx, tutorial ? '继续对诗' : '再来一局', L.againBtn.x + L.againBtn.w / 2, L.againBtn.y + 44, font(600, 20, 'serif'), c.onBrand, { align: 'center' });
      d.text(ctx, '分享', L.shareBtn.x + L.shareBtn.w / 2, L.shareBtn.y + 44, font(600, 20, 'serif'), c.secondary, { align: 'center' });
      d.text(ctx, '回首页', L.homeBtn.x + L.homeBtn.w / 2, L.homeBtn.y + 44, font(600, 20, 'serif'), c.secondary, { align: 'center' });
      ctx.restore();

      // 战绩未保存细条
      if (warnT > 0) {
        ctx.fillStyle = 'rgba(201,55,44,0.10)';
        ctx.fillRect(0, app.info.safeTop, app.info.W, 28);
        d.text(ctx, '战绩未保存', app.info.W / 2, app.info.safeTop + 14, font(400, 18, 'sans'), c.danger, { align: 'center' });
      }
      if (toast) {
        // 2026-11-18 修复：toast 原画在 H*0.35，正好压在结算页小虎脸上（真机截图实锤）
        // → 移到按钮行上方，不遮任何元素
        const ty = L.againBtn.y - 60;
        d.pill(ctx, 48, ty, app.info.W - 96, 44, 'rgba(43,35,29,0.78)');
        d.text(ctx, toast.text, app.info.W / 2, ty + 22, font(400, 22, 'sans'), '#FFF9EC', { align: 'center' });
      }
      if (pressed) {
        const r = pressed.id === 'result.again' ? [L.againBtn.x, L.againBtn.y, L.againBtn.w, L.againBtn.h]
          : pressed.id === 'result.share' ? [L.shareBtn.x, L.shareBtn.y, L.shareBtn.w, L.shareBtn.h]
          : [L.homeBtn.x, L.homeBtn.y, L.homeBtn.w, L.homeBtn.h];
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(r[0], r[1], r[2], r[3]);
      }
    },
    touch(phase, x, y) {
      if (phase === 'start') {
        for (const h of self.hotRects) {
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
            // pet.* 不做按下黑罩（2026-11-20 触摸互动）
            if (h.id.indexOf('pet.') !== 0) pressed = { id: h.id, t: 0.12 };
            pressDown = h.id;
            return;
          }
        }
        return;
      }
      const hit = (function () {
        for (const h of self.hotRects) {
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
        }
        return null;
      })();
      const was = pressDown;
      pressDown = null;
      pressed = null;
      if (!hit || hit !== was) return;
      if (hit.indexOf('pet.') === 0) {
        // 2026-11-20 触摸互动：结算页全身立绘 头/肚/脚
        const zone = hit.slice(4);
        if (pet.trigger(zone)) {
          sound.play(zone === 'head' ? 'purr' : zone === 'belly' ? 'giggle' : 'chirp');
          track.track('fhl_pet', { zone: zone === 'head' ? 1 : zone === 'belly' ? 2 : 3, scr: 3 });
        }
        return;
      }
      if (hit === 'result.again') {
        track.track('fhl_again', { tutorial: tutorial ? 1 : 0 });
        if (tutorial) {
          // 教学局结束即视为"教完"——下次进来直接正式对局，不再重复三回合
          store.markTutorialDone();
          app.goto('battle', { mode: 'choice', difficulty: app.settings.difficulty });
        } else {
          app.goto('battle', { mode: outcome.mode || (params && params.mode) || 'choice', difficulty: app.settings.difficulty });
        }
      } else if (hit === 'result.share') {
        // 2026-11-18 修复：wx.shareAppMessage 无结果回调，平台拦截（违规处罚/风控）
        // 时调用方无法感知——不能断言「已唤起」。成功路径静默（转发面板本身就是反馈），
        // 仅在不支持的环境（浏览器预览/无 wx）给提示。
        track.track('fhl_share', { result: outcome.result === 'win' ? 1 : outcome.result === 'loss' ? 2 : 3, hits: (outcome.stats && outcome.stats.hits) || 0 });
        const ok = platform.share({ title: shareTitle() });
        if (!ok) toast = { text: '当前环境不支持转发 · 请真机预览', t: 2.2 };
      } else if (hit === 'result.home') {
        app.goto('home', {});
      }
    },
  };

  // 烘焙失败不致命：L0=null 时 draw() 走整屏直绘兜底（drawStatic）
  function build() {
    try {
      L = layout.result(app.info);
      // 2026-11-20 触摸互动：结算全身立绘 头/肚/脚（按钮热区在前优先命中）
      const tgBox = { x: L.tiger.x, y: L.tiger.y, w: 400 * L.tiger.scale, h: 560 * L.tiger.scale };
      self.hotRects = L.hotRects.concat(pet.petZones('full', tgBox));
      pet.setBox(tgBox);
      L0 = platform.createOffscreen(Math.round(app.info.W * app.info.dpr), Math.round(app.info.H * app.info.dpr));
      if (!L0) return;
      const g = L0.getContext('2d');
      if (!g || typeof g.fillRect !== 'function' || typeof g.createLinearGradient !== 'function') { L0 = null; return; }
      g.setTransform(app.info.dpr, 0, 0, app.info.dpr, 0, 0);
      drawStatic(g);
    } catch (e) {
      L0 = null;
      console.error('[fhl] 结算页烘焙失败，已降级直绘:', e && (e.stack || e.message) || e);
    }
  }

  // 静态内容：烘焙层与整屏直绘兜底共用
  function drawStatic(g) {
    const { c } = app.tokens;
    const W = app.info.W, H = app.info.H;
    // S-01 背景：亮色用偏亮 4% 变体，暗色走 token（F4 修复，禁硬编码亮底）
    const bg0 = app.tokens.dark ? c.bg : '#FFFBF2';
    const bg1 = app.tokens.dark ? c.bgEnd : '#F9F0DD';
    g.fillStyle = d.makeVGrad(g, 0, 0, H, bg0, bg1);
    g.fillRect(0, 0, W, H);
    // 展示②（§4.22）：氛围底——纸纹 + 茶渍（静态烘焙，零每帧成本）
    ink.bakePaperTexture(g, W, H, 0.8);
    ink.bakeTeaStains(g, W, H);
    // S-05 回顾卡
    const rv = L.review;
    d.shadow(g, rv.x, rv.y, rv.w, rv.h, rv.r, 1, c);
    d.rrect(g, rv.x, rv.y, rv.w, rv.h, rv.r);
    g.fillStyle = c.surface; g.fill(); // F3：原 app.tokens.c.surface 为 undefined，导致继承阴影色
    g.lineWidth = T.st.hair; g.strokeStyle = c.lineSoft; g.stroke();
    // S-09 再来一局（主按钮渐变）
    const a = L.againBtn;
    d.shadow(g, a.x, a.y, a.w, a.h, a.r, 2, c);
    d.gradBtn(g, d.makeVGrad(g, a.x, a.y, a.y + a.h, c.primaryGrad[0], c.primaryGrad[1]), a.x, a.y, a.w, a.h, a.r);
    g.lineWidth = T.st.thin; g.strokeStyle = c.lineStrong; d.rrect(g, a.x, a.y, a.w, a.h, a.r); g.stroke();
    // S-10 分享（次按钮）
    const sh = L.shareBtn;
    d.rrect(g, sh.x, sh.y, sh.w, sh.h, sh.r);
    g.fillStyle = c.surface; g.fill();
    g.lineWidth = T.st.thin; g.strokeStyle = c.secondary; g.stroke();
    // S-10 回首页
    const h2 = L.homeBtn;
    d.rrect(g, h2.x, h2.y, h2.w, h2.h, h2.r);
    g.fillStyle = c.surface; g.fill(); // F3：同上，回首页卡底色
    g.lineWidth = T.st.thin; g.strokeStyle = c.secondary; g.stroke();
  }

  return self;
}

module.exports = { ResultScreen };

});
__reg("game.js", function (module, exports, require) {
'use strict';
/**
 * 飞花令 v0.1 · 微信小游戏入口
 * 主循环：update(dt) → draw。场景：home ↔ battle ↔ result。
 * 画布：canvas.width = screenW*dpr，ctx.scale(dpr,dpr)，全部按 375 基准逻辑 px 绘制。
 * 触摸：wx.onTouchStart/End 为逻辑 px，直接与 hotRects 比对。
 */
const platform = require('./js/platform');
const { resolveTokens, T } = require('./js/ui/tokens');
const { HomeScreen } = require('./js/ui/screens/home');
const { BattleScreen } = require('./js/ui/screens/battle');
const { ResultScreen } = require('./js/ui/screens/result');
const store = require('./js/app/store');
const sound = require('./js/app/sound');
const track = require('./js/app/track');

// ---------- 初始化 ----------
const canvas = platform.createMainCanvas();
const info = platform.screenInfo();
canvas.width = Math.round(info.W * info.dpr);
canvas.height = Math.round(info.H * info.dpr);
const ctx = canvas.getContext('2d');

// 暗色跟随（auto 时监听系统）
let systemDark = false;
if (platform.isWx && wx.getSystemInfoSync) {
  try { systemDark = wx.getSystemInfoSync().theme === 'dark'; } catch (e) { /* 默认亮色 */ }
}
platform.onThemeChange(e => {
  systemDark = e.theme === 'dark';
  app.applySettings();
});

const app = {
  info,
  isWx: platform.isWx,
  settings: store.loadSettings(),
  tokens: null,
  scene: null,
  goto(sceneName, params) {
    app.scene && app.scene.leave && app.scene.leave();
    if (sceneName === 'battle') app.scene = BattleScreen(app, params);
    else if (sceneName === 'result') app.scene = ResultScreen(app, params);
    else app.scene = HomeScreen(app);
    app.scene.enter();
  },
  applySettings() {
    app.tokens = resolveTokens(app.settings.theme, systemDark);
    app.scene && app.scene.invalidate && app.scene.invalidate();
  },
};

app.applySettings();
// 音效开关（P0-5）：默认开；老版本存档里没有 sound 字段时同样视为开
sound.setEnabled(app.settings.sound !== false);
app.goto('home', {});

// 被动分享：右上角菜单转发带战绩标题（2026-11-18：去「来接招 →」诱导话术，降低风控风险）
platform.initShare(() => {
  try {
    const r = store.loadRecord();
    return `我在飞花令与诗童对诗，累计胜 ${r.wins} 局`;
  } catch (e) { return '飞花令 · 与诗童对诗'; }
});

// ---------- 触摸 ----------
platform.onTouch((phase, touch) => {
  if (!app.scene || !touch) return;
  app.scene.touch(phase, touch.clientX, touch.clientY);
});

// ---------- 全局错误面（真机调试时在 vConsole 可见） ----------
if (platform.isWx) {
  if (wx.onError) wx.onError(e => console.error('[fhl] onError:', e));
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(r => console.error('[fhl] unhandledRejection:', r && r.reason));
  // 埋点 fhl_exit（切后台/小游戏隐藏）：撤退点分析的关键一环
  if (wx.onHide) {
    wx.onHide(() => {
      const s = app.scene;
      track.track('fhl_exit', { from: 2, round: s && s.match ? Math.min(s.match.roundSeq + 1, s.match.cfg.roundMax) : 0 });
    });
  }
}

// ---------- 主循环（dt 钳位防切后台大跳） ----------
let lastT = 0;
function loop(t) {
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.016;
  lastT = t;
  ctx.setTransform(info.dpr, 0, 0, info.dpr, 0, 0);
  // 安全清屏：即使烘焙层 drawImage 失效也不会堆帧（真机兼容兜底）
  ctx.clearRect(0, 0, info.W, info.H);
  try {
    app.scene.update(dt);
    app.scene.draw(ctx, t / 1000);
  } catch (e) {
    // 单帧异常不再杀死 rAF 循环（否则画布冻结成"叠帧"假死）
    console.error('[fhl] 场景异常（已兜底继续）:', e && (e.stack || e.message) || e);
  }
  platform.requestFrame(loop);
}
platform.requestFrame(loop);

// 供无头测试驱动场景路由（微信侧无影响；Node 下 requestFrame 为空实现，主循环不自启）
module.exports = { app, goto: (s, p) => app.goto(s, p) };

});
  __req('', "game.js");
})();