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
    // 2026-11-21：诗笺页需要卡内滚动，补 move 事件（此前只转发 start/end）
    wx.onTouchMove(e => { if (e.touches && e.touches[0]) handler('move', e.touches[0]); });
    wx.onTouchEnd(e => handler('end', (e.changedTouches && e.changedTouches[0]) || null));
    return;
  }
  if (typeof document !== 'undefined') {
    const c = document.querySelector('canvas');
    if (!c) return;
    let down = false;
    c.addEventListener('mousedown', e => {
      down = true;
      handler('start', { clientX: e.clientX, clientY: e.clientY });
    });
    // move 只在按下之后转发（浏览器里 mousemove 平时满天飞，不能当拖动）
    c.addEventListener('mousemove', e => {
      if (down) handler('move', { clientX: e.clientX, clientY: e.clientY });
    });
    // mouseup 绑 window：手指/鼠标滑出画布时也能收到 end，否则会卡在拖动态
    const up = e => {
      if (!down) return;
      down = false;
      handler('end', { clientX: e.clientX, clientY: e.clientY });
    };
    c.addEventListener('mouseup', up);
    if (typeof window !== 'undefined') window.addEventListener('mouseup', up);
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
    rowMe: { label: { x: X(98, k), y: yCard + 14 + hX * 0.12, w: 40 * k, h: 20 }, text: { x: X(98, k), y: yCard + 36 + hX * 0.12, w: 210 * k, h: 28 } },
    rowTiger: { label: { x: X(98, k), y: yCard + 62 + hX * 0.4, w: 60 * k, h: 20 }, text: { x: X(98, k), y: yCard + 84 + hX * 0.4, w: 210 * k, h: 28 } },
    // 诗笺入口（2026-11-21）：卡片右侧竖排书签，点击进「诗笺」看本局诗句的释义
    glossBtn: { x: X(313, k), y: yCard + 30 + hX * 0.1, w: 42 * k, h: 84 },
    reasonMid: yCard + cardH - 18,     // 判定行锚卡底，卡拉伸时行距均匀
    againBtn: { x: X(12, k), y: yBtn, w: 157 * k, h: 88, r: 14 },
    shareBtn: { x: X(176, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    homeBtn: { x: X(273, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    hotRects: [
      { id: 'result.gloss', x: X(310, k), y: yCard + 22 + hX * 0.1, w: 52 * k, h: 100 },
      { id: 'result.again', x: X(12, k), y: yBtn, w: 157 * k, h: 88 },
      { id: 'result.share', x: X(176, k), y: yBtn, w: 90 * k, h: 88 },
      { id: 'result.home', x: X(273, k), y: yBtn, w: 90 * k, h: 88 },
    ],
  };
}

/**
 * 诗笺页（2026-11-21 二版：一首一页）
 * 用户反馈「单句解析没有意义」→ 改为整首：题名 + 作者 → 全诗（本局句高亮）→ 诗童串讲 →
 * 该句直译（降为第三层）。内容超出卡片高度时卡内滚动（长诗最长 960 字，如《长恨歌》）。
 * 小虎半身像移到题名右侧，不再占一行气泡——串讲本身就是它在讲。
 */
function gloss(s) {
  const { k, topOff, yBtn } = frame(s);
  const tiger = { x: X(281, k), y: Y(24, topOff), w: X(78, k), h: X(86, k) };
  const card = { x: X(16, k), y: Y(116, topOff), w: X(343, k), h: 0, r: 16 };
  card.h = Math.max(240, yBtn - 14 - card.y);
  const padX = 22, padTop = 16, padBottom = 16;
  return {
    k,
    eyebrow: { x: X(18, k), y: Y(24, topOff) },
    title: { x: X(18, k), y: Y(52, topOff), w: X(252, k) },
    sub: { x: X(18, k), y: Y(85, topOff), w: X(168, k) },
    page: { x: X(196, k), y: Y(78, topOff), w: X(74, k), h: 20 },
    tiger: { win: tiger },
    card,
    // 卡内滚动视口（文字只画在这个矩形里，超出部分靠滚动露出）
    view: { x: card.x + padX, y: card.y + padTop, w: card.w - padX * 2, h: card.h - padTop - padBottom },
    // 正文行距（22px 字 / 34 行高）：五七言一行半联，词的长短句也自然成行
    lineFs: 22, lineLH: 34,
    introFs: 19, introLH: 31,
    noteFs: 16, noteLH: 26,
    prevBtn: { x: X(16, k), y: yBtn, w: X(100, k), h: 88, r: 14 },
    nextBtn: { x: X(122, k), y: yBtn, w: X(100, k), h: 88, r: 14 },
    backBtn: { x: X(228, k), y: yBtn, w: X(131, k), h: 88, r: 14 },
    hotRects: [
      { id: 'gloss.prev', x: X(16, k), y: yBtn, w: X(100, k), h: 88 },
      { id: 'gloss.next', x: X(122, k), y: yBtn, w: X(100, k), h: 88 },
      { id: 'gloss.back', x: X(228, k), y: yBtn, w: X(131, k), h: 88 },
    ],
    // 卡内滚动区（不是热区，只给屏幕层判断手势起手点用）
    scrollArea: { x: card.x, y: card.y, w: card.w, h: card.h },
  };
}

module.exports = { frame, home, battleShared, battleBlocks, battleChoice, reveal, result, gloss };

});
__reg("js/ui/draw.js", function (module, exports, require) {
'use strict';
/**
 * 原子绘制层（10_ui_spec.md §9.1 / §1.5）
 * 铁律：rrect 用 arcTo 手写（禁 ctx.roundRect）；椭圆带兜底；阴影用偏移实底（禁 shadowBlur）；
 *       measureText 结果按 key 缓存；渐变对象布局期创建，禁止在 draw 循环内创建。
 */
const { font } = require('./tokens');

/**
 * 大字按实测宽度收敛字号（2026-11-20 真机截图：设计值 96px 的「胜」溢出 97px 金框、
 * 120px 令字溢出印卡内框——真机字体度量普遍比设计稿偏大 1.1–1.2 倍）。
 * 以 measureText 实测宽为准，超限则等比缩字号；返回收敛后的 px 值。
 */
function fitSize(ctx, s, weight, size, family, maxW) {
  const f = font(weight, size, family);
  ctx.font = f;
  const w = ctx.measureText(s).width;
  if (w > maxW && w > 0) size = Math.max(12, Math.floor((size * maxW / w) * 10) / 10);
  return size;
}

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
module.exports = { rrect, ell, shadow, text, textWidth, truncate, pill, gradBtn, makeVGrad, drawBaked, bar, seal, chevron, measureCache, fitSize };

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
 * 设计基线（2026-11-20 七版·参考图 Q 版重造）：
 *   用户给出参考形象图，按图改造——
 *   ① 头身比再放大：头占约 2/3 身高（rx158/ry162），身圆豆形无衣（去交领/腰封/玉佩）；
 *   ② 棕色描边替代近黑勾线（#6B4423），整体暖橙 #FFB843；
 *   ③ 超大琥珀圆眼（眼白 40×44）+ 双层大高光 + 外眼角双睫毛；
 *   ④ 宽幅奶油吻部（92×50）+ 棕色小三角鼻 + 腮红粉圆；
 *   ⑤ 额上深棕「王」字（参考图为棕色非淡白）；
 *   ⑥ 咆哮笑（clap/cheer）张嘴露双小虎牙 + 舌头；
 *   ⑦ 尾巴改上卷粗尾（38px）+ 两道棕环纹 + 深棕尾尖；
 *   ⑧ cheer 加整身小跳（|sin| 包络）。
 *   保留 2026-11-20 已验证的硬约束：后肢最底层 + 连续腿、前肢两级描边、
 *   握笔三明治（杆后/尖前，握点 35%）、五状态动画语义、pet 耳抖/踩奶。
 */
(function (root) {
  'use strict';

  // ---------- 主题配色 ----------
  var THEMES = {
    guofeng: {
      name: '国风动漫',
      fur: '#FFB843', furShade: '#E2922A', outline: '#6B4423',
      cream: '#FFF6E6', pink: '#F78FA7', pinkLine: '#DE6E8C',
      stripe: '#A5682A', nose: '#8A5524', mouthIn: '#83402E',
      wang: '#9C6824',
      iris: '#E39B36', irisTop: '#6E4218', pupil: '#241608', eyeGlow: '#FFD27F',
      robe: '#2E6E8E', sash: '#C9372C', gold: '#D9A441',
      jade: '#7FC5A8', ink: '#4A2E14', petal: ['#E88494', '#F2C33C', '#FFF9EC', '#7FC5A8']
    },
    anime: {
      name: '日系赛璐璐',
      fur: '#FFC23D', furShade: '#E08A1E', outline: '#5A3A18',
      cream: '#FFF6E0', pink: '#FF8FA3', pinkLine: '#E8617D',
      stripe: '#B4762C', nose: '#7A4A22', mouthIn: '#8A4030',
      wang: '#B4762C',
      iris: '#F0A830', irisTop: '#7A4218', pupil: '#241408', eyeGlow: '#FFD880',
      robe: '#3FA98C', sash: '#E8402A', gold: '#FFC93D',
      jade: '#7FC5A8', ink: '#3A2410', petal: ['#FF8FA3', '#FFC23D', '#FFF6E0', '#3FA98C']
    }
  };

  var STATES = ['idle', 'clap', 'facepalm', 'cheer', 'pet', 'moonwalk'];

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

  // ---------- 尾巴（七版：上卷粗尾 + 棕环纹 + 深棕尾尖） ----------
  function drawTail(ctx, C, state, t) {
    var droop = state === 'facepalm' ? 24 : 0;
    // pet：尾巴舒服慢摇（幅度介于 idle 与 cheer 之间）
    var sway = Math.sin(t * (state === 'cheer' ? 6 : state === 'pet' ? 4.5 : 2.4))
      * (state === 'cheer' ? 14 : state === 'pet' ? 10 : 7);
    var baseX = 250, baseY = 474;
    var tipX = 318 + sway, tipY = 384 + droop;
    // 外描边 + 虎黄主体（38/31：避开四肢测试的 32/25 量级）。
    // 走向：从身体右后侧先贴身向后，再向右上卷起——根部埋在身体内，不压右脚。
    curve(ctx, [baseX, baseY], [352, 496], [368, 428], [tipX, tipY], C.outline, 38);
    curve(ctx, [baseX, baseY], [352, 496], [368, 428], [tipX, tipY], C.fur, 31);
    // 两道棕色环纹（近似垂直于尾走向的短弧）
    line(ctx, [312, 468, 344, 482], C.stripe, 7);
    line(ctx, [334, 432, 362, 444], C.stripe, 7);
    // 深棕尾尖：圆球收头（比短粗描边干净，不读成"贴在身上的球"）
    ellipse(ctx, tipX, tipY, 16, 15, C.stripe, C.outline, 3);
  }

  // ---------- 身体（九版：微调衔接横宽头——头底 366，身体顶 366 齐平不脱节） ----------
  function drawBody(ctx, C) {
    var cx = 200, cy = 434;
    ellipse(ctx, cx, cy, 70, 68, C.fur, C.outline, 4);
    // 肚皮白毛（八版加大：参考图的奶油肚占比更大）
    ellipse(ctx, 200, 456, 46, 36, C.cream, null);
  }

  // ---------- 耳朵（八版：小圆耳 + 奶油内耳——参考图的耳朵明显更小、内耳是米白） ----------
  // pet 状态：耳朵轻抖——被摸舒服时的小动作，左右相位错开
  function drawEar(ctx, C, x, state, t) {
    ctx.save();
    if (state === 'pet') {
      ctx.translate(x, 96);
      ctx.rotate(Math.sin(t * 9 + (x < 200 ? 0 : 1.7)) * 0.055);
      ctx.translate(-x, -96);
    }
    ellipse(ctx, x, 96, 42, 38, C.fur, C.outline, 4);
    ellipse(ctx, x, 101, 17, 13, C.cream, null);
    ctx.restore();
  }

  // ---------- 头（九版：横宽包子形——参考图的头宽>高，两颊炸毛外扩） ----------
  // 八版问题：rx158/ry162 近似正圆 → 用户「脑袋太圆了」。参考图是横椭圆
  // （宽:高 ≈ 1.15）+ 腮部炸毛尖把最宽点拉到腮部 → 轮廓读作"包子"不是"球"。
  function drawHead(ctx, C, state, blink, t) {
    var hx = 200, hy = 218;
    // 头主体：横椭圆 170×148
    ellipse(ctx, hx, hy, 170, 148, C.fur, C.outline, 4);
    // 右侧暗部（随头形走）
    ctx.beginPath();
    ctx.moveTo(200, 70);
    ctx.bezierCurveTo(314, 70, 370, 136, 370, 218);
    ctx.bezierCurveTo(370, 300, 314, 366, 200, 366);
    ctx.bezierCurveTo(256, 298, 256, 138, 200, 70);
    ctx.closePath(); ctx.fillStyle = C.furShade; ctx.globalAlpha = 0.30; ctx.fill(); ctx.globalAlpha = 1;

    // 两颊炸毛（十版：收敛变短——九版太炸读成"猴腮"，只留腮下缘一簇小尖）
    furTuft(ctx, 84, 316, -1, C);
    furTuft(ctx, 316, 316, 1, C);

    drawEar(ctx, C, 92, state, t); drawEar(ctx, C, 308, state, t);

    // 虎纹（八版：每侧 2 道短纹，上移让位给腮毛）
    ctx.strokeStyle = C.stripe; ctx.lineWidth = 6; ctx.lineCap = 'round';
    var ys = [204, 232];
    for (var i = 0; i < 2; i++) {
      var y = ys[i];
      ctx.beginPath(); ctx.moveTo(44, y); ctx.quadraticCurveTo(60, y - 8, 74, y + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(356, y); ctx.quadraticCurveTo(340, y - 8, 326, y + 2); ctx.stroke();
    }

    // 王字：参考图为深棕单色三横一竖
    line(ctx, [186, 124, 214, 124], C.wang, 9);
    line(ctx, [188, 142, 212, 142], C.wang, 9);
    line(ctx, [182, 160, 218, 160], C.wang, 9);
    line(ctx, [200, 122, 200, 162], C.wang, 9);

    // 头顶高光（参考图左上柔光）
    ctx.save();
    ctx.translate(136, 106); ctx.rotate(-0.3);
    ctx.globalAlpha = 0.20;
    ellipse(ctx, 0, 0, 60, 28, C.cream, null);
    ctx.restore(); ctx.globalAlpha = 1;

    // 吻部大白（十版：加宽加扁——九版 92 宽只占头宽 27%，参考图近 70%，
    // 窄吻+小鼻=「尖嘴猴腮」的主因。宽扁白吻贴住下巴，鼻嘴缩在白吻中上部）
    ellipse(ctx, 200, 318, 118, 42, C.cream, null);
    // 腮红（贴白吻左右边缘）
    ctx.globalAlpha = 0.65;
    ellipse(ctx, 112, 330, 23, 15, C.pink, null);
    ellipse(ctx, 288, 330, 23, 15, C.pink, null);
    ctx.globalAlpha = 1;

    // 眼睛（叠在吻部上缘，参考图眼睛压白底）
    drawEyes(ctx, C, state, blink, t);

    // 棕色小圆鼻
    ellipse(ctx, 200, 298, 12, 9, C.nose, C.outline, 1.5);
    // 嘴（随状态）
    drawMouth(ctx, C, state);
  }

  // 腮部炸毛尖（九版二改）：三枚基部埋进头内的外尖三角（只描两条外缘、不描底边），
  // 叠成参考图腮部的一簇尖毛。九版初版"两进一出"对称画法读成了蝴蝶结。
  function furTuft(ctx, x, y, dir, C) {
    var sp = [[-11, 28, 9], [0, 36, 10], [11, 26, 8]];
    ctx.fillStyle = C.fur;
    ctx.beginPath();
    for (var i = 0; i < sp.length; i++) {
      var s = sp[i];
      ctx.moveTo(x, y + s[0] - s[2]);
      ctx.lineTo(x + dir * s[1], y + s[0] + s[1] * 0.14);
      ctx.lineTo(x, y + s[0] + s[2]);
    }
    ctx.fill();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var j = 0; j < sp.length; j++) {
      var s2 = sp[j];
      ctx.beginPath();
      ctx.moveTo(x, y + s2[0] - s2[2]);
      ctx.lineTo(x + dir * s2[1], y + s2[0] + s2[1] * 0.14);
      ctx.lineTo(x, y + s2[0] + s2[2]);
      ctx.stroke();
    }
  }

  // ---------- 眼睛（八版：无眼白琥珀渐变大眼——参考图可爱度核心） ----------
  // 七版问题：白眼眶 + 小瞳孔读成"googly 眼"，参考图整个眼窝都是虹膜——
  // 垂直渐变（上深下亮）+ 超大高光 + 两眼几乎相触。八版改法：
  //   ① 不画眼白：虹膜渐变直接占满椭圆；
  //   ② 眼距收窄（142/258，七版 132/268），rx44 → 内缘只隔 28px；
  //   ③ 大瞳孔 + 玻璃三层高光 + 顶部深色压暗（立体感）；
  //   ④ 渐变对象：stub ctx 无 createLinearGradient → 回退纯色（测试/旧环境不炸）。
  function drawEyes(ctx, C, state, blink, t) {
    var eyes = [[142, 246], [258, 246]];
    for (var e = 0; e < 2; e++) {
      var x = eyes[e][0], y = eyes[e][1];
      ctx.save();
      ctx.translate(x, y);

      if (state === 'clap' || state === 'cheer' || state === 'pet') {
        // 弯月笑眼：上扬弧（pet：弧度更缓——半眯的享受眼，不是大笑）
        var amp = state === 'pet' ? -18 : -24;
        ctx.beginPath(); ctx.moveTo(-34, 8); ctx.quadraticCurveTo(0, amp, 34, 8);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
        if (state === 'cheer') {
          ellipse(ctx, -15, -2, 4, 4, C.cream, null);
          ellipse(ctx, 15, -2, 4, 4, C.cream, null);
        }
        ctx.restore();
        continue;
      }

      if (state === 'facepalm') {
        // 无奈半闭眼
        ellipse(ctx, 0, 6, 36, 19, '#FFFFFF', C.outline, 3);
        ellipse(ctx, 0, 10, 21, 14, C.iris, null);
        ellipse(ctx, 0, 11, 9, 9, C.pupil, null);
        ellipse(ctx, -7, 5, 5, 5, '#FFFFFF', null);
        ctx.beginPath(); ctx.moveTo(-36, 2); ctx.quadraticCurveTo(0, -12, 36, 2);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
        continue;
      }

      // idle：睁眼 / 眨眼
      if (blink > 0.7) {
        // 闭眼弯月弧
        ctx.beginPath(); ctx.moveTo(-36, 4); ctx.quadraticCurveTo(0, 16, 36, 4);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
      } else {
        // 虹膜渐变（无眼白）：上深棕 → 琥珀 → 底部金光
        var grad = null;
        if (typeof ctx.createLinearGradient === 'function') {
          try {
            grad = ctx.createLinearGradient(0, -50, 0, 50);
            grad.addColorStop(0, C.irisTop);
            grad.addColorStop(0.5, C.iris);
            grad.addColorStop(1, C.eyeGlow);
          } catch (e2) { grad = null; }
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, 44, 50, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad || C.iris; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = C.outline; ctx.stroke();
        // 顶部压暗（立体虹膜：上半段更深）
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, 44, 50, 0, 0, Math.PI * 2); ctx.clip();
        ctx.beginPath(); ctx.ellipse(0, -26, 46, 34, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.irisTop; ctx.fill();
        ctx.restore();
        // 大瞳孔
        ellipse(ctx, 0, 9, 16, 21, C.pupil, null);
        // 玻璃高光三层（参考图水润感的关键）
        ellipse(ctx, -14, -17, 13, 13, '#FFFFFF', null);
        ellipse(ctx, 13, 20, 6, 6, '#FFFFFF', null);
        ellipse(ctx, -3, 30, 3.5, 3.5, '#FFFFFF', null);
        // 上眼睑线 + 外眼角双睫毛
        ctx.beginPath(); ctx.moveTo(-43, -10); ctx.quadraticCurveTo(0, -56, 43, -10);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
        var dir = e === 0 ? -1 : 1;
        line(ctx, [dir * 38, -30, dir * 52, -38], C.outline, 3.5);
        line(ctx, [dir * 30, -42, dir * 42, -54], C.outline, 3.5);
      }
      ctx.restore();
    }
  }

  // ---------- 嘴（八版：idle 也张嘴笑——参考图的虎始终是开心张嘴） ----------
  function drawMouth(ctx, C, state) {
    if (state === 'pet') {
      // ω 猫嘴：被摸满足时的小猫口
      ctx.beginPath();
      ctx.moveTo(184, 338);
      ctx.quadraticCurveTo(192, 347, 200, 338);
      ctx.quadraticCurveTo(208, 347, 216, 338);
      ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    } else if (state === 'facepalm') {
      line(ctx, [188, 342, 196, 338, 204, 342, 212, 338], C.outline, 2.5);
    } else if (state === 'idle') {
      // idle 张嘴笑（十版：加宽改浅——窄深的嘴读成尖 V，是"尖嘴"感的另一来源）
      ctx.beginPath();
      ctx.moveTo(174, 324);
      ctx.quadraticCurveTo(200, 331, 226, 324);
      ctx.quadraticCurveTo(219, 350, 200, 350);
      ctx.quadraticCurveTo(181, 350, 174, 324);
      ctx.closePath();
      ctx.fillStyle = C.mouthIn; ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5; ctx.stroke();
      ellipse(ctx, 200, 343, 13, 6.5, '#F08080', null);
      ctx.fillStyle = C.cream;
      ctx.beginPath(); ctx.moveTo(189, 326); ctx.lineTo(193, 337); ctx.lineTo(197, 326); ctx.closePath(); ctx.fill();
    } else {
      // clap / cheer：张嘴笑（十版同步加宽）：口腔 + 舌头 + 双小虎牙
      ctx.beginPath();
      ctx.moveTo(168, 324);
      ctx.quadraticCurveTo(200, 332, 232, 324);
      ctx.quadraticCurveTo(224, 362, 200, 362);
      ctx.quadraticCurveTo(176, 362, 168, 324);
      ctx.closePath();
      ctx.fillStyle = C.mouthIn; ctx.fill();
      ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.stroke();
      // 舌头
      ellipse(ctx, 200, 352, 16, 9, '#F08080', null);
      // 双小虎牙（挂在口腔上缘）
      ctx.fillStyle = C.cream;
      ctx.beginPath(); ctx.moveTo(186, 328); ctx.lineTo(190, 340); ctx.lineTo(195, 328); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(205, 328); ctx.lineTo(210, 340); ctx.lineTo(214, 328); ctx.closePath(); ctx.fill();
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

  // 握持毛笔（2026-11-20 四改：用户「握笔应该握在中上段」）——
  // 四版把爪放在笔杆**最底端**（杆 -112→+4），读作"捏着笔尖"。真实执笔是手在杆的
  // 中上段（约 1/3 处），笔杆大半与笔头垂在握点下方。现改为：上段 32 / 下段 60，
  // 握点=爪心=局部原点 → 握点在杆的 35% 处；笔杆总长 92、笔头 34。
  // 角度 -0.5 → -0.78（放缓）：笔更长更斜，笔尖才落得回立绘底边内（560），
  // 否则爪位 494 下方只有 66px 垂直空间。拆两段：杆在爪后、墨尖在爪前（三明治）。
  var BRUSH_ANG = -0.78, BRUSH_SHAFT_UP = 44, BRUSH_SHAFT_DOWN = 56;
  function drawBrushShaft(ctx, C, hx, hy) {
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(BRUSH_ANG);
    // 笔杆（金竹）：从握点上方 44 伸到下方 56（爪沿杆向遮挡约 ±30，上段净露 ~14px）
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(-5.5, -BRUSH_SHAFT_UP, 11, BRUSH_SHAFT_UP + BRUSH_SHAFT_DOWN);
    ctx.fill(); ctx.stroke();
    // 杆顶笔挂 + 三缕朱砂穗
    line(ctx, [0, -BRUSH_SHAFT_UP, -10, -BRUSH_SHAFT_UP - 13], C.sash, 3);
    line(ctx, [0, -BRUSH_SHAFT_UP, 9, -BRUSH_SHAFT_UP - 15], C.sash, 3);
    line(ctx, [0, -BRUSH_SHAFT_UP, 0, -BRUSH_SHAFT_UP - 17], C.sash, 3);
    // 朱砂笔箍（笔头根部，握点下方）
    ctx.fillStyle = C.sash;
    ctx.beginPath(); ctx.rect(-7, 42, 14, 12); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBrushTip(ctx, C, hx, hy) {
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(BRUSH_ANG);
    // 笔头：从笔箍下缘（y=52）垂到 y=85，尖头朝下（露出握爪之外、不超立绘底边）
    ctx.beginPath();
    ctx.moveTo(-9, 52);
    ctx.quadraticCurveTo(-8, 76, 0, 85);
    ctx.quadraticCurveTo(8, 76, 9, 52);
    ctx.closePath();
    ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
  }

  // ---------- 后肢 ----------
  // 2026-11-20 六改：用户「下肢是断开的」——
  // 五版后脚掌中心 x=130/270 落在身体轮廓**之外**（身体 rx58 → x 只有 142–258），
  // 两只脚掌是悬在身侧外的独立椭圆；且 drawFeet 在 drawBody **之后**，上缘描边完整
  // 可见 → 读作"两个脚掌浮在身体旁边"。
  // 现补后腿：腿根埋在身体内 (156/244, 450) → 斜向下外 → 脚掌 (122/278, 520)，
  // 并把后肢移到**最底层**（身体/尾巴/前爪依次覆盖腿根）→ 后腿从身体侧后方长出来。
  function drawFeet(ctx, C, state, phase) {
    if (state === 'moonwalk') { drawMoonwalkLegs(ctx, C, phase); return; }
    var legs = [
      { bx: 156, by: 450, cx: 136, cy: 480, ex: 126, ey: 508, fx: 122, fy: 520, fa: -0.2 },
      { bx: 244, by: 450, cx: 264, cy: 480, ex: 274, ey: 508, fx: 278, fy: 520, fa: 0.2 }
    ];
    for (var i = 0; i < legs.length; i++) {
      var g = legs[i];
      // 后腿：外轮廓 32 + 毛色 25（与前肢同绘图语言）
      limb(ctx, g.bx, g.by, g.cx, g.cy, g.ex, g.ey, C.outline, 32);
      limb(ctx, g.bx, g.by, g.cx, g.cy, g.ex, g.ey, C.fur, 25);
      // 后脚掌：脚尖略朝外
      ctx.save(); ctx.translate(g.fx, g.fy); ctx.rotate(g.fa);
      ellipse(ctx, 0, 0, 32, 18, C.fur, C.outline, 3);
      ellipse(ctx, 0, 6, 21, 9.5, C.cream, null);
      line(ctx, [-9, 2, -5, 8], C.furShade, 2);
      line(ctx, [5, 8, 9, 2], C.furShade, 2);
      ctx.restore();
    }
  }

  // ---------- 太空步后肢（九版·按真实舞步解剖重做）----------
  // 用户「太空步不像，仔细研究一下」——查 moonwalk 教学（wikiHow / 维基 / 舞蹈课）后
  // 得到四条硬要点，旧版（八版）四条全踩反：
  //   ① **一只脚整掌贴地，另一只脚踮起脚尖**（脚跟离地、只用脚掌前部点地）——
  //      这个不对称站姿是舞步的视觉签名，一眼就能认出；旧版两只脚都是平掌。
  //   ② **贴地那只脚沿地面向后拖**（不离地、不抬腿）；旧版把它抬起来 16px 走空中。
  //   ③ **踮脚那只脚始终不离开地面**，相对身体向前移——观者看到"脚下往前走、
  //      人却往后滑"的错觉就是它造的；旧版同样是空中摆腿，错觉直接没了。
  //   ④ **上身不颠**（走路才有上下起伏，太空步是"飘"）；两脚换角色要**快**。
  // 相位 p∈[0,1) = 一个完整循环（左右各一次滑步）；脚 i 的局部相位 = (p + i*0.5) % 1：
  //   [0, 0.5)  整掌贴地：x 从身体前侧(+SPAN)拖到后侧(-SPAN)……见下方符号
  //   [0.5, 1)  踮脚点地：x 反向摆回，脚跟抬起 0.46rad（约 26°），掌心上抬保持脚尖触地
  // 两脚永远一脚平、一脚踮，且都在地面 → 没有一个"抬腿"的帧，读起来就是滑不是走。
  var MW_SPAN = 20;      // 单脚滑程半幅（原生单位 ≈ 脚掌宽 0.6；再大会滑出身体轮廓读成劈叉）
  var MW_HEEL = 0.46;    // 踮脚抬跟角（rad，≈26°）
  function drawMoonwalkLegs(ctx, C, phase) {
    var p = ((phase || 0) % 1 + 1) % 1;
    for (var i = 0; i < 2; i++) {
      var ph = (p + i * 0.5) % 1;
      var sgn = i === 0 ? -1 : 1;                 // 左脚踏跟朝右、右脚朝左
      var baseX = i === 0 ? 122 : 278, fa = i === 0 ? -0.2 : 0.2;
      var x, y = 520, rot = fa, knee;
      if (ph < 0.5) {
        // 整掌贴地后拖：+x = 相对身体向后（旅行方向是 -x）
        // 拍点上"抽"一下再拖：1-(1-q)^1.7 前重后轻 = 起手有冲量、拖尾渐慢（节奏感）
        var q = ph / 0.5;
        var e1 = 1 - Math.pow(1 - q, 1.7);
        x = baseX - MW_SPAN + 2 * MW_SPAN * e1;
        rot = fa;
        knee = 4 + 3 * (1 - q);                 // 起手腿绷、拖尾放松
      } else {
        // 踮脚点地向前摆：脚跟抬起后绕脚尖转，掌心必须上抬，脚尖才留在地面
        var q2 = (ph - 0.5) / 0.5;
        // 抬跟快（0.045）、落跟慢（0.09）：脚跟"啪"地落下就是这一拍的听觉/视觉重音
        var heel = Math.min(1, q2 / 0.045) * Math.min(1, (1 - q2) / 0.09);
        heel = heel * heel * (3 - 2 * heel);
        var e2 = 1 - Math.pow(1 - q2, 1.5);
        x = baseX + MW_SPAN - 2 * MW_SPAN * e2;
        rot = fa + sgn * MW_HEEL * heel;
        y = 520 - 13 * heel;                      // 抬 13 → 脚尖正好点在 y≈536（地面）
        knee = 4 + 7 * heel;
      }
      var bx = i === 0 ? 156 : 244, by = 450;
      var mx = (bx + x) / 2 + sgn * 9;
      var my = (by + y) / 2 + 6 - knee * 0.5;
      limb(ctx, bx, by, mx, my, x, y - 8, C.outline, 32);
      limb(ctx, bx, by, mx, my, x, y - 8, C.fur, 25);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ellipse(ctx, 0, 0, 32, 18, C.fur, C.outline, 3);
      ellipse(ctx, 0, 6, 21, 9.5, C.cream, null);
      line(ctx, [-9, 2, -5, 8], C.furShade, 2);
      line(ctx, [5, 8, 9, 2], C.furShade, 2);
      // 踮脚时脚踝处加一道浅影：脚跟离地要有"折"的痕迹，否则像整只脚歪着
      if (rot !== fa) {
        ctx.globalAlpha = 0.30;
        line(ctx, [-sgn * 14, -6, -sgn * 22, -13], C.furShade, 3);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // ---------- 前肢 ----------
  // 2026-11-20 五改：用户「手跟身体分离了，能不能再逼真一点」——
  // 此前前爪只是浮在身体前面的两个小椭圆，没有肩/臂，读作"两只手悬空贴着肚子"。
  // 补前肢：肩（身体侧面 y≈418）→ 肘（外弓出身体轮廓，让臂在身侧可见）→ 腕（爪心）。
  // 外轮廓深色 32 + 毛色 25（边缘 3.5px，与身体/爪同绘图语言），爪最后叠在腕上盖接缝。
  // ---------- 前肢（十一版：去肩球，臂根埋入身体丝滑长出） ----------
  // 用户「肩球不用那么明显，把手臂画到肩膀位置即可，连接要丝滑」——
  // 最终方案：手臂描边画在身体**之前**，臂根 (146/254, 414) 埋在躯干填充内被
  // 覆盖，手臂从身体侧缘自然"钻"出来——无球、无缝、无接口线。
  // 肘部外弓加大（ctrl 108/292）保证可见段完整落在躯干轮廓外。
  function limb(ctx, sx, sy, cx, cy, ex, ey, color, lw) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }
  function drawArm(ctx, C, sx, sy, cx, cy, ex, ey) {
    limb(ctx, sx, sy, cx, cy, ex, ey, C.outline, 32);
    limb(ctx, sx, sy, cx, cy, ex, ey, C.fur, 25);
  }

  // 臂描边（身体后画：深色轮廓压在躯干上读出手臂；臂根埋在躯干轮廓内）。仅描边，不含爪与笔。
  // ctrl 外弓量经过校准：中段要完整落在躯干轮廓外（距边缘 ≥12px）才读得出手臂。
  function drawArmLimbs(ctx, C, state, t, phase) {
    if (state === 'idle') {
      drawArm(ctx, C, 146, 414, 96, 464, 150, 490);    // 左臂：肩→外弓肘→腕
      drawArm(ctx, C, 254, 414, 304, 464, 250, 490);   // 右臂
    } else if (state === 'moonwalk') {
      // 太空步手臂（九版）：教学要点是"手臂自然垂在体侧、轻摆"，不要抢戏。
      // 旧版把右臂抬在胸前，读成"挥手/打招呼"，和滑步不搭。摆动频率=每循环一次（慢）。
      var sw = Math.sin(((phase || 0) % 1) * Math.PI * 2);
      drawArm(ctx, C, 146, 414, 98, 458, 148 + sw * 7, 486 + sw * 3);
      drawArm(ctx, C, 254, 414, 302, 458, 252 - sw * 7, 486 - sw * 3);
    } else if (state === 'clap') {
      var tap = Math.abs(Math.sin(t * 8)) * 12;
      drawArm(ctx, C, 148, 414, 112, 388, 184 - tap, 372);
      drawArm(ctx, C, 252, 414, 288, 388, 216 + tap, 372);
    } else if (state === 'facepalm') {
      drawArm(ctx, C, 254, 414, 296, 350, 256, 302);   // 右臂抬起捂脸
      drawArm(ctx, C, 146, 414, 96, 464, 168, 490);
    } else if (state === 'pet') {
      var knead = Math.sin(t * 5) * 6;
      drawArm(ctx, C, 146, 414, 96, 464, 150, 484 + knead);
      drawArm(ctx, C, 254, 414, 304, 464, 250, 484 - knead);
    } else { // cheer
      var lift = Math.sin(t * 6) * 8;
      drawArm(ctx, C, 146, 414, 100, 378, 128, 356 + lift);
      drawArm(ctx, C, 254, 414, 300, 378, 272, 356 + lift);
    }
  }

  // 爪与握笔（身体/头之后画：盖住腕端接缝，保证爪与笔可见）
  function drawHands(ctx, C, state, t, phase) {
    if (state === 'idle') {
      drawBrushShaft(ctx, C, 150, 494);  // 杆在爪后
      drawClaw(ctx, C, 150, 494, -0.1);
      drawBrushTip(ctx, C, 150, 494);    // 墨尖在爪前（保证可见）
      drawClaw(ctx, C, 250, 494, 0.1);
    } else if (state === 'moonwalk') {
      var sw = Math.sin(((phase || 0) % 1) * Math.PI * 2);
      drawClaw(ctx, C, 148 + sw * 7, 484 + sw * 3, -0.25);   // 垂在体侧，随滑步轻摆
      drawClaw(ctx, C, 252 - sw * 7, 484 - sw * 3, 0.25);
    } else if (state === 'clap') {
      var tap2 = Math.abs(Math.sin(t * 8)) * 12;
      drawClaw(ctx, C, 200 - 16 - tap2, 372, -0.5); drawClaw(ctx, C, 200 + 16 + tap2, 372, 0.5);
      // 拍击星光
      ctx.globalAlpha = 0.8;
      line(ctx, [200, 350, 200, 336], C.gold, 3);
      ctx.globalAlpha = 1;
    } else if (state === 'facepalm') {
      drawClaw(ctx, C, 252, 296, -0.9); // 右爪捂脸
      drawClaw(ctx, C, 168, 494, -0.1);
    } else if (state === 'pet') {
      var knead2 = Math.sin(t * 5) * 6;
      drawBrushShaft(ctx, C, 150, 478 + knead2);
      drawClaw(ctx, C, 150, 478 + knead2, -0.3);
      drawBrushTip(ctx, C, 150, 478 + knead2);
      drawClaw(ctx, C, 250, 478 - knead2, 0.3);
    } else { // cheer
      var lift2 = Math.sin(t * 6) * 8;
      drawClaw(ctx, C, 126, 350 + lift2, -0.7); drawClaw(ctx, C, 274, 350 + lift2, 0.7);
    }
  }

  // ---------- 毛笔（斜靠：仅举手/捂脸等爪腾不出的状态） ----------
  // 七版：尾巴已占身体右侧 → 斜靠笔移到左侧，避免和尾尖打架
  function drawBrush(ctx, C) {
    ctx.save();
    ctx.translate(80, 472); ctx.rotate(0.38);
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
  // opt: { state, t, theme, x, y, scale, phase }  phase=太空步腿部相位 0..1（其余状态忽略）
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
    // cheer：整身小跳（七版：欢庆要有向上的动感，不只是挥手撒花）
    if (state === 'cheer') ctx.translate(0, -Math.abs(Math.sin(t * 6)) * 10);

    // 眨眼（idle 专用，约每 3.6s 一次）
    var blink = 0;
    if (state === 'idle') {
      var p = t % 3.6;
      if (p < 0.13) blink = Math.sin(p / 0.13 * Math.PI);
    }

    // 后肢最先画（最底层）：腿根在身体内被身体覆盖、脚掌在体侧外露出 → 连续的腿
    drawFeet(ctx, C, state, opt.phase);
    drawTail(ctx, C, state, t);
    drawBody(ctx, C);
    drawHead(ctx, C, state, blink, t);
    // 手臂画在身体/头之后（十一版）：深色轮廓压在身体上才读得出手臂——
    // 画在身体前面会因同色毛与躯干融为一体（放大调试实锤）。臂根 (146/254,414)
    // 埋在躯干轮廓内，轮廓线从肩位自然"长"出来，无球无缝。
    drawArmLimbs(ctx, C, state, t, opt.phase);
    // 爪与握笔在手臂之后画：盖住腕端、保证爪与笔可见
    drawHands(ctx, C, state, t, opt.phase);
    // 毛笔：idle/pet 已握在爪（drawHands 内），其余状态爪腾不出 → 斜靠身侧
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
    phase: opts.phase,
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
    phase: opts.phase,
  });
  ctx.restore();
}

module.exports = { Tiger, BUST_WIN, fullBody, bust, STATES: Tiger.STATES };

});
__reg("js/ui/pet.js", function (module, exports, require) {
'use strict';
/**
 * 小诗童触摸互动（2026-11-20 用户需求；同日三版「沙雕出圈」）：
 * 摸头 / 摸肚子 / 挠脚（对局页半身像为头/爪两区）。
 *
 * 三版动作设计（中规中矩出不了圈 → 保留萌点、加大沙雕梗）：
 *  - 摸头「蹭 → 化成虎饼 → 啵弹回」：0–0.46 贴手蹭（歪头 + 轻揉），0.46–0.70 被摸化
 *    ——整只塌下去但**不是压成贴纸**（十二版 sy 0.56 贴地 + 头顶 Zzz；旧版 0.30 太矮），
 *    0.80 起过冲弹回（sy 冲到 1.07 再回 1），弹回瞬间冒「啵☆」。猫被摸舒服了会"化"。
 *  - 摸肚「惊炸弹起 → 抖毛 → 害羞扭」：肚子是禁区（反差萌）——0–0.18 瞬间弹起
 *    （放大 1.12 + dy -20），0.18–0.6 落地快速抖毛（squash 抖两下 + 「!!」），
 *    0.6–1 害羞小碎步扭两下。
 *  - 挠脚/爪「蹬上天 + 哈哈哈」：先蹲 0.16，随后弹到 22px（原 14），落地颠两下；
 *    特效「哈哈哈」三字错峰上浮——被挠痒的"狂笑"体感。
 *  - 连击彩蛋（出圈钩子）：同部位 3s 内连续触发 ≥3 次 → 过载模式：动作幅度 ×1.5、
 *    金色星星环、特殊音效（摸头=打呼噜 snore / 摸肚·挠脚=狂笑 laugh）。
 *
 * 设计约束（不变）：
 *  - 零图片零音频资产：反馈 = 程序化粒子 + transform；声音走 sound.js 合成；
 *  - offset() 返回 {dx,dy,rot,sx,sy}，屏侧以盒底立足点为支点做 rotate+scale
 *    （盒底支点 = 压扁自动贴地，"化饼"天然成立）；
 *  - 冷却按区：头 450ms / 其余 600ms；玩家决策热区优先（pet.* 追加在 hotRects 末尾）。
 */

const COOLDOWN_HEAD = 0.45;             // 摸头：短冷却，支持连续撸
const COOLDOWN_OTHER = 0.6;             // 其余部位
const LIFE = { head: 1.5, belly: 1.1, foot: 1.0, paw: 1.0 };        // 常规动画时长
const LIFE_COMBO = { head: 5.0, belly: 1.3, foot: 1.5, paw: 1.5 };  // 彩蛋时长（摸头=5 秒太空步）
const STREAK_WIN = 3;     // 连击次数阈值（过载模式）
const STREAK_TTL = 3;     // 连击计时窗口（秒）
const MOONWALK_CYCLE = 1.24; // 一个完整循环（左右各一次滑步）= 2 拍
const MOONWALK_STEP = 0.62; // 一拍 = 一次滑步 = 0.62s（≈97BPM，接近 Billie Jean 的 117BPM）
const MW_SPAN = 20;         // 单脚滑程半幅（原生单位；与渲染器 drawMoonwalkLegs 同值，±20 ≈ 脚程不脱出身体轮廓）

// 摸头三段与形变深度：**offset 与特效层共用**（旧版两处各写一份 0.5/0.78，
// 改动画时特效层的 Zzz/啵会错位——单一真源，改一处即可）
const HEAD_M0 = 0.44;       // 蹭止（开始化饼）
const HEAD_M1 = 0.68;       // 化透
const HEAD_B0 = 0.76;       // 弹回起点（留 0.36s 给弹回，太快会读成「闪一下」）
const HEAD_DEEP = 0.56;     // 化饼深度：sy 塌到 0.56（0.30 只有三分之一高，太夸张）
const HEAD_WIDE = 1.20;     // 化饼横向鼓起
const HEAD_PEAK = 1.07;     // 弹回过冲峰

// ---- 缓动（十二版「再丝滑一点」的地基）----
// 旧版每段都是 sin 或平方曲线，段与段之间**速度不连续**：蹭手停下的瞬间 rot 从
// 0.09 直接归零、化饼到顶时速度突然截断、下蹲结束 dy 从 5px 跳到 0（肉眼可见的一顿）。
// 统一改成两端速度为 0 的缓动，并保证相邻段「末值=首值」，接缝处才没有顿挫。
/** 三次平滑：首尾速度均为 0（小形变够用） */
function smooth(x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  return x * x * (3 - 2 * x);
}
/** 五次平滑：首尾的速度、加速度都为 0（化饼/弹回这类大形变用它，收放都不顿） */
function smoother(x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
/** 峰形 0→1→0：幂 >1 时两端速度为 0（跳跃/弹起用它，起跳和落地都不「啪」） */
function hump(x, k) {
  const s = Math.sin(Math.PI * (x < 0 ? 0 : (x > 1 ? 1 : x)));
  return Math.pow(s, k || 1.5);
}

/**
 * 单只脚在太空步循环里的位置（原生坐标，与渲染器同一套公式）。
 * 局部相位 [0,0.5) = 整掌贴地、向后拖；[0.5,1) = 踮脚点地、向前摆。
 * @param {number} ph 局部相位 0..1
 * @param {0|1} i 0=左脚 1=右脚
 * @returns {{x:number, flat:boolean}}
 */
function moonwalkFoot(ph, i) {
  const lp = ((ph % 1) + 1) % 1;
  const baseX = i === 0 ? 122 : 278;
  if (lp < 0.5) return { x: baseX - MW_SPAN + 2 * MW_SPAN * (lp / 0.5), flat: true };
  return { x: baseX + MW_SPAN - 2 * MW_SPAN * ((lp - 0.5) / 0.5), flat: false };
}

/**
 * 太空步整体姿态（九版 v3）。
 * 八版为什么"不像"：把整体位移做成左右往返滑移（读作摇晃），两条腿都是平掌在空中摆
 * （读作蹦跳），还挂了个「太空步！」字幕——靠文字解释动作，动作本身没成立。
 * 九版按真实舞步（wikiHow/维基：一脚整掌贴地后拖、另一脚踮脚点地且不离地、上身不颠）：
 *   ① 身体**不位移**：改由地面斜刻度滚动表达"在滑"（treadmill）——到位就没有回弹跳帧；
 *   ② 重心在两只脚之间转移 → 上身只有 ±0.024rad 的微倾（不是后仰，后仰像要倒）；
 *   ③ 不上下颠（dy 恒 0）、不变形（sy 恒 1），"飘"就是靠这两条。
 * @param {number} t 彩蛋已进行秒数（相位与地面滚动都由它推，保证地面只往一个方向走）
 * @param {number} sc 小虎缩放（原生 560 高 → 屏幕）
 * @returns {{cyc:number, dx:number, lean:number, scroll:number, feet:Array, dir:number}}
 */
function moonwalkPose(t, sc) {
  const tt = Math.max(0, t);
  const c = (((tt / MOONWALK_CYCLE) % 1) + 1) % 1;
  const u = (tt / MOONWALK_STEP) % 1;            // 拍内相位
  const k = Math.max(0.55, sc * 3);              // 屏幕尺度归一（首页 sc≈0.3 → k≈0.9）
  const env = Math.exp(-u * 9);                  // 拍点重音包络：起手即满、快速衰减
  return {
    cyc: c,
    u,
    dx: 0,
    // 拍点沉降：每拍下压 2px 后指数回弹——节奏靠这一次"压"，不是走路那种持续 bob
    dy: 2.0 * k * env,
    // 压扁同步（体积感）：拍点 1.8% → 回 1，配合 dy 读成"踩下去那一下"
    squash: 1 - 0.018 * env,
    lean: 0.022 * Math.cos(c * Math.PI * 2),
    // 地面滚动 = 脚程（略快 15% 让小屏也看得出在走），按绝对时间累计 → 只往一个方向
    scroll: tt * (2 * MW_SPAN / MOONWALK_STEP) * 1.15 * sc,
    feet: [moonwalkFoot(c, 0), moonwalkFoot((c + 0.5) % 1, 1)],
    dir: -1,
  };
}

/**
 * 由小虎可见盒算互动热区。
 * @param {'full'|'bust'} kind full=全身立绘（首页/结算：头/肚/脚）；bust=对局半身窗（头/爪）
 * @param {{x:number,y:number,w:number,h:number}} box 小虎在屏幕上的可见盒
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

/** 该次互动的配音（连击彩蛋换沙雕音）：屏侧统一 sound.play(pet.soundFor(zone)) */
function soundFor(zone, combo) {
  if (zone === 'head') return combo ? 'moonwalk' : 'purr';
  if (zone === 'belly') return combo ? 'laugh' : 'yelp';
  return combo ? 'laugh' : 'chirp';   // foot / paw
}

/** 每屏一个实例 */
function create() {
  let fx = null;          // {zone, t, cx, cy, scale, dir, combo, amp, life, boxW, kind}
  let coolZone = null;    // 冷却中的部位 id
  let coolT = 0;          // 冷却剩余秒
  let box = null;         // 当前小虎可见盒（供特效锚点）
  let boxKind = 'full';   // 'full' 全身立绘 / 'bust' 对局半身窗（决定地面痕迹画不画）
  let dir = 1;            // 蹭的方向（交替，左右歪头有变化）
  let clock = 0;          // 实例内部时钟（连击窗口计时）
  let streak = { zone: null, n: 0, at: -9 };   // 连击状态

  return {
    petZones,   // 模块级函数挂到实例上，屏侧统一走 pet.* 一个命名空间
    soundFor,
    /** 各屏 build/enter 时同步小虎盒（kind：半身窗不画地面参照） */
    setBox(b, kind) { box = b; boxKind = kind || 'full'; },

    /**
     * 触发互动。命中冷却或动画未结束时返回 false（屏据此决定是否发声/埋点）。
     * 同区 STREAK_TTL 秒内累计触发 ≥STREAK_WIN 次 → 过载模式（幅度放大 + 特殊音）。
     * @param {'head'|'belly'|'foot'|'paw'} zone
     */
    trigger(zone) {
      if (!box) return false;
      const cool = zone === 'head' ? COOLDOWN_HEAD : COOLDOWN_OTHER;
      if (coolT > 0 && coolZone === zone) return false;
      coolZone = zone;
      coolT = cool;
      dir = -dir;
      // 连击计数：同区且在窗口内累加，否则重新计
      if (streak.zone === zone && clock - streak.at <= STREAK_TTL) streak.n += 1;
      else streak = { zone, n: 1, at: clock };
      const combo = streak.n >= STREAK_WIN;
      // 特效锚点（屏幕坐标）：头=盒顶中心，肚=盒中心，脚/爪=盒底中心
      const anchor = zone === 'head' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.16 }
        : zone === 'belly' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.62 }
        : { x: box.x + box.w / 2, y: box.y + box.h * 0.88 };
      const life = (combo ? LIFE_COMBO : LIFE)[zone] || 1.0;
      fx = { zone, t: 0, x: anchor.x, y: anchor.y, scale: box.h / 560, dir, combo, amp: combo ? 1.5 : 1, life,
        boxW: box.w, kind: boxKind };
      return true;
    },

    update(dt) {
      clock += dt;
      if (coolT > 0) { coolT -= dt; if (coolT <= 0) { coolT = 0; coolZone = null; } }
      if (fx) { fx.t += dt; if (fx.t > fx.life) fx = null; }
    },

    /** 离屏清理（动画/冷却/连击全部归零） */
    reset() { fx = null; coolZone = null; coolT = 0; streak = { zone: null, n: 0, at: -9 }; },

    /**
     * 状态覆盖：摸头常规（含化饼）→ 'pet'（眯眼享受/融化）；摸头 3 连太空步 → null
     * （张嘴笑酷滑步，眯眼滑不像）；肚/脚惊跳保持睁眼 → null。
     */
    stateOverride() {
      if (!fx) return null;
      if (fx.zone === 'head' && !fx.combo) return 'pet';
      return null;
    },

    /**
     * 姿态 + 相位（八版）：屏侧统一 `const pz = pet.pose()` 再喂给 tiger.fullBody。
     * 太空步需要把步频相位传给渲染器（腿的贴地相与整体位移必须同频，否则脚会"打滑"）。
     */
    pose() {
      if (fx && fx.zone === 'head' && fx.combo) {
        return { state: 'moonwalk', phase: ((fx.t / MOONWALK_CYCLE) % 1 + 1) % 1 };
      }
      return { state: this.stateOverride(), phase: 0 };
    },

    /**
     * 小虎绘制 transform（区内衰减，之外归零）。支点=盒底中心（屏侧实现）。
     *  - head：蹭（rot+dx 贴手）→ 化饼（sy 0.56/sx 1.20 贴地）→ 啵弹回（过冲 1.07）；
     *  - belly：惊跳（-20px + 放大 1.12）→ 抖毛（squash 快抖）→ 害羞扭；
     *  - foot/paw：蹲 → 高蹬（-22px）→ 颠两下；连击=原地陀螺（rot 连转）。
     * 返回 {dx,dy,rot,sx,sy}，sx/sy=1 时屏侧可跳过 scale。
     */
    offset() {
      if (!fx) return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
      const z = fx.zone, p = Math.min(fx.t / fx.life, 1), sc = fx.scale, d = fx.dir, A = fx.amp;
      if (z === 'head') {
        const M0 = HEAD_M0, M1 = HEAD_M1, B0 = HEAD_B0;
        if (fx.combo) {
          // 3 连彩蛋「5 秒太空步」v3：身体不位移（地面在走），只有重心微倾——
          // 位移交给地面刻度，才不会出现末尾"滑回去"的回弹帧。
          const mw = moonwalkPose(fx.t, sc);
          return {
            dx: mw.dx, dy: mw.dy, rot: mw.lean,
            sx: 1 + (1 - mw.squash) * 0.7,   // 压扁时横向补一点（体积守恒）
            sy: mw.squash,
          };
        }
        // 十二版：化饼深度 0.30 → 0.56（模块常量 HEAD_DEEP）。sy=0.30 只有三分之一高，
        // 读成"被压扁的贴纸"而不是"化成一坨"（用户：太夸张了、太矮了）。
        const DEEP = HEAD_DEEP, WIDE = HEAD_WIDE, PEAK = HEAD_PEAK;
        if (p < M0) {
          // 蹭：包络 0–0.12 贴上去（平滑入），末尾揉动收力（不在 M0 处硬停）
          const env = smooth(p / 0.12);
          const rub = Math.sin(fx.t * 9) * 0.02 * env * smooth((M0 - p) / 0.07);
          return { dx: d * 6 * env, dy: 0, rot: d * 0.07 * env + rub, sx: 1, sy: 1 };
        }
        if (p < M1) {
          // 化饼：贴手那点歪头和位移随塌陷一起**平滑收回**（首尾速度 0），不硬切
          const q = smoother((p - M0) / (M1 - M0));
          return {
            dx: d * 6 * (1 - q), dy: 0, rot: d * 0.07 * (1 - q),
            sx: 1 + (WIDE - 1) * q, sy: 1 - (1 - DEEP) * q,
          };
        }
        if (p < B0) {
          // 化透停顿：贴地饼状，头顶 Zzz（特效层）
          return { dx: 0, dy: 0, rot: 0, sx: WIDE, sy: DEEP };
        }
        // 弹回：DEEP → 过冲峰 → 1，两段五次平滑（顶点处速度本来为 0，接缝无顿）
        const q = (p - B0) / (1 - B0);
        const sy = q < 0.55
          ? DEEP + (PEAK - DEEP) * smoother(q / 0.55)
          : PEAK - (PEAK - 1) * smoother((q - 0.55) / 0.45);
        const sx = WIDE - (WIDE - 1) * smoother(q / 0.75);
        return { dx: 0, dy: 0, rot: 0, sx, sy };
      }
      if (z === 'belly') {
        const J = 0.20, S = 0.58;
        const lift = 18 * sc * A, grow = 0.10 * A;
        if (p < J) {
          // 惊跳：峰形两端速度为 0（起跳/落地的瞬间都不「啪」）
          const j = hump(p / J, 1.4);
          return { dx: 0, dy: -lift * j, rot: 0, sx: 1 + grow * j, sy: 1 + grow * j };
        }
        if (p < S) {
          // 落地抖毛：快抖两下，起手淡入、幅度按幂次衰减（末尾速度为 0）
          const q = (p - J) / (S - J);
          const sq = Math.sin(q * Math.PI * 2) * Math.pow(1 - q, 1.2) * smooth(q / 0.12);
          // dx 也淡入：旧版从 0 直接跳到 ±3px（接缝实测 2.99 的硬位移）
          return { dx: d * 3 * (1 - q) * (1 - q) * smooth(q / 0.25), dy: 0, rot: 0,
            sx: 1 + 0.05 * A * sq, sy: 1 - 0.07 * A * sq };
        }
        // 害羞小碎步扭两下（淡入 + 幂衰减，接缝与末值都平滑归零）
        const q = (p - S) / (1 - S);
        const decay = Math.pow(1 - q, 1.4) * smooth(q / 0.16);
        const sq = Math.sin(q * Math.PI * 2) * decay;
        return { dx: 0, dy: 0, rot: Math.sin(q * Math.PI * 2) * 0.05 * decay,
          sx: 1 + 0.03 * sq, sy: 1 - 0.04 * sq };
      }
      // foot / paw：蹲 → 蹬（弧线跨过蹲深，不再从 5px 直接跳 0）→ 落地颠两下
      const C = 0.18, K = 0.55;
      const dip = 5 * sc, lift = 22 * sc * A;
      if (p < C) {
        const q = smoother(p / C);
        return { dx: 0, dy: dip * q, rot: 0, sx: 1 + 0.045 * q, sy: 1 - 0.07 * q };
      }
      if (p < K) {
        const q = (p - C) / (K - C);
        const arc = hump(q, 1.5);
        if (fx.combo) {
          // 过载：原地转一整圈（2π，落地必定正立）+ 高弹；用五次平滑加速/减速，
          // 旧版匀速转 3π 在落地瞬间硬停且停在倒立位
          return {
            dx: 0, dy: dip * (1 - smoother(q)) - 24 * sc * arc,
            rot: d * Math.PI * 2 * smoother(q),
            sx: 1, sy: 1 + 0.05 * arc,
          };
        }
        return {
          dx: 0,
          dy: dip * (1 - smooth(q)) - lift * arc,   // 蹲深平滑卸掉 + 弧线起跳
          rot: d * 0.09 * arc,
          sx: 1 + 0.045 * (1 - q) - 0.03 * arc,     // 蹲时的横向鼓起随起跳收回
          sy: 1 - 0.07 * (1 - q) + 0.06 * arc,      // 蹲扁 → 拉伸 → 落地回正
        };
      }
      // 落地颠两下：sin² 起手速度为 0（不弹跳硬切），幂次衰减
      const q = (p - K) / (1 - K);
      return { dx: 0, dy: Math.pow(Math.sin(Math.PI * 2 * q), 2) * 3 * sc * Math.pow(1 - q, 1.5), rot: 0, sx: 1, sy: 1 };
    },

    /**
     * 叠加特效（在各屏绘制完小虎后调用）。
     * head=心心音符 → 化饼期 Zzz → 弹回「啵☆」 / belly=「!!」+ 波纹 /
     * foot·paw=星花 + 「哈哈哈」三连。连击=金星环。alpha ≤0.9、数量 ≤6。
     */
    draw(ctx) {
      if (!fx) return;
      const p = Math.min(fx.t / fx.life, 1);
      const fade = 1 - p;
      ctx.save();
      const S3 = fx.scale * 3;
      if (fx.zone === 'head') {
        const M0 = HEAD_M0, M1 = HEAD_M1, B0 = HEAD_B0;
        const DEEP = HEAD_DEEP, PEAK = HEAD_PEAK;
        if (fx.combo) {
          // 太空步特效 v3（九版）：用户「不要用文字提示，要让人从动作上看出来」——
          // 删掉「太空步！」字幕与 ♪ 音符（靠文字解释动作 = 动作没成立），改由
          // **地面参照系**承担"在滑"的信息：
          //   ① 地面线 + 斜刻度随滑行滚动：身体钉住、地面在走 → 滑步的错觉；
          //   ② 贴地那只脚后方拖一条擦地痕（跟着脚走，不是画在固定点）；
          //   ③ 影子钉在脚下、不上下（影子不动 = 身体没跳，是飘着滑）；
          //   ④ 每半循环换脚时点一撮尘：节奏感来自脚，不来自字幕。
          const sc2 = fx.scale, S = 0.6 + sc2;
          const mw = moonwalkPose(fx.t, sc2);
          const cyc = mw.cyc;
          // 脚底 y：头锚点在盒高 16%（原生 89.6），脚底 536 → 偏移 446
          const gy = fx.y + 446 * sc2;
          const cx = fx.x;
          const oval = (x, y, rx, ry) => {
            ctx.beginPath();
            if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            else ctx.arc(x, y, (rx + ry) / 2, 0, Math.PI * 2);
          };
          const fadeIn = Math.min(1, p / 0.06) * Math.max(0, 1 - Math.max(0, p - 0.94) * 16);

          if (fx.kind !== 'bust') {
            const hw = 96 * S;
            ctx.strokeStyle = 'rgba(107,68,35,0.95)';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.34 * fadeIn;
            ctx.beginPath(); ctx.moveTo(cx - hw, gy); ctx.lineTo(cx + hw, gy); ctx.stroke();
            // 斜刻度：随 scroll 右移（旅行方向是左，地面相对向右）
            const gap = 17 * S;
            const off = mw.scroll % gap;
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            for (let k = -6; k <= 6; k++) {
              const tx = cx + k * gap + off;
              if (tx < cx - hw || tx > cx + hw) continue;
              const edge = 1 - Math.abs(tx - cx) / hw;
              ctx.globalAlpha = 0.46 * edge * fadeIn;
              ctx.beginPath();
              ctx.moveTo(tx, gy + 1);
              ctx.lineTo(tx - 4.5 * S, gy + 6 * S);
              ctx.stroke();
            }
          }

          // ③ 影子：钉在脚下中心，随拍点脉动（踩下去那一下影子铺开，读得出重音）
          const bp0 = Math.exp(-mw.u * 9);
          ctx.globalAlpha = (0.20 + 0.10 * bp0) * fadeIn;
          ctx.fillStyle = '#3A2410';
          oval(cx, gy + 1, 54 * sc2 * (1 + 0.10 * bp0), 8 * sc2 * (1 + 0.10 * bp0));
          ctx.fill();

          // ② 擦地痕：贴地那只脚的后方（+x），从脚后缘往后拖
          for (let i = 0; i < 2; i++) {
            const f = mw.feet[i];
            if (!f.flat) continue;
            const fxc = cx + (f.x - 200) * sc2;
            const tail = fxc + 30 * sc2;
            const len = 28 * S;
            ctx.strokeStyle = 'rgba(168,104,42,0.95)';
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.34 * fadeIn;
            ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.moveTo(tail, gy + 2); ctx.lineTo(tail + len, gy + 2); ctx.stroke();
            ctx.globalAlpha = 0.16 * fadeIn;
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(tail + 4 * S, gy + 7 * S); ctx.lineTo(tail + len * 0.7, gy + 7 * S); ctx.stroke();
          }

          // ④ 拍点（每 0.62s 一次）：落地脚下光环 + 三粒尘——节奏看脚，不看字幕。
          //    用 mw.u（拍内相位）而不是循环相位：一拍一次，和配乐的鼓点严格同拍。
          const nf = mw.feet[0].flat ? mw.feet[0] : mw.feet[1];
          const bxc = cx + (nf.x - 200) * sc2;
          if (mw.u < 0.30) {
            const bp = mw.u / 0.30;
            ctx.globalAlpha = (1 - bp) * 0.55 * fadeIn;
            ctx.strokeStyle = 'rgba(228,186,118,0.95)';
            ctx.lineWidth = 2;
            oval(bxc, gy + 2, (10 + bp * 24) * S, (3.6 + bp * 7) * S);
            ctx.stroke();
            ctx.fillStyle = 'rgba(206,170,116,0.9)';
            for (let k = 0; k < 3; k++) {
              const a = (k / 3) * Math.PI * 2 + cyc * 9;
              ctx.globalAlpha = (1 - bp) * 0.42 * fadeIn;
              ctx.beginPath();
              ctx.arc(bxc + Math.cos(a) * (7 + bp * 13) * S, gy - bp * 8 * S + Math.sin(a) * 3 * S,
                1.9 * S, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          return;
        }
        if (p < M0) {
          // 蹭：心心/音符上浮
          const marks = ['♥', '♪', '♥'];
          for (let i = 0; i < 3; i++) {
            const lp = Math.max(0, Math.min(1, p * 1.9 - i * 0.14));
            if (lp <= 0 || lp >= 1) continue;
            const sway = Math.sin(lp * Math.PI * 2 + i * 2) * 6;
            ctx.globalAlpha = (1 - lp) * 0.9;
            ctx.fillStyle = i === 1 ? 'rgba(184,115,51,0.9)' : 'rgba(214,69,69,0.85)';
            ctx.font = Math.round(13 + fx.scale * 8) + 'px serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(marks[i], fx.x + (i - 1) * 16 * S3 + sway, fx.y - 14 - lp * 26 * S3);
          }
        } else if (p < B0) {
          // 化饼：头顶 Zzz（三字错峰、越化越省略号）。
          // 十二版：Zzz 跟着**压扁后的头顶**走——旧版按未压扁的盒顶锚定，
          // 一塌下去字符就悬在半空（sy 0.3 时差 118px，肉眼是"字飘了"）。
          const mp = (p - M0) / (B0 - M0);
          const syNow = p < M1 ? 1 - (1 - DEEP) * smoother((p - M0) / (M1 - M0)) : DEEP;
          const hy = fx.y + 470.4 * fx.scale * (1 - syNow);   // 0.84×560×scale：头顶到盒底
          for (let i = 0; i < 3; i++) {
            const lp = Math.max(0, Math.min(1, mp * 1.5 - i * 0.22));
            if (lp <= 0 || lp >= 1) continue;
            ctx.globalAlpha = (1 - lp) * 0.85;
            ctx.fillStyle = 'rgba(120,110,100,0.9)';
            ctx.font = Math.round((11 + i * 2) * (0.8 + fx.scale)) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('Z', fx.x + (i + 1) * 10 * (0.6 + fx.scale) + lp * 4, hy - 8 - (i * 12 + lp * 14) * (0.6 + fx.scale));
          }
        } else {
          // 弹回：「啵」大字 + 金色星（combo 加星环）；起点仍贴着饼顶，随弹起一起抬
          const bp = (p - B0) / (1 - B0);
          const syNow = bp < 0.55
            ? DEEP + (PEAK - DEEP) * smoother(bp / 0.55)
            : PEAK - (PEAK - 1) * smoother((bp - 0.55) / 0.45);
          const hy = fx.y + 470.4 * fx.scale * (1 - syNow);
          ctx.globalAlpha = (1 - bp) * 0.95;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round((16 + fx.scale * 10) * (1 + bp * 0.6)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('啵', fx.x, hy - 20 * S3 - bp * 18);
          if (fx.combo) starRing(ctx, fx.x, fx.y + 30 * S3, bp, S3);
        }
      } else if (fx.zone === 'belly') {
        // 「!!」惊跳字 + 波纹（抖毛期两圈扩散）
        if (p < 0.35) {
          const lp = Math.min(p / 0.35, 1);
          ctx.globalAlpha = (1 - lp) * 0.95;
          ctx.fillStyle = 'rgba(214,69,69,0.95)';
          ctx.font = 'bold ' + Math.round((18 + fx.scale * 10) * (1 + lp * 0.3)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!!', fx.x, fx.y - 30 * S3 - lp * 20);
        } else {
          for (let i = 0; i < 2; i++) {
            const lp = Math.max(0, Math.min(1, (p - 0.3) * 1.6 - i * 0.25));
            if (lp <= 0 || lp >= 1) continue;
            ctx.globalAlpha = (1 - lp) * 0.5;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, (8 + lp * 26) * S3, 0, Math.PI * 2);
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(184,115,51,0.8)'; ctx.stroke();
          }
        }
        if (fx.combo) starRing(ctx, fx.x, fx.y, p, S3);
      } else {
        // 挠脚：星花迸开 + 「哈哈哈」三字错峰上浮
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2;
          const r0 = 6 * S3, r1 = (6 + p * 16) * S3;
          ctx.globalAlpha = fade * 0.8;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
          ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,195,60,0.9)'; ctx.stroke();
        }
        const hs = ['哈', '哈', '哈'];
        for (let i = 0; i < 3; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.5 - i * 0.16));
          if (lp <= 0 || lp >= 1) continue;
          ctx.globalAlpha = (1 - lp) * 0.9;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round((13 + fx.scale * 7) * (1 + i * 0.12)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(hs[i], fx.x + (i - 1) * 20 * (0.5 + fx.scale), fx.y - 30 * S3 - lp * 30 * (0.6 + fx.scale) - i * 6);
        }
        if (fx.combo) starRing(ctx, fx.x, fx.y, p, S3);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    /** 测试/调试钩子 */
    _fx() { return fx; },
    _streak() { return streak; },
  };
}

/** 金色星星环（连击过载标记）：6 颗小星从中心扩散 */
function starRing(ctx, x, y, p, S3) {
  if (p <= 0 || p >= 1) return;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + p * 1.2;
    const r = (10 + p * 30) * S3;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.fillStyle = 'rgba(242,195,60,0.95)';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.6 * (0.6 + S3 * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
}

const api = { petZones, create, soundFor, COOLDOWN_HEAD, COOLDOWN_OTHER, LIFE, LIFE_COMBO, STREAK_WIN, STREAK_TTL, MOONWALK_STEP, MOONWALK_CYCLE, moonwalkPose };
// 双端导出：小游戏 require（module.exports）+ 浏览器预览页（window.Pet）
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)).Pet = api;

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
  // 教学局不计战绩、不入错题本（§4.19 定稿口径，此处补上实际短路——原实现漏了）
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

// ---------------- 错题本（错句复仇 MVP，2026-11-19） ----------------
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
/** 错题本状态摘要（首页战绩签 / 结算页展示用） */
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
__reg("js/app/voice_data.js", function (module, exports, require) {
'use strict';
/**
 * 小老虎叫声采样（由 tools/render_voice.py 生成，勿手改）。
 * 为什么改成采样：WebAudio 的锯齿波 + 2 带通做不出声门脉冲与 F3/F4，
 * 调多久都是「电子哨」。离线用物理模型（Rosenberg 声门脉冲 + 4 级共振峰
 * + 气声 + 破音）渲染成 PCM，运行时 decodeAudioData 直接播。
 * 纯 PCM（无 WAV 头）：22.05kHz / 单声道 / 16bit 小端。
 * 解码失败（旧基础库无 decodeAudioData）时 sound.js 自动落回实时合成。
 */
const SR = 22050;
const PURR =
  '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' +
  'hf8=';
const CHIRP =
  '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' +
  '5gIaArQBrQHeARcCKgLtAVoBfABj/yP+4fy+++D6Zvpn+vn6Gvy+/cv/AgIKBJ0FnQYAB+AGRwZSBSoEEgNBAs0BtQHTAQICGwIAAp4B8QALAAX/7/3j/AD8' +
  'Z/s1+237DfwT/Yr+VAA8Au4DMQXvBTQGCAZ8BaYErAPBAh4CzwHLAekBEQIhAvwBkgHgAPj/8f7f/dv8DfyR+4b76vu3/OL9Vf/zAJUC+wP5BIAFmQVUBccE' +
  'CQRAA5ECFwLbAcwB1QHbAccBiwEXAXMArP/Z/g7+YP3y/Nj8HP2t/Wz+RP81ADwBSAIxA9UDJwQxBAcEtANKA9kCcwIhAu0BzgG7Aa0BmAFrARUBlgABAGv/' +
  '3/5l/hH++P0c/m/+3v5b/+v/mABaARYCqgIIAzQDPAMvAxcD8wLFApcCZQIwAv4B0QGkAW0BGwGvADUAuf9D/9/+k/5v/nX+nv7e/jH/nP8mAM8AgAEcApIC' +
  '4QIPAyADHQMFA98CrQJ1AjkC/wHPAaQBcAEpAc8AbQAKAK3/V/8P/97+zf7e/gb/Qf+U/wYAlgAyAcQBOwKPAsQC3QLcAscCpAJ3AkACBALOAaIBfgFaASoB' +
  '6gCeAE8AAgC9/4H/Wv9N/1v/e/+o/+T/MgCUAAIBbQHIAQoCNQJOAloCWgJRAjwCGgLsAbwBjgFjATgBCAHPAJMAWAAmAAEA7//t//7/HABCAGsAkgC5AOEA' +
  'CAExAVcBeAGRAaQBtAHDAc4B1AHNAbkBmgF3AVABJgH7AMwAnQByAFEAPgA+AFIAdwCkANMA+wAcATMBQQFFAUEBOQEuASIBGgEWARsBKQE6AUoBVQFXAVEB' +
  'QwEtAQ8B6wDFAKEAhgB6AH8AlwA=';
const YELP =
  'PwBBAFAAcgCvAPcALAE1AR8B7ADEAJcAOQC7/zH/jP7e/QT9E/xd+3H7/fxOAIQEwAf+By8FtAFHAC0BDwLPAL/9J/uz+vP72f0RABwDMAbSBxkHkwTZAXQA' +
  '9P+j/hf7z/UC8XHvTPMn/KAGlw10DpsKeAYzBTIGkAYxBMT/Fftv9+70yPSF+Lv/2wfaDGAMuQfMAuEA5wEiAiD+VvVs63bmf+rE91AI5xJtE/IM4Aa4BYgH' +
  'hggYB2QEtQAZ+xr0ze+x8pv8sQegDckLUwV///n8Zvwx+z73svHX7gzztf18CEoMBgmqBSgI0QxIDTMHWv8D/QQAyAFE/rD4ufjr/yMIDwoeBS7+nPnh9xj2' +
  'bfF4693qhvVGCLcWaheFC77/2P/vCckP4QpoAAv6ofoA/b37d/m4/doHow+cDYMCmvZ98Djw5vAo7xvuhfSaA9AR9hROC4sACwKxDcoWmBGpAS71SfS9+jn/' +
  'M/+E/hIBJwRrAwz9g/Rp8NPwEPPa9Zn7iwSPDdgQKgwHA+j9gQDvB5IL4QeGAEn7ifvH/g8DwQV1BiYGGwOU/e/1G+095yfnE+/+/U8OGhi+FUYKOgDq//oG' +
  'qQujCdgCVP2++v35B/rQ/HYDDgmlCZADivkj8cLsWeyi8Ov7MQsYFWwSaAXr+bf6EAVBDR8MkATy/Tj9uv/hAAMBRgI+BXMEk/419N/o0+JS5WryPAhsHBMi' +
  'XxYkAov2cvw6CogQPQpm/Yfz2vEK9sz9QwcoD7AQGwij9+Pmd92q4HfzuA+7I1UiFwwo8lXt0v/2FrAdoQ8k+mPr5+i27v75FwgeEwsStwHk6TnaD9um7hsQ' +
  '2iokL6IY5fSl4krvKw5SIcwbgwZJ8p/paunv7En3gwguFjISxfgb2/zN8N3kCvYzUD30I9X0y9pW5ywMCybHIygMYfKj5SjiReWr8UkF+hPXDhf13tg+0aLo' +
  'TRtKPxJBnh1X6Y3UY+j1EbYoiCG1BorunOWz52Pw3v2jCkgLzPdi2CLJOdk9Dk0+I0ggLH/yMdRe4AMMuCwsLBcQ1OxV2qjbUekW/T4O8hD3/czbg8kJ2F4N' +
  'ET8URXcnsO9/1IXhJgkFJ/knTRKg9FPfTdpt5gH/TBPwEZr24dHHxQjhQB6TSXtH5hzg4ffKcuGhD/AtIiuED+zut9sU2i/pFANfFrkRi/QY1EPO4u1wJXVG' +
  'ZEDjFl3mC9VY5i8Hyh4ZIGoMhvIN4KDcfOnw/RUKuQQz8nTmVvDFC30mqy2NILEJNPXF7tbzPgBECnENgAXN9ZPnreHq5v3xTPxUA2sJ5RBgFuMTDw0OCbUK' +
  'hxC7DdQBvPKH7Mrw4vle/xz9uPQF6Vvfn+RK/tAgxjG0JesGGPCW9oANSRzcFQMBfO+950fp5O1J9Kz3jPVz7h3v2ADEGqIpuSFZCe719/f9BpwRQQ2OAEH0' +
  'qes36jjtYvGq8qDw1fBn/zYZMitXJsgL2vLj757+QA5jEcwJn/5C9NHqDujg7YT1wfi19Vf3/QbGGn0jMxkeA9744P7nCWAKFf839EDyO/ZN+Or2wvLy65Ho' +
  'sfEqC0ImtyxoG8v9FPBo+K4INgyHAXP2bvUo+I/2+e9B7CXvZfXc/iAP0R+nJXgXrf3J7kr48wpAEUYEfPKZ7NfySvqJ+C/vl+VN5PHx8RERMAU2gh8a98fi' +
  'Lu/8CkkWUAmu9PnqHe108Q7zy/Jc8lP0r/zZDRYhNyZsGToCJ/ZJ/nsIRQWh9JXpv+5o/HgC1Pum8bbqbO30/CwXwywKLEQT/PH05aL4fhJRFrwBY+jQ4FTs' +
  'B/xTAsD8mfJe8dsAoBoOK+slHAsq8d/vowP1EUoJA++43a7iCPZaAy7/qvFS6cf09BTeMhA3jhy59V3lk/aaEAUUhvvg3c7Ue+E89jABNf0G9Rz2wQtLKe03' +
  'vimjBYXtL/TKCfgObPmc293SO+GU9RL8q/XM7uf0Ug3FKlY5STCMDGnqZ+Ym/woVMg3K7NPThdQH6KL60/+0/XL6mfwICvEfyi7HK/kPr/CR6Lv4rwjIBnP1' +
  'w+ZI5jLuK/Z3/MkA8f/b+kL9UBGSKEEt+BRh8gTnmvlmEGEPb/g64/ree+eD8xv8af98/Vn6cwP5GRUuWCtdDtrt4uiK/nkQiwgU7jrekONt9YMBZwA9+GPx' +
  'C/W1CFUjRzHjJHcDE+fv6BkAwQ90BwXxTOOJ6Mj3VQDp/x36RPMf9W8E7xxiK7UiAwZK7Grt3wMpE8gKyfOl5WXrFfpkANX5bOvg4evoOQXSKpA8ZS7tARTf' +
  'IOTCCFIhPRdW8UPVXdXA6ez+yQSo+3HwkfENCcQruTvOLFgCLeHC5JUB1xQNCqrtPt1f40D0Yv+A/u30vO/M960Rky1UNFgb8fON4hT1ghK9Fs/7R9yA1uPr' +
  'bgUTDA/9euhh3zLw8RmUPpJBMh1T50/T++w7F2kkOQof4cPOQNks88cGWgeH+cnrwfKPEzE0xTccHEPz2eN/8rEGjQYZ823jQObY9GAA/wGb/Vv2N/LS+ZIR' +
  '9CsoMWcWFu6J3JrslQuYFjEGLe3H4xDuCwHCDR4NfPsT4vTXNO5BIPlBODpJCoHaOddW/PIe1x15/nHdptYe6MsBJRCIB6HwId856pMSGzkUPMIb5eqi157o' +
  'DwRJCw/7OepP66H32gLsBfcA/PpP9WL29QcQIYcoUBT/75bbHOhIBvoU/Qji8pfsr/n3CyQUowtF9wDiytkA6GYMDS5GMkEW7Op62XDt4hAHIXIUPfmI6PDq' +
  'B/mjBlAIavku5D3cD/HuHew6eTRXDIXeX9ZZ8XoPYRTUAxbyOvB19339jf78/Gb5Z/b6+W8L5x11IJYMCPCi5SryuwSoCH7/6/q4AX4JXgbl+EHtIucM6Anx' +
  'OAgxJe4uHxso8dnai+q5DhUg4xDQ9RLsWPQ6AF8BFfeY5xXeluX8BOYuRD8hLbH09s3H2gEM0icaGI3tBNr657YDrhK9CIzyl+IY5zIEcywMO1gnGPUX0rDd' +
  'Qga4HFYMmetz4kv2SQyjCtDyvtzt30791yQAOb8reANn3Mrc6wKzJTofiPEFzHrUMgAWIkwYb+zry7PT9ASsO/hKci8p8J/HYdP/CMMtfCAK7JfH0NHA/S8i' +
  'zx7f+k3YvNdH/8sxPkRMK3jy483K2NoG+SYJHQ/zk9TW2Y765xXnE+X5l9tn1w76BjDRSJoylPc4zxzbhgz9K1IcCeuHyfvPwfTWFmkZkAFu5ofkzQfSNCBD' +
  '7SHN5vzMx+aIFUcj9QTK2KPL0+RlDRgfQw9v7pjckPCbIBBAqDR6/QHPeNMWBbQrjCB17sbKu9Gb+HMZGxjg+yDgieAHBg0yIEGSJKzrks955YkVuimaEP3h' +
  'jswA3CP8LQ3GA0TvtOaO+xgikDoFNgUMbt+72yUBSSMWHJDvH8yPzRzvmg+yEET5Secx7FYQFjUVPGgh5ezH0rjkuBELJcwNE+F/zdHe2AG0EzAHsu6z56r9' +
  'ZSVYOuAtY/5g2cfeUwg2Jqsc8+0lzeDS0vWVDkcGhemB3/31GSdsQfc5JAqW27vYlAHaJ+ojqPRjyT3G8OdoD0sVkPeK337pfxcGP2I/UxYQ35DSNPR5Ivon' +
  '7f9f0QjJGOiQDp8Td/hj3hLmTRLAOYU/nBst4y/Rme4EIhQwIw922SbHi95HCUgWcfxB2krXtv7cNbJIKTLF8uLOg+CsGEY1vh6L4Gu/ycsB/JIaCwxP5PnT' +
  'N/J4LmxKHj+mAuHP/NBAA94t9ihQ84fIY8lj8dIVZBCQ7FXYQO0eJOVB7TlcBjvWgtZLA4QsyiYX8m3Jecwn9wMdHxUr6XjN1dwvGpVEpEM+E4zWacxp+k8y' +
  'fjcGCHXLRr4/3VEQrxyU+5TU3tEDAeo6kUs7MnDs/8mQ3bYauDVcG9fcpMGm0tkGnh/rCendKsyc5vQmC0lBRCIM9c/CyD/6lTEYNXAC8MqQwjTn8Bf0ITgA' +
  'otMdyMTmhioQTkZL2AptyTvAW/l7N9o+gwkNyLi4gdw7FiorOgsV2AHB391eKjNYRFLSBYa7ubiY+8E/vUH+ATu/X7h95uQi1i6sB/jPvLsL4X40SV4ETY/4' +
  'qLM2vKQJr0nsQJj18bJstNjupjA3NKEAGsLKtw3otEEDYP1HTu4YshO9tgm5Q/o3jvDDuKq/cPxIM4Y0owJEyRC6ut4cKy5VEUncCSjBrLpV8VY6fER/FYbJ' +
  'crRX18sZSDyIIzjhlrcLxDAPvFdAXzstEMdkpSDOFy+fUKEqRs8bqG3E3Q06QAoqbebBu7rTlib0XINRRwBisp+yMvyPQ1pAePeBtG+4Iv16Oss2lfASt0y5' +
  '9QfhVvRkyyYMwAyi5tn5PktaryB9uWSbscpuLzNU/STsx7ehOcWPMxNuvWTjArWjG58q8h5Sz1lqC6qqhpsU12I6GFdWJsjN3aZewxsroGY3Y4QKJ6vzn+7p' +
  '0klkWyEeW7lqnpTGjiMIT0ouneDJrzHAdx6uXihkBhVCsyShTuKePpRS+BQcvP+kk9DQJlBJkSZa3UC3JNWJKiVbCU7P8cStLLO0B5BId0Is85K1RLl7/Gw3' +
  'UDdj+rjAhriy9npHtV/KOGnQL6fXyX0vvVZTMjLLcqFOubwZvUzSPDnniLC5tXsLslgeZfguGr1WnxzIwDoFXNg06sMRnkS4iiAYUm1Ag+Xyrhe4NRBoWadh' +
  'AicguRKif9EAP/pY9ip3vUyfAr9HJRVQkjRq3SKzRc3ALMJbWFO19g+uva+MBG1Lzkj68oStD6wL9XA9Dz+k+VLAg8NbEnlQo1UtEnC+oLMv9E5ATUhABWK4' +
  'xq0K5XQuIDYb+CTG7srnHklR4VXxBRG5jq5r/v9GOE5x+ZuwC6ae6iY7n0YU/au+l7+EFWBVzlPKD7izJbCt8ABMcU1VC4uxVazE3Dk2TzyO/ju7QcV6Gqla' +
  '4VOGC1yzmrLf+0NMDkrh+eWr5a1x8MQ/YTw/7BmxyL7+JOlkhloOA1OoQ6vJACBYRlXM/7mlwab+7MVEy0TW7vun+K01EEpnLmaYJvSuMKRL37pRKFzBJnKx' +
  'S6CywnQqH0ZHF5zCw7Wk9vxSkFvCNr7J5bGW2HE4b0zWHg2+o62PyYAgWzl7C3/KRMmYGOZSXEuKCTu4TMBL/9ZKCTz377epGrr79kpDbDQq53qy88skNyFi' +
  'GEj85feiEL1dHsZeJUQY38CdkbWwBWRQADru1eqmgcGMOE1mAU2l71WgXbgdHPljj0xi54qaBa9c+4VQJD4j2Y+ho7paMMptpFVXBQqd56+ZAsJlDVPA/j+Y' +
  '5qWV4aVO9Eda+ESo37enFXBorVfFG1em2a1v551V1VACGWKrvqqQ1zU96kSBBQG347XR8XFUgFOhOlbBc7KdzUQ72kyHM/HF6rIHvlIZjz1MJknTE7tw0Cs3' +
  '3kwtUML0aLvVt+QHHUN4R0X3vL76s4nqczAGOC3/m8dEv0EEbT8aUhYvuNEOuVDWhi9oSAwpltLstEm+XhLjMmgcuNaJwDvolzQ5UldIauZFulK+UBpARis8' +
  'neSktFquj/3FN8g7vu1SvC/D1BrmVK1eIA3Vt1GlQO/ZRm1Z/hc7uiueT87oK8JJChY+xEqzLui1R8ZgGkQB1BiqJsRgLPdTNDhL0S6lh7UWEQtBiyt11UC2' +
  'UNJ9Ne1c6VUu9MKuk7D8DDZRn09t9UWt1KZ/8P86CUHE8ei0fLNTBa1VSGUZNtnEHqWizpI68FooMfXEppzmtqoY2kxXMOfVma73x8osGl8nXjIHQLXhqkn3' +
  'WUYgT1cJy7lKqg7fdiWdNnP/pcflvg3670PmW7s2Md9Zsy/TeCXCSdor7djXrSfDmQq5OPwgEdqKuVHMfSF5WaFbuR1euyirs+KjP0tRnyKmv7yj8cAVG0ZF' +
  'tya12Zu1L83vLEpfz1pKB1WzIK+M8lNDCkrZClG4y62i3PgnBznjDwjUdb+m7EA7KFl1P8LkmbWQxtkZ+EW0OuTm1bN+ucr6Yy4xJzDr3MQ/yhgZ9k5RWh8c' +
  'z8qcscrmrTLqSfgUgcOMqN7O9BwNQWEbIdfitXfdjjgUYz1USfbJrW+voQCqSQRNV/6KsIqmSt10LOI6DwXrydq7XQAqSj1i/DVa186r+NB0JnJOHCuR0Qum' +
  'sLqjCKE+5CiR5O+7qc7/JyNZBlsODGa44qpO7tI/b09/EgO/P6ss1gkjAD5REn7RDbbG3I82KV7qTzv3prKWtgQGUEhMRpD5jbIFrg7mxi2COegHt8rYtirn' +
  '9zohYP5OOPmysjO3J/4fQidAzPvqua20B+dTKVg0YhEr1SDAVeBpKP9U40uVCyLDZ7v967kxTDvYDpDOWr063T8TTinBFibhs8mg2j8XHUi1RxsZ0dWWwbDl' +
  'FCJPM/4Tmd2DyfnjTAzbIfsOXOMNzdjYHg/tQv5KFyZE4sPAdNrMGPs4VCUY6pHC5M+k+OoikBxB9RjRedIPAfA7mkz0MMvsCMAq0F8KtzRPJkPupMNIzkD6' +
  'HSgzIaT4QM6D0CUAfDxMTDwuK+ggvsHP8Q0NOfgn7uopwcTPNQXuMaQn9vKYwYLEDvuqQV5UpjW76Py39MXdCYw+hTTm9hrAucI29P0nVjBFBpTSz8Qk6Ckr' +
  'qk/OQVoHU8rawrPwTijkMA4LdNhwzAHstRHVH7cALdoN0MDzfC34S983q/spx8DK1AC+MYQt6/e2xFfFmPdJKckxQwJoy1i84ujHNJ9Z/ULv+Z+4wrvN+ZQ6' +
  'xzxlA1bA97c06YArY0BKFDnQt7Jr1sUoZ11HUFANhr05tFfpQzTTQ5QYLNLaurLbzRPPLwYVt9suvm/apiI2VfJLWg/ly+vC3fN6Lyg2hwS1yKy8euUiH6wv' +
  '3gpTzh+8H+zCP8llFEw08bmtx7XmAQdFGEET+dixoazn42ExckL/EADK7bvx+VNMGWQ7N4DV9ahmyGscNkjvKrfXN6qRu+UC2DtFMmD0hsPu02UhMVjgU2wD' +
  'X7jGsnL4zj4vRZv/KbZ+p5PayyrRRpQastZuuLnjmjb2XYRLIO4is4m6gQndP1M76PObunC1sudcIhcvugd03CfV8AQxOjNMlCrr4dzEcOM1IfA2rBWv04C3' +
  'wcv+BSQobxe36l3RO+m+KPZL9UoSCcfIaL5A9GQtSjerAc3EBrQo1mUVoy3cDz3k5dbWAro4IUxGMZ7mCMBW0GIQMDXKJnfmvb50xJT24CI9G63t4s1e3awl' +
  'M1AET1MTWMfoukrw3DVtQ50PeMDLqmrKRRKaNKYVddrowOHlCjodX/9RogFuuYu5tPtQPHE9Efzbt92tt9izHNMuDQdY1dPKiwDkRpNadjzv5G21C8fwD/8+' +
  '/y9F6dq2+7w68jgqUisF/ibNxMcG+xRB9VaMPG/t7LvGybQK5DyUM0L2ksDvv//pwBnkH6P8+c17xxjx5zmyWGVJWAMLxQDEp/tVNCgzG/y0w8+6luCwEoEl' +
  'RgrY2/bNqerVKjxQQUrbE+TRi79b5sggAzChDAXYZMbr4csMJSZGEz3rKtNB3y4QBT4QQ5ggn+ZRyQ/gNxFhKiUYOe2O1Vzil/6cEvYDlOtd237qRxNpOL06' +
  '/xuc6cXRMOfREjco5RLD49rKqtvmA14gSA+W5j7KzdtlFCNJy01aKe/iqL/w04wPOTKNIcHoPsJozCX5HSXMJWD9QNEx0bT+XTqAStovBvGZxnzOTf9lJScf' +
  'WvVA04jZFf8hIIcgEPr906nPPPQiKmhEpzPsARvU0dFP+WIizyUyBanfnduN9uoRYhZR97bWHsza5t0YyECrQGQgbO7O1NzlyQ3fI4YUwewl1m3iXf9kFaQJ' +
  'quoj0cjYif8dNrhJ4DaIAubM/sld8EwftSVtBcjcQtin72IQmRiQAo3iQtkN738byjr9M7AQi9840HPpAhNlIBQLW+uk5Aj5JRKkE4D2tNUqzpXoxxaxOlI5' +
  'jRy56t3Rj+ORDzQpOxv78n3ZteLW/LEQXwWg7IraO+OxAQwrMjtGL3EKRt761PPu8hLbGjkGTuvz6H75NAzJBS/vtt3C4sX8aSFeNFQsFA4p5AbYXO37EO0b' +
  '+Qc263Loifu8EbEMruzQ0CTSf/HGIbc+XTZlF/jkPdEX5xcTXidWFjvunNjk4tr8oA5tBCPsct4y7IkNtS48NHwgfvgv2wrguP1WFY8OqfLE4vfvFQxDG48J' +
  'Yuk71nzi5APgKBI13yXFAO/aJNY38bUVeR9BDffyZO2S+n8KHgqz91TlaOHI7Y4Fzh9rKSAg3ARf6brki/YzC6wP+wS0+iX6rP5t+6btsuSj5+P1xAbKGYEj' +
  'ryGWEbH1beeR7wsEdg7LBS33vvIl+aYAbf2A9XnvQvAc97oGBhv8JI8e7gIs5fnfB/NcDEwVkA5TAa36Ovt7+D7yfuy46ifrePOWCWkjTS1XIDT6Cd4W4gUC' +
  '7BwaILkMRfXd6oDoouo/8Qz2d/V38Z33kw89KaQwAh2C9M/dkua+AeQRkg5w//f0EfNq84P27fnu+n/2xPPv/fkV9SeBJHQEOeGd16Tsig1RHkcahAen9+Hu' +
  '3O93+LcAXP+48tjl8usBCH0iWybyDKnrTuC88N4NWSDwHCwKw/Sp5iPnwfQhAsABzu8f36zk0QXnKTU0Th7j87XZGuA1ACMgcSq6GMf4ud6V3OfwyQq5FBwF' +
  'pejg16jjsgYuJjwqthIO8PbfGfDUEZMomyIxBzTqXOHC7IEA5grHBLjwR9yw10PplwtPJ1UrmRlZ/0PyJPuADEIXghNIB+X5JfE87mPvLPSx9hXz/uol5kfv' +
  'IQmpI68tViIMCJT0bvIY/uIKZg5NB5P6h++B65PuafbH+bTzHenc5xD5qRaiK/QqExQx+nnw1PvNDxMYsg9S/TztBeiI7Vr2zvnK8pblTeHD8b0U1zGtMz8Z' +
  '0PXL55j4rhQMIn0VofnL4xPh5uym+nr/VPV547PaYOsrEz03gTyCHhDxdtsO7cQS3il2H6L9od9y1x3klfmnBZf/R+xw3jzn2wkaLz87nCYq/WvhG+cOBd0c' +
  'dhvYBUDum+OJ6F31X/+P/szzc+kv7B8DxiC9LmEjnARf6YXnDf0mFfgc3xDv+QzoOeRf7Bj3kfvr9RLtSu2k/+wbjCxmJlELkvDn6639uhQjHHUPYve15Ozf' +
  '3+jO9YD78/bS72PyLAYoHxsqBSDgBHTvKO+PAMYRIBNvA9zw3ueK7Jj5sAIz/3/wfORl6nwFRiOELSQft/5X5sPn8f4dF2kdIBGm/MfpA+NZ6c72Jf9g/H7z' +
  '2/At/qgULyH4G6MJMPlo+DwEqQ7zDYkDkPh58tHx/fN69NbvU+lf5wD0Qw/GJvwq+xdY+Ufo4/AkCcobdRpoB1TxWeUE50b0TQJKBR369+m35vv5RBmVKg4j' +
  'JAch7kPrav2BFGccMhIMAArwqOlS7HjyqvWy8FPo4eoxAHkd+SvkIEoEL+8t8kMJbR4EHqAIke5T4KDiUvC//RP/SvLa5Ino/gI8JMMymybdBd/rGez/APcV' +
  'eBjeB7DyZea251jxy/mi+bPxLexx9YsOHSfGK6oWYvWq5UvySA40H1cWgP3+6Djk5e7x/ScD0vn56Srizu7PDVAn3SuzFv724+j48+wLCBoPFVwDb/JW6qHq' +
  '3vAr9p72TPKu8L/5SA42IHshzBAo/Bn2ywCIEIEVdwvq+5nxou8681b2YvYn7xPlOeIs8/IUti8zMtMaDPc35zHz/gzlHfkYugKg65neVd8P6xL3Mvoz9f/x' +
  'Mv2BFX0naSUSDw/2nu+h/NEOHRQLCMH1nOvd7aj3jwD2/gzz5OWF5QT7IhskLlYowgk66XPh2PXvE7Qj5BsLBSXvxuND5gTy9vrJ+C/t/+aO8V8MIiOhJsQU' +
  'KP139VoBGhFfFlINh/318TDtQu9G8qfxp+to5ojq7/13Gm8sTykDEW30b+uc+WcQ/BsuFLP/gu345fLqMfbM/dr5MuyN4u3qOgesI88tVB/qACPtc/AYBSUZ' +
  'BxzODjD63+q/5+HsXvMS9Z/vVOjc7NgAGRsnKRsiowvL+G755QnQGKwXSAiW9JHosOfL7q31avJA577e5uX5AeojDDX3LMwO3vHd7M7+KhWlHLcQ6Pk35u7f' +
  '/OWg8DX29vL57Grv6QFKHA0r7SS4DGz2CPQPBIoWzxnhC672qudO5kvtX/T280rq3OCp5Ir8Sh5RM28wvRVd9l3sX/oLEo0cehId/EHo0eAf5a3vPvZH807r' +
  '0+mE+X4W3Sz8LXAXOvoo7qT4VwtBFQYO1vy67V/opO3L99T9GfkF7UHlie5oCV8klCwiHjkCA+9s8ZIELha2GTsPZP3g7h7p7+s08VvySO3k53rtFgJNG5Ao' +
  'lCD+CZ/3IvkRCmgaFRsDDNH1ceUG4TPogvI79pPvsuY36sgAah77LqMo8g6x9PXuXf5gEggZCA+w+9bqVeU/6oDyGfUe8LLorulX+zEXKyqTKMMSQPhw7yb8' +
  '2hG/HIoV2gJK8FXnkuiA7zf1aPOF6ofj++hX/2obECt6Jh4Tuf6T+UcD3A8/FIYNLP/N8djqu+pE7YjuF+wY6MfoGPT1CSUgBSq1IqEOZvyG+HkC9Q/gFIgM' +
  '+vsP7T/nbOqd8dr26PVL72jozeoN+7wTAifbKdocOQkg/Aj8GAQ8CgcJSAJu+vbyle1c6prpqOpx7Hruo/T7AZ0TKCEfI2UY1wnDAm8F6wsuDKEEUPlX8Ant' +
  '1O778y/4vfdJ8eDn3+US8YwJ/SKfLoUncRJ//ZP0E/nyA9sLIwuMAsj12eqW59Trd/Oa9132YfK68g/9iw5oHmEk3B7REe8DlPt2+Sr8PADOAdz/IfvW9Ojv' +
  'a+wb6/fsnvD09psBiA/WGvkdZxedCg8Ag/4KA/wHtwZ4/tTzlO0B75j1r/wmAIL9Q/Wu7EHqofOzCFwf4Cq0JHYP9/ff6+jvfP0sC+EPwwl8+8ztzuhr7aD4' +
  '7gHoAWr5c+9D72b9xROMJEQlMhYVAV/zPPKd+VIEWgoaCOn/gPYN8R7xkfMZ9YbzbO8v7zv4lgrbHGUkvxytCuD6uvah/s0IqgwOB9j7z/Gv7vbyR/spAGf9' +
  'NvSB6dnlZ/AdB5Ye/ygQIv4NFvm28P/2iwPlC3sKiAIi+lr11PSp9zr6u/nd9LXteOjK7N771hEBI/QmzRv/B9L3lfNN+qMEEwzqC1AGi/2N9Yfwy+/z8Dnx' +
  'LO8E7Ivsq/b3Cqwf5SmiIzER1v3c9AT4igHHCTULwAY1/ln16O6J7Hrt8O878VTw+e+y9Y8EaRelJO8kiRjQBkv5//Ri+vwCOQgSCAsDC/zv9Tbyn/Hk8tDz' +
  'aPEK7oXuDfj0ChofQihEIZEOQvvN8kT4dQSQDlMQcwmt/YXzO+/q7yfyJPLW7Z7o7+f58jQImB4HKrokZBOOALb3fPvHBckNtw39BLz4Fe7P6WXree8N8iHx' +
  'ie407yj52gqxHS4nfyL+EQQA+fVZ9yIANwn7DOQJNAAE9dztNuyK7+vzpvWT8kfuSe/e+UUNHCHoKF8hUQ4e+7TyfPfDAh0MxQ6rCSn/NvOg643qNe7U8Tny' +
  'sPB98O731gdGGdgjfSE0FNsDlvmK+XwADAghC1IHAv4n9FrtdeuE7izz/PUp9vj0WPZm/l4NUhxXIssbwQv5+2P1PPjuANEHTwheArD5G/Pl8A/zP/Zx+N/3' +
  '1fTj8a7za/xrC64ZCR+6GCMK8/sf9p/66QSgDQEPBAit/IfyZe2c7hvzUff3+BX3QfQw9Jn6eAcOFcwcphpwDxwBh/iv+I//sAZkCQIG6/4894jxE/Aj8jX2' +
  'GPrZ+4r6Dfjr9+L+TgteFrUZzxI0BqH84PoR/8IElQY/A1L9UPg79b/0NPY1+ZX8nP7T/XX5uvUY9i7+awzoF7sacBPYBmD9Jvvm/o0DEAciB34CJvzd9bXx' +
  '5/AF81j28vdG9lX0iPW5/dILVxnDHmYaiQ9MBFz+o/1oAJ0CzgGh/b74iPSp8S/x5vLv9d73APjc9tn4nQBADQQZ3h2TGLALaP6g90b4MP6CBO8GHwQD/hL3' +
  'GvJw8VT0ovkA/iT+uvlk9LXz9PxNDQMbzB6bFgcIFvy09+D6sQBhBZwFmQJz/RL3wvEQ79jvmPMo97n4N/gF+koB8A1pGREdHRf3CygCGf5l/44CegQvA+f/' +
  'v/qc9Z/xp/A98xH3zPhr9s3y2PJT+50LMhx5IzEe5A5u/u31XfdM/gYG/gngBwMBwvfR70zrEO3S8gD52vtF+oL3RfniAvQQBxtyHAAVNQlg/078O/7HAc8D' +
  'EQMK/1L5OvSl8T/yevQ99hP2kPMQ8in2vAKzE+ggeCMwGsQJI/xE92/7UgNXCY8J4wPq+t/wCOt36u3twfOU97L3DPdj+vsD9BFeHeUgPxoTDhwDuv0I/r8A' +
  'TQIvAff9D/ms817vau3n7UvwivMh97/71QOgDuMXxRxqGocRqAYl//P81f7RAdEC3gCp/Nj24vEp7+Dus+9e8Yzz1PZf/VwHiRLZGdAZfBPgCd4CrAGmA5cF' +
  'NAWyAl//S/vs9iXyJe506/nq7OxV8U342wJnDwwZ9xu8F+wOiQc+BM0EcwUnBPMAkvwu+Xr3fvYL9dvxN+4z61Pqb+70+HMIXBi9IYIgfhV8B5/9rPuG/0gE' +
  'mQZFBbsAa/pd9GfxlPDf8brzd/SS89fyK/Vq/d0KcBhIH8YcLxMZB83+Evyy/dwAugLkAm0BJP6k+OzxjOwm6nHrze899U/77gF7CkATuBfVFikRTgqkBfsE' +
  'jAWqBJABQ/1R+cH2BPXd84rzefPq89n0yPX19rr6AgO+Dp0YrRtbFk0LBgFE/ED9igFDBcAFgwL9/Hr2VvHR7yHywfcq/Q//VvyW92f2+fxgCVYVoxrXFxsP' +
  'zgWs/yj9Xv1z/uj/CQGoAAD90faC8M3sVO1r8Prz1/dP/RsGBBCNF+8YixNICs8DGQKDAwEFUgRtAdT8Tvjo9M7y7vKK9IT3Tvn991j1PPTI+LAEIBSTHzAh' +
  'NBhQCX38i/ea+dn+KwNZBLcBU/wk9kzxIu+K8PPzMfcu+Av4T/puAnsOFhkeHZIYaw53A4z8bPuO/T4AwAG1AXz+Mfk39JvwF/AW8t/09fWv9Yv2ZPwXCM8V' +
  'nB4yHs0T/gU7+6L3pfpBAMUE/gVkA1n95/YJ8qDwy/JF9zv7Xfve9zT0mfYbAlMSux2eHmEWvgl7/zD8SP7DAlwFcQW2AYr7LfVL8DLuYu8D8mD0+PTB9AL4' +
  'TQEFD50aYB6lGMoNzAOf/qD/5AN6BpMFggDa+AjyRu527hfyl/ay+eP5IvdO9Y74DgMKEf8bFh6EFgkKmf99+zz97ADFAvsAHPwc963zlvKG9Cn5jv3N/n78' +
  'E/e/8tzzMf0vDCAZZB2QFz8L6/+0+mf7rP8sBNQGVgbmAoj9cfdv8rrwQPHl8bjxDPFC8t/36wKAECMa/xv9Fb8M7AU0BHMESwQPAmf+XvoY9+L0v/QH9uD3' +
  'sPh+9zr1S/Nl8wP3XADeDVYarh98GuwNQwHT+Rb5g/wEAUkDjgKu/m75cPUh9V73rPq4/Hr8LvoA92X02PQV+3EGOBIkGTgY8w8tBR79XvqK/M0AxQT8BYYE' +
  'oQAi/AL5G/dU9nL2fvfj+DX4z/QS8xn4AwVCFLcdnh1CFcMJJAFu/UL9Cv4k/6b/Xv+x/c76X/e389Hw1e8l8mv2rfmz/GgBBwrdExQa1hl2E3gKuAK4/nf9' +
  'Vv2X/CH7P/m494f3+/hv+uL5Yfe88+TwbPFB9tsATQ+XGwYg0xrdDskB2vlA+SL99gFvBF4D1/66+NHz0vGi8gH16vdK+UD43vVd9Yb6KAZVFIAd9R26FTIK' +
  '2AC8/Oj8lf9RAhsDSQCP+gD15fDE77TxNfVs+AH5Efci9Yr3EAH7D4QcZyCzGvgO+QIZ/I/6o/w3/2MAmv/j+3f3pfNM8njzhvaR+vr9P/8I/XH51PhP/7cL' +
  'qxeHHMoXTAwKAKL4Hvcd+iX+8ABzAUkAYv7r+yf6Q/jb9jT3YPjw+SH65fi++HL9OQezEQAXTBWFDr8GSQGa/gL+dv5A/ywArgDYAPP/R/0h+eH0OfKx8dby' +
  'rvRd9tn5AwI2DmgYgRuOFdoK5wF1/tX/dgJ2A2gCsv/B/KX6LfkI+Or2b/Wx9Oz0QvWh9EP0LPc2AOMNRhpqHzMbjBDfBAT9GPp8+sP7AP1d/Tz90PyQ+/L5' +
  'r/fB9cj00fX79xD5SPlk+x0C/wy3FqIZEhWjC1sCLv04/FX9QP5Z/rf9Of0I/kz/7v+l/kL70/aD9PvzNPQb9Nj10/x+CdgWSh2lGcEOGAKH+ej2//jm/JkA' +
  'ZgJPApQB2P9b/QX6pvah9XT3KvuY/Vv7PPfk9XD7TAe/EggY+hQVDCQCxPq19w74QvpP/WoANwP5BOkEagJN/bD44/Yp+Qv9JP/F/Cf3kvP79jcBCA2xE1US' +
  'UwszA739lPu2+3X8df5FAUkEPwfMCI0H2gJS/B/3ufVG99X4Xfea8znyoPYpAf4MNxNUEb8JJAHU+3b7J/7xAXwFwAcyCEUHdAX2AcP8tfeK9an2sfpo/Uj7' +
  'NPRV7djsFvZqBWATShlRFrUMRwF7+fP2Z/ke/40FtgpODQkN6ghrAVP4RPGd7yD07fpg/xL+2vcQ8gHywfnQBZ0PdBLCDswHZAFA/rj+6gEgBQQHswcdCMkH' +
  'kgWgADz60vQd8531GPk4+lD3E/Mn8u/3kALADFgRjg7yBsv/Kv0CADkGgwtSDEkJQAXoAZH/Qv1J+iT32fU799r5Ofry9RXvF+vH7sn69Am9FF8Wig9sBa/+' +
  'pP4xA6sIjAsSC1QIRgWSApn/dvuJ9krzZvQy+VT+ZP+Y+S3w5ekj7N/36wdpE8YV7Q96B4cBCQGMA4cGXQdgBtcFMAZNBmoEnP8C+Sb0cPRG+Vn/RQE8/Ffy' +
  'Quo+6TTxFP/vC80SiBIjDtwJRQdBBiYFnQOwApADIQaQCFoI1gOf++nzPvA18rj3q/yx/Er30fDi7XjxufrDBeoNHhFhEB8OvAwKC6sH2QJX/vr8ov9VBKQH' +
  'rQZvAY76SfUY9Mj2jfrM+6j4pPI57onvTfeTAucL5A+vDp8L0QngCVMKAwnfBdcCxAHeAn4EiAToAdH89Pdn9Qr2wvg8+mb44PJE7RbsffGV/MMIDxGWE9IR' +
  'iw4BDHEKBAj3BAcC3gAPAl8EeAWdA2T+KPgR9ILzz/X3+ET5TfVj7xHsOu+6+eYHRhNeF3cUQg5LCRYHfgZtBbwDWgKrAg4E1QT5Ah/+i/dy8nLxtPSh+SL9' +
  'HPwq91Ly/PFZ+AUDHw0NEhQRAw2HCUYI/weOBu4DIAHP/+EAPQNcBEECYP3J9xD0qvOe9SX3wPXx8fHuPvH/+UEGRBDdEy0RwAs/BwsGAQe+B5QG4gOjAcEA' +
  'XwFbATL/rPrX9UDzX/Q6+Kz78Pv49/jyh/Fv9tMA/AuQEoESVw1LB6wDTwNCBDoE1wJ7AcIBSAMDBJkCeP76+DP1J/XZ+K797f+w/dv3g/Km8er2RQBNCSIO' +
  'xw2yCt0HhQYqBt8EAQJ5/2D/6QGoBaMHZgaSATb7nPat9fv3HvsL/L35VvUk8grzi/iJALAHOgu8CzQLMAthC3IK7wdGBC0BYgC/AWwDWgOrAAj8ivcW9Y31' +
  'V/ja+hr7tfg59c/ziPYa/fEEIQvYDawNQwy+Cv0IRwbcAov/cP21/d//VwL6Ai0Bkv1f+fT2XvcA+sj8mf3H+4f4N/at9j364P/fBUAKuwycDfgMkwqMBqEB' +
  'fP0I/P/9GQLoBaQHTAbvAZX8CfgF9qD2iviQ+n/79/q1+d/4bPnS+7b/pwQcCY8MNA5MDYIKhAaCAnj/af41/wYBhwLCAs8AUv2f+Qb3i/bT98j5qPuK/OD7' +
  '0fod+ib7c/57A6EIXAzWDSYNrQrCBkoCVP77+8P7Wv2j/48BOgL7AGz+rvu++Vj5V/oq/K/9Cv7y/LH6xPg0+Z789AFGB7oKCQxVC1kJuwavA4AA/v3j/In9' +
  'bf+zAU0DhwPwAeL+iPt7+X757fp0/Dz9Sfwc+lD4jPgw+/3/fQUTCmgMhAx0C0gJNwY0AmD+y/uN+6r9EgGsAysEIQJ5/sD6g/i6+FH62vsn/Ar7Vfmf+A/6' +
  'rv2GAtgGcgk/CuUJxgjXBhcE6AAK/qz8UP3N/3wCHwSAA+0Adv3K+g/6M/si/Z7+jf7L/AX6p/f79vn4f/1WA4MImAuPDGILoAjbBJ8Aa/1G/Or9XgGyBA0G' +
  'uwRGARb91/nF+Lr5ZPwb/yoAAf/J+6r3i/R09Af4tf4vBiUM+w59DoILDweEAoj+XPyl/O7+GAKPBBkFZgP1/0L80Plj+Qr7g/2i/0EA6P4K/Lb4jfb59rf6' +
  'SgAZBkwK5QsaC48IDQV8Acr+cv2g/Ur/lQGDA10EbQMCASX+vPuF+sH6Pvz6/bz+4P3G+3D5KPhC+bP8rgFLBjwJNgqJCcgHcgUDAwABwP9//14AyAG9As8C' +
  'nQHV/xj+yPyR/AL9F/1e/Ir6Gvj29cf1OvhF/XcDoghEC2ILdgnmBsAE+QKmAREBOwEGAv8CPgMuAuH/MP1G+3X6EPuP/EH+zf6J/bf6m/eK9QL2WPkG/zkF' +
  '9QkXDMEL1wkZBxcENAHt/vX9jv5dAF8CVgO1ApQA6f2/+936gvtJ/Qr/tv/C/kL8Q/kQ9zD3IvoQ/18EaghuCnMKCQnXBiUETgEn/w7+e/46AGICwQPiA78C' +
  'kwD7/S78avuw+3T89/yj/DP7ePlv+D35GPwjAD8ETgfwCDIJvwi0BwgG8wPnAWIA2/86APsAYgEOAQwAbv7x/Av8wfvV+7T7/frB+Vr45fcb+Xf8/QB3BcgI' +
  'EAqXCSAIWQaZBNACNgEpAAYApgA/ATIBWQDc/kb9NPzx+5T8qv2O/nz+MP0Y+1n54/hU+pv92AGtBSkI/wh5CAoHDwWeAnEA5/5y/iX/ewCiARsCugGKAPv+' +
  'pv0r/Un9qv3m/bj92Pxv+zb64/nq+mP9xgApBKMG7AciCFkH2gX+A/MBUwBR/yH/t/+ZAGwB4AF0AYsAIv+j/bv8Svwj/AX8qPvF+hj6RvqL+wP+BgHrAxkG' +
  'LQeMB3kHzQZ0BZEDtQFKAJv/f//8/2QAegAdAHf/rf4e/tr9ov3z/Mf7SPrm+DH40Pje+ib+3gFeBZMHSgi5B2QG1wRJA9kB0wBwALAANgGoAcABYQFeAB7/' +
  '4/0H/fz8dv0i/kb+tP12/OT6l/kh+Qv6nfxqAHgEkAcOCdoIUQdLBSUDIwF7/5/+8v4OAK0BFwOWAwADOgHt/uz8+vvz+2785vwm/Qr9iPyL+6v6mvrh+6/+' +
  'WgLTBTgIGgmgCBwH5QRTAjMA6v7e/r3/HgF5AkgDLAP8AfT/p/23+636avrU+p/7S/yq/Kn8d/yd/Nv9LAAlA8kFjAc5CO4HxAbWBHsCVQDr/qr+bP/0AF8C' +
  'JAOzAkkBLP/r/Bv7JPq9+eP5Q/rE+o37uvxD/kUAegJ5BO4FcQYpBo0F0gTZA58CgwHGAHcAsgARARwBsgAMAD//bf7N/YT9Xf0C/Uz8WfuT+kv65Pp1/Pn+' +
  'yQFgBBoG1waPBn8FJAS0Am4BjQBFAJ8AcwFHAsECpALIAXsAH//h/e/8ZvwP/ML7TPu2+jj6KvrP+o/8Sv98AmEFMAfbB3gHUAalBMQCJQEPANv/ZgCEAX4C' +
  '1wJcAv4AD/88/fT7kvvF+0T8mvy2/H/8Nfw5/N38V/6DAPwCRAXiBmYH6wa9BRsESgKqAK3/Yf/I/6kAmQEiAvkBMwHx/3D+J/09/M37mfuO+337ffvU+878' +
  'c/6TAMMCjwSjBfsF2QV4BccEtANEAvUACQCq/+H/fwAOAXYBIwE6APT+rv2C/Kb7Dfuq+oL6wPqL+wT9Sv/jAT0EwgVDBvoFNwVUBGMDYQJdAZUAJQA2AKAA' +
  '7wD5AJQAwf/Z/jT+5P3T/cX9hf37/Fn80Puu+0n8wf3g/zQCOQSJBewFqgXkBKsDGAKkAJr/Yv/9/xkBJAK9AocCjgEFAGr+Lf1o/Dz8W/yT/Lv8z/zT/Bz9' +
  '0P0A/5cAPQKlA6gERAVeBf0EKATkAoEBWgCs/5r/AgCUABEBJgG7AAMALv9i/rX9Jf2X/Ar8ufvG+z/8Qv3j/t4A1AJUBBoFPwXWBCoEVQNbAmIBqgBmAI8A' +
  '7ABAAV0BGgGFAKD/qf75/Zz9h/1z/TH90Pxp/Dr8mfyy/WH/SQEHA1AE/AQYBc4ELARTA1UCSAF1ABIALACoADEBeAFDAYwAp/+y/uH9Gv1S/JP7B/vG+gT7' +
  '8vuo/ev/SgI9BGsF1QWKBdEE2wPIAsoBGQHJANsANQGSAaMBPgFdACr/8v0f/c783PwQ/S79Dv3P/Kz85/yt/Q//1wC4AkMEQQWfBWkFqQSOA0cCCAEWAKz/' +
  'wf8/AOQAWgFAAb8A4//p/gL+Q/2t/D387vvm+xf8s/zB/Uf//wCSArwDWwR3BEsE9QNuA7MC3wEfAaEAfgCKALMAwACnAEIAqf8H/3D+CP6//Wb9Af2n/Hz8' +
  'l/wq/Tz+uv9uAegC8gNSBC8EsgMAAyoCWgG0AEwAMABuANcAMQFJAf8AaQCt/+n+R/7h/bn9uP3g/Qr+OP5j/oX+q/4I/7b/tAC6AaICOgN1A1MD9AJgAq8B' +
  'BQGIAEIAQwByAMEAAQEYAeEAXwC9/xL/hP4a/uX96v0b/kj+Z/58/pr++/66/8AAxgGKAvAC/wLMAoYCLAK5AUcB7gC2ALQA0QD6AA8B5gByALv/9v5Q/t/9' +
  'qv2q/dL9DP48/mT+p/4X/8v/rwCWAU4CsQLGArgCnQJlAhkCuwFoASoBAwHZALcAhgA4AMb/JP+K/hL+z/3G/fb9Ov6H/rn+2v4A/1D/5/+mAHsBIQKKAqMC' +
  'kAJoAjwC+gGuAWEBKAH/AO4A3gC6AGkA8f9Y/7r+P/74/eX97v0T/kH+dP6v/gH/gv8zAPwAtwE0Al4CXgJVAkUCJgL1AbYBcAExAf0AxgCWAF4ADACq/zP/' +
  'uv5b/hv+Bv4J/iX+Vv6P/tv+Qf/a/4wARgHgATYCUQJAAicCBwLdAaMBYQEmAfgAzQCbAGkAJQDX/33/Gv+6/nH+Qf4y/j3+WP6E/sf+Lv+//24AIwG8ASIC' +
  'RwIxAvQBpgFXARAB3QDDALsAwQC3AJgAYAAIAKf/S//9/sb+r/6//vH+N/96/6n/xf/N/9r//P8/AK0AKgGaAd8B8wHZAZYBNAHBAFsAEgDz//3/GQBHAG4A' +
  'dwBdAB8Ay/9z/y//C/8F/x//Sv96/5//tf/L//r/SgClAPUAHQEpASEBFgEQAQoBAgHuANYAvwCpAJUAfQBiAD4ACwDO/5j/d/9q/27/fv+S/5z/mv+P/3//' +
  'ef+R/9H/LACYAPYAOQFiAXABawFQASgB8gC1AIIAZQBbAFoAWQBHAB8A5P+p/3f/X/9h/3n/n//K/+n/9f/r/9D/s/+n/7n/7P83AI4A3wAkAVkBcwFoATUB' +
  '7ACdAFMAJAAQABMAHwAlACIAEwD8/+b/2//f/+f/7//4/wEABQABAPT/1f+0/6X/uf/0/0kAoQDpABcBKgEkAQsB5gC5AIgAUwAmAAcA//8GABgAKQAvACgA' +
  'IgAhACYAMQA1ADEAJAAPAPD/y/+j/4X/gf+k/+r/RwCnAPIAHAEmARIB5ACoAGIAJAD5/+v//f8mAFUAegCGAH0AZABGACoAEwACAPj/8v/0//f/9f/t/+D/' +
  '1f/R/9//AAAyAGcAlACyAMAAwAC2AKUAjQBzAFwASwA+ADkAOQA6ADwAPAA7ADgAMgArACQAGQANAAIA+f/3//j//v8FAA8AHgA0AE0AZQB2AH4AewB3AHQA' +
  'dgB6AHkAcgBkAFIAQAAwACIAGgAVABQAGwAoADYAQgBJAEcAPwA1ACsAIwAeAB0AHgAgACcAMwBAAEoAUABTAFQAVABWAFkAXQBcAFkAVABMAEQAOwAzAC4A' +
  'LQAxADcAPgBDAEUARABAADwAOAA2ADMAMAAsACgAJwAoAC0ANQA/AEkAUgBXAFkAWgBZAFYAUAA=';
const LAUGH =
  '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' +
  '5/6W/rr+Ev9X/1r/DP9//tD9Ff1g/Ln7Q/si+2r7IvxU/fz+8wDlAnEEYQW2BZAF+wQDBMICYAEcACv/o/6E/rD++/5C/2z/Y/8r/87+X/7m/WX95Px6/FD8' +
  'n/yI/fb+pQA9AngDPgSVBIYEDQQtAwECuQCb/9v+kv64/iv/rf8LACcADgDO/2j/2/4g/kn9f/z4+/D7g/yw/UP/5wBVAmIDCQRJBCEEggN8AkIBGwBG/+f+' +
  'Av9m/+L/SACBAIkAZQAJAHD/ov66/d78Ovz3+yr84/wY/pX/FwFjAlED1wPtA5YD3gLmAecAEwCP/2H/fP/J/ykAfgCwAKkAYgDd/yn/XP6L/c38QPwF/Df8' +
  '6PwT/of//wA5AhIDgwOVA1MDygIQAj0BeADl/5z/nv/W/yUAaACGAGwAIgCy/yr/iv7Z/Sr9m/xO/GT87Pzh/Sb/fwCzAZ4CMQN0A2gDDgNrApYBvQAJAJb/' +
  'af97/7H/8f8hADMAIQDv/5z/J/+a/gn+jv1G/T/9f/0E/sf+uP+0AJkBSQKwAssCnAIzAqIB/QBaANT/fP9g/3j/uP8EAEUAYgBUABwAvv9G/8b+UP73/c39' +
  '0P0B/mL+9f6y/4AAPwHIAQ8CHAL4Aa0BRQHLAFMA8/+8/7X/1P8LAEQAagBtAEoABgCt/0z/6/6S/lL+N/5B/mv+sv4Y/5n/LAC6ACoBbwGJAX8BWQEbAdAA' +
  'hgBHAB0ADAAPACEAOQBJAEgALwAAAMT/gP89//7+yP6l/pT+lv6p/tf+J/+Y/xsAlgD2ADEBTAFPAT0BFwHhAKQAawA8AB4AFAAXAB8AHwARAPL/yf+Z/2X/' +
  'Mf8B/9z+xf6//sf+4/4Z/2z/1f9EAKYA7QAYAS4BMAEgAQAB0QCYAF8ALQAKAPz/+v/5//L/4P/E/6X/g/9k/0v/Of8x/zD/Nv9A/1L/cf+g/+H/KABsAKEA' +
  'xgDeAOoA6QDbALoAjABZACcAAADp/93/2P/S/8r/wP+4/7T/sv+w/6v/of+P/3n/Y/9R/03/Xv+H/8T/CQBNAIoAvQDiAPYA8wDYAKgAbQAyAAAA3//L/8T/' +
  'xf/I/8v/zv/S/9X/0v/I/7j/o/+M/3b/Zf9e/2r/i/+/////PgB4AKcAyADZANYAvgCVAGIALQD+/9r/w/+5/7r/wf/K/9X/3v/j/+L/2v/M/7r/p/+V/4f/' +
  'gf+K/6X/0P8BADUAYgCGAJ4AqQCjAI0AagBBABgA9//g/9T/0f/W/9//5//u//H/7//p/+D/0//D/7P/ov+T/4z/kf+k/8X/7/8YAD8AXwB4AIYAigCCAG0A' +
  'UAAvABAA+f/o/+D/3//h/+X/6f/s/+7/7P/n/97/0f/C/7L/o/+Z/5j/pf++/+L/CQAxAFQAcACCAIgAgABrAEwAKQAHAOv/1//O/9D/2f/n//T/AAAGAAgA' +
  'AwD6/+r/1v/B/63/nf+V/5v/r//O//T/GgA9AFoAbwB4AHUAZgBMAC0ADQD0/+H/2f/Z/+D/6//2//7/AgACAP3/8//k/9L/wf+z/6v/qv+0/8n/5f8EACMA' +
  'PABQAFsAXgBXAEcAMwAbAAQA8v/l/9//4P/m/+7/9v/7///////9//j/8v/q/+P/3P/W/9T/1f/b/+f/9v8GABcAJAAvADUANwAzACsAHwAQAAIA9//v/+z/' +
  '7f/y//n///8CAAQABAACAP//9//u/+T/2v/R/8z/zP/T/9//7/8BABMAIwAvADcAOQA1ACwAHwARAAMA+f/y//D/8f/1//n//v8BAAMAAwAAAPv/9P/q/+D/' +
  '2P/R/8//0v/b/+r/+/8MAB0AKgAzADcANQAuACMAFQAGAPv/8v/u/+7/8f/2//r//v8AAAEAAAD9//b/7v/m/9//2v/Y/9z/5P/w////DAAZACQAKgAsACoA' +
  'IwAZAA0AAgD5//L/7//v//L/9v/7//7/AAABAAEA///7//X/7//q/+b/5f/m/+r/8v/7/wUADgAWABwAHgAeABoAFAAMAAMA/P/3//T/9P/2//r//f8AAAIA' +
  'AwADAAIAAAD9//n/9v/z//D/7//v//H/9P/6/wAABQAKAA4AEAARAA8ADQAJAAQAAAD9//r/+v/6//v//f///wAAAAABAAEAAQAAAP///f/8//r/+f/3//b/' +
  '9v/3//n//P8AAAMABgAIAAkACQAJAAcABQACAAAA/v/9//z//P/9//7///8AAAEAAwADAAMAAgABAAAA/v/8//r/+P/3//b/9//5//z///8BAAQABQAGAAcA' +
  'BwAGAAQAAgABAAAA/v/+//7//v///wAAAAAAAAEAAQABAAAAAAD///7//f/9//z//P/8//z//f/+////AAABAAEAAgACAAMAAwACAAIAAQAAAAAAAAD/////' +
  '////////AAAAAAAAAAAAAAAAAAAAAAAAAAD//////v/+//7//v/+//7///8AAAAAAQACAAIAAgACAAIAAQAAAAAAAAD/////////////AAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAP////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const STEP =
  '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';

module.exports = { SR,
  purr: PURR, chirp: CHIRP, yelp: YELP, laugh: LAUGH, step: STEP };

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
 *   - spec.partials = [[ratio, gain], ...]：谐波堆叠（第 1 项主音），拟嗓音厚度；
 *   - spec.lowpass = Hz：整组过一遍低通，削掉刺耳高频（幼兽声音偏闷）。
 *     无 createBiquadFilter 的旧基础库自动降级为直连；
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
  // 小诗童叫声（2026-11-20 六版：用户「叫声不对」）。
  // 根因（一~五版都没解决）：「嗷呜」是元音 a→u 的变化——正弦滑音只动音高不动
  // 音色，怎么调音量/跨度都像"滑哨"。六版换共振峰（formant）合成：
  //   锯齿波声源（谐波结构像声带）→ 两个带通滤波器并行（F1=开口度 ~950Hz、
  //   F2=圆唇度 ~1500Hz），滤波器频率随时间滑到「呜」的位置（F1 380 / F2 850）
  //   → 音色本身从"张嘴嗷"变成"圆唇呜"，这才是叫声的元音变化。
  //   旧基础库无 createBiquadFilter 时自动降级为 notes 正弦滑音（五版配方保底）。
  // 小诗童叫声（2026-11-21 八版：用户「声音不萌」）。
  // 七版是"拟真"路线——240–380Hz 基频 + 1250Hz 低通 + 24Hz 喉震，客观指标 F0=342Hz、
  // 谱重心 1404Hz，落在**成年猫低吼**区间：闷、糊、像呼噜，离"奶音"越来越远。
  // 八版换"幼态"路线，四条同时动手（萌 = 幼态 = 高基频 + 短促 + 亮 + 气声）：
  //   ① 基频 520→830（0.13s 快升）→ 545：幼猫/幼虎喵叫典型 550–900Hz，
  //      短促上扬才"奶"，长音低音只会"憨"；
  //   ② 时长 1.05 → 0.62s：喊一声就收，不拖成呼噜；
  //   ③ 共振峰整体上移（F1 1120→1250→600 / F2 2150→2450→1250）：幼兽声道短，
  //      共振峰天然更高，"嗷→呜"的元音变化保留；
  //   ④ 去掉 24Hz 喉震（AM 会把泛音抖成电子味），改 srcLp 3800（保留"嫩"的亮度）
  //      + breath 0.2（气声多 = 幼态）+ jitter 17Hz（活物感）。
  purr: {
    voice: true, lowpass: 2600, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    formant: {
      src: 'sawtooth', dur: 0.62, gain: 0.50, attack: 0.02, release: 0.16,
      pitch: [[520, 0], [830, 0.13], [760, 0.33], [545, 0.62]],   // 嗷↑ 停 呜↓
      vibHz: 7.5, vibDepth: 16, jitterHz: 17, jitterDepth: 5,
      f1: [[1120, 0], [1250, 0.13], [1020, 0.33], [600, 0.62]],
      f2: [[2150, 0], [2450, 0.13], [2050, 0.33], [1250, 0.62]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 3800, breath: 0.20,
    },
    notes: [
      [520, 0, 0.13, 0.26, 830, { attack: 0.015, vibHz: 7.5, vibDepth: 12 }],
      [800, 0.13, 0.22, 0.22, 560, { attack: 0.01, vibHz: 7.5, vibDepth: 12 }],
    ],
  },
  // giggle（二版摸肚音）已于三版移除：摸肚改「惊叫 yelp」+ 连击「狂笑 laugh」，
  // giggle 无调用方（屏侧统一走 pet.soundFor）。
  chirp: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.22], [3, 0.07]],
    formant: {
      src: 'sawtooth', dur: 0.30, gain: 0.56, attack: 0.01, release: 0.10,
      pitch: [[700, 0], [1120, 0.10], [640, 0.30]],
      vibHz: 8, vibDepth: 14, jitterHz: 18, jitterDepth: 5,
      f1: [[1200, 0], [1450, 0.10], [720, 0.30]],
      f2: [[2350, 0], [2650, 0.10], [1350, 0.30]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 4200, breath: 0.22,
    },
    notes: [
      [700, 0, 0.10, 0.28, 1120, { attack: 0.01 }],
      [1100, 0.10, 0.18, 0.22, 650, { attack: 0.01, vibHz: 8, vibDepth: 10 }],
    ],
  },
  // ---- 沙雕音组（2026-11-20 互动三版「出圈」+ 彩蛋太空步）----
  // yelp 摸肚「惊叫」：肚子是禁区——短促高音急窜（860→1320→700），0.24s
  yelp: {
    voice: true, lowpass: 3400, partials: [[1, 1], [2, 0.2]],
    formant: {
      src: 'sawtooth', dur: 0.24, gain: 0.60, attack: 0.008, release: 0.08,
      pitch: [[860, 0], [1320, 0.07], [700, 0.24]],
      vibHz: 9, vibDepth: 18, jitterHz: 19, jitterDepth: 6,
      f1: [[1350, 0], [1650, 0.07], [820, 0.24]],
      f2: [[2500, 0], [2900, 0.07], [1500, 0.24]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 4600, breath: 0.24,
    },
    notes: [
      [860, 0, 0.08, 0.28, 1320, { attack: 0.008 }],
      [1300, 0.07, 0.15, 0.24, 700, { vibHz: 9, vibDepth: 14 }],
    ],
  },
  // laugh 连击「狂笑三连」：哈↑哈↑哈↑ 三段递升（640→1020 / 680→1080 / 740→1160），
  // 每段都往上挑才是"笑"，往下掉会读成"叹气"
  laugh: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    formant: {
      src: 'sawtooth', dur: 0.78, gain: 0.58, attack: 0.015, release: 0.12,
      pitch: [[620, 0], [1020, 0.10], [600, 0.19], [680, 0.23], [1080, 0.33], [660, 0.42], [740, 0.47], [1160, 0.58], [700, 0.66], [720, 0.78]],
      vibHz: 8, vibDepth: 12, jitterHz: 16, jitterDepth: 4,
      f1: [[1200, 0], [1500, 0.10], [820, 0.19], [1250, 0.23], [1550, 0.33], [840, 0.42], [1300, 0.47], [1600, 0.58], [860, 0.66], [880, 0.78]],
      f2: [[2400, 0], [2750, 0.10], [1400, 0.19], [2450, 0.23], [2800, 0.33], [1420, 0.42], [2500, 0.47], [2850, 0.58], [1450, 0.66], [1480, 0.78]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.18,
      srcLp: 4200, breath: 0.15,
      amHz: 26, amDepth: 0.16,
    },
    notes: [
      [620, 0, 0.10, 0.26, 1020, { attack: 0.012 }],
      [680, 0.23, 0.10, 0.26, 1080, { attack: 0.012 }],
      [740, 0.47, 0.12, 0.26, 1160, { attack: 0.012 }],
    ],
  },
  // moonwalk 摸头 3 连「太空步」配乐：**四拍独立起音**（repeat: 每拍 0.62s，与动画拍点同钟）。
  // 八版 1.12s 打完四拍（每拍 0.28s ≈ 214BPM），和 1.25s/步的动画完全对不上——用户
  // 「没有节奏感」一半出在这里。九版：一拍 0.62s 起一个短嗷（0.45s 音 + 0.17s 空隙），
  // 四个独立 attack 才有鼓点感（正弦 AM 只做出波浪，做不出拍点）。
  moonwalk: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    repeat: { times: 4, gap: 0.62 },
    formant: {
      src: 'sawtooth', dur: 0.45, gain: 0.52, attack: 0.008, release: 0.13,
      pitch: [[620, 0], [900, 0.16], [655, 0.45]],      // 一拍一个"嗷"：起→扬→落
      vibHz: 8, vibDepth: 12, jitterHz: 17, jitterDepth: 5,
      f1: [[1180, 0], [1500, 0.16], [820, 0.45]],
      f2: [[2350, 0], [2750, 0.16], [1380, 0.45]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.18,
      srcLp: 4200, breath: 0.16,
    },
    notes: [
      [620, 0, 0.17, 0.24, 900, { attack: 0.008 }],
      [660, 0.62, 0.17, 0.22, 960, { attack: 0.008 }],
      [700, 1.24, 0.17, 0.24, 1010, { attack: 0.008 }],
      [740, 1.86, 0.30, 0.26, 1080, { attack: 0.008 }],
    ],
  },
};

/** 十一版（2026-11-21）：叫声改为「离线物理模型采样」优先。
 *  锯齿波 + 2 带通的实时合成做不出声门脉冲与 F3/F4 共振峰，怎么调都是电子哨
 *  （一~十版用户全部不满意）。tools/render_voice.py 用 Rosenberg 声门脉冲 +
 *  4 级级联共振峰 + 气声 + 破音离线渲染成 PCM（22.05kHz/单声道/16bit），内嵌在
 *  voice_data.js；运行时 decodeAudioData 解码后用 BufferSource 播——
 *  解码失败 / 旧基础库无 decodeAudioData / Buffer 还没就绪时，自动落回
 *  下面的实时合成（合成配方保留，作为降级路径与测试桩）。 */
const VOICE_DATA = require('./voice_data');
const SAMPLE_MAP = { purr: 'purr', chirp: 'chirp', yelp: 'yelp', laugh: 'laugh', moonwalk: 'step' };

let ac = null;          // AudioContext（懒创建：首次 play 才建，避免启动即占资源）
let failed = false;     // 环境不支持 / 异常 → 后续 play 直接快速返回
let enabled = true;     // 用户开关（默认开）
let voiceUntil = -1;    // 小叫声占线截止时刻（秒，ctx.currentTime 域）——其余音让路

// ---- 采样加载（异步，一次性）：state none→loading→ready/failed ----
let sampleState = 'none';
const sampleBufs = {};

/** base64 → ArrayBuffer（微信环境无 atob，自己解） */
function b64ToArrayBuffer(s) {
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const n = s.length, pad = (s.charAt(n - 1) === '=') ? (s.charAt(n - 2) === '=' ? 2 : 1) : 0;
  const out = new Uint8Array(Math.floor(n / 4) * 3 - pad);
  let o = 0, bits = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const v = CH.indexOf(s.charAt(i));
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.buffer;
}

/** 首次拿到 AudioContext 时启动解码；任一失败→整体降级合成（不重试） */
function loadSamples(a) {
  if (sampleState !== 'none' || !VOICE_DATA) return;
  if (typeof a.decodeAudioData !== 'function') { sampleState = 'failed'; return; }
  sampleState = 'loading';
  const keys = Object.keys(SAMPLE_MAP).map(k => SAMPLE_MAP[k]);   // 注意别把 SR 也当采样解码
  let pending = keys.length;
  keys.forEach(k => {
    try {
      const raw = b64ToArrayBuffer(VOICE_DATA[k]);
      a.decodeAudioData(raw, buf => {
        sampleBufs[k] = buf;
        if (--pending === 0) sampleState = 'ready';
      }, () => { sampleState = 'failed'; });
    } catch (e) { sampleState = 'failed'; }
  });
}

/** 从 PCM（16bit 小端单声道）重建 AudioBuffer（供测试桩 / 无 decodeAudioData 但有
 *  createBuffer 的环境走同步解码；微信 wx.createWebAudioContext 两者都有） */
function pcmToBuffer(a, b64) {
  const u8 = new Uint8Array(b64ToArrayBuffer(b64));
  const n = u8.length >> 1;
  const buf = a.createBuffer(1, n, VOICE_DATA.SR);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = u8[i * 2] | (u8[i * 2 + 1] << 8);
    if (v & 0x8000) v -= 0x10000;
    ch[i] = v / 32768;
  }
  return buf;
}

/** 播采样：kind 已映射到 sample 名；repeat（moonwalk 四拍）按 gap 重复起音。
 *  节点全部建好后再 start：中途异常时不至于「响了半条又补一条合成声」 */
function playSample(spec, a, now) {
  const name = SAMPLE_MAP[spec._kind];
  const buf = sampleBufs[name];
  if (!buf) return false;
  const gap = spec.repeat ? spec.repeat.gap : 0;
  const times = spec.repeat ? spec.repeat.times : 1;
  const nodes = [];
  for (let i = 0; i < times; i++) {
    const s = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = spec.sampleGain || 0.62;
    s.buffer = buf;
    s.connect(g);
    g.connect(a.destination);
    nodes.push({ s, at: now + 0.01 + i * gap });
  }
  nodes.forEach(n => n.s.start(n.at));
  return true;
}

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
  osc.type = type || 'sine';
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

/**
 * 共振峰叫声（六版骨架 + 七版拟真层）：锯齿波声源 + 两个并行带通（F1/F2）随时间滑动，
 * 音色本身完成「嗷→呜」的元音变化。返回是否成功（失败由 play 落回正弦滑音）。
 *
 * 七版拟真（修「合成器味」——纯周期声源 + 窄带共振峰像振荡器，不像活物）：
 *   ① 声源低通 2200Hz：锯齿波高频毛刺先削掉，谐波变圆润；
 *   ② 带通 Q 7 → 4.5：Q 太窄会挑出单频「哨音」，放宽后更像声道共鸣；
 *   ③ jitter 音高微抖：13Hz ±4Hz 的次级随机感扰动（真声带的基频从来不稳定），
 *      叠在 5.5Hz 颤音下面——颤音是「唱」，jitter 是「活」；
 *   ④ 呼吸噪声层：白噪 → 1.2 带宽带通（跟随 F2 末端）→ 低增益垫进 master，
 *      纯周期源再加一点气声，立刻从「电子喵」变「毛绒喵」。
 *   无 createBufferSource 的旧基础库自动跳过噪声层；全部 try/catch 不阻断主声。
 */
function playFormant(spec, a, now) {
  const f = spec.formant;
  const t0 = now + 0.01;
  // 主包络：软起 → 保持 → 释放（exponentialRamp 不接受 0，用 0.0001 收尾）
  const master = a.createGain();
  const rel = f.release || 0.2;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(f.gain, t0 + (f.attack || 0.04));
  master.gain.setValueAtTime(f.gain, t0 + Math.max(f.attack || 0.04, f.dur - rel));
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + f.dur);
  master.connect(a.destination);

  // 声源：锯齿波（谐波结构像声带），音高轮廓 + 颤音 + jitter
  const src = a.createOscillator();
  src.type = f.src || 'sawtooth';
  const pts = f.pitch;
  try { src.frequency.setValueAtTime(pts[0][0], t0); } catch (e) { src.frequency.value = pts[0][0]; }
  if (typeof src.frequency.linearRampToValueAtTime === 'function') {
    for (let i = 1; i < pts.length; i++) src.frequency.linearRampToValueAtTime(pts[i][0], t0 + pts[i][1]);
  }
  if (f.vibHz) {
    try {
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = f.vibHz; lg.gain.value = f.vibDepth;
      lfo.connect(lg); lg.connect(src.frequency);
      lfo.start(t0); lfo.stop(t0 + f.dur + 0.02);
    } catch (e) { /* 颤音失败不影响主声 */ }
  }
  if (f.jitterHz !== 0) {
    // ② jitter：次级音高微扰（13Hz ±4Hz），让基频永远「不完全稳定」
    try {
      const jl = a.createOscillator(), jg = a.createGain();
      jl.frequency.value = f.jitterHz || 13; jg.gain.value = f.jitterDepth || 4;
      jl.connect(jg); jg.connect(src.frequency);
      jl.start(t0); jl.stop(t0 + f.dur + 0.02);
    } catch (e) { /* jitter 失败不影响主声 */ }
  }
  src.start(t0); src.stop(t0 + f.dur + 0.02);

  // ① 声源低通：削锯齿毛刺（谐波圆润），F1/F2/直通都从低通后取
  let voice = src;
  if (f.srcLp !== 0 && typeof a.createBiquadFilter === 'function') {
    try {
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = f.srcLp || 2200; lp.Q.value = 0.7;
      src.connect(lp);
      voice = lp;
    } catch (e) { voice = src; }
  }

  // ② 两个共振峰带通 + 直通垫底（并行，各占一份响度）；Q 4.5 = 声道共鸣不是哨音
  const mkFormant = (contour, g) => {
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4.5;
    try { bp.frequency.setValueAtTime(contour[0][0], t0); } catch (e) { bp.frequency.value = contour[0][0]; }
    if (typeof bp.frequency.linearRampToValueAtTime === 'function') {
      for (let i = 1; i < contour.length; i++) bp.frequency.linearRampToValueAtTime(contour[i][0], t0 + contour[i][1]);
    }
    const vg = a.createGain(); vg.gain.value = g;
    voice.connect(bp); bp.connect(vg); vg.connect(master);
  };
  mkFormant(f.f1, f.f1Gain);
  mkFormant(f.f2, f.f2Gain);
  const dg = a.createGain(); dg.gain.value = f.directGain;
  voice.connect(dg); dg.connect(master);

  // ④ 呼吸噪声层：白噪 → 宽带通（跟 F2 末端）→ 低增益，纯周期源之外的「气声」。
  // 默认 0.12（所有叫声都垫气声）；snore 显式调低（呼噜浑厚不需要）。
  const breathAmt = f.breath !== undefined ? f.breath : 0.12;
  if (breathAmt && typeof a.createBufferSource === 'function' && typeof a.createBuffer === 'function') {
    try {
      const sr = a.sampleRate || 44100;
      const len = Math.max(64, Math.ceil(sr * (f.dur + 0.05)));
      const buf = a.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const ns = a.createBufferSource(); ns.buffer = buf;
      const nbp = a.createBiquadFilter();
      nbp.type = 'bandpass'; nbp.Q.value = 1.2;
      nbp.frequency.value = f.f2[f.f2.length - 1][0] * 0.85;
      const ng = a.createGain(); ng.gain.value = f.gain * breathAmt;
      ns.connect(nbp); nbp.connect(ng); ng.connect(master);
      ns.start(t0); ns.stop(t0 + f.dur + 0.02);
    } catch (e) { /* 噪声层失败不影响主声 */ }
  }

  // 喉震（AM）：咕噜垫底
  if (f.amHz) {
    try {
      const am = a.createOscillator(), ag = a.createGain();
      am.frequency.value = f.amHz;
      ag.gain.value = f.gain * f.amDepth;
      am.connect(ag); ag.connect(master.gain);
      am.start(t0); am.stop(t0 + f.dur + 0.02);
    } catch (e) { /* AM 失败不影响主声 */ }
  }
}

/** 播一个音：kind ∈ pick | pass | fail | purr | chirp | yelp | snore | laugh。返回是否真的发声 */
function play(kind) {
  if (!enabled) return false;
  const spec = SFX[kind];
  if (!spec) return false;
  const a = ensureCtx();
  if (!a) return false;
  try {
    const now = typeof a.currentTime === 'number' ? a.currentTime : 0;
    // 背景声处理：小老虎叫声占线时，其余玩法音让路（叫声不被混成背景）
    const total = spec.repeat
      ? spec.repeat.gap * (spec.repeat.times - 1) + (spec.formant ? spec.formant.dur : 0)
      : (spec.formant ? spec.formant.dur : Math.max.apply(null, spec.notes.map(n => n[1] + n[2])));
    if (!spec.voice && now < voiceUntil) return false;
    // iOS / 微信：上下文可能处于 suspended，需在用户手势链上 resume
    if (a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* resume 失败不阻断发声尝试 */ }
    }
    // 十一版：采样优先（物理模型离线渲染，听感远好于实时合成）；没就绪/失败落回合成
    loadSamples(a);
    if (sampleState === 'ready') {
      spec._kind = kind;
      try {
        if (playSample(spec, a, now)) {
          if (spec.voice) voiceUntil = now + total + 0.05;
          return true;
        }
      } catch (e) { /* 落回实时合成 */ }
    }
    // 节奏型音效（repeat）：同一配方按 gap 间隔重复起音——每次都有独立 attack，
    // 才有鼓点那种"打"的冲击；正弦振幅调制（amHz）只做得出波浪，做不出拍点。
    if (spec.repeat && spec.formant && typeof a.createBiquadFilter === 'function') {
      try {
        for (let i = 0; i < spec.repeat.times; i++) playFormant(spec, a, now + i * spec.repeat.gap);
        if (spec.voice) voiceUntil = now + total + 0.05;
        return true;
      } catch (e) { /* 落回下面的单次路径 */ }
    }
    // 六版：共振峰叫声优先（有 BiquadFilter 能力时）；异常则落回正弦滑音
    if (spec.formant && typeof a.createBiquadFilter === 'function') {
      try {
        playFormant(spec, a, now);
        if (spec.voice) voiceUntil = now + total + 0.05;
        return true;
      } catch (e) { /* 落回 notes 正弦滑音 */ }
    }
    const partials = spec.partials || (spec.overtone ? [[1, 1], [spec.overtone.ratio, spec.overtone.gain]] : [[1, 1]]);
    // 低通：把小老虎叫声的高频毛刺削掉（幼兽声音是"闷"的）。旧基础库无 BiquadFilter 时自动跳过。
    let sink = a.destination;
    if (spec.lowpass && typeof a.createBiquadFilter === 'function') {
      try {
        const f = a.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = spec.lowpass;
        f.Q.value = 0.7;
        f.connect(a.destination);
        sink = f;
      } catch (e) { sink = a.destination; }
    }
    for (const n of spec.notes) {
      const freq = n[0], delay = n[1], dur = n[2], peak = n[3], freqEnd = n[4];
      const opts = n[5] || {};
      const t0 = now + 0.01 + delay;
      // 谐波堆叠：第 1 项为主音（ratio 1），其余为泛音；每项都与主音同包络
      const voices = [];
      for (const p of partials) {
        const v = spawnOsc(a, t0, dur, peak * p[1], freq * p[0],
          freqEnd ? freqEnd * p[0] : 0, spec.type, opts.attack);
        if (v) voices.push(v);
      }
      if (!voices.length) continue;
      const main = voices[0];
      voices.forEach(v => v.gain.connect(sink));
      voices.forEach(v => { v.osc.start(t0); v.osc.stop(t0 + dur + 0.02); });
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
  let recTap = 0;         // 战绩签点击轮换计数（错题本提示 ↔ 常规战绩）
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
      const pz = pet.pose();
      ctx.save();
      const pivX = tg.x + 400 * tg.scale / 2, pivY = tg.y + 560 * tg.scale;
      ctx.translate(pivX + petOff.dx, pivY + petOff.dy);
      ctx.rotate(petOff.rot);
      if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
      ctx.translate(-pivX, -pivY);
      tiger.fullBody(ctx, { cx: tg.x + 400 * tg.scale / 2, y0: tg.y, scale: tg.scale, state: pz.state || 'idle', t: tDraw, phase: pz.phase });
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
              // 三版沙雕音：常规=嗷呜/惊叫/嗷呜；同区 3 连击=打呼噜/狂笑（pet.soundFor 统一映射）
              sound.play(pet.soundFor(zone, pet._fx() && pet._fx().combo));
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
        // 轮换展示：有未订正的错题本条目时第一次点给错题本提示，再点回常规战绩
        const gs = store.grudgeSummary();
        if (gs.pending > 0 && recTap++ % 2 === 0) {
          // 2026-11-21 「仇册」更名「错题本」：文案同时压到 10 字内，
          // 旧「仇册 N 句未雪耻 · 诗童记着呢」实测超出战绩签数据行 217px 可用宽被省略成「…」
          toast = { text: `错题本 ${gs.pending} 句，诗童记着`, t: 2.4 };
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
  var L = ["风吹草低见牛羊|0|m","唧唧复唧唧|1|h","木兰当户织|1|h","不闻机杼声|1|h","惟闻女叹息|1|h","问女何所思|1|h","问女何所忆|1|h","女亦无所思|1|h","女亦无所忆|1|h","昨夜见军帖|1|h","可汗大点兵|1|h","军书十二卷|1|h","卷卷有爷名|1|h","阿爷无大儿|1|h","木兰无长兄|1|h","愿为市鞍马|1|h","从此替爷征|1|h","东市买骏马|1|h","西市买鞍鞯|1|h","南市买辔头|1|h","北市买长鞭|1|h","旦辞爷娘去|1|h","暮宿黄河边|1|h","不闻爷娘唤女声|1|h","旦辞黄河去|1|h","暮至黑山头|1|h","万里赴戎机|1|h","关山度若飞|1|h","朔气传金柝|1|h","寒光照铁衣|1|h","将军百战死|1|h","壮士十年归|1|h","归来见天子|1|h","天子坐明堂|1|h","策勋十二转|1|h","赏赐百千强|1|h","可汗问所欲|1|h","木兰不用尚书郎|1|h","愿驰千里足|1|h","送儿还故乡|1|h","爷娘闻女来|1|h","出郭相扶将|1|h","阿姊闻妹来|1|h","当户理红妆|1|h","小弟闻姊来|1|h","磨刀霍霍向猪羊|1|h","开我东阁门|1|h","坐我西阁床|1|h","脱我战时袍|1|h","著我旧时裳|1|h","当窗理云鬓|1|h","对镜帖花黄|1|h","出门看火伴|1|h","火伴皆惊忙|1|h","同行十二年|1|h","不知木兰是女郎|1|h","雄兔脚扑朔|1|h","雌兔眼迷离|1|h","双兔傍地走|1|h","安能辨我是雄雌|1|h","长命无绝衰|3|m","乃敢与君绝|3|m","陟彼北芒兮|4|m","顾览帝京兮|4|m","宫室崔嵬兮|4|m","人之劬劳兮|4|m","辽辽未央兮|4|m","十五从军征|5|m","八十始得归|5|m","道逢乡里人|5|m","家中有阿谁|5|m","遥看是君家|5|m","松柏冢累累|5|m","兔从狗窦入|5|m","雉从梁上飞|5|m","中庭生旅谷|5|m","井上生旅葵|5|m","舂谷持作饭|5|m","采葵持作羹|5|m","羹饭一时熟|5|m","不知贻阿谁|5|m","出门东向看|5|m","泪落沾我衣|5|m","行行重行行|6|m","与君生别离|6|m","相去万余里|6|m","各在天一涯|6|m","道路阻且长|6|m","会面安可知|6|m","胡马依北风|6|m","越鸟巢南枝|6|m","相去日已远|6|m","衣带日已缓|6|m","浮云蔽白日|6|m","游子不顾返|6|m","思君令人老|6|m","岁月忽已晚|6|m","弃捐勿复道|6|m","努力加餐饭|6|m","青青河畔草|7|m","郁郁园中柳|7|m","盈盈楼上女|7|m","皎皎当窗牖|7|m","娥娥红粉妆|7|m","纤纤出素手|7|m","昔为倡家女|7|m","今为荡子妇|7|m","荡子行不归|7|m","空床难独守|7|m","今日良宴会|8|m","欢乐难具陈|8|m","弹筝奋逸响|8|m","新声妙入神|8|m","令德唱高言|8|m","识曲听其真|8|m","齐心同所愿|8|m","含意俱未申|8|m","西北有高楼|9|m","上与浮云齐|9|m","交疏结绮窗|9|m","阿阁三重阶|9|m","上有弦歌声|9|m","音响一何悲|9|m","谁能为此曲|9|m","无乃杞梁妻|9|m","庭中有奇树|10|m","绿叶发华滋|10|m","攀条折其荣|10|m","将以遗所思|10|m","馨香盈怀袖|10|m","路远莫致之|10|m","此物何足贵|10|m","但感经时违|10|m","驱车上东门|11|m","遥望郭北墓|11|m","白杨何萧萧|11|m","松柏夹广路|11|m","下有陈死人|11|m","杳杳即长暮|11|m","潜寐黄泉下|11|m","千载永不寤|11|m","生年不满百|12|m","常怀千岁忧|12|m","昼短苦夜长|12|m","何不秉烛游|12|m","为乐当及时|12|m","何能待来兹|12|m","愚者爱惜费|12|m","但为后世嗤|12|m","明月何皎皎|13|m","照我罗床帏|13|m","忧愁不能寐|13|m","揽衣起徘徊|13|m","客行虽云乐|13|m","不如早旋归|13|m","出户独彷徨|13|m","愁思当告谁|13|m","我所思兮在太山|14|m","欲往从之梁父艰|14|m","侧身东望涕沾翰|14|m","力拔山兮气盖世|15|m","时不利兮骓不逝|15|m","骓不逝兮可奈何|15|m","虞兮虞兮奈若何|15|m","大风起兮云飞扬|16|m","孔雀东南飞|17|h","五里一徘徊|17|h","十三能织素|17|h","十四学裁衣|17|h","十五弹箜篌|17|h","十六诵诗书|17|h","十七为君妇|17|h","心中常苦悲|17|h","君既为府吏|17|h","守节情不移|17|h","贱妾留空房|17|h","相见常日稀|17|h","鸡鸣入机织|17|h","夜夜不得息|17|h","三日断五匹|17|h","大人故嫌迟|17|h","非为织作迟|17|h","君家妇难为|17|h","妾不堪驱使|17|h","徒留无所施|17|h","便可白公姥|17|h","及时相遣归|17|h","但感物候时|18|m","新裂齐纨素|19|m","皎洁如霜雪|19|m","裁为合欢扇|19|m","团团似明月|19|m","出入君怀袖|19|m","动摇微风发|19|m","常恐秋节至|19|m","凉飙夺炎热|19|m","弃捐箧笥中|19|m","恩情中道绝|19|m","欲归家无人|20|m","欲渡河无船|20|m","心思不能言|20|m","肠中车轮转|20|m","明月皎夜光|21|m","促织鸣东壁|21|m","玉衡指孟冬|21|m","众星何历历|21|m","白露沾野草|21|m","时节忽复易|21|m","秋蝉鸣树间|21|m","玄鸟逝安适|21|m","昔我同门友|21|m","高举振六翮|21|m","不念携手好|21|m","弃我如遗迹|21|m","南箕北有斗|21|m","牵牛不负轭|21|m","良无盘石固|21|m","虚名复何益|21|m","乃在大海南|22|m","何用问遗君|22|m","双珠玳瑁簪|22|m","用玉绍缭之|22|m","闻君有他心|22|m","拉杂摧烧之|22|m","当风扬其灰|22|m","相思与君绝|22|m","兄嫂当知之|22|m","秋风肃肃晨风飔|22|m","东方须臾高知之|22|m","江南可采莲|24|e","莲叶何田田|24|e","鱼戏莲叶间|24|e","鱼戏莲叶东|24|e","鱼戏莲叶西|24|e","鱼戏莲叶南|24|e","鱼戏莲叶北|24|e","涉江采芙蓉|25|m","兰泽多芳草|25|m","采之欲遗谁|25|m","所思在远道|25|m","还顾望旧乡|25|m","长路漫浩浩|25|m","同心而离居|25|m","忧伤以终老|25|m","游子不顾反|26|m","清商随风发|27|m","中曲正徘徊|27|m","一弹再三叹|27|m","慷慨有余哀|27|m","不惜歌者苦|27|m","但伤知音稀|27|m","愿为双鸿鹄|27|m","奋翅起高飞|27|m","人生譬朝露|28|m","居世多屯蹇|28|m","忧艰常早至|28|m","欢会常苦晚|28|m","迢迢牵牛星|29|m","皎皎河汉女|29|m","纤纤擢素手|29|m","札札弄机杼|29|m","终日不成章|29|m","泣涕零如雨|29|m","河汉清且浅|29|m","相去复几许|29|m","盈盈一水间|29|m","脉脉不得语|29|m","青青园中葵|30|m","朝露待日晞|30|m","阳春布德泽|30|m","万物生光辉|30|m","焜黄华叶衰|30|m","百川东到海|30|m","何时复西归|30|m","少壮不努力|30|m","老大徒伤悲|30|m","绵绵思远道|31|m","远道不可思|31|m","宿昔梦见之|31|m","梦见在我傍|31|m","忽觉在他乡|31|m","他乡各异县|31|m","辗转不相见|31|m","枯桑知天风|31|m","海水知天寒|31|m","入门各自媚|31|m","谁肯相为言|31|m","客从远方来|31|m","遗我双鲤鱼|31|m","呼儿烹鲤鱼|31|m","中有尺素书|31|m","长跪读素书|31|m","书中竟何如|31|m","上言加餐食|31|m","下言长相忆|31|m","远水长流洁白鸥|32|m","野梅初绽暗香浮|32|m","孤舟夜宿芦花岸|32|m","一枕秋声入梦来|32|m","滚滚长江东逝水|33|h","是非成败转头空|33|h","青山依旧在|33|h","几度夕阳红|33|h","白发渔樵江渚上|33|h","一壶浊酒喜相逢|33|h","古今多少事|33|h","都付笑谈中|33|h","秋风江口听鸣榔|34|e","远客三更倒客觞|34|e","两岸月明霜已白|34|e","一江风急水犹黄|34|e","十年往事随风过|34|e","一枕归心入梦长|34|e","世路无涯身已老|34|e","青山何处是吾乡|34|e","江水三千里|35|e","家书十五行|35|e","行行无别语|35|e","只道早还乡|35|e","今日复今日|36|m","今日何其少|36|m","今日又不为|36|m","此事何时了|36|m","人生百年几今日|36|m","今日不为真可惜|36|m","若言姑待明朝至|36|m","明朝又有明朝事|36|m","为君聊赋今日诗|36|m","努力请从今日始|36|m","高田如楼梯|37|e","平田如棋局|37|e","白鹭忽飞来|37|e","点破秧针绿|37|e","三年羁旅客|38|m","今日又南冠|38|m","无限河山泪|38|m","谁言天地宽|38|m","已知泉路近|38|m","欲别故乡难|38|m","毅魄归来日|38|m","灵旗空际看|38|m","凿开混沌得乌金|39|m","藏蓄阳和意最深|39|m","爝火燃回春浩浩|39|m","洪炉照破夜沉沉|39|m","鼎彝元赖生成力|39|m","铁石犹存死后心|39|m","但愿苍生俱饱暖|39|m","不辞辛苦出山林|39|m","渡水复渡水|40|e","看花还看花|40|e","春风江上路|40|e","不觉到君家|40|e","春色醉巴陵|41|m","阑干落洞庭|41|m","水吞三楚白|41|m","山接九疑青|41|m","空阔鱼龙舞|41|m","娉婷帝子灵|41|m","何人夜吹笛|41|m","风急雨冥冥|41|m","春风一夜到衡阳|42|e","楚水燕山万里长|42|e","莫道春来便归去|42|e","江南虽好是他乡|42|e","风烟节物眼中稀|43|e","三月人犹恋褚衣|43|e","结就客愁云片段|43|e","唤回乡梦雨霏微|43|e","官船来往乱如麻|44|m","军听了军愁|44|m","民听了民怕|44|m","吹伤了那家|44|m","寂历秋江渔火稀|45|e","起看残月映林微|45|e","波光水鸟惊犹宿|45|e","露冷流萤湿不飞|45|e","白发渔翁老此乡|46|e","芦花深处草为堂|46|e","一壶村酒鲈鱼美|46|e","睡到明朝又何妨|46|e","千锤万凿出深山|47|m","烈火焚烧若等闲|47|m","粉骨碎身浑不怕|47|m","要留清白在人间|47|m","书卷多情似故人|48|m","晨昏忧乐每相亲|48|m","眼前直下三千字|48|m","胸次全无一点尘|48|m","风条雨叶逐风尘|49|e","横惹阶前半面春|49|e","莫道此君无用处|49|e","岁寒曾伴雪中身|49|e","南北驱驰报主情|50|m","江花边草笑平生|50|m","一年三百六十日|50|m","多是横戈马上行|50|m","江干远树浮|51|m","天末孤烟起|51|m","江天自如合|51|m","烟树还相似|51|m","孤烟起新丰|52|m","归雁出吴城|52|m","草低金城雾|52|m","木下玉门风|52|m","玉关道路远|53|m","金陵信使疏|53|m","独下千行泪|53|m","开君万里书|53|m","暮烟起遥岸|54|m","斜日照安流|54|m","一同心赏夕|54|m","暂解去乡忧|54|m","楚材称晋用|55|m","秦臣即赵冠|55|m","离宫延子产|55|m","羁旅接陈完|55|m","一身仕关西|56|m","家族满山东|56|m","二年从车驾|56|m","斋祭甘泉宫|56|m","白云满鄣来|57|m","黄尘暗天起|57|m","关山四面绝|57|m","故乡几千里|57|m","灞涘望长安|58|m","河阳视京县|58|m","白日丽飞甍|58|m","参差皆可见|58|m","余霞散成绮|58|m","澄江静如练|58|m","秋风吹木叶|59|m","还似洞庭波|59|m","常山临代郡|59|m","亭障绕黄河|59|m","客心已百念|60|m","孤游重千里|60|m","江暗雨欲来|60|m","浪白风初起|60|m","山中何所有|61|m","岭上多白云|61|m","只可自怡悦|61|m","不堪持赠君|61|m","折花逢驿使|62|m","寄与陇头人|62|m","江南无所有|62|m","聊赠一枝春|62|m","阳关万里道|63|m","不见一人归|63|m","惟有河边雁|63|m","秋来南向飞|63|m","军歌应唱大刀环|64|m","誓灭胡奴出玉关|64|m","只解沙场为国死|64|m","何须马革裹尸还|64|m","沉沉更鼓急|65|e","渐渐人声绝|65|e","吹灯窗更明|65|e","月照一天雪|65|e","金粉东南十五州|66|m","万重恩怨属名流|66|m","牢盆狎客操全算|66|m","团扇才人踞上游|66|m","避席畏闻文字狱|66|m","著书都为稻粱谋|66|m","田横五百人安在|66|m","难道归来尽列侯|66|m","天山万笏耸琼瑶|67|m","导我西行伴寂寥|67|m","我与山灵相对笑|67|m","满头晴雪共难消|67|m","衙斋卧听萧萧竹|68|m","疑是民间疾苦声|68|m","些小吾曹州县吏|68|m","一枝一叶总关情|68|m","不惜千金买宝刀|69|m","貂裘换酒也堪豪|69|m","一腔热血勤珍重|69|m","洒去犹能化碧涛|69|m","九州生气恃风雷|70|m","万马齐喑究可哀|70|m","我劝天公重抖擞|70|m","不拘一格降人才|70|m","浩荡离愁白日斜|71|m","吟鞭东指即天涯|71|m","落红不是无情物|71|m","化作春泥更护花|71|m","少年哀乐过于人|72|m","歌泣无端字字真|72|m","既壮周旋杂痴黠|72|m","童心来复梦中身|72|m","霜豪掷罢倚天寒|73|m","任作淋漓淡墨看|73|m","何敢自矜医国手|73|m","药方只贩古时丹|73|m","牧童骑黄牛|74|e","歌声振林樾|74|e","意欲捕鸣蝉|74|e","忽然闭口立|74|e","连宵风雨恶|75|e","蓬户不轻开|75|e","山似春归日|75|e","花如客到时|75|e","春风如贵客|76|e","一到便繁华|76|e","来扫千山雪|76|e","归留万国花|76|e","少闻鸡声眠|77|m","老听鸡声起|77|m","千古万代人|77|m","消磨数声里|77|m","人生若只如初见|78|m","何事秋风悲画扇|78|m","等闲变却故人心|78|m","却道故人心易变|78|m","骊山语罢清宵半|78|m","泪雨霖铃终不怨|78|m","何如薄幸锦衣郎|78|m","比翼连枝当日愿|78|m","草长莺飞二月天|79|e","拂堤杨柳醉春烟|79|e","儿童散学归来早|79|e","忙趁东风放纸鸢|79|e","看万山红遍|80|h","万类霜天竞自由|80|h","问苍茫大地|80|h","恰同学少年|80|h","粪土当年万户侯|80|h","到中流击水|80|h","望长城内外|81|h","欲与天公试比高|81|h","看红装素裹|81|h","惜秦皇汉武|81|h","只识弯弓射大雕|81|h","数风流人物|81|h","谁念西风独自凉|82|h","萧萧黄叶闭疏窗|82|h","沉思往事立残阳|82|h","被酒莫惊春睡重|82|h","赌书消得泼茶香|82|h","当时只道是寻常|82|h","望门投止思张俭|83|m","忍死须臾待杜根|83|m","我自横刀向天笑|83|m","去留肝胆两昆仑|83|m","咬定青山不放松|84|m","立根原在破岩中|84|m","千磨万击还坚劲|84|m","任尔东西南北风|84|m","月黑见渔灯|85|e","孤光一点萤|85|e","微微风簇浪|85|e","散作满河星|85|e","白日不到处|86|e","青春恰自来|86|e","苔花如米小|86|e","也学牡丹开|86|e","蝉居最高树|87|h","高树亦无枝|87|h","饮露身何洁|87|h","吟风韵自奇|87|h","绝音人不识|87|h","远响尔何知|87|h","寄语螳螂辈|87|h","休将此意欺|87|h","辛苦最怜天上月|88|m","昔昔都成玦|88|m","若似月轮终皎洁|88|m","不辞冰雪为卿热|88|m","李杜诗篇万口传|89|m","至今已觉不新鲜|89|m","江山代有才人出|89|m","各领风骚数百年|89|m","诗界千年靡靡风|90|m","兵魂销尽国魂空|90|m","集中什九从军乐|90|m","亘古男儿一放翁|90|m","万籁无声夜正中|91|m","月华如水浸帘栊|91|m","闲愁一缕随风去|91|m","化作清光入太空|91|m","力微任重久神疲|92|m","再竭衰庸定不支|92|m","苟利国家生死以|92|m","岂因祸福避趋之|92|m","谪居正是君恩厚|92|m","养拙刚于戍卒宜|92|m","戏与山妻谈故事|92|m","试吟断送老头皮|92|m","爱好由来落笔难|93|m","一诗千改始心安|93|m","阿婆还似初笄女|93|m","头未梳成不许看|93|m","我亦飘零久|94|m","宿昔齐名非忝窃|94|m","身向榆关那畔行|95|m","夜深千帐灯|95|m","聒碎乡心梦不成|95|m","故园无此声|95|m","思亲不断如春草|96|e","一夜西风绿又生|96|e","欲寄归心无处着|96|e","月明满地是乡情|96|e","莫唱当年长恨歌|97|m","人间亦自有银河|97|m","石壕村里夫妻别|97|m","泪比长生殿上多|97|m","万里乘云去复来|98|m","只身东海挟春雷|98|m","忍看图画移颜色|98|m","肯使江山付劫灰|98|m","浊酒不销忧国泪|98|m","救时应仗出群才|98|m","拼将十万头颅血|98|m","须把乾坤力挽回|98|m","红藕香残玉簟秋|99|h","云中谁寄锦书来|99|h","花自飘零水自流|99|h","此情无计可消除|99|h","梅子黄时日日晴|100|m","小溪泛尽却山行|100|m","绿阴不减来时路|100|m","添得黄鹂四五声|100|m","少年不识愁滋味|101|m","为赋新词强说愁|101|m","而今识尽愁滋味|101|m","却道天凉好个秋|101|m","梨花淡白柳深青|102|m","柳絮飞时花满城|102|m","惆怅东栏一株雪|102|m","人生看得几清明|102|m","世味年来薄似纱|103|h","谁令骑马客京华|103|h","小楼一夜听春雨|103|h","深巷明朝卖杏花|103|h","矮纸斜行闲作草|103|h","晴窗细乳戏分茶|103|h","素衣莫起风尘叹|103|h","犹及清明可到家|103|h","去年春恨却来时|104|h","落花人独立|104|h","微雨燕双飞|104|h","琵琶弦上说相思|104|h","当时明月在|104|h","曾照彩云归|104|h","夜饮东坡醒复醉|105|h","家童鼻息已雷鸣|105|h","敲门都不应|105|h","倚杖听江声|105|h","长恨此身非我有|105|h","夜阑风静縠纹平|105|h","小舟从此逝|105|h","江海寄余生|105|h","早岁那知世事艰|106|h","中原北望气如山|106|h","楼船夜雪瓜洲渡|106|h","铁马秋风大散关|106|h","塞上长城空自许|106|h","镜中衰鬓已先斑|106|h","出师一表真名世|106|h","千载谁堪伯仲间|106|h","野水参差落涨痕|107|m","疏林欹倒出霜根|107|m","扁舟一棹归何处|107|m","家在江南黄叶村|107|m","萧萧远树疏林外|108|e","一半秋山带夕阳|108|e","茅檐长扫净无苔|109|m","花木成畦手自栽|109|m","一水护田将绿绕|109|m","两山排闼送青来|109|m","庙堂无策可平戎|110|m","坐使甘泉照火光|110|m","夷甫诸人堪一笑|110|m","更从今去误苍生|110|m","云淡风轻近午天|111|m","傍花随柳过前川|111|m","时人不识余心乐|111|m","将谓偷闲学少年|111|m","爆竹声中一岁除|112|m","春风送暖入屠苏|112|m","千门万户曈曈日|112|m","总把新桃换旧符|112|m","一番洗清秋|113|h","渐霜风凄紧|113|h","苒苒物华休|113|h","惟有长江水|113|h","望故乡渺邈|113|h","叹年来踪迹|113|h","何事苦淹留|113|h","想佳人妆楼颙望|113|h","天际识归舟|113|h","关塞莽然平|114|h","追想当年事|114|h","落日牛羊下|114|h","看名王宵猎|114|h","骑火一川明|114|h","干羽方怀远|114|h","使行人到此|114|h","忠愤气填膺|114|h","黑云翻墨未遮山|115|m","白雨跳珠乱入船|115|m","卷地风来忽吹散|115|m","望湖楼下水如天|115|m","参横斗转欲三更|116|m","苦雨终风也解晴|116|m","云散月明谁点缀|116|m","天容海色本澄清|116|m","空余鲁叟乘桴意|116|m","粗识轩辕奏乐声|116|m","九死南荒吾不恨|116|m","兹游奇绝冠平生|116|m","古人学问无遗力|117|m","少壮工夫老始成|117|m","纸上得来终觉浅|117|m","绝知此事要躬行|117|m","任宝奁尘满|118|h","念武陵人远|118|h","乳鸭池塘水浅深|119|m","熟梅天气半晴阴|119|m","东园载酒西园醉|119|m","摘尽枇杷一树金|119|m","落日无情最有情|120|e","遍催万树暮蝉鸣|120|e","听来咫尺无寻处|120|e","寻到旁边却不声|120|e","衣上征尘杂酒痕|121|m","远游无处不消魂|121|m","此身合是诗人未|121|m","细雨骑驴入剑门|121|m","少年易老学难成|122|m","一寸光阴不可轻|122|m","未觉池塘春草梦|122|m","阶前梧叶已秋声|122|m","北山输绿涨横陂|123|m","直堑回塘滟滟时|123|m","细数落花因坐久|123|m","缓寻芳草得归迟|123|m","僵卧孤村不自哀|124|m","尚思为国戍轮台|124|m","夜阑卧听风吹雨|124|m","铁马冰河入梦来|124|m","何处望神州|125|h","满眼风光北固楼|125|h","千古兴亡多少事|125|h","不尽长江滚滚流|125|h","年少万兜鍪|125|h","坐断东南战未休|125|h","天下英雄谁敌手|125|h","生子当如孙仲谋|125|h","南浦东冈二月时|126|m","物华撩我有新诗|126|m","含风鸭绿粼粼起|126|m","弄日鹅黄袅袅垂|126|m","驿外断桥边|127|m","寂寞开无主|127|m","已是黄昏独自愁|127|m","更着风和雨|127|m","无意苦争春|127|m","一任群芳妒|127|m","零落成泥碾作尘|127|m","只有香如故|127|m","水是眼波横|128|m","山是眉峰聚|128|m","欲问行人去那边|128|m","眉眼盈盈处|128|m","才始送春归|128|m","又送君归去|128|m","若到江南赶上春|128|m","千万和春住|128|m","缺月挂疏桐|129|h","漏断人初静|129|h","谁见幽人独往来|129|h","缥缈孤鸿影|129|h","惊起却回头|129|h","有恨无人省|129|h","拣尽寒枝不肯栖|129|h","寂寞沙洲冷|129|h","燕子将雏语夏深|130|m","绿槐庭院不多阴|130|m","西窗一雨无人见|130|m","展尽芭蕉数尺心|130|m","度帘幕中间|131|h","又软语商量不定|131|h","爱贴地争飞|131|h","人生到处知何似|132|h","应似飞鸿踏雪泥|132|h","泥上偶然留指爪|132|h","鸿飞那复计东西|132|h","老僧已死成新塔|132|h","坏壁无由见旧题|132|h","往日崎岖还记否|132|h","路长人困蹇馿嘶|132|h","昼出耘田夜绩麻|133|m","村庄儿女各当家|133|m","童孙未解供耕织|133|m","也傍桑阴学种瓜|133|m","梅子金黄杏子肥|134|m","麦花雪白菜花稀|134|m","日长篱落无人过|134|m","唯有蜻蜓蛱蝶飞|134|m","惟有蜻蜓蛱蝶飞|135|m","新筑场泥镜面平|136|m","家家打稻趁霜晴|136|m","笑歌声里轻雷动|136|m","一夜连枷响到明|136|m","怎一个愁字了得|137|h","别院深深夏席清|138|m","石榴开遍透帘明|138|m","树阴满地日当午|138|m","梦觉流莺时一声|138|m","长夏村墟风日清|139|m","檐牙燕雀已生成|139|m","蝶衣晒粉花枝舞|139|m","蛛网惹丝罥落星|139|m","流水阶除静|140|e","孤眠得自由|140|e","月生林欲晓|140|e","雨过夜如秋|140|e","远忆荷花浦|140|e","谁吟杜若洲|140|e","良宵恐无梦|140|e","有梦即俱游|140|e","生当作人杰|141|m","死亦为鬼雄|141|m","至今思项羽|141|m","不肯过江东|141|m","萧萧梧叶送寒声|142|m","江上秋风动客情|142|m","知有儿童挑促织|142|m","夜深篱落一灯明|142|m","庭户无人秋月明|143|m","夜霜欲落气先清|143|m","梧桐真不甘衰谢|143|m","数叶迎风尚有声|143|m","腰间羽箭久凋零|144|m","太息燕然未勒铭|144|m","老子犹堪绝大漠|144|m","诸君何至泣新亭|144|m","一身报国有万死|144|m","双鬓向人无再青|144|m","记取江湖泊船处|144|m","卧闻新雁落寒汀|144|m","水调数声持酒听|145|m","午醉醒来愁未醒|145|m","送春春去几时回|145|m","往事后期空记省|145|m","沙上并禽池上暝|145|m","云破月来花弄影|145|m","重重帘幕密遮灯|145|m","明日落红应满径|145|m","一轮秋影转金波|146|m","飞镜又重磨|146|m","把酒问姮娥|146|m","直下看山河|146|m","斫去桂婆娑|146|m","月未到诚斋|147|m","隔一庭修竹|147|m","如今才是十三夜|147|m","月色已如玉|147|m","看十五十六|147|m","试问卷帘人|148|m","兴尽晚回舟|149|m","天质自森森|150|m","孤高几百寻|150|m","凌霄不屈己|150|m","得地本虚心|150|m","岁老根弥壮|150|m","阳骄叶更阴|150|m","明时思解愠|150|m","愿斲五弦琴|150|m","莫听穿林打叶声|151|h","何妨吟啸且徐行|151|h","竹杖芒鞋轻胜马|151|h","一蓑烟雨任平生|151|h","料峭春风吹酒醒|151|h","山头斜照却相迎|151|h","回首向来萧瑟处|151|h","也无风雨也无晴|151|h","篱落疏疏一径深|152|e","树头新绿未成阴|152|e","儿童急走追黄蝶|152|e","飞入菜花无处寻|152|e","我居北海君南海|153|h","寄雁传书谢不能|153|h","桃李春风一杯酒|153|h","江湖夜雨十年灯|153|h","持家但有四立壁|153|h","治病不蕲三折肱|153|h","想见读书头已白|153|h","隔溪猿哭瘴溪藤|153|h","泉眼无声惜细流|154|e","树阴照水爱晴柔|154|e","小荷才露尖尖角|154|e","早有蜻蜓立上头|154|e","昨夜寒蛩不住鸣|155|h","惊回千里梦|155|h","起来独自绕阶行|155|h","帘外月胧明|155|h","白首为功名|155|h","旧山松竹老|155|h","欲将心事付瑶琴|155|h","弦断有谁听|155|h","众芳摇落独暄妍|156|m","占尽风情向小园|156|m","疏影横斜水清浅|156|m","暗香浮动月黄昏|156|m","霜禽欲下先偷眼|156|m","粉蝶如知合断魂|156|m","卷起千堆雪|157|h","小乔初嫁了|157|h","多情应笑我|157|h","玉鉴琼田三万顷|158|h","表里俱澄澈|158|h","肝肺皆冰雪|158|h","短发萧骚襟袖冷|158|h","万象为宾客|158|h","尽日寻春不见春|159|m","芒鞋踏遍陇头云|159|m","归来笑拈梅花嗅|159|m","春在枝头已十分|159|m","两两归鸿欲破群|160|m","依依还似北归人|160|m","遥知朔漠多风雪|160|m","更待江南半月春|160|m","罗浮山下四时春|161|m","卢橘杨梅次第新|161|m","日啖荔枝三百颗|161|m","不辞长作岭南人|161|m","过春风十里|162|h","尽荠麦青青|162|h","自胡马窥江去后|162|h","纵豆蔻词工|162|h","念桥边红药|162|h","田夫抛秧田妇接|164|m","小儿拔秧大儿插|164|m","笠是兜鍪蓑是甲|164|m","雨从头上湿到胛|164|m","唤渠朝餐歇半霎|164|m","低头折腰只不答|164|m","秧根未牢莳未匝|164|m","照管鹅儿与雏鸭|164|m","惜春长怕花开早|165|h","天涯芳草无归路|165|h","算只有殷勤|165|h","尽日惹飞絮|165|h","千金纵买相如赋|165|h","玉环飞燕皆尘土|165|h","休去倚危栏|165|h","烟柳断肠处|165|h","数日秋风欺病夫|166|m","尽吹黄叶下庭芜|166|m","林疏放得遥山出|166|m","又被云遮一半无|166|m","黄莺也爱新凉好|167|e","飞过青山影里啼|167|e","东风知我欲山行|168|m","吹断檐间积雨声|168|m","岭上晴云披絮帽|168|m","树头初日挂铜钲|168|m","青苔满地初晴后|169|m","绿树无人昼梦余|169|m","唯有南风旧相识|169|m","偷开门户又翻书|169|m","露侵驼褐晓寒轻|170|m","星斗阑干分外明|170|m","寂寞小桥和梦过|170|m","稻田深处草虫鸣|170|m","金炉香烬漏声残|171|m","剪剪轻风阵阵寒|171|m","春色恼人眠不得|171|m","月移花影上栏杆|171|m","春宵一刻值千金|172|m","花有清香月有阴|172|m","歌管楼台声细细|172|m","秋千院落夜沉沉|172|m","阴阴溪曲绿交加|173|m","小雨翻萍上浅沙|173|m","鹅鸭不知春去尽|173|m","争随流水趁桃花|173|m","胜日寻芳泗水滨|174|m","无边光景一时新|174|m","等闲识得东风面|174|m","万紫千红总是春|174|m","一春略无十日晴|175|m","处处浮云将雨行|175|m","野田春水碧于镜|175|m","人影渡傍鸥不惊|175|m","竹外桃花三两枝|176|m","春江水暖鸭先知|176|m","蒌蒿满地芦芽短|176|m","正是河豚欲上时|176|m","双飞燕子几时回|177|m","夹岸桃花蘸水开|177|m","春雨断桥人不渡|177|m","小舟撑出柳阴来|177|m","急雨打篷声|178|m","聚作水银窝|178|m","毕竟西湖六月中|179|e","风光不与四时同|179|e","接天莲叶无穷碧|179|e","映日荷花别样红|179|e","紫青莼菜卷荷香|180|m","玉雪芹芽拔薤长|180|m","不待春风催暖日|180|m","只消新水满池塘|180|m","清风无力屠得热|181|m","落日着翅飞上山|181|m","人固已惧江海竭|181|m","天岂不惜河汉干|181|m","昆仑之高有积雪|181|m","蓬莱之远常遗寒|181|m","不能手提天下往|181|m","何忍身去游其间|181|m","算几番照我|182|h","不管清寒与攀摘|182|h","都忘却春风词笔|182|h","但怪得竹外疏花|182|h","香冷入瑶席|182|h","叹寄与路遥|182|h","红萼无言耿相忆|182|h","千树压西湖寒碧|182|h","双双瓦雀行书案|183|m","点点杨花入砚池|183|m","闲坐小窗读周易|183|m","不知春去几多时|183|m","游人脚底一声雷|184|m","满座顽云拨不开|184|m","天外黑风吹海立|184|m","浙东飞雨过江来|184|m","十分潋滟金樽凸|184|m","千杖敲铿羯鼓催|184|m","唤起谪仙泉洒面|184|m","倒倾鲛室泻琼瑰|184|m","风细柳斜斜|185|m","试上超然台上看|185|m","半壕春水一城花|185|m","烟雨暗千家|185|m","酒醒却咨嗟|185|m","休对故人思故国|185|m","且将新火试新茶|185|m","诗酒趁年华|185|m","云树绕堤沙|186|h","怒涛卷霜雪|186|h","可怜今夕月|187|m","是别有人间|187|m","浩浩送中秋|187|m","草满池塘水满陂|188|e","山衔落日浸寒漪|188|e","牧童归去横牛背|188|e","短笛无腔信口吹|188|e","晓带轻烟间杏花|189|m","晚凝深翠拂平沙|189|m","长条别有风流处|189|m","密映钱塘苏小家|189|m","正故国晚秋|190|h","归帆去棹残阳里|190|h","叹门外楼头|190|h","六朝旧事随流水|190|h","但寒烟衰草凝绿|190|h","墙角数枝梅|191|e","凌寒独自开|191|e","遥知不是雪|191|e","为有暗香来|191|e","云里溪桥独占春|192|e","天然玉质晓妆新|192|e","月中疏影霜中韵|192|e","都作人间百倍珍|192|e","闻道梅花坼晓风|193|m","雪堆遍满四山中|193|m","何方可化身千亿|193|m","一树梅花一放翁|193|m","天地有正气|194|h","杂然赋流形|194|h","下则为河岳|194|h","上则为日星|194|h","于人曰浩然|194|h","沛乎塞苍冥|194|h","皇路当清夷|194|h","含和吐明庭|194|h","时穷节乃见|194|h","一一垂丹青|194|h","风住尘香花已尽|195|m","日晚倦梳头|195|m","物是人非事事休|195|m","欲语泪先流|195|m","闻说双溪春尚好|195|m","也拟泛轻舟|195|m","只恐双溪舴艋舟|195|m","昨夜扁舟雨一蓑|196|m","满江风浪夜如何|196|m","今朝试卷孤篷看|196|m","依旧青山绿树多|196|m","明月几时有|197|h","把酒问青天|197|h","今夕是何年|197|h","高处不胜寒|197|h","起舞弄清影|197|h","何似在人间|197|h","何事长向别时圆|197|h","此事古难全|197|h","但愿人长久|197|h","千里共婵娟|197|h","也无人惜从教坠|198|h","梦随风万里|198|h","恨西园落红难缀|198|h","水随天去秋无际|199|h","把吴钩看了|199|h","倩何人唤取|199|h","烽火扬州路|200|h","江上秋风吹白头|201|m","倦游空叹此身浮|201|m","只应且作乘桴客|201|m","安得长为击楫流|201|m","江上往来人|202|m","但爱鲈鱼美|202|m","君看一叶舟|202|m","出没风波里|202|m","十年生死两茫茫|203|h","无处话凄凉|203|h","纵使相逢应不识|203|h","夜来幽梦忽还乡|203|h","惟有泪千行|203|h","料得年年肠断处|203|h","老夫聊发少年狂|204|m","千骑卷平冈|204|m","为报倾城随太守|204|m","酒酣胸胆尚开张|204|m","何日遣冯唐|204|m","会挽雕弓如满月|204|m","江头落日照平沙|205|m","潮退渔船阁岸斜|205|m","白鸟一双临水立|205|m","见人惊起入芦花|205|m","经年尘土满征衣|206|m","特特寻芳上翠微|206|m","好水好山看不足|206|m","马蹄催趁月明归|206|m","城上斜阳画角哀|207|m","沈园非复旧池台|207|m","伤心桥下春波绿|207|m","曾是惊鸿照影来|207|m","梦断香消四十年|208|m","沈园柳老不吹绵|208|m","此身行作稽山土|208|m","犹吊遗踪一泫然|208|m","京口瓜洲一水间|209|m","钟山只隔数重山|209|m","春风又绿江南岸|209|m","明月何时照我还|209|m","自清凉无汗|210|h","水殿风来暗香满|210|h","起来携素手|210|h","时见疏星渡河汉|210|h","试问夜如何|210|h","一曲新词酒一杯|211|h","去年天气旧亭台|211|h","夕阳西下几时回|211|h","无可奈何花落去|211|h","似曾相识燕归来|211|h","小园香径独徘徊|211|h","山下兰芽短浸溪|212|h","松间沙路净无泥|212|h","潇潇暮雨子规啼|212|h","谁道人生无再少|212|h","门前流水尚能西|212|h","休将白发唱黄鸡|212|h","东风袅袅泛崇光|213|m","香雾空蒙月转廊|213|m","只恐夜深花睡去|213|m","故烧高烛照红妆|213|m","春阴垂野草青青|214|m","时有幽花一树明|214|m","晚泊孤舟古祠下|214|m","满川风雨看潮生|214|m","小桃无主自开花|215|m","烟草茫茫带晚鸦|215|m","几处败垣围故井|215|m","向来一一是人家|215|m","寂寞无行路|216|m","若有人知春去处|216|m","溪上青青草|217|m","醉里吴音相媚好|217|m","天接云涛连晓雾|218|h","星河欲转千帆舞|218|h","仿佛梦魂归帝所|218|h","殷勤问我归何处|218|h","我报路长嗟日暮|218|h","学诗谩有惊人句|218|h","九万里风鹏正举|218|h","蓬舟吹取三山去|218|h","塞下秋来风景异|219|h","衡阳雁去无留意|219|h","四面边声连角起|219|h","长烟落日孤城闭|219|h","浊酒一杯家万里|219|h","燕然未勒归无计|219|h","羌管悠悠霜满地|219|h","将军白发征夫泪|219|h","西塞山前白鹭飞|220|m","桃花流水鳜鱼肥|220|m","斜风细雨不须归|220|m","应怜屐齿印苍苔|221|h","小扣柴扉久不开|221|h","春色满园关不住|221|h","一枝红杏出墙来|221|h","莫笑农家腊酒浑|222|m","丰年留客足鸡豚|222|m","山重水复疑无路|222|m","柳暗花明又一村|222|m","箫鼓追随春社近|222|m","衣冠简朴古风存|222|m","从今若许闲乘月|222|m","拄杖无时夜叩门|222|m","聊共引离尊|223|h","流水绕孤村|223|h","销魂当此际|223|h","灯火已黄昏|223|h","三十功名尘与土|224|h","八千里路云和月|224|h","白了少年头|224|h","壮志饥餐胡虏肉|224|h","笑谈渴饮匈奴血|224|h","收拾旧山河|224|h","倦客愁闻归路遥|225|m","眼明飞阁俯长桥|225|m","贪看白鹭横秋浦|225|m","不觉青林没晚潮|225|m","太湖西畔随云去|226|m","商略黄昏雨|226|m","拟共天随住|226|m","残柳参差舞|226|m","一自胡尘入汉关|227|m","十年伊洛路漫漫|227|m","青墩溪畔龙钟客|227|m","独立东风看牡丹|227|m","年年跃马长安市|228|m","客舍似家家似寄|228|m","青钱换酒日无何|228|m","红烛呼卢宵不寐|228|m","易挑锦妇机中字|228|m","难得玉人心下事|228|m","男儿西北有神州|228|m","莫滴水西桥畔泪|228|m","尊前拟把归期说|229|m","欲语春容先惨咽|229|m","人生自是有情痴|229|m","此恨不关风与月|229|m","离歌且莫翻新阕|229|m","一曲能教肠寸结|229|m","直须看尽洛城花|229|m","始共春风容易别|229|m","若言琴上有琴声|230|m","放在匣中何不鸣|230|m","若言声在指头上|230|m","何不于君指上听|230|m","去年元夜时|231|m","花市灯如昼|231|m","月上柳梢头|231|m","人约黄昏后|231|m","今年元夜时|231|m","月与灯依旧|231|m","不见去年人|231|m","泪湿春衫袖|231|m","耕犁千亩实千箱|232|m","力尽筋疲谁复伤|232|m","但得众生皆得饱|232|m","不辞羸病卧残阳|232|m","病骨支离纱帽宽|233|m","孤臣万里客江干|233|m","位卑未敢忘忧国|233|m","事定犹须待阖棺|233|m","天地神灵扶庙社|233|m","京华父老望和銮|233|m","出师一表通今古|233|m","夜半挑灯更细看|233|m","痴儿了却公家事|234|h","快阁东西倚晚晴|234|h","落木千山天远大|234|h","澄江一道月分明|234|h","朱弦已为佳人绝|234|h","青眼聊因美酒横|234|h","万里归船弄长笛|234|h","此心吾与白鸥盟|234|h","飞来山上千寻塔|235|m","闻说鸡鸣见日升|235|m","不畏浮云遮望眼|235|m","自缘身在最高层|235|m","池上碧苔三四点|236|m","叶底黄鹂一两声|236|m","日长飞絮轻|236|m","疑怪昨宵春梦好|236|m","元是今朝斗草赢|236|m","笑从双脸生|236|m","八百里分麾下炙|237|h","五十弦翻塞外声|237|h","沙场秋点兵|237|h","了却君王天下事|237|h","赢得生前身后名|237|h","可怜白发生|237|h","死去元知万事空|238|m","但悲不见九州同|238|m","王师北定中原日|238|m","家祭无忘告乃翁|238|m","夜漏添长抱影悲|239|m","明月无情偏照户|239|m","秋来纨扇合收藏|239|m","何事佳人重感伤|239|m","三万里河东入海|240|m","五千仞岳上摩天|240|m","遗民泪尽胡尘里|240|m","南望王师又一年|240|m","利欲驱人万火牛|241|m","江湖浪迹一沙鸥|241|m","日长似岁闲方觉|241|m","事大如天醉亦休|241|m","闲来无事不从容|242|m","睡觉东窗日已红|242|m","万物静观皆自得|242|m","四时佳兴与人同|242|m","清溪流过碧山头|243|m","空水澄鲜一色秋|243|m","隔断红尘三十里|243|m","白云红叶两悠悠|243|m","黄梅时节家家雨|244|m","青草池塘处处蛙|244|m","有约不来过夜半|244|m","闲敲棋子落灯花|244|m","古木阴中系短篷|245|m","杖藜扶我过桥东|245|m","沾衣欲湿杏花雨|245|m","吹面不寒杨柳风|245|m","一叶渔船两小童|246|e","收篙停棹坐船中|246|e","怪生无雨都张伞|246|e","不是遮头是使风|246|e","重重叠叠上瑶台|247|m","几度呼童扫不开|247|m","刚被太阳收拾去|247|m","却教明月送将来|247|m","侵晓窥檐语|248|h","叶上初阳干宿雨|248|h","一一风荷举|248|h","久作长安旅|248|h","五月渔郎相忆否|248|h","梦入芙蓉浦|248|h","波上寒烟翠|249|h","山映斜阳天接水|249|h","更在斜阳外|249|h","好梦留人睡|249|h","明月楼高休独倚|249|h","化作相思泪|249|h","郁孤台下清江水|250|h","中间多少行人泪|250|h","西北望长安|250|h","可怜无数山|250|h","青山遮不住|250|h","毕竟东流去|250|h","江晚正愁余|250|h","山深闻鹧鸪|250|h","一片能教一断肠|251|h","可堪平砌更堆墙|251|h","飘如迁客来过岭|251|h","坠似骚人去赴湘|251|h","乱点莓苔多莫数|251|h","偶粘衣袖久犹香|251|h","东风谬掌花权柄|251|h","却忌孤高不主张|251|h","雪虐风饕愈凛然|252|h","花中气节最高坚|252|h","过时自合飘零去|252|h","耻向东君更乞怜|252|h","少年听雨歌楼上|253|m","红烛昏罗帐|253|m","壮年听雨客舟中|253|m","断雁叫西风|253|m","而今听雨僧庐下|253|m","鬓已星星也|253|m","悲欢离合总无情|253|m","点滴到天明|253|m","昨日入城市|254|m","归来泪满巾|254|m","遍身罗绮者|254|m","不是养蚕人|254|m","槛菊愁烟兰泣露|255|m","燕子双飞去|255|m","明月不谙离恨苦|255|m","斜光到晓穿朱户|255|m","昨夜西风凋碧树|255|m","望尽天涯路|255|m","欲寄彩笺兼尺素|255|m","山长水阔知何处|255|m","伫倚危楼风细细|256|m","黯黯生天际|256|m","草色烟光残照里|256|m","无言谁会凭阑意|256|m","拟把疏狂图一醉|256|m","强乐还无味|256|m","衣带渐宽终不悔|256|m","为伊消得人憔悴|256|m","庭院深深深几许|257|m","帘幕无重数|257|m","玉勒雕鞍游冶处|257|m","楼高不见章台路|257|m","雨横风狂三月暮|257|m","无计留春住|257|m","泪眼问花花不语|257|m","乱红飞过秋千去|257|m","花褪残红青杏小|258|m","绿水人家绕|258|m","枝上柳绵吹又少|258|m","天涯何处无芳草|258|m","墙里秋千墙外道|258|m","墙里佳人笑|258|m","笑渐不闻声渐悄|258|m","多情却被无情恼|258|m","飞花两岸照船红|259|m","百里榆堤半日风|259|m","卧看满天云不动|259|m","不知云与我俱东|259|m","稻花香里说丰年|260|m","旧时茅店社林边|260|m","山围故国绕清江|261|m","怒涛寂寞打孤城|261|m","半亩方塘一鉴开|262|m","天光云影共徘徊|262|m","问渠那得清如许|262|m","为有源头活水来|262|m","昨夜江边春水生|263|m","蒙冲巨舰一毛轻|263|m","向来枉费推移力|263|m","此日中流自在行|263|m","当年万里觅封侯|264|h","匹马戍梁州|264|h","尘暗旧貂裘|264|h","自古功名亦苦辛|265|m","行藏终欲付何人|265|m","当时黮闇犹承误|265|m","末俗纷纭更乱真|265|m","甚矣吾衰矣|266|h","我见青山多妩媚|266|h","一尊搔首东窗里|266|h","江左沉酣求名者|266|h","不恨古人吾不见|266|h","绿树听鹈鴂|267|h","啼到春归无寻处|267|h","马上琵琶关塞黑|267|h","将军百战身名裂|267|h","易水萧萧西风冷|267|h","啼鸟还知如许恨|267|h","北望神州路|268|m","记得太行山百万|268|m","君去京东豪杰喜|268|m","下拜真吾父|268|m","荷尽已无擎雨盖|269|m","菊残犹有傲霜枝|269|m","一年好景君须记|269|m","最是橙黄橘绿时|269|m","草薰风暖摇征辔|270|m","离愁渐远渐无穷|270|m","迢迢不断如春水|270|m","楼高莫近危阑倚|270|m","平芜尽处是春山|270|m","行人更在春山外|270|m","桃源望断无寻处|271|m","可堪孤馆闭春寒|271|m","杜鹃声里斜阳暮|271|m","砌成此恨无重数|271|m","郴江幸自绕郴山|271|m","为谁流下潇湘去|271|m","卜宅新息仅留期|272|m","更作留侯计亦迟|272|m","黄阁风烟那复问|272|m","青山泉石本无期|272|m","莫言下岭便无难|273|m","赚得行人空喜欢|273|m","正入万山圈子里|273|m","一山放过一山拦|273|m","辛苦遭逢起一经|274|h","干戈寥落四周星|274|h","山河破碎风飘絮|274|h","身世浮沉雨打萍|274|h","惶恐滩头说惶恐|274|h","零丁洋里叹零丁|274|h","人生自古谁无死|274|h","留取丹心照汗青|274|h","三月残花落更开|275|m","小檐日日燕飞来|275|m","子规夜半犹啼血|275|m","不信东风唤不回|275|m","薄雾浓云愁永昼|276|h","瑞脑销金兽|276|h","佳节又重阳|276|h","半夜凉初透|276|h","东篱把酒黄昏后|276|h","有暗香盈袖|276|h","莫道不销魂|276|h","人比黄花瘦|276|h","群芳过后西湖好|277|m","垂柳阑干尽日风|277|m","笙歌散尽游人去|277|m","双燕归来细雨中|277|m","一天秋色冷晴湾|278|h","无数峰峦远近间|278|h","闲上山来看野水|278|h","忽于水底见青山|278|h","满城春色宫墙柳|279|h","泪痕红浥鲛绡透|279|h","涧水无声绕竹流|280|m","竹西花草弄春柔|280|m","茅檐相对坐终日|280|m","一鸟不鸣山更幽|280|m","梅子留酸软齿牙|281|m","芭蕉分绿与窗纱|281|m","日长睡起无情思|281|m","闲看儿童捉柳花|281|m","满川风雨独凭栏|282|m","绾结湘娥十二鬟|282|m","可惜不当湖水面|282|m","银山堆里看青山|282|m","一雨池塘水面平|283|m","淡磨明镜照檐楹|283|m","东风忽起垂杨舞|283|m","更作荷心万点声|283|m","竟无语凝噎|284|h","暮霭沉沉楚天阔|284|h","多情自古伤离别|284|h","冷落清秋节|284|h","便纵有千种风情|284|h","更与何人说|284|h","梅雪争春未肯降|285|m","骚人阁笔费评章|285|m","梅须逊雪三分白|285|m","雪却输梅一段香|285|m","有梅无雪不精神|286|m","有雪无诗俗了人|286|m","日暮诗成天又雪|286|m","与梅并作十分春|286|m","凌波不过横塘路|287|m","锦瑟华年谁与度|287|m","只有春知处|287|m","飞云冉冉蘅皋暮|287|m","彩笔新题断肠句|287|m","试问闲愁都几许|287|m","梅子黄时雨|287|m","东风夜放花千树|288|h","宝马雕车香满路|288|h","一夜鱼龙舞|288|h","蛾儿雪柳黄金缕|288|h","笑语盈盈暗香去|288|h","众里寻他千百度|288|h","灯火阑珊处|288|h","山外青山楼外楼|289|m","西湖歌舞几时休|289|m","暖风熏得游人醉|289|m","直把杭州作汴州|289|m","寺里山因花得名|290|m","繁英不见草纵横|290|m","栽培剪伐须勤力|290|m","花易凋零草易生|290|m","横看成岭侧成峰|291|m","远近高低各不同|291|m","不识庐山真面目|291|m","只缘身在此山中|291|m","水光潋滟晴方好|293|m","山色空蒙雨亦奇|293|m","欲把西湖比西子|293|m","淡妆浓抹总相宜|293|m","金风玉露一相逢|294|h","便胜却人间无数|294|h","两情若是久长时|294|h","又岂在朝朝暮暮|294|h","彩袖殷勤捧玉钟|295|m","当年拚却醉颜红|295|m","舞低杨柳楼心月|295|m","歌尽桃花扇底风|295|m","几回魂梦与君同|295|m","今宵剩把银釭照|295|m","犹恐相逢是梦中|295|m","陌上柔桑破嫩芽|296|m","东邻蚕种已生些|296|m","平冈细草鸣黄犊|296|m","斜日寒林点暮鸦|296|m","青旗沽酒有人家|296|m","城中桃李愁风雨|296|m","春在溪头荠菜花|296|m","日暮鸟雀稀|297|m","稚子呼牛归|297|m","住处无利害|297|m","勿言翁独非|297|m","雨歇杨林东渡头|299|m","永和三日荡轻舟|299|m","故人家在桃花岸|299|m","直到门前溪水流|299|m","沅湘流不尽|300|m","屈子怨何深|300|m","日暮秋风起|300|m","萧萧枫树林|300|m","不见李生久|301|m","佯狂真可哀|301|m","世人皆欲杀|301|m","吾意独怜才|301|m","敏捷诗千首|301|m","飘零酒一杯|301|m","匡山读书处|301|m","头白好归来|301|m","人事有代谢|302|m","往来成古今|302|m","江山留胜迹|302|m","我辈复登临|302|m","水落鱼梁浅|302|m","天寒梦泽深|302|m","羊公碑尚在|302|m","读罢泪沾襟|302|m","将军魏武之子孙|303|h","于今为庶为清门|303|h","英雄割据虽已矣|303|h","文采风流今尚存|303|h","学书初学卫夫人|303|h","但恨无过王右军|303|h","丹青不知老将至|303|h","富贵于我如浮云|303|h","开元之中常引见|303|h","承恩数上南薰殿|303|h","凌烟功臣少颜色|303|h","将军下笔开生面|303|h","良骥头上盘戏龙|303|h","一洗万古凡马空|303|h","为有云屏无限娇|304|m","凤城寒尽怕春宵|304|m","无端嫁得金龟婿|304|m","辜负香衾事早朝|304|m","三月三日天气新|305|h","长安水边多丽人|305|h","态浓意远淑且真|305|h","肌理细腻骨肉匀|305|h","绣罗衣裳照暮春|305|h","蹙金孔雀银麒麟|305|h","头上何所有|305|h","翠微盍叶垂鬓唇|305|h","背后何所见|305|h","珠压腰衱稳称身|305|h","就中云幕椒房亲|305|h","赐名大国虢与秦|305|h","紫驼之峰出翠釜|305|h","水精之盘行素鳞|305|h","犀箸厌饫久未下|305|h","鸾刀缕切空纷纶|305|h","黄门飞鞚不动尘|305|h","御厨络绎送八珍|305|h","箫鼓哀吟感鬼神|305|h","宾从杂遝实要津|305|h","后来鞍马何逡巡|305|h","当轩下马入锦茵|305|h","杨花雪落覆白苹|305|h","青鸟飞去衔红巾|305|h","炙手可热势绝伦|305|h","慎莫近前丞相嗔|305|h","朱雀桥边野草花|307|m","乌衣巷口夕阳斜|307|m","旧时王谢堂前燕|307|m","飞入寻常百姓家|307|m","向晚意不适|308|m","驱车登古原|308|m","夕阳无限好|308|m","只是近黄昏|308|m","老去悲秋强自宽|309|m","兴来今日尽君欢|309|m","羞将短发还吹帽|309|m","笑倩旁人为正冠|309|m","蓝水远从千涧落|309|m","玉山高并两峰寒|309|m","明年此会知谁健|309|m","醉把茱萸仔细看|309|m","独在异乡为异客|310|m","每逢佳节倍思亲|310|m","遥知兄弟登高处|310|m","遍插茱萸少一人|310|m","九月九日眺山川|311|m","归心归望积风烟|311|m","他乡共酌金花酒|311|m","万里同悲鸿雁天|311|m","七夕今宵看碧霄|312|m","牵牛织女渡河桥|312|m","家家乞巧望秋月|312|m","穿尽红丝几万条|312|m","绿遍山原白满川|313|m","子规声里雨如烟|313|m","乡村四月闲人少|313|m","才了蚕桑又插田|313|m","长镵长镵白木柄|314|h","我生托子以为命|314|h","黄精无苗山雪盛|314|h","短衣数挽不掩胫|314|h","此时与子空归来|314|h","男呻女吟四壁静|314|h","邻里为我色惆怅|314|h","二月二日江上行|315|m","东风日暖闻吹笙|315|m","花须柳眼各无赖|315|m","紫蝶黄蜂俱有情|315|m","万里忆归元亮井|315|m","三年从事亚夫营|315|m","新滩莫悟游人意|315|m","更作风檐夜雨声|315|m","此地别燕丹|316|m","壮士发冲冠|316|m","昔时人已没|316|m","今日水犹寒|316|m","东西那有碍|317|e","出处岂虚心|317|e","晓入洞庭阔|317|e","春归云梦深|317|e","烽火照西京|318|m","心中自不平|318|m","牙璋辞凤阙|318|m","铁骑绕龙城|318|m","雪暗凋旗画|318|m","风多杂鼓声|318|m","宁为百夫长|318|m","胜作一书生|318|m","青海长云暗雪山|319|m","孤城遥望玉门关|319|m","黄沙百战穿金甲|319|m","不破楼兰终不还|319|m","琵琶起舞换新声|320|m","总是关山旧别情|320|m","撩乱边愁听不尽|320|m","高高秋月照长城|320|m","大漠风尘日色昏|321|m","红旗半卷出辕门|321|m","前军夜战洮河北|321|m","已报生擒吐谷浑|321|m","九日驱驰一日闲|322|m","寻君不遇又空还|322|m","怪来诗思清人骨|322|m","门对寒流雪满山|322|m","二月卖新丝|323|m","五月粜新谷|323|m","医得眼前疮|323|m","剜却心头肉|323|m","我愿君王心|323|m","化作光明烛|323|m","不照绮罗筵|323|m","只照逃亡屋|323|m","单车欲问边|324|h","属国过居延|324|h","征蓬出汉塞|324|h","归雁入胡天|324|h","大漠孤烟直|324|h","长河落日圆|324|h","萧关逢候骑|324|h","都护在燕然|324|h","紫陌红尘拂面来|325|m","无人不道看花回|325|m","玄都观里桃千树|325|m","尽是刘郎去后栽|325|m","功盖三分国|326|m","名成八阵图|326|m","江流石不转|326|m","遗恨失吞吴|326|m","种花满西园|327|m","花发青楼道|327|m","花下一禾生|327|m","去之为恶草|327|m","凉月如眉挂柳湾|328|m","越中山色镜中看|328|m","兰溪三日桃花雨|328|m","半夜鲤鱼来上滩|328|m","明月出天山|329|h","苍茫云海间|329|h","长风几万里|329|h","吹度玉门关|329|h","汉下白登道|329|h","胡窥青海湾|329|h","由来征战地|329|h","不见有人还|329|h","思归多苦颜|329|h","高楼当此夜|329|h","叹息未应闲|329|h","行人弓箭各在腰|330|h","耶娘妻子走相送|330|h","尘埃不见咸阳桥|330|h","牵衣顿足拦道哭|330|h","哭声直上干云霄|330|h","道旁过者问行人|330|h","行人但云点行频|330|h","或从十五北防河|330|h","便至四十西营田|330|h","去时里正与裹头|330|h","归来头白还戍边|330|h","边庭流血成海水|330|h","武皇开边意未已|330|h","千村万落生荆杞|330|h","纵有健妇把锄犁|330|h","禾生陇亩无东西|330|h","况复秦兵耐苦战|330|h","被驱不异犬与鸡|330|h","长者虽有问|330|h","役夫敢申恨|330|h","且如今年冬|330|h","未休关西卒|330|h","县官急索租|330|h","租税从何出|330|h","信知生男恶|330|h","反是生女好|330|h","生女犹得嫁比邻|330|h","生男埋没随百草|330|h","古来白骨无人收|330|h","新鬼烦冤旧鬼哭|330|h","天阴雨湿声啾啾|330|h","百亩庭中半是苔|331|m","桃花净尽菜花开|331|m","种桃道士归何处|331|m","前度刘郎今又来|331|m","去岁曾经此县城|332|m","县民无口不冤声|332|m","今来县宰加朱绂|332|m","便是生灵血染成|332|m","骝马新跨白玉鞍|333|m","战罢沙场月色寒|333|m","城头铁鼓声犹震|333|m","匣里金刀血未干|333|m","夜半呼儿趁晓耕|334|m","羸牛无力渐艰行|334|m","时人不识农家苦|334|m","将谓田中谷自生|334|m","黄河远上白云间|335|m","一片孤城万仞山|335|m","羌笛何须怨杨柳|335|m","春风不度玉门关|335|m","葡萄美酒夜光杯|336|m","欲饮琵琶马上催|336|m","醉卧沙场君莫笑|336|m","古来征战几人回|336|m","客去波平槛|337|m","蝉休露满枝|337|m","永怀当此节|337|m","倚立自移时|337|m","北斗兼春远|337|m","南陵寓使迟|337|m","天涯占梦数|337|m","疑误有新知|337|m","秦时明月汉时关|338|m","万里长征人未还|338|m","但使龙城飞将在|338|m","不教胡马度阴山|338|m","居延城外猎天骄|339|m","白草连天野火烧|339|m","暮云空碛时驱马|339|m","秋日平原好射雕|339|m","护羌校尉朝乘障|339|m","破虏将军夜渡辽|339|m","玉靶角弓珠勒马|339|m","汉家将赐霍嫖姚|339|m","嫩箨香苞初出林|340|m","於陵论价重如金|340|m","皇都陆海应无数|340|m","忍剪凌云一寸心|340|m","澹然空水对斜晖|341|m","曲岛苍茫接翠微|341|m","波上马嘶看棹去|341|m","柳边人歇待船归|341|m","霜华净天末|342|e","雾色锁江干|342|e","风度蝉声远|342|e","云开雁路残|342|e","千里黄云白日曛|343|e","北风吹雁雪纷纷|343|e","莫愁前路无知己|343|e","天下谁人不识君|343|e","六翮飘飖私自怜|344|e","一离京洛十余年|344|e","丈夫贫贱应未足|344|e","今日相逢无酒钱|344|e","挽弓当挽强|345|m","用箭当用长|345|m","射人先射马|345|m","擒贼先擒王|345|m","杀人亦有限|345|m","列国自有疆|345|m","苟能制侵陵|345|m","岂在多杀伤|345|m","十年磨一剑|346|m","霜刃未曾试|346|m","今日把示君|346|m","谁有不平事|346|m","残阳西入崦|347|m","茅屋访孤僧|347|m","落叶人何在|347|m","寒云路几层|347|m","独敲初夜磬|347|m","闲倚一枝藤|347|m","世界微尘里|347|m","吾宁爱与憎|347|m","中庭地白树栖鸦|348|m","冷露无声湿桂花|348|m","今夜月明人尽望|348|m","不知秋思落谁家|348|m","伐薪烧炭南山中|349|h","满面尘灰烟火色|349|h","两鬓苍苍十指黑|349|h","卖炭得钱何所营|349|h","身上衣裳口中食|349|h","可怜身上衣正单|349|h","心忧炭贱愿天寒|349|h","夜来城外一尺雪|349|h","晓驾炭车辗冰辙|349|h","牛困人饥日已高|349|h","市南门外泥中歇|349|h","翩翩两骑来是谁|349|h","黄衣使者白衫儿|349|h","手把文书口称敕|349|h","回车叱牛牵向北|349|h","宫使驱将惜不得|349|h","半匹红绡一丈绫|349|h","系向牛头充炭直|349|h","南浦凄凄别|350|e","西风袅袅秋|350|e","一看肠一断|350|e","好去莫回头|350|e","澹澹长江水|351|e","悠悠远客情|351|e","落花相与恨|351|e","到地一无声|351|e","武陵溪口驻扁舟|352|m","溪水随君向北流|352|m","行到荆门上三峡|352|m","莫将孤月对猿愁|352|m","堂前扑枣任西邻|353|m","无食无儿一妇人|353|m","不为困穷宁有此|353|m","只缘恐惧转须亲|353|m","即防远客虽多事|353|m","便插疏篱却甚真|353|m","已诉征求贫到骨|353|m","正思戎马泪盈巾|353|m","白日登山望烽火|354|m","黄昏饮马傍交河|354|m","行人刁斗风沙暗|354|m","公主琵琶幽怨多|354|m","野云万里无城郭|354|m","雨雪纷纷连大漠|354|m","胡鴈哀鸣夜夜飞|354|m","胡儿眼泪双双落|354|m","闻道玉门犹被遮|354|m","应将性命逐轻车|354|m","年年战骨埋荒外|354|m","空见蒲桃入汉家|354|m","虽复沉埋无所用|355|m","犹能夜夜气冲天|355|m","男儿事长征|356|m","少小幽燕客|356|m","赌胜马蹄下|356|m","由来轻七尺|356|m","杀人莫敢前|356|m","须如猬毛磔|356|m","黄云陇底白雪飞|356|m","未得报恩不能归|356|m","辽东小妇年十五|356|m","惯弹琵琶解歌舞|356|m","今为羗笛出塞声|356|m","使我三军泪如雨|356|m","小时不识月|357|e","呼作白玉盘|357|e","又疑瑶台镜|357|e","飞在青云端|357|e","孔明庙前有老柏|358|h","柯如青铜根如石|358|h","霜皮溜雨四十围|358|h","黛色参天二千尺|358|h","君臣已与时际会|358|h","树木犹为人爱惜|358|h","云来气接巫峡长|358|h","月出寒通雪山白|358|h","忆昨路绕锦亭东|358|h","先主武侯同閟宫|358|h","崔嵬枝干郊原古|358|h","窈窕丹青户牖空|358|h","落落盘踞虽得地|358|h","冥冥孤高多烈风|358|h","扶持自是神明力|358|h","正直原因造化功|358|h","大厦如倾要梁栋|358|h","万牛回首丘山重|358|h","不露文章世已惊|358|h","未辞剪伐谁能送|358|h","苦心未免容蝼蚁|358|h","香叶终经宿鸾凤|358|h","志士幽人莫怨嗟|358|h","古来材大难为用|358|h","自恨寻芳到已迟|359|m","往年曾见未开时|359|m","如今风摆花狼藉|359|m","绿叶成阴子满枝|359|m","高卧南斋时|360|m","开帷月初吐|360|m","清辉淡水木|360|m","演漾在窗户|360|m","苒苒几盈虚|360|m","澄澄变今古|360|m","美人清江畔|360|m","是夜越吟苦|360|m","千里其如何|360|m","微风吹兰杜|360|m","有客有客字子美|361|h","白头乱发垂过耳|361|h","岁拾橡栗随狙公|361|h","天寒日暮山谷里|361|h","中原无书归不得|361|h","手脚冻皴皮肉死|361|h","悲风为我从天来|361|h","危冠广袖楚宫妆|362|m","独步闲庭逐夜凉|362|m","自把玉钗敲砌竹|362|m","清歌一曲月如霜|362|m","鸣筝金粟柱|363|e","素手玉房前|363|e","欲得周郎顾|363|e","时时误拂弦|363|e","蔡女昔造胡笳声|364|m","一弹一十有八拍|364|m","胡人落泪沾边草|364|m","汉使断肠对归客|364|m","蜀僧抱绿绮|365|m","西下峨眉峰|365|m","为我一挥手|365|m","如听万壑松|365|m","客心洗流水|365|m","余响入霜钟|365|m","不觉碧山暮|365|m","秋云暗几重|365|m","高秋夜分后|366|e","远客雁来时|366|e","明月余清影|366|e","秋风生桂枝|366|e","独有宦游人|367|m","偏惊物候新|367|m","云霞出海曙|367|m","梅柳渡江春|367|m","淑气催黄鸟|367|m","晴光转绿蘋|367|m","胡人吹笛戍楼间|368|m","楼上萧条海月闲|368|m","借问落梅凡几曲|368|m","从风一夜满关山|368|m","鸡鸣紫陌曙光寒|369|m","莺啭皇州春色阑|369|m","金阙晓钟开万户|369|m","玉阶仙仗拥千官|369|m","花迎剑佩星初落|369|m","柳拂旌旗露未干|369|m","独有凤凰池上客|369|m","阳春一曲和皆难|369|m","绛帻鸡人报晓筹|370|m","尚衣方进翠云裘|370|m","九天阊阖开宫殿|370|m","万国衣冠拜冕旒|370|m","日色才临仙掌动|370|m","香烟欲傍衮龙浮|370|m","朝罢须裁五色诏|370|m","佩声归到凤池头|370|m","尚有绨袍赠|371|m","应怜范叔寒|371|m","不知天下士|371|m","犹作布衣看|371|m","群山万壑赴荆门|372|m","生长明妃尚有村|372|m","一去紫台连朔漠|372|m","独留青冢向黄昏|372|m","画图省识春风面|372|m","环珮空归夜月魂|372|m","千载琵琶作胡语|372|m","分明怨恨曲中论|372|m","支离东北风尘际|373|m","漂泊西南天地间|373|m","三峡楼台淹日月|373|m","五溪衣服共云山|373|m","羯胡事主终无赖|373|m","词客哀时且未还|373|m","庾信平生最萧瑟|373|m","暮年诗赋动江关|373|m","摇落深知宋玉悲|374|m","风流儒雅亦吾师|374|m","怅望千秋一洒泪|374|m","萧条异代不同时|374|m","江山故宅空文藻|374|m","云雨荒台岂梦思|374|m","最是楚宫俱泯灭|374|m","舟人指点到今疑|374|m","诸葛大名垂宇宙|375|m","宗臣遗像肃清高|375|m","三分割据纡筹策|375|m","万古云霄一羽毛|375|m","伯仲之间见伊吕|375|m","指挥若定失萧曹|375|m","运移汉祚终难复|375|m","志决身歼军务劳|375|m","蜀主窥吴幸三峡|376|m","崩年亦在永安宫|376|m","翠华想像空山里|376|m","玉殿虚无野寺中|376|m","古庙杉松巢水鹤|376|m","岁时伏腊走村翁|376|m","武侯祠屋常邻近|376|m","一体君臣祭祀同|376|m","碧玉妆成一树高|377|e","万条垂下绿丝绦|377|e","不知细叶谁裁出|377|e","二月春风似剪刀|377|e","逐舞飘轻袖|378|e","传歌共绕梁|378|e","动枝生乱影|378|e","吹花送远香|378|e","曲项向天歌|379|e","白毛浮绿水|379|e","红掌拨清波|379|e","一上高城万里愁|380|h","蒹葭杨柳似汀洲|380|h","溪云初起日沉阁|380|h","山雨欲来风满楼|380|h","鸟下绿芜秦苑夕|380|h","蝉鸣黄叶汉宫秋|380|h","行人莫问当年事|380|h","故国东来渭水流|380|h","少陵野老吞声哭|381|h","春日潜行曲江曲|381|h","江头宫殿锁千门|381|h","细柳新蒲为谁绿|381|h","忆昔霓旌下南苑|381|h","苑中万物生颜色|381|h","昭阳殿里第一人|381|h","同辇随君侍君侧|381|h","辇前才人带弓箭|381|h","白马嚼啮黄金勒|381|h","翻身向天仰射云|381|h","一笑正坠双飞翼|381|h","明眸皓齿今何在|381|h","血污游魂归不得|381|h","清渭东流剑阁深|381|h","去住彼此无消息|381|h","人生有情泪沾臆|381|h","江水江花岂终极|381|h","黄昏胡骑尘满城|381|h","欲往城南望城北|381|h","长安城头头白乌|382|h","夜飞延秋门上呼|382|h","又向人家啄大屋|382|h","屋底达官走避胡|382|h","金鞭断折九马死|382|h","骨肉不待同驰驱|382|h","腰下宝玦青珊瑚|382|h","可怜王孙泣路隅|382|h","问之不肯道姓名|382|h","但道困苦乞奴卢|382|h","已经百日窜荆棘|382|h","身上无有完肌肤|382|h","高帝子孙尽隆准|382|h","龙种自与常人殊|382|h","豺狼在邑龙在野|382|h","王孙善保千金躯|382|h","不敢长语临交衢|382|h","且为王孙立斯须|382|h","昨夜东风吹血腥|382|h","东来橐驼满旧都|382|h","朔方健儿好身手|382|h","昔何勇锐今何愚|382|h","窃闻天子已传位|382|h","圣德北服南单于|382|h","花门剺面请雪耻|382|h","慎勿出口他人狙|382|h","哀哉王孙慎勿疏|382|h","五陵佳气无时无|382|h","北斗七星高|383|m","哥舒夜带刀|383|m","至今窥牧马|383|m","不敢过临洮|383|m","晨起动征铎|384|m","客行悲故乡|384|m","鸡声茅店月|384|m","人迹板桥霜|384|m","槲叶落山路|384|m","枳花明驿墙|384|m","因思杜陵梦|384|m","凫雁满回塘|384|m","少小离家老大回|385|m","乡音无改鬓毛衰|385|m","儿童相见不相识|385|m","笑问客从何处来|385|m","离别家乡岁月多|386|m","近来人事半消磨|386|m","惟有门前镜湖水|386|m","春风不改旧时波|386|m","西陆蝉声唱|387|m","南冠客思深|387|m","不堪玄鬓影|387|m","来对白头吟|387|m","露重飞难进|387|m","风多响易沉|387|m","无人信高洁|387|m","谁为表予心|387|m","四郊未宁静|388|h","垂老不得安|388|h","子孙阵亡尽|388|h","焉用身独完|388|h","投杖出门去|388|h","同行为辛酸|388|h","幸有牙齿存|388|h","所悲骨髓干|388|h","男儿既介胄|388|h","长揖别上官|388|h","老妻卧路啼|388|h","岁暮衣裳单|388|h","孰知是死别|388|h","且复伤其寒|388|h","此去必不归|388|h","还闻劝加餐|388|h","土门壁甚坚|388|h","杏园度亦难|388|h","势异邺城下|388|h","纵死时犹宽|388|h","人生有离合|388|h","岂择衰老端|388|h","忆昔少壮日|388|h","迟回竟长叹|388|h","万国尽征戍|388|h","烽火被冈峦|388|h","积尸草木腥|388|h","流血川原丹|388|h","何乡为乐土|388|h","安敢尚盘桓|388|h","弃绝蓬室居|388|h","塌然摧肺肝|388|h","诗家清景在新春|389|m","绿柳才黄半未匀|389|m","若待上林花似锦|389|m","出门俱是看花人|389|m","酒旗相望大堤头|390|m","堤下连樯堤上楼|390|m","日暮行人争渡急|390|m","桨声幽轧满中流|390|m","汉家旌帜满阴山|391|m","不遣胡儿匹马还|391|m","愿得此身长报国|391|m","何须生入玉门关|391|m","蝉鸣空桑林|392|m","八月萧关道|392|m","出塞入塞寒|392|m","处处黄芦草|392|m","从来幽并客|392|m","皆共尘沙老|392|m","莫学游侠儿|392|m","矜夸紫骝好|392|m","月黑雁飞高|393|m","单于夜遁逃|393|m","欲将轻骑逐|393|m","大雪满弓刀|393|m","林暗草惊风|394|m","将军夜引弓|394|m","平明寻白羽|394|m","没在石棱中|394|m","玉帛朝回望帝乡|395|m","乌孙归去不称王|395|m","天涯静处无征战|395|m","兵气销为日月光|395|m","鹫翎金仆姑|396|m","燕尾绣蝥弧|396|m","独立扬新令|396|m","千营共一呼|396|m","回乐烽前沙似雪|397|h","受降城外月如霜|397|h","不知何处吹芦管|397|h","一夜征人尽望乡|397|h","危楼高百尺|398|e","手可摘星辰|398|e","不敢高声语|398|e","恐惊天上人|398|e","山寺钟鸣昼已昏|399|m","渔梁渡头争渡喧|399|m","人随沙岸向江村|399|m","余亦乘舟归鹿门|399|m","鹿门月照开烟树|399|m","忽到庞公栖隐处|399|m","岩扉松径长寂寥|399|m","惟有幽人自来去|399|m","君问归期未有期|400|m","巴山夜雨涨秋池|400|m","何当共剪西窗烛|400|m","却话巴山夜雨时|400|m","已讶衾枕冷|401|e","复见窗户明|401|e","夜深知雪重|401|e","时闻折竹声|401|e","人间四月芳菲尽|402|m","山寺桃花始盛开|402|m","长恨春归无觅处|402|m","不知转入此中来|402|m","凉风起天末|403|m","君子意如何|403|m","鸿雁几时到|403|m","江湖秋水多|403|m","文章憎命达|403|m","魑魅喜人过|403|m","应共冤魂语|403|m","投诗赠汨罗|403|m","春日在天涯|404|m","天涯日又斜|404|m","莺啼如有泪|404|m","为湿最高花|404|m","渭水自萦秦塞曲|405|m","黄山旧绕汉宫斜|405|m","銮舆迥出千门柳|405|m","阁道回看上苑花|405|m","云里帝城双凤阙|405|m","雨中春树万人家|405|m","为乘阳气行时令|405|m","不是宸游玩物华|405|m","东望望春春可怜|406|e","更逢晴日柳含烟|406|e","宫中下见南山尽|406|e","城上平临北斗悬|406|e","细草徧承回辇处|406|e","轻花微落奉觞前|406|e","宸游对此欢无极|406|e","鸟哢声声入管弦|406|e","纨袴不饿死|407|h","儒冠多误身|407|h","丈人试静听|407|h","贱子请具陈|407|h","甫昔少年日|407|h","早充观国宾|407|h","读书破万卷|407|h","下笔如有神|407|h","赋料扬雄敌|407|h","诗看子建亲|407|h","李邕求识面|407|h","王翰愿为邻|407|h","自谓颇挺出|407|h","立登要路津|407|h","致君尧舜上|407|h","再使风俗淳|407|h","此意竟萧条|407|h","行歌非隐沦|407|h","骑驴三十载|407|h","旅食京华春|407|h","朝扣富儿门|407|h","暮随肥马尘|407|h","残杯与冷炙|407|h","到处潜悲辛|407|h","乳燕入巢笋成竹|408|m","谁家二女种新谷|408|m","无人无牛不及犁|408|m","持刀斫地翻作泥|408|m","自言家贫母年老|408|m","长兄从军未娶嫂|408|m","去年灾疫牛囤空|408|m","截绢买刀都市中|408|m","头巾掩面畏人识|408|m","以刀代牛谁与同|408|m","姊妹相携心正苦|408|m","不见路人唯见土|408|m","疏通畦陇防乱苗|408|m","整顿沟塍待时雨|408|m","日正南冈下饷归|408|m","可怜朝雉扰惊飞|408|m","东邻西舍花发尽|408|m","共惜余芳泪满衣|408|m","云母屏风烛影深|409|m","长河渐落晓星沉|409|m","嫦娥应悔偷灵药|409|m","碧海青天夜夜心|409|m","明朝驿使发|410|m","一夜絮征袍|410|m","素手抽针冷|410|m","那堪把剪刀|410|m","裁缝寄远道|410|m","几日到临洮|410|m","镜湖三百里|411|m","菡萏发荷花|411|m","五月西施采|411|m","人看隘若耶|411|m","回舟不待月|411|m","归去越王家|411|m","秦地罗敷女|412|m","采桑绿水边|412|m","素手青条上|412|m","红妆白日鲜|412|m","蚕饥妾欲去|412|m","五马莫留连|412|m","长安一片月|413|m","万户捣衣声|413|m","秋风吹不尽|413|m","总是玉关情|413|m","何日平胡虏|413|m","良人罢远征|413|m","孤雁不饮啄|414|m","飞鸣声念群|414|m","谁怜一片影|414|m","相失万重云|414|m","望尽似犹见|414|m","哀多如更闻|414|m","野鸦无意绪|414|m","鸣噪自纷纷|414|m","迢递高城百尺楼|415|h","绿杨枝外尽汀洲|415|h","贾生年少虚垂涕|415|h","王粲春来更远游|415|h","兰陵美酒郁金香|416|m","玉碗盛来琥珀光|416|m","但使主人能醉客|416|m","不知何处是他乡|416|m","舍南舍北皆春水|417|h","但见群鸥日日来|417|h","花径不曾缘客扫|417|h","蓬门今始为君开|417|h","盘飧市远无兼味|417|h","樽酒家贫只旧醅|417|h","肯与邻翁相对饮|417|h","隔篱呼取尽余杯|417|h","昨日之日不可留|418|h","今日之日多烦忧|418|h","长风万里送秋雁|418|h","对此可以酣高楼|418|h","蓬莱文章建安骨|418|h","中间小谢又清发|418|h","俱怀逸兴壮思飞|418|h","欲上青天揽明月|418|h","抽刀断水水更流|418|h","举杯消愁愁更愁|418|h","人生在世不称意|418|h","明朝散发弄扁舟|418|h","故国三千里|419|m","深宫二十年|419|m","一声何满子|419|m","双泪落君前|419|m","清秋幕府井梧寒|420|m","独宿江城蜡炬残|420|m","永夜角声悲自语|420|m","中天月色好谁看|420|m","风尘荏苒音书绝|420|m","关塞萧条行路难|420|m","已忍伶俜十年事|420|m","强移栖息一枝安|420|m","移舟泊烟渚|421|m","日暮客愁新|421|m","野旷天低树|421|m","江清月近人|421|m","山暝听猿愁|422|m","沧江急夜流|422|m","风鸣两岸叶|422|m","月照一孤舟|422|m","建德非吾土|422|m","维扬忆旧游|422|m","还将两行泪|422|m","遥寄海西头|422|m","清溪深不测|423|m","隐处唯孤云|423|m","松际露微月|423|m","清光犹为君|423|m","茅亭宿花影|423|m","药院滋苔纹|423|m","余亦谢时去|423|m","西山鸾鹤群|423|m","竹坞无尘水槛清|424|m","相思迢递隔重城|424|m","秋阴不散霜飞晚|424|m","留得枯荷听雨声|424|m","联步趋丹陛|425|m","分曹限紫微|425|m","晓随天仗入|425|m","暮惹御香归|425|m","白发悲花落|425|m","青云羡鸟飞|425|m","圣朝无阙事|425|m","自觉谏书稀|425|m","青山隐隐水迢迢|426|m","秋尽江南草未凋|426|m","二十四桥明月夜|426|m","玉人何处教吹箫|426|m","去年花里逢君别|427|m","今日花开又一年|427|m","世事茫茫难自料|427|m","春愁黯黯独成眠|427|m","寒月沉沉洞房静|428|m","真珠帘外梧桐影|428|m","秋霜欲下手先知|428|m","灯底裁缝剪刀冷|428|m","春城无处不飞花|429|m","寒食东风御柳斜|429|m","日暮汉宫传蜡烛|429|m","轻烟散入五侯家|429|m","清溪一道穿桃李|430|m","演漾绿蒲涵白芷|430|m","溪上人家凡几家|430|m","落花半落东流水|430|m","蹴踘屡过飞鸟上|430|m","秋千竞出垂杨里|430|m","少年欢乐日已老|430|m","谁能今朝更如此|430|m","一路经行处|431|m","莓苔见履痕|431|m","白云依静渚|431|m","春草闭闲门|431|m","过雨看松色|431|m","随山到水源|431|m","溪花与禅意|431|m","相对亦忘言|431|m","松下问童子|432|e","言师采药去|432|e","只在此山中|432|e","云深不知处|432|e","我本渔樵孟诸野|433|m","一生自是悠悠者|433|m","乍可狂歌草泽中|433|m","宁堪作吏风尘下|433|m","秪言小邑无所为|433|m","公门百事皆有期|433|m","拜迎官长心欲碎|433|m","鞭挞黎庶令人悲|433|m","归来向家问妻子|433|m","举家尽笑今如此|433|m","生事应须南亩田|433|m","世情付与东流水|433|m","梦想旧山安在哉|433|m","为衔君命且迟廻|433|m","乃知梅福徒为尔|433|m","转忆陶潜归去来|433|m","清时有味是无能|434|m","闲爱孤云静爱僧|434|m","欲把一麾江海去|434|m","乐游原上望昭陵|434|m","奔流到海不复回|435|h","朝如青丝暮成雪|435|h","人生得意须尽欢|435|h","莫使金樽空对月|435|h","天生我材必有用|435|h","千金散尽还复来|435|h","烹羊宰牛且为乐|435|h","会须一饮三百杯|435|h","与君歌一曲|435|h","请君为我倾耳听|435|h","钟鼓馔玉不足贵|435|h","但愿长醉不复醒|435|h","古来圣贤皆寂寞|435|h","惟有饮者留其名|435|h","陈王昔时宴平乐|435|h","斗酒十千恣欢谑|435|h","主人何为言少钱|435|h","径须沽取对君酌|435|h","呼儿将出换美酒|435|h","与尔同销万古愁|435|h","佳辰强饮食犹寒|436|m","隐几萧条戴鹖冠|436|m","春水船如天上坐|436|m","老年花似雾中看|436|m","娟娟戏蝶过闲幔|436|m","片片轻鸥下急湍|436|m","云白山青万余里|436|m","愁看直北是长安|436|m","自小刺头深草里|437|m","而今渐觉出蓬蒿|437|m","时人不识凌云木|437|m","直待凌云始道高|437|m","花雪随风不厌看|438|m","更多还肯失林峦|438|m","愁人正在书窗下|438|m","一片飞来一片寒|438|m","长江悲已滞|439|e","万里念将归|439|e","况属高风晚|439|e","山山黄叶飞|439|e","夫因兵死守蓬茅|440|m","麻苎衣衫鬓发焦|440|m","桑柘废来犹纳税|440|m","田园荒后尚征苗|440|m","时挑野菜和根煮|440|m","旋斫生柴带叶烧|440|m","任是深山更深处|440|m","也应无计避征徭|440|m","问余何意栖碧山|441|m","笑而不答心自闲|441|m","桃花流水窅然去|441|m","别有天地非人间|441|m","寂寞掩柴扉|442|m","苍茫对落晖|442|m","鹤巢松树遍|442|m","人访荜门稀|442|m","绿竹含新粉|442|m","红莲落故衣|442|m","渡头烟火起|442|m","处处采菱归|442|m","空山新雨后|443|m","天气晚来秋|443|m","明月松间照|443|m","清泉石上流|443|m","竹喧归浣女|443|m","莲动下渔舟|443|m","随意春芳歇|443|m","王孙自可留|443|m","梁园日暮乱飞鸦|444|m","极目萧条三两家|444|m","庭树不知人去尽|444|m","春来还发旧时花|444|m","远上寒山石径斜|445|m","白云生处有人家|445|m","停车坐爱枫林晚|445|m","霜叶红于二月花|445|m","弥年不得意|446|m","新岁又如何|446|m","念昔同游者|446|m","而今有几多|446|m","以闲为自在|446|m","将寿补蹉跎|446|m","春色无情故|446|m","幽居亦见过|446|m","北阙休上书|447|m","南山归敝庐|447|m","不才明主弃|447|m","多病故人疏|447|m","白发催年老|447|m","青阳逼岁除|447|m","永怀愁不寐|447|m","松月夜窗虚|447|m","十年曾一别|448|m","征路此相逢|448|m","马首向何处|448|m","夕阳千万峰|448|m","一封朝奏九重天|449|h","夕贬潮州路八千|449|h","欲为圣明除弊事|449|h","肯将衰朽惜残年|449|h","云横秦岭家何在|449|h","雪拥蓝关马不前|449|h","知汝远来应有意|449|h","好收吾骨瘴江边|449|h","碧阑干外绣帘垂|450|m","猩色屏风画折枝|450|m","八尺龙须方锦褥|450|m","已凉天气未寒时|450|m","贵贱虽异等|451|e","出门皆有营|451|e","独无外物牵|451|e","遂此幽居情|451|e","微雨夜来过|451|e","不知春草生|451|e","青山忽已曙|451|e","鸟雀绕舍鸣|451|e","时与道人偶|451|e","或随樵者行|451|e","自当安蹇劣|451|e","谁谓薄世荣|451|e","西登香炉峰|452|m","南见瀑布水|452|m","挂流三百丈|452|m","喷壑数十里|452|m","欻如飞电来|452|m","隐若白虹起|452|m","初惊河汉落|452|m","半洒云天里|452|m","仰观势转雄|452|m","壮哉造化功|452|m","海风吹不断|452|m","江月照还空|452|m","我本楚狂人|453|h","凤歌笑孔丘|453|h","手持绿玉杖|453|h","朝别黄鹤楼|453|h","五岳寻仙不辞远|453|h","一生好入名山游|453|h","庐山秀出南斗傍|453|h","屏风九叠云锦张|453|h","影落明湖青黛光|453|h","金阙前开二峰长|453|h","银河倒挂三石梁|453|h","香炉瀑布遥相望|453|h","回崖沓嶂凌苍苍|453|h","翠影红霞映朝日|453|h","鸟飞不到吴天长|453|h","登高壮观天地间|453|h","大江茫茫去不还|453|h","黄云万里动风色|453|h","白波九道流雪山|453|h","好为庐山谣|453|h","兴因庐山发|453|h","闲窥石镜清我心|453|h","谢公行处苍苔没|453|h","早服还丹无世情|453|h","琴心三叠道初成|453|h","遥见仙人彩云里|453|h","手把芙蓉朝玉京|453|h","先期汗漫九垓上|453|h","愿接卢敖游太清|453|h","遥遥去巫峡|454|e","望望下章台|454|e","巴国山川尽|454|e","荆门烟雾开|454|e","城分苍野外|454|e","树断白云隈|454|e","今日狂歌客|454|e","谁知入楚来|454|e","泠泠七弦上|455|m","静听松风寒|455|m","古调虽自爱|455|m","今人多不弹|455|m","清川带长薄|456|m","车马去闲闲|456|m","流水如有意|456|m","暮禽相与还|456|m","荒城临古渡|456|m","落日满秋山|456|m","迢递嵩高下|456|m","归来且闭关|456|m","海燕虽微眇|457|m","乘春亦暂来|457|m","岂知泥滓贱|457|m","只见玉堂开|457|m","东来万里客|458|m","乱定几年归|458|m","肠断江城雁|458|m","高高正北飞|458|m","漠漠秋云起|459|e","稍稍夜寒生|459|e","但觉衣裳湿|459|e","无点亦无声|459|e","定定住天涯|460|m","依依向物华|460|m","寒梅最堪恨|460|m","常作去年花|460|m","风景旧曾谙|461|m","日出江花红胜火|461|m","春来江水绿如蓝|461|m","能不忆江南|461|m","最忆是杭州|462|e","山寺月中寻桂子|462|e","郡亭枕上看潮头|462|e","何日更重游|462|e","美人卷珠帘|463|m","深坐蹙蛾眉|463|m","但见泪痕湿|463|m","不知心恨谁|463|m","锄禾日当午|464|e","汗滴禾下土|464|e","谁知盘中餐|464|e","粒粒皆辛苦|464|e","春种一粒粟|465|e","秋收万颗子|465|e","四海无闲田|465|e","农夫犹饿死|465|e","兰叶春葳蕤|466|m","桂华秋皎洁|466|m","欣欣此生意|466|m","自尔为佳节|466|m","谁知林栖者|466|m","闻风坐相悦|466|m","草木有本心|466|m","何求美人折|466|m","兰若生春夏|467|m","芊蔚何青青|467|m","幽独空林色|467|m","朱蕤冒紫茎|467|m","迟迟白日晚|467|m","袅袅秋风生|467|m","岁华尽摇落|467|m","芳意竟何成|467|m","庾信文章老更成|468|m","凌云健笔意纵横|468|m","今人嗤点流传赋|468|m","不觉前贤畏后生|468|m","王杨卢骆当时体|469|m","轻薄为文哂未休|469|m","尔曹身与名俱灭|469|m","不废江河万古流|469|m","胡马大宛名|470|m","锋棱瘦骨成|470|m","竹批双耳峻|470|m","风入四蹄轻|470|m","所向无空阔|470|m","真堪托死生|470|m","骁腾有如此|470|m","万里可横行|470|m","青天有月来几时|471|h","我今停杯一问之|471|h","人攀明月不可得|471|h","月行却与人相随|471|h","皎如飞镜临丹阙|471|h","绿烟灭尽清辉发|471|h","但见宵从海上来|471|h","宁知晓向云间没|471|h","白兔捣药秋复春|471|h","嫦娥孤栖与谁邻|471|h","今人不见古时月|471|h","今月曾经照古人|471|h","古人今人若流水|471|h","共看明月皆如此|471|h","唯愿当歌对酒时|471|h","月光长照金樽里|471|h","今代麒麟阁|472|h","何人第一功|472|h","君王自神武|472|h","驾驭必英雄|472|h","开府当朝杰|472|h","论兵迈古风|472|h","先锋百战在|472|h","略地两隅空|472|h","青海无传箭|472|h","天山早挂弓|472|h","廉颇仍走敌|472|h","魏绛已和戎|472|h","每惜河湟弃|472|h","新兼节制通|472|h","智谋垂睿想|472|h","出入冠诸公|472|h","日月低秦树|472|h","乾坤绕汉宫|472|h","胡人愁逐北|472|h","宛马又从东|472|h","受命边沙远|472|h","归来御席同|472|h","轩墀曾宠鹤|472|h","畋猎旧非熊|472|h","茅土加名数|472|h","山河誓始终|472|h","策行遗战伐|472|h","契合动昭融|472|h","勋业青冥上|472|h","交亲气概中|472|h","未为珠履客|472|h","已见白头翁|472|h","壮节初题柱|472|h","生涯独转蓬|472|h","几年春草歇|472|h","今日暮途穷|472|h","军事留孙楚|472|h","行间识吕蒙|472|h","防身一长剑|472|h","将欲倚崆峒|472|h","开帘见新月|473|m","便即下阶拜|473|m","细语人不闻|473|m","北风吹裙带|473|m","芙蓉阙下会千官|474|m","紫禁朱樱出上兰|474|m","才是寝园春荐后|474|m","非关御苑鸟衔残|474|m","归鞍竞带青丝笼|474|m","中使频倾赤玉盘|474|m","饱食不须愁内热|474|m","大官还有蔗浆寒|474|m","兔丝附蓬麻|475|h","引蔓故不长|475|h","嫁女与征夫|475|h","不如弃路旁|475|h","结发为君妻|475|h","席不暖君床|475|h","暮婚晨告别|475|h","无乃太匆忙|475|h","君行虽不远|475|h","守边赴河阳|475|h","妾身未分明|475|h","何以拜姑嫜|475|h","父母养我时|475|h","日夜令我藏|475|h","生女有所归|475|h","鸡狗亦得将|475|h","君今往死地|475|h","沉痛迫中肠|475|h","誓欲随君去|475|h","形势反苍黄|475|h","勿为新婚念|475|h","努力事戎行|475|h","妇人在军中|475|h","兵气恐不扬|475|h","自嗟贫家女|475|h","久致罗襦裳|475|h","罗襦不复施|475|h","对君洗红妆|475|h","仰视百鸟飞|475|h","大小必双翔|475|h","人事多错迕|475|h","与君永相望|475|h","三日入厨下|476|e","洗手作羹汤|476|e","未谙姑食性|476|e","先遣小姑尝|476|e","客行新安道|477|h","喧呼闻点兵|477|h","借问新安吏|477|h","县小更无丁|477|h","府帖昨夜下|477|h","次选中男行|477|h","中男绝短小|477|h","何以守王城|477|h","肥男有母送|477|h","瘦男独伶俜|477|h","白水暮东流|477|h","青山犹哭声|477|h","莫自使眼枯|477|h","收汝泪纵横|477|h","眼枯即见骨|477|h","天地终无情|477|h","我军取相州|477|h","日夕望其平|477|h","岂意贼难料|477|h","归军星散营|477|h","就粮近故垒|477|h","练卒依旧京|477|h","掘壕不到水|477|h","牧马役亦轻|477|h","况乃王师顺|477|h","抚养甚分明|477|h","送行勿泣血|477|h","仆射如父兄|477|h","乡心新岁切|478|m","天畔独潸然|478|m","老至居人下|478|m","春归在客先|478|m","岭猿同旦暮|478|m","江柳共风烟|478|m","新晴原野旷|479|m","极目无氛垢|479|m","郭门临渡头|479|m","村树连溪口|479|m","白水明田外|479|m","碧峰出山后|479|m","农月无闲人|479|m","倾家事南亩|479|m","细草微风岸|480|m","危樯独夜舟|480|m","星垂平野阔|480|m","月涌大江流|480|m","名岂文章著|480|m","官应老病休|480|m","飘飘何所似|480|m","天地一沙鸥|480|m","寂寞天宝后|481|h","园庐但蒿藜|481|h","我里百余家|481|h","世乱各东西|481|h","存者无消息|481|h","死者为尘泥|481|h","贱子因阵败|481|h","归来寻旧蹊|481|h","久行见空巷|481|h","日瘦气惨凄|481|h","但对狐与狸|481|h","竖毛怒我啼|481|h","四邻何所有|481|h","一二老寡妻|481|h","宿鸟恋本枝|481|h","安辞且穷栖|481|h","方春独荷锄|481|h","日暮还灌畦|481|h","县吏知我至|481|h","召令习鼓鞞|481|h","虽从本州役|481|h","内顾无所携|481|h","近行止一身|481|h","远去终转迷|481|h","家乡既荡尽|481|h","远近理亦齐|481|h","永痛长病母|481|h","五年委沟溪|481|h","生我不得力|481|h","终身两酸嘶|481|h","人生无家别|481|h","何以为蒸黎|481|h","相见时难别亦难|482|h","东风无力百花残|482|h","春蚕到死丝方尽|482|h","蜡炬成灰泪始干|482|h","晓镜但愁云鬓改|482|h","夜吟应觉月光寒|482|h","蓬山此去无多路|482|h","青鸟殷勤为探看|482|h","昨夜星辰昨夜风|483|h","画楼西畔桂堂东|483|h","身无彩凤双飞翼|483|h","心有灵犀一点通|483|h","隔座送钩春酒暖|483|h","分曹射覆蜡灯红|483|h","嗟余听鼓应官去|483|h","走马兰台类转蓬|483|h","朝辞白帝彩云间|484|m","千里江陵一日还|484|m","两岸猿声啼不住|484|m","轻舟已过万重山|484|m","木落雁南度|485|m","北风江上寒|485|m","我家襄水曲|485|m","遥隔楚云端|485|m","乡泪客中尽|485|m","孤帆天际看|485|m","迷津欲有问|485|m","平海夕漫漫|485|m","天街小雨润如酥|486|m","草色遥看近却无|486|m","最是一年春好处|486|m","绝胜烟柳满皇都|486|m","一树寒梅白玉条|487|m","迥临村路傍溪桥|487|m","不知近水花先发|487|m","疑是经冬雪未销|487|m","屋上春鸠鸣|488|m","村边杏花白|488|m","持斧伐远扬|488|m","荷锄觇泉脉|488|m","归燕识故巢|488|m","旧人看新历|488|m","临觞忽不御|488|m","惆怅远行客|488|m","杨柳阴阴细雨晴|489|m","残花落尽见流莺|489|m","春风一夜吹香梦|489|m","梦逐春风到洛城|489|m","银烛吐青烟|490|e","金樽对绮筵|490|e","离堂思琴瑟|490|e","别路绕山川|490|e","好雨知时节|491|e","当春乃发生|491|e","随风潜入夜|491|e","润物细无声|491|e","野径云俱黑|491|e","江船火独明|491|e","晓看红湿处|491|e","花重锦官城|491|e","早被婵娟误|492|m","欲妆临镜慵|492|m","承恩不在貌|492|m","教妾若为容|492|m","风暖鸟声碎|492|m","日高花影重|492|m","年年越溪女|492|m","相忆采芙蓉|492|m","燕草如碧丝|493|m","秦桑低绿枝|493|m","当君怀归日|493|m","是妾断肠时|493|m","春风不相识|493|m","何事入罗帏|493|m","纱窗日落渐黄昏|494|m","金屋无人见泪痕|494|m","寂寞空庭春欲晚|494|m","梨花满地不开门|494|m","打起黄莺儿|495|m","莫教枝上啼|495|m","啼时惊妾梦|495|m","不得到辽西|495|m","春眠不觉晓|496|e","处处闻啼鸟|496|e","夜来风雨声|496|e","花落知多少|496|e","国破山河在|497|h","城春草木深|497|h","感时花溅泪|497|h","恨别鸟惊心|497|h","烽火连三月|497|h","家书抵万金|497|h","白头搔更短|497|h","浑欲不胜簪|497|h","洞房昨夜春风起|498|m","故人尚隔湘江水|498|m","枕上片时春梦中|498|m","行尽江南数千里|498|m","春江潮水连海平|499|h","海上明月共潮生|499|h","滟滟随波千万里|499|h","何处春江无月明|499|h","江流宛转绕芳甸|499|h","月照花林皆似霰|499|h","空里流霜不觉飞|499|h","汀上白沙看不见|499|h","江天一色无纤尘|499|h","皎皎空中孤月轮|499|h","江畔何人初见月|499|h","江月何年初照人|499|h","人生代代无穷已|499|h","江月年年望相似|499|h","不知江月待何人|499|h","但见长江送流水|499|h","白云一片去悠悠|499|h","青枫浦上不胜愁|499|h","谁家今夜扁舟子|499|h","何处相思明月楼|499|h","可怜楼上月徘徊|499|h","应照离人妆镜台|499|h","玉户帘中卷不去|499|h","捣衣砧上拂还来|499|h","此时相望不相闻|499|h","愿逐月华流照君|499|h","鸿雁长飞光不度|499|h","鱼龙潜跃水成文|499|h","昨夜闲潭梦落花|499|h","可怜春半不还家|499|h","江水流春去欲尽|499|h","江潭落月复西斜|499|h","斜月沉沉藏海雾|499|h","碣石潇湘无限路|499|h","不知乘月几人归|499|h","落月摇情满江树|499|h","幽意无断绝|500|m","此去随所偶|500|m","晚风吹行舟|500|m","花路入溪口|500|m","际夜转西壑|500|m","隔山望南斗|500|m","潭烟飞溶溶|500|m","林月低向后|500|m","生事且弥漫|500|m","愿为持竿叟|500|m","宜阳城下草萋萋|501|m","涧水东流复向西|501|m","芳树无人花自落|501|m","春山一路鸟空啼|501|m","寒食月明雨|502|m","落花香满泥|502|m","佳人持锦字|502|m","无雁寄辽西|502|m","怅卧新春白袷衣|503|m","白门寥落意多违|503|m","红楼隔雨相望冷|503|m","珠箔飘灯独自归|503|m","春雪满空来|504|e","触处似花开|504|e","不知园里树|504|e","若个是真梅|504|e","新年都未有芳华|505|m","二月初惊见草芽|505|m","白雪却嫌春色晚|505|m","故穿庭树作飞花|505|m","草树知春不久归|506|h","百般红紫斗芳菲|506|h","杨花榆荚无才思|506|h","惟解漫天作雪飞|506|h","深居俯夹城|507|m","春去夏犹清|507|m","天意怜幽草|507|m","人间重晚晴|507|m","并添高阁迥|507|m","微注小窗明|507|m","越鸟巢干后|507|m","归飞体更轻|507|m","故乡杳无际|508|e","日暮且孤征|508|e","川原迷旧国|508|e","道路入边城|508|e","野戍荒烟断|508|e","深山古木平|508|e","如何此时恨|508|e","噭噭夜猿鸣|508|e","一道残阳铺水中|509|m","半江瑟瑟半江红|509|m","可怜九月初三夜|509|m","露似真珠月似弓|509|m","数里闻寒水|510|e","山家少四邻|510|e","怪禽啼旷野|510|e","落日恐行人|510|e","初月未终夕|510|e","边烽不过秦|510|e","萧条桑柘外|510|e","烟火渐相亲|510|e","浮香绕曲岸|511|e","圆影覆华池|511|e","常恐秋风早|511|e","飘零君不知|511|e","花间一壶酒|512|m","独酌无相亲|512|m","举杯邀明月|512|m","对影成三人|512|m","月上随人意|513|e","江边一院清|513|e","明河净无声|513|e","更深月色半人家|514|e","北斗阑干南斗斜|514|e","今夜偏知春气暖|514|e","虫声新透绿窗纱|514|e","今夜鄜州月|515|e","闺中只独看|515|e","遥怜小儿女|515|e","未解忆长安|515|e","香雾云鬟湿|515|e","清辉玉臂寒|515|e","何时倚虚幌|515|e","双照泪痕干|515|e","戍鼓断人行|516|h","边秋一雁声|516|h","露从今夜白|516|h","月是故乡明|516|h","有弟皆分散|516|h","无家问死生|516|h","寄书长不达|516|h","况乃未休兵|516|h","贱妾留南楚|517|m","征夫向北燕|517|m","三秋方一日|517|m","少别比千年|517|m","不掩嚬红楼|517|m","无论数绿钱|517|m","相思明月夜|517|m","迢递白云天|517|m","天门中断楚江开|518|m","碧水东流至此回|518|m","两岸青山相对出|518|m","孤帆一片日边来|518|m","岱宗夫如何|519|h","齐鲁青未了|519|h","造化钟神秀|519|h","阴阳割昏晓|519|h","荡胸生曾云|519|h","决眦入归鸟|519|h","会当凌绝顶|519|h","一览众山小|519|h","庐山东南五老峰|520|m","青天削出金芙蓉|520|m","九江秀色可揽结|520|m","吾将此地巢云松|520|m","日照香炉生紫烟|521|e","遥看瀑布挂前川|521|e","飞流直下三千尺|521|e","疑是银河落九天|521|e","海上生明月|522|m","天涯共此时|522|m","情人怨遥夜|522|m","竟夕起相思|522|m","灭烛怜光满|522|m","披衣觉露滋|522|m","不堪盈手赠|522|m","还寝梦佳期|522|m","时难年荒世业空|523|m","弟兄羁旅各西东|523|m","田园寥落干戈后|523|m","骨肉流离道路中|523|m","吊影分为千里雁|523|m","辞根散作秋蓬飞|523|m","共看明月应垂泪|523|m","一夜乡心五处同|523|m","湖光秋月两相和|524|m","潭面无风镜未磨|524|m","遥望洞庭山水翠|524|m","白银盘里一青螺|524|m","八月湖水平|525|m","涵虚混太清|525|m","气蒸云梦泽|525|m","波撼岳阳城|525|m","欲济无舟楫|525|m","端居耻圣明|525|m","坐观垂钓者|525|m","徒有羡鱼情|525|m","燕台一去客心惊|526|m","笳鼓喧喧汉将营|526|m","万里寒光生积雪|526|m","三边曙色动危旌|526|m","沙场烽火侵胡月|526|m","海畔云山拥蓟城|526|m","少小虽非投笔吏|526|m","论功还欲请长缨|526|m","冷烛无烟绿蜡干|527|m","芳心犹卷怯春寒|527|m","一缄书札藏何事|527|m","会被东风暗拆看|527|m","闻道黄龙戍|528|m","频年不解兵|528|m","可怜闺里月|528|m","长在汉家营|528|m","吴丝蜀桐张高秋|529|h","空山凝云颓不流|529|h","江娥啼竹素女愁|529|h","李凭中国弹箜篌|529|h","昆山玉碎凤凰叫|529|h","芙蓉泣露香兰笑|529|h","十二门前融冷光|529|h","二十三丝动紫皇|529|h","女娲炼石补天处|529|h","石破天惊逗秋雨|529|h","梦入神山教神妪|529|h","老鱼跳波瘦蛟舞|529|h","吴质不眠倚桂树|529|h","露脚斜飞湿寒兔|529|h","霜草苍苍虫切切|530|m","村南村北行人绝|530|m","独出门前望野田|530|m","月明荞麦花如雪|530|m","塞北梅花羌笛吹|531|m","淮南桂树小山词|531|m","请君莫奏前朝曲|531|m","听唱新翻杨柳枝|531|m","月落乌啼霜满天|532|m","江枫渔火对愁眠|532|m","姑苏城外寒山寺|532|m","夜半钟声到客船|532|m","曾逐东风拂舞筵|533|m","乐游春苑断肠天|533|m","如何肯到清秋日|533|m","已带斜阳又带蝉|533|m","渔舟逐水爱山春|534|h","两岸桃花夹古津|534|h","坐看红树不知远|534|h","行尽青溪不见人|534|h","山口潜行始隈隩|534|h","山开旷望旋平陆|534|h","遥看一处攒云树|534|h","近入千家散花竹|534|h","樵客初传汉姓名|534|h","居人未改秦衣服|534|h","居人共住武陵源|534|h","还从物外起田园|534|h","月明松下房栊静|534|h","日出云中鸡犬喧|534|h","惊闻俗客争来集|534|h","竞引还家问都邑|534|h","平明闾巷扫花开|534|h","薄暮渔樵乘水入|534|h","初因避地去人间|534|h","及至成仙遂不还|534|h","峡里谁知有人事|534|h","世中遥望空云山|534|h","不疑灵境难闻见|534|h","尘心未尽思乡县|534|h","出洞无论隔山水|534|h","辞家终拟长游衍|534|h","自谓经过旧不迷|534|h","安知峰壑今来变|534|h","当时只记入山深|534|h","青溪几度到云林|534|h","春来遍是桃花水|534|h","不辨仙源何处寻|534|h","数萼初含雪|535|e","孤标画本难|535|e","香中别有韵|535|e","清极不知寒|535|e","横笛和愁听|535|e","斜枝倚病看|535|e","朔风如解意|535|e","容易莫摧残|535|e","梅岭花初发|536|m","天山雪未开|536|m","雪处疑花满|536|m","花边似雪回|536|m","老兔寒蟾泣天色|537|m","云楼半开壁斜白|537|m","玉轮轧露湿团光|537|m","鸾珮相逢桂香陌|537|m","黄尘清水三山下|537|m","更变千年如走马|537|m","遥望齐州九点烟|537|m","一泓海水杯中泻|537|m","海客谈瀛洲|538|h","烟涛微茫信难求|538|h","越人语天姥|538|h","云霞明灭或可睹|538|h","天姥连天向天横|538|h","势拔五岳掩赤城|538|h","天台四万八千丈|538|h","对此欲倒东南倾|538|h","我欲因之梦吴越|538|h","一夜飞度镜湖月|538|h","湖月照我影|538|h","送我至剡溪|538|h","谢公宿处今尚在|538|h","渌水荡漾清猿啼|538|h","脚著谢公屐|538|h","身登青云梯|538|h","半壁见海日|538|h","空中闻天鸡|538|h","千岩万转路不定|538|h","迷花倚石忽已暝|538|h","熊咆龙吟殷岩泉|538|h","栗深林兮惊层巅|538|h","青冥浩荡不见底|538|h","日月照耀金银台|538|h","霓为衣兮风为马|538|h","虎鼓瑟兮鸾回车|538|h","仙之人兮列如麻|538|h","世间行乐亦如此|538|h","古来万事东流水|538|h","别君去兮何时还|538|h","且放白鹿青崖间|538|h","须行即骑访名山|538|h","使我不得开心颜|538|h","客路青山外|539|h","行舟绿水前|539|h","潮平两岸阔|539|h","风正一帆悬|539|h","海日生残夜|539|h","江春入旧年|539|h","乡书何处达|539|h","归雁洛阳边|539|h","楚塞三湘接|540|m","荆门九派通|540|m","江流天地外|540|m","山色有无中|540|m","郡邑浮前浦|540|m","波澜动远空|540|m","襄阳好风日|540|m","留醉与山翁|540|m","天秋月又满|541|e","城阙夜千重|541|e","还作江南会|541|e","翻疑梦里逢|541|e","江送巴南水|542|e","山横塞北云|542|e","津亭秋月夜|542|e","谁见泣离群|542|e","千里莺啼绿映红|543|m","水村山郭酒旗风|543|m","南朝四百八十寺|543|m","多少楼台烟雨中|543|m","嫁得瞿塘贾|544|m","朝朝误妾期|544|m","早知潮有信|544|m","嫁与弄潮儿|544|m","岐王宅里寻常见|545|h","崔九堂前几度闻|545|h","正是江南好风景|545|h","落花时节又逢君|545|h","钓罢归来不系船|546|m","江村月落正堪眠|546|m","纵然一夜风吹去|546|m","只在芦花浅水边|546|m","江汉思归客|547|m","乾坤一腐儒|547|m","片云天共远|547|m","永夜月同孤|547|m","落日心犹壮|547|m","秋风病欲苏|547|m","古来存老马|547|m","不必取长途|547|m","黄四娘家花满蹊|548|m","千朵万朵压枝低|548|m","留连戏蝶时时舞|548|m","自在娇莺恰恰啼|548|m","咫尺愁风雨|549|e","匡庐不可登|549|e","只疑云雾窟|549|e","犹有六朝僧|549|e","千山鸟飞绝|550|e","万径人踪灭|550|e","孤舟蓑笠翁|550|e","独钓寒江雪|550|e","小娃撑小艇|551|e","偷采白莲回|551|e","不解藏踪迹|551|e","浮萍一道开|551|e","北风吹白云|552|e","万里渡河汾|552|e","心绪逢摇落|552|e","秋声不可闻|552|e","烟笼寒水月笼沙|553|m","夜泊秦淮近酒家|553|m","商女不知亡国恨|553|m","隔江犹唱后庭花|553|m","渭水清无淀|554|m","春流两岸平|554|m","忽看千骑出|554|m","共喜一舟行|554|m","映日同云气|554|m","随风散雨声|554|m","方知帝城远|554|m","宛在水中央|554|m","泾溪石险人兢慎|555|m","终岁不闻倾覆人|555|m","却是平流无石处|555|m","时时闻说有沉沦|555|m","中兴诸将收山东|556|h","捷书夜报清昼同|556|h","河广传闻一苇过|556|h","胡危命在破竹中|556|h","祗残邺城不日得|556|h","独任朔方无限功|556|h","京师皆骑汗血马|556|h","回纥喂肉葡萄宫|556|h","已喜皇威清海岱|556|h","常思仙仗过崆峒|556|h","三年笛里关山月|556|h","万国兵前草木风|556|h","成王功大心转小|556|h","郭相谋深古来少|556|h","司徒清鉴悬明镜|556|h","尚书气与秋天杳|556|h","二三豪俊为时出|556|h","整顿乾坤济时了|556|h","东走无复忆鲈鱼|556|h","南飞觉有安巢鸟|556|h","青春复随冠冕入|556|h","紫禁正耐烟花绕|556|h","鹤禁通霄凤辇备|556|h","鸡鸣问寝龙楼晓|556|h","攀龙附凤势莫当|556|h","天下尽化为侯王|556|h","汝等岂知蒙帝力|556|h","时来不得夸身强|556|h","关中既留萧丞相|556|h","幕下复用张子房|556|h","张公一生江海客|556|h","身长九尺须眉苍|556|h","征起适遇风云会|556|h","扶颠始知筹策良|556|h","青袍白马更何有|556|h","后汉今周喜再昌|556|h","寸地尺天皆入贡|556|h","奇祥异瑞争来送|556|h","不知何国致白环|556|h","复道诸山得银瓮|556|h","隐士休歌紫芝曲|556|h","词人解撰河清颂|556|h","田家望望惜雨干|556|h","布谷处处催春种|556|h","淇上健儿归莫懒|556|h","城南思妇愁多梦|556|h","安得壮士挽天河|556|h","净洗甲兵长不用|556|h","洛阳女儿对门居|557|h","才可颜容十五余|557|h","良人玉勒乘骢马|557|h","侍女金盘脍鲤鱼|557|h","画阁朱楼尽相望|557|h","红桃绿柳垂檐向|557|h","罗帷送上七香车|557|h","宝扇迎归九华帐|557|h","狂夫富贵在青春|557|h","意气骄奢剧季伦|557|h","自怜碧玉亲教舞|557|h","不惜珊瑚持与人|557|h","春窗曙灭九微火|557|h","九微片片飞花琐|557|h","戏罢曾无理曲时|557|h","妆成祗是熏香坐|557|h","城中相识尽繁华|557|h","日夜经过赵李家|557|h","谁怜越女颜如玉|557|h","贫贱江头自浣纱|557|h","九曲黄河万里沙|558|m","浪淘风簸自天涯|558|m","如今直上银河去|558|m","同到牵牛织女家|558|m","帘外雨潺潺|559|m","罗衾不耐五更寒|559|m","梦里不知身是客|559|m","独自莫凭栏|559|m","别时容易见时难|559|m","流水落花春去也|559|m","莫道谗言如浪深|560|m","莫言迁客似沙沉|560|m","千淘万漉虽辛苦|560|m","吹尽狂沙始到金|560|m","江汉曾为客|561|m","相逢每醉还|561|m","浮云一别后|561|m","流水十年间|561|m","欢笑情如旧|561|m","萧疏鬓已斑|561|m","何因不归去|561|m","淮上有秋山|561|m","旅泊青山夜|562|e","荒庭白露秋|562|e","洞房悬月影|562|e","高枕听江流|562|e","猿响寒岩树|562|e","萤飞古驿楼|562|e","他乡对摇落|562|e","倂觉起离忧|562|e","触目柔肠断|563|m","砌下落梅如雪乱|563|m","清明时节雨纷纷|564|m","路上行人欲断魂|564|m","借问酒家何处有|564|m","牧童遥指杏花村|564|m","林卧愁春尽|565|m","开轩览物华|565|m","忽逢青鸟使|565|m","邀入赤松家|565|m","丹灶初开火|565|m","仙桃正发花|565|m","童颜若可驻|565|m","何惜醉流霞|565|m","渔翁夜傍西岩宿|566|m","晓汲清湘燃楚竹|566|m","烟销日出不见人|566|m","欸乃一声山水绿|566|m","回看天际下中流|566|m","岩上无心云相逐|566|m","岭外音书断|567|m","经冬复历春|567|m","近乡情更怯|567|m","不敢问来人|567|m","迟日园林悲昔游|568|m","今春花鸟作边愁|568|m","独怜京国人南窜|568|m","不似湘江水北流|568|m","渡远荆门外|569|h","来从楚国游|569|h","山随平野尽|569|h","江入大荒流|569|h","月下飞天镜|569|h","云生结海楼|569|h","仍怜故乡水|569|h","万里送行舟|569|h","渭城朝雨浥轻尘|570|e","客舍青青柳色新|570|e","劝君更尽一杯酒|570|e","西出阳关无故人|570|e","斜光照墟落|571|m","穷巷牛羊归|571|m","野老念牧童|571|m","倚杖候荆扉|571|m","雉雊麦苗秀|571|m","蚕眠桑叶稀|571|m","田夫荷锄至|571|m","相见语依依|571|m","即此羡闲逸|571|m","怅然吟式微|571|m","慈母手中线|572|m","游子身上衣|572|m","临行密密缝|572|m","意恐迟迟归|572|m","谁言寸草心|572|m","报得三春晖|572|m","岑参兄弟皆好奇|573|h","携我远来游渼陂|573|h","天地黤惨忽异色|573|h","波涛万顷堆琉璃|573|h","琉璃汗漫泛舟入|573|h","事殊兴极忧思集|573|h","鼍作鲸吞不复知|573|h","恶风白浪何不及|573|h","主人锦帆相为开|573|h","舟子喜甚无氛埃|573|h","凫鹥满散陂不及|573|h","菱叶荷花静如拭|573|h","宛在中流渤澥清|573|h","下归无极终南黑|573|h","半陂以南纯浸山|573|h","动影袅窕冲融间|573|h","船舷暝戛云际寺|573|h","水面月出蓝田关|573|h","此时骊龙亦吐珠|573|h","冯夷击鼓群龙趋|573|h","湘妃汉女出歌舞|573|h","金支翠旗光有无|573|h","咫尺但愁雷雨至|573|h","苍茫不晓神灵意|573|h","少壮几时奈老何|573|h","向来哀乐何其多|573|h","万丈红泉落|574|e","迢迢半紫氛|574|e","奔流下杂树|574|e","洒落出重云|574|e","篱外谁家不系船|575|m","春风吹入钓鱼湾|575|m","小童疑是有村客|575|m","急向柴门去却关|575|m","独怜幽草涧边生|576|m","上有黄鹂深树鸣|576|m","春潮带雨晚来急|576|m","野渡无人舟自横|576|m","滕王高阁临江渚|577|m","佩玉鸣鸾罢歌舞|577|m","画栋朝飞南浦云|577|m","珠帘暮卷西山雨|577|m","闲云潭影日悠悠|577|m","物换星移几度秋|577|m","阁中帝子今何在|577|m","槛外长江空自流|577|m","沈约怜何逊|578|m","延年毁谢庄|578|m","清新俱有得|578|m","名誉底相伤|578|m","江月去人只数尺|579|m","风灯照夜欲三更|579|m","沙头宿鹭联拳静|579|m","船尾跳鱼拨剌鸣|579|m","士卒何草草|580|h","筑城潼关道|580|h","大城铁不如|580|h","小城万丈余|580|h","借问潼关吏|580|h","修关还备胡|580|h","要我下马行|580|h","为我指山隅|580|h","连云列战格|580|h","飞鸟不能逾|580|h","胡来但自守|580|h","岂复忧西都|580|h","丈人视要处|580|h","窄狭容单车|580|h","艰难奋长戟|580|h","万古用一夫|580|h","哀哉桃林战|580|h","百万化为鱼|580|h","请嘱防关将|580|h","慎勿学哥舒|580|h","湖南为客动经春|581|m","燕子衔泥两度新|581|m","旧入故园尝识主|581|m","如今社日远看人|581|m","可怜处处巢居室|581|m","何异飘飘托此身|581|m","暂语船樯还起去|581|m","穿花贴水益沾巾|581|m","汉家烟尘在东北|582|h","汉将辞家破残贼|582|h","男儿本自重横行|582|h","天子非常赐颜色|582|h","摐金伐鼓下榆关|582|h","旌旆逶迤碣石间|582|h","校尉羽书飞瀚海|582|h","单于猎火照狼山|582|h","山川萧条极边土|582|h","胡骑凭陵杂风雨|582|h","战士军前半死生|582|h","美人帐下犹歌舞|582|h","大漠穷秋塞草腓|582|h","孤城落日斗兵稀|582|h","身当恩遇常轻敌|582|h","力尽关山未解围|582|h","铁衣远戍辛勤久|582|h","玉箸应啼别离后|582|h","少妇城南欲断肠|582|h","征人蓟北空回首|582|h","边庭飘飖那可度|582|h","绝域苍茫更何有|582|h","杀气三时作阵云|582|h","寒声一夜传刁斗|582|h","相看白刃血纷纷|582|h","死节从来岂顾勋|582|h","至今犹忆李将军|582|h","卢家少妇郁金堂|583|m","海燕双栖玳瑁梁|583|m","九月寒砧催木叶|583|m","十年征戍忆辽阳|583|m","众鸟高飞尽|584|m","孤云独去闲|584|m","相看两不厌|584|m","只有敬亭山|584|m","昨夜裙带解|585|m","今朝蟢子飞|585|m","铅华不可弃|585|m","莫是藁砧归|585|m","浔阳江头夜送客|586|h","枫叶荻花秋瑟瑟|586|h","主人下马客在船|586|h","举酒欲饮无管弦|586|h","醉不成欢惨将别|586|h","别时茫茫江浸月|586|h","忽闻水上琵琶声|586|h","主人忘归客不发|586|h","千呼万唤始出来|586|h","犹抱琵琶半遮面|586|h","转轴拨弦三两声|586|h","未成曲调先有情|586|h","弦弦掩抑声声思|586|h","似诉平生不得志|586|h","低眉信手续续弹|586|h","说尽心中无限事|586|h","轻拢慢捻抹复挑|586|h","初为霓裳后六幺|586|h","大弦嘈嘈如急雨|586|h","小弦切切如私语|586|h","嘈嘈切切错杂弹|586|h","大珠小珠落玉盘|586|h","间关莺语花底滑|586|h","幽咽泉流冰下难|586|h","冰泉冷涩弦凝绝|586|h","凝绝不通声暂歇|586|h","别有幽愁暗恨生|586|h","此时无声胜有声|586|h","银瓶乍破水浆迸|586|h","铁骑突出刀枪鸣|586|h","曲终收拨当心画|586|h","四弦一声如裂帛|586|h","东船西舫悄无言|586|h","唯见江心秋月白|586|h","自言本是京城女|586|h","家在虾蟆陵下住|586|h","十三学得琵琶成|586|h","名属教坊第一部|586|h","曲罢曾教善才服|586|h","妆成每被秋娘妒|586|h","五陵年少争缠头|586|h","一曲红绡不知数|586|h","今年欢笑复明年|586|h","秋月春风等闲度|586|h","弟走从军阿姨死|586|h","暮去朝来颜色故|586|h","门前冷落鞍马稀|586|h","老大嫁作商人妇|586|h","商人重利轻别离|586|h","前月浮梁买茶去|586|h","去来江口守空船|586|h","绕船月明江水寒|586|h","夜深忽梦少年事|586|h","梦啼妆泪红阑干|586|h","我闻琵琶已叹息|586|h","又闻此语重唧唧|586|h","同是天涯沦落人|586|h","相逢何必曾相识|586|h","我从去年辞帝京|586|h","谪居卧病浔阳城|586|h","浔阳地僻无音乐|586|h","终岁不闻丝竹声|586|h","住近湓江地低湿|586|h","黄芦苦竹绕宅生|586|h","其间旦暮闻何物|586|h","杜鹃啼血猿哀鸣|586|h","春江花朝秋月夜|586|h","往往取酒还独倾|586|h","岂无山歌与村笛|586|h","呕哑嘲哳难为听|586|h","今夜闻君琵琶语|586|h","如听仙乐耳暂明|586|h","莫辞更坐弹一曲|586|h","为君翻作琵琶行|586|h","感我此言良久立|586|h","却坐促弦弦转急|586|h","凄凄不似向前声|586|h","满座重闻皆掩泣|586|h","座中泣下谁最多|586|h","江州司马青衫湿|586|h","送客湓浦口|587|h","铮铮然有京都声|587|h","本长安倡女|587|h","使快弹数曲|587|h","今漂沦憔悴|587|h","予出官二年|587|h","凡六百一十六言|587|h","冰簟银床梦不成|588|m","碧天如水夜云轻|588|m","雁声远过潇湘去|588|m","十二楼中月自明|588|m","父耕原上田|589|m","子劚山下荒|589|m","六月禾未秀|589|m","官家已修仓|589|m","远看山有色|590|e","近听水无声|590|e","春去花还在|590|e","人来鸟不惊|590|e","素练风霜起|591|m","苍鹰画作殊|591|m","㧐身思狡兔|591|m","侧目似愁胡|591|m","绦镟光堪摘|591|m","轩楹势可呼|591|m","何当击凡鸟|591|m","毛血洒平芜|591|m","寂寂竟何待|592|m","朝朝空自归|592|m","欲寻芳草去|592|m","惜与故人违|592|m","当路谁相假|592|m","知音世所稀|592|m","只应守寂寞|592|m","还掩故园扉|592|m","物外山川近|593|e","晴初景霭新|593|e","芳郊花柳遍|593|e","何处不宜春|593|e","昔闻洞庭水|594|h","今上岳阳楼|594|h","吴楚东南坼|594|h","乾坤日夜浮|594|h","亲朋无一字|594|h","老病有孤舟|594|h","戎马关山北|594|h","凭轩涕泗流|594|h","前不见古人|595|h","后不见来者|595|h","城上高楼接大荒|596|h","海天愁思正茫茫|596|h","惊风乱飐芙蓉水|596|h","密雨斜侵薜荔墙|596|h","岭树重遮千里目|596|h","江流曲似九回肠|596|h","共来百越文身地|596|h","犹自音书滞一乡|596|h","花近高楼伤客心|597|m","万方多难此登临|597|m","锦江春色来天地|597|m","玉垒浮云变古今|597|m","北极朝廷终不改|597|m","西山寇盗莫相侵|597|m","可怜后主还祠庙|597|m","日暮聊为梁甫吟|597|m","踏阁攀林恨不同|598|m","楚云沧海思无穷|598|m","数家砧杵秋山下|598|m","一郡荆榛寒雨中|598|m","风急天高猿啸哀|599|h","渚清沙白鸟飞回|599|h","无边落木萧萧下|599|h","不尽长江滚滚来|599|h","万里悲秋常作客|599|h","百年多病独登台|599|h","艰难苦恨繁霜鬓|599|h","潦倒新停浊酒杯|599|h","白日依山尽|600|e","黄河入海流|600|e","欲穷千里目|600|e","更上一层楼|600|e","天平山上白云泉|601|m","云自无心水自闲|601|m","何必奔冲山下去|601|m","更添波浪向人间|601|m","白帝城中云出门|602|m","白帝城下雨翻盆|602|m","高江急峡雷霆斗|602|m","古木苍藤日月昏|602|m","戎马不如归马逸|602|m","千家今有百家存|602|m","哀哀寡妇诛求尽|602|m","恸哭秋原何处村|602|m","北风卷地白草折|603|h","胡天八月即飞雪|603|h","忽如一夜春风来|603|h","千树万树梨花开|603|h","散入珠帘湿罗幕|603|h","狐裘不暖锦衾薄|603|h","将军角弓不得控|603|h","都护铁衣冷难着|603|h","瀚海阑干百丈冰|603|h","愁云惨淡万里凝|603|h","中军置酒饮归客|603|h","胡琴琵琶与羌笛|603|h","纷纷暮雪下辕门|603|h","风掣红旗冻不翻|603|h","轮台东门送君去|603|h","去时雪满天山路|603|h","山回路转不见君|603|h","雪上空留马行处|603|h","忆年十五心尚孩|604|h","健如黄犊走复来|604|h","庭前八月梨枣熟|604|h","一日上树能千回|604|h","即今倏忽已五十|604|h","坐卧只多少行立|604|h","强将笑语供主人|604|h","悲见生涯百忧集|604|h","入门依旧四壁空|604|h","老妻睹我颜色同|604|h","痴儿不知父子礼|604|h","叫怒索饭啼门东|604|h","暮投石壕村|606|h","有吏夜捉人|606|h","老翁逾墙走|606|h","老妇出门看|606|h","吏呼一何怒|606|h","妇啼一何苦|606|h","听妇前致词|606|h","三男邺城戍|606|h","一男附书至|606|h","二男新战死|606|h","存者且偷生|606|h","死者长已矣|606|h","室中更无人|606|h","惟有乳下孙|606|h","有孙母未去|606|h","出入无完裙|606|h","老妪力虽衰|606|h","请从吏夜归|606|h","急应河阳役|606|h","犹得备晨炊|606|h","夜久语声绝|606|h","如闻泣幽咽|606|h","天明登前途|606|h","独与老翁别|606|h","山围故国周遭在|607|h","潮打空城寂寞回|607|h","淮水东边旧时月|607|h","夜深还过女墙来|607|h","走马西来欲到天|608|m","辞家见月两回圆|608|m","今夜不知何处宿|608|m","平沙万里绝人烟|608|m","孤灯伴残月|609|e","客梦未全忘|609|e","香灯伴残梦|609|e","楚国在天涯|609|e","禹庙空山里|610|m","秋风落日斜|610|m","荒庭垂橘柚|610|m","古屋画龙蛇|610|m","云气嘘青壁|610|m","江声走白沙|610|m","早知乘四载|610|m","疏凿控三巴|610|m","曾经沧海难为水|611|m","除却巫山不是云|611|m","取次花丛懒回顾|611|m","半缘修道半缘君|611|m","玉露凋伤枫树林|612|m","巫山巫峡气萧森|612|m","江间波浪兼天涌|612|m","塞上风云接地阴|612|m","丛菊两开他日泪|612|m","孤舟一系故园心|612|m","寒衣处处催刀尺|612|m","白帝城高急暮砧|612|m","银烛秋光冷画屏|613|m","轻罗小扇扑流萤|613|m","天阶夜色凉如水|613|m","坐看牵牛织女星|613|m","怀君属秋夜|614|e","散步咏凉天|614|e","空山松子落|614|e","幽人应未眠|614|e","洛阳城里见秋风|615|m","欲作家书意万重|615|m","复恐匆匆说不尽|615|m","行人临发又开封|615|m","古台摇落后|616|m","秋日望乡心|616|m","野寺来人少|616|m","云峰隔水深|616|m","夕阳依旧垒|616|m","寒磬满空林|616|m","白发三千丈|617|m","缘愁似个长|617|m","不知明镜里|617|m","何处得秋霜|617|m","北山白云里|618|m","隐者自怡悦|618|m","相望试登高|618|m","心随雁飞灭|618|m","愁因薄暮起|618|m","兴是清秋发|618|m","时见归村人|618|m","沙行渡头歇|618|m","天边树若荠|618|m","江畔洲如月|618|m","何当载酒来|618|m","共醉重阳节|618|m","江城如画里|619|m","山晓望晴空|619|m","两水夹明镜|619|m","双桥落彩虹|619|m","人烟寒橘柚|619|m","秋色老梧桐|619|m","谁念北楼上|619|m","临风怀谢公|619|m","自古逢秋悲寂寥|620|m","我言秋日胜春朝|620|m","晴空一鹤排云上|620|m","便引诗情到碧霄|620|m","雨霁长空荡涤清|621|m","远山初出未知名|621|m","夜来江上秋无价|621|m","说与舟人不解情|621|m","何处秋风至|622|m","萧萧送雁群|622|m","朝来入庭树|622|m","孤客最先闻|622|m","一丘常欲卧|623|m","三径苦无资|623|m","北土非吾愿|623|m","东林怀我师|623|m","黄金燃桂尽|623|m","壮志逐年衰|623|m","日夕凉风至|623|m","闻蝉但益悲|623|m","积雨空林烟火迟|624|m","蒸藜炊黍饷东菑|624|m","漠漠水田飞白鹭|624|m","阴阴夏木啭黄鹂|624|m","山中习静观朝槿|624|m","松下清斋折露葵|624|m","野老与人争席罢|624|m","海鸥何事更相疑|624|m","远书归梦两悠悠|625|m","只有空床敌素秋|625|m","阶下青苔与红树|625|m","雨中寥落月中愁|625|m","杨柳青青江水平|626|m","闻郎江上踏歌声|626|m","东边日出西边雨|626|m","道是无晴却有晴|626|m","独坐幽篁里|627|e","弹琴复长啸|627|e","深林人不知|627|e","明月来相照|627|e","松叶堪为酒|628|e","春来酿几多|628|e","不辞山路远|628|e","踏雪也相过|628|e","猿鸟犹疑畏简书|629|h","风云常为护储胥|629|h","徒令上将挥神笔|629|h","终见降王走传车|629|h","管乐有才终不忝|629|h","关张无命欲何如|629|h","他年锦里经祠庙|629|h","梁父吟成恨有余|629|h","晓迎秋露一枝新|630|m","不占园中最上春|630|m","桃李无言又何在|630|m","向风偏笑艳阳人|630|m","择茧缲丝清水煮|631|m","拣丝练线红蓝染|631|m","染为红线红于蓝|631|m","织作披香殿上毯|631|m","中岁颇好道|632|m","晚家南山陲|632|m","兴来每独往|632|m","胜事空自知|632|m","行到水穷处|632|m","坐看云起时|632|m","偶然值林叟|632|m","谈笑无还期|632|m","太乙近天都|633|m","连山接海隅|633|m","白云回望合|633|m","青霭入看无|633|m","分野中峰变|633|m","阴晴众壑殊|633|m","欲投人处宿|633|m","隔水问樵夫|633|m","终南阴岭秀|634|e","积雪浮云端|634|e","林表明霁色|634|e","城中增暮寒|634|e","结客少年场|635|m","春风满路香|635|m","韩魏多奇节|635|m","齐鲁富文章|635|m","两个黄鹂鸣翠柳|636|m","一行白鹭上青天|636|m","窗含西岭千秋雪|636|m","门泊东吴万里船|636|m","迟日江山丽|637|e","春风花草香|637|e","泥融飞燕子|637|e","沙暖睡鸳鸯|637|e","江碧鸟逾白|638|e","山青花欲燃|638|e","今春看又过|638|e","何日是归年|638|e","眼见客愁愁不醒|639|m","无赖春色到江亭|639|m","即遣花开深造次|639|m","便教莺语太丁宁|639|m","熟知茅斋绝低小|640|e","江上燕子故来频|640|e","衔泥点污琴书内|640|e","更接飞虫打着人|640|e","少年十五二十时|641|h","步行夺得胡马骑|641|h","射杀山中白额虎|641|h","肯数邺下黄须儿|641|h","一身转战三千里|641|h","一剑曾当百万师|641|h","汉兵奋迅如霹雳|641|h","虏骑崩腾畏蒺藜|641|h","卫青不败由天幸|641|h","李广无功缘数奇|641|h","自从弃置便衰朽|641|h","世事蹉跎成白首|641|h","昔时飞箭无全目|641|h","今日垂杨生左肘|641|h","路旁时卖故侯瓜|641|h","门前学种先生柳|641|h","苍茫古木连穷巷|641|h","寥落寒山对虚牖|641|h","誓令疏勒出飞泉|641|h","不似颍川空使酒|641|h","贺兰山下阵如云|641|h","羽檄交驰日夕闻|641|h","节使三河募年少|641|h","诏书五道出将军|641|h","试拂铁衣如雪色|641|h","聊持宝剑动星文|641|h","愿得燕弓射大将|641|h","耻令越甲鸣吾君|641|h","莫嫌旧日云中守|641|h","犹堪一战取功勋|641|h","自君之出矣|642|m","不复理残机|642|m","思君如满月|642|m","夜夜减清辉|642|m","得即高歌失即休|643|m","多愁多恨亦悠悠|643|m","今朝有酒今朝醉|643|m","明日愁来明日愁|643|m","寒雨连江夜入吴|644|m","平明送客楚山孤|644|m","洛阳亲友如相问|644|m","一片冰心在玉壶|644|m","旧苑荒台杨柳新|645|m","菱歌清唱不胜春|645|m","只今惟有西江月|645|m","曾照吴王宫里人|645|m","苏武魂销汉使前|646|h","古祠高树两茫然|646|h","云边雁断胡天月|646|h","陇上羊归塞草烟|646|h","廻日楼台非甲帐|646|h","去时冠劒是丁年|646|h","茂陵不见封侯印|646|h","空向秋波哭逝川|646|h","苏溪亭上草漫漫|647|m","谁倚东风十二阑|647|m","燕子不归春事晚|647|m","一汀烟雨杏花寒|647|m","八月秋高风怒号|648|h","卷我屋上三重茅|648|h","茅飞渡江洒江郊|648|h","高者挂罥长林梢|648|h","下者飘转沉塘坳|648|h","忍能对面为盗贼|648|h","公然抱茅入竹去|648|h","唇焦口燥呼不得|648|h","归来倚杖自叹息|648|h","俄顷风定云墨色|648|h","秋天漠漠向昏黑|648|h","布衾多年冷似铁|648|h","娇儿恶卧踏里裂|648|h","床头屋漏无干处|648|h","雨脚如麻未断绝|648|h","自经丧乱少睡眠|648|h","长夜沾湿何由彻|648|h","安得广厦千万间|648|h","风雨不动安如山|648|h","秋丛绕舍似陶家|649|m","遍绕篱边日渐斜|649|m","不是花中偏爱菊|649|m","此花开尽更无花|649|m","待到秋来九月八|650|m","我花开后百花杀|650|m","冲天香阵透长安|650|m","满城尽带黄金甲|650|m","小山重叠金明灭|651|m","鬓云欲度香腮雪|651|m","懒起画蛾眉|651|m","弄妆梳洗迟|651|m","照花前后镜|651|m","花面交相映|651|m","新帖绣罗襦|651|m","双双金鹧鸪|651|m","营州少年厌原野|652|m","狐裘蒙茸猎城下|652|m","虏酒千钟不醉人|652|m","胡儿十岁能骑马|652|m","高阁客竟去|653|h","小园花乱飞|653|h","参差连曲陌|653|h","迢递送斜晖|653|h","肠断未忍扫|653|h","眼穿仍欲归|653|h","芳心向春尽|653|h","所得是沾衣|653|h","春花秋月何时了|654|h","往事知多少|654|h","小楼昨夜又东风|654|h","雕栏玉砌应犹在|654|h","只是朱颜改|654|h","问君能有几多愁|654|h","粉色全无饥色加|655|m","岂知人世有荣华|655|m","年年道我蚕辛苦|655|m","底事浑身着苎麻|655|m","天地英雄气|656|m","千秋尚凛然|656|m","势分三足鼎|656|m","业复五铢钱|656|m","得相能开国|656|m","生儿不像贤|656|m","凄凉蜀故妓|656|m","来舞魏宫前|656|m","丞相祠堂何处寻|657|h","锦官城外柏森森|657|h","映阶碧草自春色|657|h","隔叶黄鹂空好音|657|h","三顾频烦天下计|657|h","两朝开济老臣心|657|h","出师未捷身先死|657|h","长使英雄泪满襟|657|h","客心争日月|658|e","来往预期程|658|e","秋风不相待|658|e","先至洛阳城|658|e","难于上青天|659|h","蚕丛及鱼凫|659|h","开国何茫然|659|h","尔来四万八千岁|659|h","不与秦塞通人烟|659|h","西当太白有鸟道|659|h","可以横绝峨眉巅|659|h","地崩山摧壮士死|659|h","猿猱欲度愁攀援|659|h","青泥何盘盘|659|h","百步九折萦岩峦|659|h","扪参历井仰胁息|659|h","以手抚膺坐长叹|659|h","问君西游何时还|659|h","畏途巉岩不可攀|659|h","但见悲鸟号古木|659|h","雄飞雌从绕林间|659|h","又闻子规啼夜月|659|h","使人听此凋朱颜|659|h","连峰去天不盈尺|659|h","枯松倒挂倚绝壁|659|h","飞湍瀑流争喧豗|659|h","砯崖转石万壑雷|659|h","其险也如此|659|h","剑阁峥嵘而崔嵬|659|h","所守或匪亲|659|h","化为狼与豺|659|h","锦城虽云乐|659|h","不如早还家|659|h","侧身西望长咨嗟|659|h","不论平地与山尖|660|m","无限风光尽被占|660|m","采得百花成蜜后|660|m","为谁辛苦为谁甜|660|m","本以高难饱|661|h","徒劳恨费声|661|h","五更疏欲断|661|h","一树碧无情|661|h","薄宦梗犹泛|661|h","故园芜已平|661|h","烦君最相警|661|h","我亦举家清|661|h","垂緌饮清露|662|h","流响出疏桐|662|h","居高声自远|662|h","非是藉秋风|662|h","强欲登高去|663|h","无人送酒来|663|h","遥怜故园菊|663|h","应傍战场开|663|h","寥落古行宫|664|m","宫花寂寞红|664|m","白头宫女在|664|m","闲坐说玄宗|664|m","金樽清酒斗十千|665|m","玉盘珍羞直万钱|665|m","停杯投箸不能食|665|m","拔剑四顾心茫然|665|m","欲渡黄河冰塞川|665|m","将登太行雪满山|665|m","闲来垂钓碧溪上|665|m","忽复乘舟梦日边|665|m","长风破浪会有时|665|m","直挂云帆济沧海|665|m","大道如青天|667|h","我独不得出|667|h","羞逐长安社中儿|667|h","赤鸡白雉赌梨栗|667|h","弹剑作歌奏苦声|667|h","曳裾王门不称情|667|h","淮阴市井笑韩信|667|h","汉朝公卿忌贾生|667|h","拥篲折节无嫌猜|667|h","剧辛乐毅感恩分|667|h","输肝剖胆效英才|667|h","昭王白骨萦蔓草|667|h","谁人更扫黄金台|667|h","王濬楼船下益州|668|m","金陵王气黯然收|668|m","千寻铁锁沉江底|668|m","一片降幡出石头|668|m","人世几回伤往事|668|m","山形依旧枕寒流|668|m","今逢四海为家日|668|m","故垒萧萧芦荻秋|668|m","家国兴亡自有时|669|m","吴人何苦怨西施|669|m","西施若解倾吴国|669|m","越国亡来又是谁|669|m","艳色天下重|670|m","西施宁久微|670|m","朝为越溪女|670|m","暮作吴宫妃|670|m","贱日岂殊众|670|m","贵来方悟稀|670|m","邀人傅脂粉|670|m","不自著罗衣|670|m","君宠益娇态|670|m","君怜无是非|670|m","当时浣纱伴|670|m","莫得同车归|670|m","持谢邻家子|670|m","效颦安可希|670|m","宰嚭亡吴国|671|m","西施陷恶名|671|m","浣纱春水急|671|m","似有不平声|671|m","昔有佳人公孙氏|672|h","一舞剑器动四方|672|h","观者如山色沮丧|672|h","天地为之久低昂|672|h","㸌如羿射九日落|672|h","矫如群帝骖龙翔|672|h","来如雷霆收震怒|672|h","罢如江海凝清光|672|h","绛唇珠袖两寂寞|672|h","晚有弟子传芬芳|672|h","临颍美人在白帝|672|h","妙舞此曲神扬扬|672|h","与余问答既有以|672|h","感时抚事增惋伤|672|h","先帝侍女八千人|672|h","公孙剑器初第一|672|h","五十年间似反掌|672|h","风尘澒洞昏王室|672|h","梨园弟子散如烟|672|h","女乐余姿映寒日|672|h","金粟堆南木已拱|672|h","瞿唐石城草萧瑟|672|h","玳筵急管曲复终|672|h","乐极哀来月东出|672|h","老夫不知其所往|672|h","足茧荒山转愁疾|672|h","田家少闲月|673|h","五月人倍忙|673|h","夜来南风起|673|h","小麦覆陇黄|673|h","妇姑荷箪食|673|h","童稚携壶浆|673|h","相随饷田去|673|h","丁壮在南冈|673|h","足蒸暑土气|673|h","背灼炎天光|673|h","力尽不知热|673|h","但惜夏日长|673|h","复有贫妇人|673|h","抱子在其旁|673|h","右手秉遗穗|673|h","左臂悬敝筐|673|h","听其相顾言|673|h","闻者为悲伤|673|h","家田输税尽|673|h","拾此充饥肠|673|h","今我何功德|673|h","曾不事农桑|673|h","吏禄三百石|673|h","岁晏有余粮|673|h","念此私自愧|673|h","尽日不能忘|673|h","绕池闲步看鱼游|674|m","正值儿童弄钓舟|674|m","一种爱鱼心各异|674|m","我来施食尔垂钩|674|m","风劲角弓鸣|675|m","将军猎渭城|675|m","草枯鹰眼疾|675|m","雪尽马蹄轻|675|m","忽过新丰市|675|m","还归细柳营|675|m","回看射雕处|675|m","千里暮云平|675|m","劳歌一曲解行舟|677|m","红叶青山水急流|677|m","日暮酒醒人已远|677|m","满天风雨下西楼|677|m","翻手作云覆手雨|678|h","纷纷轻薄何须数|678|h","此道今人弃如土|678|h","宣室求贤访逐臣|679|h","贾生才调更无伦|679|h","可怜夜半虚前席|679|h","不问苍生问鬼神|679|h","离离原上草|680|e","一岁一枯荣|680|e","野火烧不尽|680|e","春风吹又生|680|e","远芳侵古道|680|e","晴翠接荒城|680|e","又送王孙去|680|e","萋萋满别情|680|e","楚江微雨里|681|m","建业暮钟时|681|m","漠漠帆来重|681|m","冥冥鸟去迟|681|m","海门深不见|681|m","浦树远含滋|681|m","相送情无限|681|m","沾襟比散丝|681|m","稻粱犹足活诸雏|682|m","妒敌专场好自娱|682|m","可要五更惊稳梦|682|m","不辞风雪为阳乌|682|m","多情却似总无情|683|m","唯觉樽前笑不成|683|m","蜡烛有心还惜别|683|m","替人垂泪到天明|683|m","娉娉袅袅十三余|684|m","豆蔻梢头二月初|684|m","春风十里扬州路|684|m","卷上珠帘总不如|684|m","江海相逢客恨多|685|m","秋风一叶度关河|685|m","李白乘舟将欲行|686|e","忽闻岸上踏歌声|686|e","桃花潭水深千尺|686|e","不及汪伦送我情|686|e","锦城丝管日纷纷|687|m","半入江风半入云|687|m","此曲只应天上有|687|m","人间能得几回闻|687|m","知君书记本翩翩|688|m","为许从戎赴朔边|688|m","红粉楼中应计日|688|m","燕支山下莫经年|688|m","枿坐云游出世尘|689|m","兼无瓶钵可随身|689|m","逢人不说人间事|689|m","便是人间无事人|689|m","折戟沉沙铁未销|690|h","自将磨洗认前朝|690|h","东风不与周郎便|690|h","铜雀春深锁二乔|690|h","平沙莽莽黄入天|691|h","轮台九月风夜吼|691|h","一川碎石大如斗|691|h","随风满地石乱走|691|h","匈奴草黄马正肥|691|h","金山西见烟尘飞|691|h","汉家大将西出师|691|h","将军金甲夜不脱|691|h","半夜军行戈相拨|691|h","风头如刀面如割|691|h","马毛带雪汗气蒸|691|h","五花连钱旋作冰|691|h","幕中草檄砚水凝|691|h","虏骑闻之应胆慑|691|h","料知短兵不敢接|691|h","车师西门伫献捷|691|h","越王勾践破吴归|692|m","义士还乡尽锦衣|692|m","宫女如花满春殿|692|m","只今惟有鹧鸪飞|692|m","一从归白社|693|m","不复到青门|693|m","时倚檐前树|693|m","远看原上村|693|m","青菰临水拔|693|m","白鸟向山翻|693|m","寂寞於陵子|693|m","桔槔方灌园|693|m","寒山转苍翠|694|m","秋水日潺湲|694|m","倚杖柴门外|694|m","临风听暮蝉|694|m","渡头余落日|694|m","墟里上孤烟|694|m","复值接舆醉|694|m","狂歌五柳前|694|m","轻舟南垞去|695|m","北垞淼难即|695|m","隔浦望人家|695|m","遥遥不相识|695|m","木末芙蓉花|696|m","山中发红萼|696|m","涧户寂无人|696|m","纷纷开且落|696|m","溪水无情似有情|697|m","入山三日得同行|697|m","岭头便是分头处|697|m","惜别潺湲一夜声|697|m","长安回望绣成堆|698|h","山顶千门次第开|698|h","一骑红尘妃子笑|698|h","无人知是荔枝来|698|h","故人具鸡黍|699|m","邀我至田家|699|m","绿树村边合|699|m","青山郭外斜|699|m","开轩面场圃|699|m","把酒话桑麻|699|m","待到重阳日|699|m","还来就菊花|699|m","曾于青史见遗文|700|m","今日飘蓬过此坟|700|m","词客有灵应识我|700|m","霸才无主始怜君|700|m","不知香积寺|701|m","数里入云峰|701|m","古木无人径|701|m","深山何处钟|701|m","泉声咽危石|701|m","日色冷青松|701|m","薄暮空潭曲|701|m","安禅制毒龙|701|m","洞房昨夜停红烛|702|m","待晓堂前拜舅姑|702|m","妆罢低声问夫婿|702|m","画眉深浅入时无|702|m","荒戍落黄叶|703|m","浩然离故关|703|m","高风汉祖庙|703|m","秋日楚王台|703|m","江上几人在|703|m","天涯孤棹还|703|m","君到姑苏见|704|m","人家尽枕河|704|m","古宫闲地少|704|m","水港小桥多|704|m","夜市卖菱藕|704|m","春船载绮罗|704|m","遥知未眠月|704|m","乡思在渔歌|704|m","别路云初起|705|e","离亭叶正稀|705|e","所嗟人异雁|705|e","不作一行归|705|e","下马饮君酒|706|m","问君何所之|706|m","君言不得意|706|m","归卧南山陲|706|m","但去莫复问|706|m","白云无尽时|706|m","青山横北郭|707|h","白水绕东城|707|h","此地一为别|707|h","孤蓬万里征|707|h","浮云游子意|707|h","落日故人情|707|h","挥手自兹去|707|h","萧萧班马鸣|707|h","巢父掉头不肯住|708|h","东将入海随烟雾|708|h","诗卷长留天地间|708|h","钓竿欲拂珊瑚树|708|h","深山大泽龙蛇远|708|h","春寒野阴风景暮|708|h","蓬莱织女回云车|708|h","指点虚无是征路|708|h","自是君身有仙骨|708|h","世人那得知其故|708|h","惜君只欲苦死留|708|h","富贵何如草头露|708|h","蔡侯静者意有余|708|h","清夜置酒临前除|708|h","罢琴惆怅月照席|708|h","几岁寄我空中书|708|h","南寻吴越并海峤|708|h","北过大梁逢故人|708|h","长笛一声乱愁思|708|h","乘舟木叶下纷纷|708|h","万里辞家事鼓鼙|709|m","金陵驿路楚云西|709|m","江春不肯留行客|709|m","草色青青送马蹄|709|m","城阙辅三秦|710|m","风烟望五津|710|m","与君离别意|710|m","同是宦游人|710|m","海内存知己|710|m","天涯若比邻|710|m","无为在歧路|710|m","儿女共沾巾|710|m","沅水通波接武冈|711|m","送君不觉有离伤|711|m","青山一道同云雨|711|m","明月何曾是两乡|711|m","巴陵一望洞庭秋|712|m","日见孤峰水上浮|712|m","闻道神仙不可接|712|m","心随湖水共悠悠|712|m","万壑树参天|713|m","千山响杜鹃|713|m","山中一夜雨|713|m","树杪百重泉|713|m","汉女输橦布|713|m","巴人讼芋田|713|m","文翁翻教授|713|m","不敢倚先贤|713|m","苍苍竹林寺|714|e","杳杳钟声晚|714|e","荷笠带斜阳|714|e","青山独归远|714|e","圣代无隐者|715|m","英灵尽来归|715|m","遂令东山客|715|m","不得顾采薇|715|m","既至金门远|715|m","孰云吾道非|715|m","江淮度寒食|715|m","京洛缝春衣|715|m","置酒长安道|715|m","同心与我违|715|m","行当浮桂棹|715|m","未几拂荆扉|715|m","远树带行客|715|m","孤城当落晖|715|m","吾谋适不用|715|m","勿谓知音稀|715|m","朝闻游子唱离歌|716|m","昨夜微霜初渡河|716|m","鸿雁不堪愁里听|716|m","云山况是客中过|716|m","醉别江楼橘柚香|717|m","江风引雨入舟凉|717|m","忆君遥在潇湘月|717|m","愁听清猿梦里长|717|m","故园东望路漫漫|718|h","双袖龙钟泪不干|718|h","马上相逢无纸笔|718|h","凭君传语报平安|718|h","日暮苍山远|719|e","天寒白屋贫|719|e","柴门闻犬吠|719|e","风雪夜归人|719|e","弄石临溪坐|720|e","寻花绕寺行|720|e","时时闻鸟语|720|e","处处是泉声|720|e","落魄江南载酒行|721|m","楚腰纤细掌中轻|721|m","十年一觉扬州梦|721|m","赢得青楼薄幸名|721|m","北邙山上列坟茔|722|m","万古千秋对洛城|722|m","城中日夕歌钟起|722|m","山上唯闻松柏声|722|m","巴山楚水凄凉地|723|h","二十三年弃置身|723|h","怀旧空吟闻笛赋|723|h","到乡翻似烂柯人|723|h","沉舟侧畔千帆过|723|h","病树前头万木春|723|h","今日听君歌一曲|723|h","暂凭杯酒长精神|723|h","晚年惟好静|724|m","万事不关心|724|m","自顾无长策|724|m","空知返旧林|724|m","松风吹解带|724|m","山月照弹琴|724|m","君问穷通理|724|m","渔歌入浦深|724|m","诸公衮衮登台省|725|h","广文先生官独冷|725|h","甲第纷纷厌粱肉|725|h","广文先生饭不足|725|h","先生有道出羲皇|725|h","先生有才过屈宋|725|h","德尊一代常坎坷|725|h","名垂万古知何用|725|h","杜陵野客人更嗤|725|h","被褐短窄鬓如丝|725|h","日籴太仓五升米|725|h","时赴郑老同襟期|725|h","得钱即相觅|725|h","醉酒更同归|725|h","情亲故旧谁肯来|725|h","相访柴门独老妻|725|h","不须闻此意惨怆|725|h","生前相遇且衔杯|725|h","陆机二十作文赋|726|h","汝更小年能缀文|726|h","总角草书又神速|726|h","世上儿子徒纷纷|726|h","骅骝作驹已汗血|726|h","鸷鸟举翮连青云|726|h","词源倒流三峡水|726|h","笔阵独扫千人军|726|h","只今年才十六七|726|h","射策君门期第一|726|h","旧穿杨叶真自知|726|h","暂蹶霜蹄未为失|726|h","偶然擢秀非难取|726|h","会是排风有毛质|726|h","汝身已见唾成珠|726|h","汝伯何由发如漆|726|h","春光淡沱秦东亭|726|h","渚蒲牙白水荇青|726|h","风吹客衣日杲杲|726|h","树搅离思花冥冥|726|h","酒尽沙头双玉瓶|726|h","众宾皆醉我独醒|726|h","乃知贫贱别更苦|726|h","吞声踯躅涕泪零|726|h","荷叶罗裙一色裁|727|m","芙蓉向脸两边开|727|m","乱入池中看不见|727|m","闻歌始觉有人来|727|m","猿啼客散暮江头|728|m","人自伤心水自流|728|m","同作逐臣君更远|728|m","青山万里一孤舟|728|m","东皋薄暮望|729|h","徙倚欲何依|729|h","树树皆秋色|729|h","山山唯落晖|729|h","牧人驱犊返|729|h","猎马带禽归|729|h","相顾无相识|729|h","长歌怀采薇|729|h","劝君莫惜金缕衣|730|m","劝君惜取少年时|730|m","花开堪折直须折|730|m","莫待无花空折枝|730|m","繁华事散逐香尘|731|m","流水无情草自春|731|m","日暮东风怨啼鸟|731|m","落花犹似坠楼人|731|m","孤山寺北贾亭西|732|h","水面初平云脚低|732|h","几处早莺争暖树|732|h","谁家新燕啄春泥|732|h","乱花渐欲迷人眼|732|h","浅草才能没马蹄|732|h","最爱湖东行不足|732|h","绿杨阴里白沙堤|732|h","锦瑟无端五十弦|733|h","一弦一柱思华年|733|h","庄生晓梦迷蝴蝶|733|h","望帝春心托杜鹃|733|h","沧海月明珠有泪|733|h","蓝田日暖玉生烟|733|h","此情可待成追忆|733|h","只是当时已惘然|733|h","奉帚平明金殿开|734|m","暂将团扇共徘徊|734|m","玉颜不及寒鸦色|734|m","犹带昭阳日影来|734|m","长安大道连狭斜|735|m","青牛白马七香车|735|m","玉辇纵横过主第|735|m","金鞭络绎向侯家|735|m","龙衔宝盖承朝日|735|m","凤吐流苏带晚霞|735|m","百丈游丝争绕树|735|m","一群娇鸟共啼花|735|m","啼花戏蝶千门侧|735|m","碧树银台万种色|735|m","复道交窗作合欢|735|m","双阙连薨垂凤翼|735|m","梁家画阁天中起|735|m","汉帝金茎云外直|735|m","楼前相望不相知|735|m","陌上相逢讵相识|735|m","借问吹箫向紫烟|735|m","曾经学舞度芳年|735|m","得成比目何辞死|735|m","愿作鸳鸯不羡仙|735|m","比目鸳鸯真可羡|735|m","双去双来君不见|735|m","生憎帐额绣孤鸾|735|m","好取门帘帖双燕|735|m","双燕双飞绕画梁|735|m","罗帏翠被郁金香|735|m","片片行云着蝉鬓|735|m","纤纤初月上鸦黄|735|m","鸦黄粉白车中出|735|m","含娇含态情非一|735|m","妖童宝马铁连钱|735|m","娼妇盘龙金屈膝|735|m","御史府中乌夜啼|735|m","廷尉门前雀欲栖|735|m","隐隐朱城临玉道|735|m","遥遥翠幰没金堤|735|m","挟弹飞鹰杜陵北|735|m","探丸借客渭桥西|735|m","俱邀侠客芙蓉剑|735|m","共宿娼家桃李蹊|735|m","娼家日暮紫罗裙|735|m","清歌一啭口氛氲|735|m","北堂夜夜人如月|735|m","南陌朝朝骑似云|735|m","南陌北堂连北里|735|m","五剧三条控三市|735|m","弱柳青槐拂地垂|735|m","佳气红尘暗天起|735|m","汉代金吾千骑来|735|m","翡翠屠苏鹦鹉杯|735|m","罗襦宝带为君解|735|m","燕歌赵舞为君开|735|m","别有豪华称将相|735|m","转日回天不相让|735|m","意气由来排灌夫|735|m","专权判不容萧相|735|m","专权意气本豪雄|735|m","青虬紫燕坐春风|735|m","自言歌舞长千载|735|m","自谓骄奢凌五公|735|m","节物风光不相待|735|m","桑田碧海须臾改|735|m","昔时金阶白玉堂|735|m","即今唯见青松在|735|m","年年岁岁一床书|735|m","独有南山桂花发|735|m","飞来飞去袭人裾|735|m","客从东方来|736|m","衣上灞陵雨|736|m","问客何为来|736|m","采山因买斧|736|m","冥冥花正开|736|m","飏飏燕新乳|736|m","昨别今已春|736|m","鬓丝生几缕|736|m","妾发初覆额|737|h","折花门前剧|737|h","郎骑竹马来|737|h","绕床弄青梅|737|h","同居长干里|737|h","两小无嫌猜|737|h","十四为君妇|737|h","羞颜未尝开|737|h","低头向暗壁|737|h","千唤不一回|737|h","十五始展眉|737|h","愿同尘与灰|737|h","常存抱柱信|737|h","岂上望夫台|737|h","十六君远行|737|h","瞿塘滟滪堆|737|h","五月不可触|737|h","猿声天上哀|737|h","门前迟行迹|737|h","一一生绿苔|737|h","苔深不能扫|737|h","落叶秋风早|737|h","八月蝴蝶黄|737|h","双飞西园草|737|h","感此伤妾心|737|h","坐愁红颜老|737|h","早晚下三巴|737|h","预将书报家|737|h","相迎不道远|737|h","直至长风沙|737|h","汉皇重色思倾国|738|h","御宇多年求不得|738|h","杨家有女初长成|738|h","养在深闺人未识|738|h","天生丽质难自弃|738|h","一朝选在君王侧|738|h","回眸一笑百媚生|738|h","六宫粉黛无颜色|738|h","春寒赐浴华清池|738|h","温泉水滑洗凝脂|738|h","侍儿扶起娇无力|738|h","始是新承恩泽时|738|h","云鬓花颜金步摇|738|h","芙蓉帐暖度春宵|738|h","春宵苦短日高起|738|h","从此君王不早朝|738|h","承欢侍宴无闲暇|738|h","春从春游夜专夜|738|h","后宫佳丽三千人|738|h","三千宠爱在一身|738|h","金屋妆成娇侍夜|738|h","玉楼宴罢醉和春|738|h","姊妹弟兄皆列土|738|h","可怜光彩生门户|738|h","遂令天下父母心|738|h","不重生男重生女|738|h","骊宫高处入青云|738|h","仙乐风飘处处闻|738|h","缓歌慢舞凝丝竹|738|h","尽日君王看不足|738|h","渔阳鼙鼓动地来|738|h","惊破霓裳羽衣曲|738|h","九重城阙烟尘生|738|h","千乘万骑西南行|738|h","翠华摇摇行复止|738|h","西出都门百余里|738|h","六军不发无奈何|738|h","宛转蛾眉马前死|738|h","花钿委地无人收|738|h","翠翘金雀玉搔头|738|h","君王掩面救不得|738|h","回看血泪相和流|738|h","黄埃散漫风萧索|738|h","云栈萦纡登剑阁|738|h","峨嵋山下少人行|738|h","旌旗无光日色薄|738|h","蜀江水碧蜀山青|738|h","圣主朝朝暮暮情|738|h","行宫见月伤心色|738|h","夜雨闻铃肠断声|738|h","天旋地转回龙驭|738|h","到此踌躇不能去|738|h","马嵬坡下泥土中|738|h","不见玉颜空死处|738|h","君臣相顾尽沾衣|738|h","东望都门信马归|738|h","归来池苑皆依旧|738|h","太液芙蓉未央柳|738|h","芙蓉如面柳如眉|738|h","对此如何不泪垂|738|h","春风桃李花开日|738|h","秋雨梧桐叶落时|738|h","西宫南内多秋草|738|h","落叶满阶红不扫|738|h","梨园弟子白发新|738|h","椒房阿监青娥老|738|h","夕殿萤飞思悄然|738|h","孤灯挑尽未成眠|738|h","迟迟钟鼓初长夜|738|h","耿耿星河欲曙天|738|h","鸳鸯瓦冷霜华重|738|h","翡翠衾寒谁与共|738|h","悠悠生死别经年|738|h","魂魄不曾来入梦|738|h","临邛道士鸿都客|738|h","能以精诚致魂魄|738|h","为感君王辗转思|738|h","遂教方士殷勤觅|738|h","排空驭气奔如电|738|h","升天入地求之遍|738|h","上穷碧落下黄泉|738|h","两处茫茫皆不见|738|h","忽闻海上有仙山|738|h","山在虚无缥缈间|738|h","楼阁玲珑五云起|738|h","其中绰约多仙子|738|h","中有一人字太真|738|h","雪肤花貌参差是|738|h","金阙西厢叩玉扃|738|h","转教小玉报双成|738|h","闻道汉家天子使|738|h","九华帐里梦魂惊|738|h","揽衣推枕起徘徊|738|h","珠箔银屏迤逦开|738|h","云鬓半偏新睡觉|738|h","花冠不整下堂来|738|h","风吹仙袂飘飘举|738|h","犹似霓裳羽衣舞|738|h","玉容寂寞泪阑干|738|h","梨花一枝春带雨|738|h","含情凝睇谢君王|738|h","一别音容两渺茫|738|h","昭阳殿里恩爱绝|738|h","蓬莱宫中日月长|738|h","回头下望人寰处|738|h","不见长安见尘雾|738|h","惟将旧物表深情|738|h","钿合金钗寄将去|738|h","钗留一股合一扇|738|h","钗擘黄金合分钿|738|h","但教心似金钿坚|738|h","天上人间会相见|738|h","临别殷勤重寄词|738|h","词中有誓两心知|738|h","七月七日长生殿|738|h","夜半无人私语时|738|h","在天愿作比翼鸟|738|h","在地愿为连理枝|738|h","天长地久有时尽|738|h","此恨绵绵无绝期|738|h","晨征犯烟磴|739|e","夕憩在云关|739|e","晚风清近壑|739|e","新月照澄湾|739|e","郊童樵唱返|739|e","津叟钓歌还|739|e","客行无与晤|739|e","赖此释愁颜|739|e","绿蚁新醅酒|740|e","红泥小火炉|740|e","晚来天欲雪|740|e","能饮一杯无|740|e","闺中少妇不知愁|741|m","春日凝妆上翠楼|741|m","忽见陌头杨柳色|741|m","悔教夫婿觅封侯|741|m","月落星稀天欲明|742|m","孤灯未灭梦难成|742|m","披衣更向门前望|742|m","不忿朝来鹊喜声|742|m","剑外忽传收蓟北|743|m","初闻涕泪满衣裳|743|m","却看妻子愁何在|743|m","漫卷诗书喜欲狂|743|m","白日放歌须纵酒|743|m","青春作伴好还乡|743|m","即从巴峡穿巫峡|743|m","便下襄阳向洛阳|743|m","杨花落尽子规啼|744|h","闻道龙标过五溪|744|h","我寄愁心与明月|744|h","随君直到夜郎西|744|h","岁暮阴阳催短景|745|m","天涯霜雪霁寒宵|745|m","五更鼓角声悲壮|745|m","三峡星河影动摇|745|m","野哭千家闻战伐|745|m","夷歌数处起渔樵|745|m","卧龙跃马终黄土|745|m","人事音书漫寂寥|745|m","旅馆寒灯独不眠|746|m","客心何事转凄然|746|m","故乡今夜思千里|746|m","霜鬓明朝又一年|746|m","旅馆谁相问|747|e","寒灯独可亲|747|e","一年将尽夜|747|e","万里未归人|747|e","寥落悲前事|747|e","支离笑此身|747|e","愁颜与衰鬓|747|e","明日又逢春|747|e","紫泉宫殿锁烟霞|748|h","欲取芜城作帝家|748|h","玉玺不缘归日角|748|h","锦帆应是到天涯|748|h","于今腐草无萤火|748|h","终古垂杨有暮鸦|748|h","地下若逢陈后主|748|h","岂宜重问后庭花|748|h","黑云压城城欲摧|749|h","甲光向日金鳞开|749|h","角声满天秋色里|749|h","塞上燕脂凝夜紫|749|h","半卷红旗临易水|749|h","霜重鼓寒声不起|749|h","报君黄金台上意|749|h","提携玉龙为君死|749|h","雨里鸡鸣一两家|750|m","竹溪村路板桥斜|750|m","妇姑相唤浴蚕去|750|m","闲着中庭栀子花|750|m","尽道丰年瑞|751|m","丰年事若何|751|m","长安有贫者|751|m","为瑞不宜多|751|m","初闻征雁已无蝉|752|m","百尺楼高水接天|752|m","青女素娥俱耐冷|752|m","月中霜里斗婵娟|752|m","言入黄花川|753|m","每逐青溪水|753|m","随山将万转|753|m","趣途无百里|753|m","声喧乱石中|753|m","色静深松里|753|m","漾漾泛菱荇|753|m","澄澄映葭苇|753|m","我心素已闲|753|m","清川澹如此|753|m","请留盘石上|753|m","垂钓将已矣|753|m","床前明月光|754|e","疑是地上霜|754|e","举头望明月|754|e","低头思故乡|754|e","国初已来画鞍马|755|h","神妙独数江都王|755|h","将军得名三十载|755|h","人间又见真乘黄|755|h","曾貌先帝照夜白|755|h","龙池十日飞霹雳|755|h","内府殷红玛瑙盘|755|h","婕妤传诏才人索|755|h","盘赐将军拜舞归|755|h","轻纨细绮相追飞|755|h","贵戚权门得笔迹|755|h","始觉屏障生光辉|755|h","昔日太宗拳毛騧|755|h","近时郭家狮子花|755|h","今之新图有二马|755|h","复令识者久叹嗟|755|h","此皆骑战一敌万|755|h","缟素漠漠开风沙|755|h","其余七匹亦殊绝|755|h","迥若寒空动烟雪|755|h","霜蹄蹴踏长楸间|755|h","马官厮养森成列|755|h","可怜九马争神骏|755|h","顾视清高气深稳|755|h","借问苦心爱者谁|755|h","后有韦讽前支遁|755|h","忆昔巡幸新丰宫|755|h","翠华拂天来向东|755|h","腾骧磊落三万匹|755|h","皆与此图筋骨同|755|h","自从献宝朝河宗|755|h","无复射蛟江水中|755|h","龙媒去尽鸟呼风|755|h","日暮秋烟起|756|m","胜败兵家事不期|757|m","包羞忍耻是男儿|757|m","江东子弟多才俊|757|m","卷土重来未可知|757|m","闲居少邻并|758|m","草径入荒园|758|m","鸟宿池边树|758|m","僧敲月下门|758|m","过桥分野色|758|m","移石动云根|758|m","暂去还来此|758|m","幽期不负言|758|m","清晨入古寺|759|h","初日照高林|759|h","曲径通幽处|759|h","禅房花木深|759|h","山光悦鸟性|759|h","潭影空人心|759|h","万籁此都寂|759|h","但余钟磬音|759|h","松下茅亭五月凉|760|m","汀沙云树晚苍苍|760|m","行人无限秋风思|760|m","隔水青山似故乡|760|m","飒飒西风满院栽|761|m","蕊寒香冷蝶难来|761|m","他年我若为青帝|761|m","报与桃花一处开|761|m","去年今日此门中|762|m","人面桃花相映红|762|m","人面不知何处去|762|m","桃花依旧笑春风|762|m","金陵津渡小山楼|763|m","一宿行人自可愁|763|m","潮落夜江斜月里|763|m","两三星火是瓜洲|763|m","世人结交须黄金|764|m","黄金不多交不深|764|m","纵令然诺暂相许|764|m","终是悠悠行路心|764|m","解落三秋叶|765|e","能开二月花|765|e","过江千尺浪|765|e","入竹万竿斜|765|e","凄凉宝剑篇|766|h","羁泊欲穷年|766|h","黄叶仍风雨|766|h","青楼自管弦|766|h","新知遭薄俗|766|h","旧好隔良缘|766|h","心断新丰酒|766|h","销愁斗几千|766|h","望君烟水阔|767|m","挥手泪沾巾|767|m","飞鸟没何处|767|m","青山空向人|767|m","长江一帆远|767|m","落日五湖春|767|m","谁见汀洲上|767|m","相思愁白苹|767|m","海外徒闻更九州|768|h","他生未卜此生休|768|h","空闻虎旅传宵柝|768|h","无复鸡人报晓筹|768|h","此日六军同驻马|768|h","当时七夕笑牵牛|768|h","如何四纪为天子|768|h","不及卢家有莫愁|768|h","玄宗回马杨妃死|769|m","云雨难忘日月新|769|m","终是圣明天子事|769|m","景阳宫井又何人|769|m","大漠沙如雪|770|m","燕山月似钩|770|m","何当金络脑|770|m","快走踏清秋|770|m","此马非凡马|771|m","房星本是星|771|m","向前敲瘦骨|771|m","犹自带铜声|771|m","龙脊贴连钱|772|m","银蹄白踏烟|772|m","无人织锦韂|772|m","谁为铸金鞭|772|m","人闲桂花落|773|e","夜静春山空|773|e","月出惊山鸟|773|e","时鸣春涧中|773|e","买得晨鸡共结交|774|m","言交退食未相抛|774|m","知时每报凌晨唱|774|m","解语曾闻半夜号|774|m","空山不见人|775|e","但闻人语响|775|e","返景入深林|775|e","复照青苔上|775|e","昔人已乘黄鹤去|776|h","此地空余黄鹤楼|776|h","黄鹤一去不复返|776|h","白云千载空悠悠|776|h","晴川历历汉阳树|776|h","芳草萋萋鹦鹉洲|776|h","日暮乡关何处是|776|h","烟波江上使人愁|776|h","故人西辞黄鹤楼|777|m","烟花三月下扬州|777|m","孤帆远影碧空尽|777|m","唯见长江天际流|777|m","煮豆持作羹|778|e","漉菽以为汁|778|e","萁在釜下燃|778|e","豆在釜中泣|778|e","本自同根生|778|e","相煎何太急|778|e","饥来驱我去|779|m","不知竟何之|779|m","行行至斯里|779|m","叩门拙言辞|779|m","主人解余意|779|m","遗赠岂虚来|779|m","谈谐终日夕|779|m","觞至辄倾杯|779|m","情欣新知欢|779|m","言咏遂赋诗|779|m","感子漂母惠|779|m","愧我非韩才|779|m","衔戢知何谢|779|m","冥报以相贻|779|m","燕丹善养士|780|h","志在报强嬴|780|h","招集百夫良|780|h","岁暮得荆卿|780|h","君子死知己|780|h","提剑出燕京|780|h","素骥鸣广陌|780|h","慷慨送我行|780|h","雄发指危冠|780|h","猛气冲长缨|780|h","饮饯易水上|780|h","四座列群英|780|h","渐离击悲筑|780|h","宋意唱高声|780|h","萧萧哀风逝|780|h","淡淡寒波生|780|h","商音更流涕|780|h","羽奏壮士惊|780|h","心知去不归|780|h","且有后世名|780|h","登车何时顾|780|h","飞盖入秦庭|780|h","凌厉越万里|780|h","逶迤过千城|780|h","图穷事自至|780|h","豪主正怔营|780|h","惜哉剑术疏|780|h","奇功遂不成|780|h","其人虽已没|780|h","千载有余情|780|h","凄厉岁云暮|781|m","拥褐曝前轩|781|m","南圃无遗秀|781|m","枯条盈北园|781|m","倾壶绝余沥|781|m","窥灶不见烟|781|m","诗书塞座外|781|m","日昃不遑研|781|m","闲居非陈厄|781|m","窃有愠见言|781|m","何以慰吾怀|781|m","赖古多此贤|781|m","人生归有道|782|m","衣食固其端|782|m","孰是都不营|782|m","而以求自安|782|m","开春理常业|782|m","岁功聊可观|782|m","晨出肆微勤|782|m","日入负耒还|782|m","山中饶霜露|782|m","风气亦先寒|782|m","田家岂不苦|782|m","弗获辞此难|782|m","四体诚乃疲|782|m","庶无异患干|782|m","盥濯息檐下|782|m","斗酒散襟颜|782|m","遥遥沮溺心|782|m","千载乃相关|782|m","但愿长如此|782|m","躬耕非所叹|782|m","少无适俗韵|783|m","性本爱丘山|783|m","误落尘网中|783|m","一去三十年|783|m","羁鸟恋旧林|783|m","池鱼思故渊|783|m","开荒南野际|783|m","守拙归园田|783|m","方宅十余亩|783|m","草屋八九间|783|m","榆柳荫后檐|783|m","桃李罗堂前|783|m","暧暧远人村|783|m","依依墟里烟|783|m","狗吠深巷中|783|m","鸡鸣桑树颠|783|m","户庭无尘杂|783|m","虚室有余闲|783|m","久在樊笼里|783|m","复得返自然|783|m","种豆南山下|784|m","草盛豆苗稀|784|m","晨兴理荒秽|784|m","带月荷锄归|784|m","道狭草木长|784|m","夕露沾我衣|784|m","衣沾不足惜|784|m","但使愿无违|784|m","荣荣窗下兰|787|m","密密堂前柳|787|m","初与君别时|787|m","不谓行当久|787|m","出门万里客|787|m","中道逢嘉友|787|m","未言心相醉|787|m","不在接杯酒|787|m","兰枯柳亦衰|787|m","遂令此言负|787|m","多谢诸少年|787|m","相知不忠厚|787|m","意气倾人命|787|m","离隔复何有|787|m","漫漫秋夜长|788|m","烈烈北风凉|788|m","展转不能寐|788|m","披衣起彷徨|788|m","彷徨忽已久|788|m","白露沾我裳|788|m","俯视清水波|788|m","仰看明月光|788|m","天汉回西流|788|m","三五正纵横|788|m","草虫鸣何悲|788|m","孤雁独南翔|788|m","郁郁多悲思|788|m","绵绵思故乡|788|m","愿飞安得翼|788|m","欲济河无梁|788|m","向风长叹息|788|m","断绝我中肠|788|m","人生无根蒂|789|m","飘如陌上尘|789|m","分散逐风转|789|m","此已非常身|789|m","落地为兄弟|789|m","何必骨肉亲|789|m","得欢当作乐|789|m","斗酒聚比邻|789|m","盛年不重来|789|m","一日难再晨|789|m","及时当勉励|789|m","岁月不待人|789|m","秋风萧瑟天气凉|790|h","草木摇落露为霜|790|h","群燕辞归鹄南翔|790|h","念君客游思断肠|790|h","慊慊思归恋故乡|790|h","君何淹留寄他方|790|h","贱妾茕茕守空房|790|h","忧来思君不敢忘|790|h","不觉泪下沾衣裳|790|h","援琴鸣弦发清商|790|h","短歌微吟不能长|790|h","明月皎皎照我床|790|h","星汉西流夜未央|790|h","牵牛织女遥相望|790|h","尔独何辜限河梁|790|h","在昔闻南亩|791|m","当年竟未践|791|m","屡空既有人|791|m","春兴岂自免|791|m","夙晨装吾驾|791|m","启涂情已缅|791|m","鸟哢欢新节|791|m","泠风送余善|791|m","寒草被荒蹊|791|m","地为罕人远|791|m","是以植杖翁|791|m","悠然不复返|791|m","即理愧通识|791|m","所保讵乃浅|791|m","白马饰金羁|792|h","连翩西北驰|792|h","借问谁家子|792|h","幽并游侠儿|792|h","少小去乡邑|792|h","扬声沙漠垂|792|h","宿昔秉良弓|792|h","楛矢何参差|792|h","控弦破左的|792|h","右发摧月支|792|h","仰手接飞猱|792|h","俯身散马蹄|792|h","狡捷过猴猿|792|h","勇剽若豹螭|792|h","边城多警急|792|h","虏骑数迁移|792|h","羽檄从北来|792|h","厉马登高堤|792|h","长驱蹈匈奴|792|h","左顾凌鲜卑|792|h","弃身锋刃端|792|h","性命安可怀|792|h","父母且不顾|792|h","何言子与妻|792|h","名编壮士籍|792|h","不得中顾私|792|h","捐躯赴国难|792|h","视死忽如归|792|h","昔欲居南村|794|m","非为卜其宅|794|m","闻多素心人|794|m","乐与数晨夕|794|m","怀此颇有年|794|m","今日从兹役|794|m","弊庐何必广|794|m","取足蔽床席|794|m","邻曲时时来|794|m","抗言谈在昔|794|m","奇文共欣赏|794|m","疑义相与析|794|m","春秋多佳日|795|m","登高赋新诗|795|m","过门更相呼|795|m","有酒斟酌之|795|m","农务各自归|795|m","闲暇辄相思|795|m","相思则披衣|795|m","言笑无厌时|795|m","此理将不胜|795|m","无为忽去兹|795|m","衣食当须纪|795|m","力耕不吾欺|795|m","美女妖且闲|796|h","采桑歧路间|796|h","柔条纷冉冉|796|h","落叶何翩翩|796|h","攘袖见素手|796|h","皓腕约金环|796|h","头上金爵钗|796|h","腰佩翠琅玕|796|h","明珠交玉体|796|h","珊瑚间木难|796|h","罗衣何飘飖|796|h","轻裾随风还|796|h","顾盼遗光彩|796|h","长啸气若兰|796|h","行徒用息驾|796|h","休者以忘餐|796|h","借问女安居|796|h","乃在城南端|796|h","青楼临大巷|796|h","幽门结重关|796|h","容华耀朝日|796|h","谁不希令颜|796|h","媒氏何所营|796|h","玉帛不时安|796|h","佳人慕高义|796|h","求贤良独难|796|h","众人徒嗷嗷|796|h","安知彼所观|796|h","盛年处房室|796|h","中夜起长叹|796|h","关东有义士|797|m","兴兵讨群凶|797|m","初期会盟津|797|m","乃心在咸阳|797|m","军合力不齐|797|m","踌躇而雁行|797|m","势利使人争|797|m","嗣还自相戕|797|m","淮南弟称号|797|m","刻玺于北方|797|m","铠甲生虮虱|797|m","万姓以死亡|797|m","白骨露于野|797|m","千里无鸡鸣|797|m","生民百遗一|797|m","念之断人肠|797|m","孟夏草木长|799|m","绕屋树扶疏|799|m","众鸟欣有托|799|m","吾亦爱吾庐|799|m","既耕亦已种|799|m","时还读我书|799|m","穷巷隔深辙|799|m","颇回故人车|799|m","欢言酌春酒|799|m","摘我园中蔬|799|m","微雨从东来|799|m","好风与之俱|799|m","泛览周王传|799|m","流观山海图|799|m","俯仰终宇宙|799|m","不乐复何如|799|m","精卫衔微木|800|m","将以填沧海|800|m","刑天舞干戚|800|m","猛志固常在|800|m","同物既无虑|800|m","化去不复悔|800|m","徒设在昔心|800|m","良辰讵可待|800|m","白发被两鬓|801|m","肌肤不复实|801|m","虽有五男儿|801|m","总不好纸笔|801|m","阿舒已二八|801|m","懒惰故无匹|801|m","阿宣行志学|801|m","而不爱文术|801|m","雍端年十三|801|m","不识六与七|801|m","通子垂九龄|801|m","但觅梨与栗|801|m","天运苟如此|801|m","且进杯中物|801|m","谒帝承明庐|802|h","逝将归旧疆|802|h","清晨发皇邑|802|h","日夕过首阳|802|h","伊洛广且深|802|h","欲济川无梁|802|h","泛舟越洪涛|802|h","怨彼东路长|802|h","顾瞻恋城阙|802|h","引领情内伤|802|h","太谷何寥廓|802|h","山树郁苍苍|802|h","霖雨泥我涂|802|h","流潦浩纵横|802|h","中逵绝无轨|802|h","改辙登高冈|802|h","修坂造云日|802|h","我马玄以黄|802|h","结庐在人境|803|m","而无车马喧|803|m","问君何能尔|803|m","心远地自偏|803|m","采菊东篱下|803|m","悠然见南山|803|m","山气日夕佳|803|m","飞鸟相与还|803|m","此中有真意|803|m","欲辨已忘言|803|m","秋菊有佳色|804|m","裛露掇其英|804|m","泛此忘忧物|804|m","远我遗世情|804|m","一觞虽独进|804|m","杯尽壶自倾|804|m","日入群动息|804|m","归鸟趋林鸣|804|m","啸傲东轩下|804|m","聊复得此生|804|m","故人赏我趣|805|m","挈壶相与至|805|m","班荆坐松下|805|m","数斟已复醉|805|m","父老杂乱言|805|m","觞酌失行次|805|m","不觉知有我|805|m","安知物为贵|805|m","悠悠迷所留|805|m","酒中有深味|805|m","若有人兮山之阿|807|h","被薜荔兮带女萝|807|h","既含睇兮又宜笑|807|h","子慕予兮善窈窕|807|h","乘赤豹兮从文狸|807|h","辛夷车兮结桂旗|807|h","被石兰兮带杜衡|807|h","折芳馨兮遗所思|807|h","路险难兮独后来|807|h","表独立兮山之上|807|h","云容容兮而在下|807|h","杳冥冥兮羌昼晦|807|h","东风飘兮神灵雨|807|h","留灵修兮憺忘归|807|h","岁既晏兮孰华予|807|h","采三秀兮于山间|807|h","石磊磊兮葛蔓蔓|807|h","怨公子兮怅忘归|807|h","君思我兮不得闲|807|h","山中人兮芳杜若|807|h","饮石泉兮荫松柏|807|h","君思我兮然疑作|807|h","雷填填兮雨冥冥|807|h","猿啾啾兮狖夜鸣|807|h","风飒飒兮木萧萧|807|h","思公子兮徒离忧|807|h","帝力于我何有哉|809|e","操吴戈兮被犀甲|810|h","车错毂兮短兵接|810|h","旌蔽日兮敌若云|810|h","矢交坠兮士争先|810|h","凌余阵兮躐余行|810|h","左骖殪兮右刃伤|810|h","霾两轮兮絷四马|810|h","援玉枹兮击鸣鼓|810|h","天时怼兮威灵怒|810|h","严杀尽兮弃原野|810|h","出不入兮往不反|810|h","平原忽兮路超远|810|h","带长剑兮挟秦弓|810|h","首身离兮心不惩|810|h","诚既勇兮又以武|810|h","终刚强兮不可凌|810|h","身既死兮神以灵|810|h","魂魄毅兮为鬼雄|810|h","曰遂古之初|816|h","风萧萧兮易水寒|819|m","投我以木瓜|820|m","报之以琼琚|820|m","永以为好也|820|m","投我以木桃|820|m","报之以琼瑶|820|m","投我以木李|820|m","报之以琼玖|820|m","纷其可喜兮|821|h","姱而不丑兮|821|h","岂不可喜兮|821|h","廓其无求兮|821|h","横而不流兮|821|h","终不失过兮|821|h","梗其有理兮|821|h","置以为像兮|821|h","袅袅兮秋风|823|h","洞庭波兮木叶下|823|h","沅有芷兮澧有兰|823|h","思公子兮未敢言|823|h","荒忽兮远望|823|h","帝高阳之苗裔兮|825|h","摄提贞于孟陬兮|825|h","皇览揆余初度兮|825|h","字余曰灵均|825|h","扈江离与辟芷兮|825|h","汩余若将不及兮|825|h","恐年岁之不吾与|825|h","朝搴阰之木兰兮|825|h","日月忽其不淹兮|825|h","惟草木之零落兮|825|h","不抚壮而弃秽兮|825|h","何不改此度|825|h","乘骐骥以驰骋兮|825|h","宛在水中坻|826|h","宛在水中沚|826|h","俟我于城隅|828|m","匪女之为美|828|m","以燕乐嘉宾之心|829|h","寄与多情客|831|m","料峭春风寒|831|m","独自凭栏久|831|m","归期何太晚|831|m","美人自刎乌江岸|832|m","战火曾烧赤壁山|832|m","将军空老玉门关|832|m","读书人一声长叹|832|m","老瓦盆边笑呵呵|833|m","他出一对鸡|833|m","我出一个鹅|833|m","往常得兴时|834|m","一扫无瑕疵|834|m","我家洗砚池头树|835|m","朵朵花开淡墨痕|835|m","不要人夸好颜色|835|m","只留清气满乾坤|835|m","道是春归人未归|836|m","几日添憔悴|836|m","一春鱼雁无消息|836|m","则见双燕斗衔泥|836|m","两三航未曾着岸|841|m","落花水香茅舍晚|841|m","断桥头卖鱼人散|841|m","山河表里潼关路|842|m","伤心秦汉经行处|842|m","当时奢侈今何处|843|m","只见草萧疏|843|m","至今遗恨迷烟树|843|m","列国周齐秦汉楚|843|m","都变做了土|843|m","对青山强整乌纱|844|m","人老去西风白发|844|m","蝶愁来明日黄花|844|m","醒时诗酒醉时歌|845|m","瑶琴不理抛书卧|845|m","一声梧叶一声秋|846|m","一点芭蕉一点愁|846|m","三更归梦三更后|846|m","叹新丰逆旅淹留|846|m","枕上十年事|846|m","江南二老忧|846|m","冬前冬后几村庄|847|m","溪北溪南两履霜|847|m","树头树底孤山上|847|m","忽相逢缟袂绡裳|847|m","挂绝壁松枯倒倚|848|m","落残霞孤鹜齐飞|848|m","四围不尽山|848|m","一望无穷水|848|m","散西风满天秋意|848|m","夜静云帆月影低|848|m","载我在潇湘画里|848|m","瓦盆边浊酒生涯|849|m","醉里乾坤大|849|m","壶中日月长|849|m","问人间谁是英雄|850|m","有酾酒临江|850|m","更惊起南阳卧龙|850|m","便成名八阵图中|850|m","动高吟楚客秋风|851|m"];
  var S = ["敕勒歌|北朝民歌|北朝","木兰诗|北朝民歌|北朝","木兰辞|佚名|北朝","上邪|汉乐府|汉","五噫歌|梁鸿|汉","十五从军征|佚名|汉","古诗十九首（其一）|佚名|汉","古诗十九首（其二）|佚名|汉","古诗十九首（其四）|佚名|汉","古诗十九首（其五）|佚名|汉","古诗十九首（其九）|佚名|汉","古诗十九首（其十三）|佚名|汉","古诗十九首（其十五）|佚名|汉","古诗十九首（其十九）|佚名|汉","四愁诗（其一）|张衡|汉","垓下歌|项羽|汉","大风歌|刘邦|汉","孔雀东南飞|汉乐府|汉","庭中有奇树|汉乐府|汉","怨歌行|班婕妤|汉","悲歌|佚名|汉","明月皎夜光|汉乐府|汉","有所思|佚名|汉","有所思|汉乐府|汉","江南|汉乐府|汉","涉江采芙蓉|汉乐府|汉","行行重行行|汉乐府|汉","西北有高楼|汉乐府|汉","赠妇诗（其一）|秦嘉|汉","迢迢牵牛星|汉乐府|汉","长歌行|汉乐府|汉","饮马长城窟行|汉乐府|汉","上京舟中|杨慎|明","临江仙|杨慎|明","九日渡江|李东阳|明","京师得家书|袁凯|明","今日诗|文嘉|明","出郊|杨慎|明","别云间|夏完淳|明","咏煤炭|于谦|明","寻胡隐君|高启|明","岳阳楼|杨基|明","春雁|王恭|明","暮春|朱弁|明","朝天子·咏喇叭|王磐|明","江宿|汤显祖|明","渔家|孙蕡|明","石灰吟|于谦|明","观书|于谦|明","题竹|刘基|明","马上作|戚继光|明","之零陵郡次新亭|范云|南北朝","别诗|范云|南北朝","寄王琳|庾信|南北朝","慈姥矶|何逊|南北朝","拟咏怀|庾信|南北朝","数名诗|鲍照|南北朝","断句|刘昶|南北朝","晚登三山还望京邑|谢朓|南北朝","渡河北|王褒|南北朝","相送|何逊|南北朝","答诏问|陶弘景|南北朝","赠范晔诗|陆凯|南北朝","重别周尚书|庾信|南北朝","出塞|徐锡麟|清","十二月十五夜|袁枚|清","咏史|龚自珍|清","塞外杂咏|林则徐|清","墨竹图题诗|郑燮|清","对酒|秋瑾|清","己亥杂诗(九州生气恃风雷)|龚自珍|清","己亥杂诗(浩荡离愁白日斜)|龚自珍|清","己亥杂诗(少年哀乐过于人)|龚自珍|清","己亥杂诗(霜豪掷罢倚天寒)|龚自珍|清","所见|袁枚|清","推窗|袁枚|清","春风|袁枚|清","晓窗|魏源|清","木兰词|纳兰性德|清","村居|高鼎|清","沁园春·长沙|毛泽东|清","沁园春·雪|毛泽东|清","浣溪沙|纳兰性德|清","狱中题壁|谭嗣同|清","竹石|郑燮|清","舟夜书所见|查慎行|清","苔|袁枚|清","蝉|袁枚|清","蝶恋花|纳兰性德|清","论诗|赵翼|清","读陆放翁集|梁启超|清","赋得对月|万梦丹|清","赴戍登程口占示家人|林则徐|清","遣兴|袁枚|清","金缕曲|顾贞观|清","长相思|纳兰性德|清","题临淮方教未申之思堂|袁枚|清","马嵬|袁枚|清","黄海舟中日人索句并见日俄战争地图|秋瑾|清","一剪梅|李清照|宋","三衢道中|曾几|宋","丑奴儿·书博山道中壁|辛弃疾|宋","东栏梨花|苏轼|宋","临安春雨初霁|陆游|宋","临江仙|晏几道|宋","临江仙|苏轼|宋","书愤|陆游|宋","书李世南所画秋景二首（其一）|苏轼|宋","书河上亭壁|寇准|宋","书湖阴先生壁|王安石|宋","伤春|陈与义|宋","偶成|程颢|宋","元日|王安石|宋","八声甘州|柳永|宋","六州歌头|张孝祥|宋","六月二十七日望湖楼醉书|苏轼|宋","六月二十日夜渡海|苏轼|宋","冬夜读书示子聿|陆游|宋","凤凰台上忆吹箫|李清照|宋","初夏游张园|戴敏|宋","初秋行圃|杨万里|宋","剑门道中遇微雨|陆游|宋","劝学诗|朱熹|宋","北山|王安石|宋","十一月四日风雨大作|陆游|宋","南乡子·登京口北固亭有怀|辛弃疾|宋","南浦|王安石|宋","卜算子·咏梅|陆游|宋","卜算子·送鲍浩然之浙东|王观|宋","卜算子·黄州定慧院寓居作|苏轼|宋","即事|汪藻|宋","双双燕·咏燕|史达祖|宋","和子由渑池怀旧|苏轼|宋","四时田园杂兴（其一）|范成大|宋","四时田园杂兴（其二）|范成大|宋","四时田园杂兴（其二十五）|范成大|宋","四时田园杂兴（其四十四）|范成大|宋","声声慢|李清照|宋","夏意|苏舜钦|宋","夏日三首（其一）|张耒|宋","夏日怀友|徐玑|宋","夏日绝句|李清照|宋","夜书所见|叶绍翁|宋","夜坐|张耒|宋","夜泊水村|陆游|宋","天仙子|张先|宋","太常引·建康中秋夜为吕叔潜赋|辛弃疾|宋","好事近|杨万里|宋","如梦令|李清照|宋","如梦令·常记溪亭日暮|李清照|宋","孤桐|王安石|宋","定风波|苏轼|宋","宿新市徐公店|杨万里|宋","寄黄几复|黄庭坚|宋","小池|杨万里|宋","小重山|岳飞|宋","山园小梅|林逋|宋","念奴娇·赤壁怀古|苏轼|宋","念奴娇·过洞庭|张孝祥|宋","悟道诗|某尼|宋","惠崇春江晚景（其二）|苏轼|宋","惠州一绝|苏轼|宋","扬州慢|姜夔|宋","扬州慢·淮左名都|姜夔|宋","插秧歌|杨万里|宋","摸鱼儿|辛弃疾|宋","数日|赵师秀|宋","新凉|徐玑|宋","新城道中（其一）|苏轼|宋","新晴|刘攽|宋","早行|陈与义|宋","春夜|王安石|宋","春宵|苏轼|宋","春日|晁冲之|宋","春日|朱熹|宋","春日|汪藻|宋","春江晚景|苏轼|宋","春游湖|徐俯|宋","昭君怨·咏荷上雨|杨万里|宋","晓出净慈寺送林子方|杨万里|宋","晚春田园杂兴|范成大|宋","暑旱苦热|王令|宋","暗香|姜夔|宋","暮春即事|叶采|宋","有美堂暴雨|苏轼|宋","望江南·超然台作|苏轼|宋","望海潮|柳永|宋","木兰花慢|辛弃疾|宋","村晚|雷震|宋","柳|寇准|宋","桂枝香·金陵怀古|王安石|宋","梅花|王安石|宋","梅花|陈焕|宋","梅花绝句|陆游|宋","正气歌（节选）|文天祥|宋","武陵春|李清照|宋","水口行舟|朱熹|宋","水调歌头·明月几时有|苏轼|宋","水龙吟·次韵章质夫杨花词|苏轼|宋","水龙吟·登建康赏心亭|辛弃疾|宋","永遇乐·京口北固亭怀古|辛弃疾|宋","江上|王安石|宋","江上渔者|范仲淹|宋","江城子·乙卯正月二十日夜记梦|苏轼|宋","江城子·密州出猎|苏轼|宋","江村晚眺|戴复古|宋","池州翠微亭|岳飞|宋","沈园二首（其一）|陆游|宋","沈园二首（其二）|陆游|宋","泊船瓜洲|王安石|宋","洞仙歌|苏轼|宋","浣溪沙|晏殊|宋","浣溪沙|苏轼|宋","海棠|苏轼|宋","淮中晚泊犊头|苏舜钦|宋","淮村兵后|戴复古|宋","清平乐|黄庭坚|宋","清平乐·村居|辛弃疾|宋","渔家傲|李清照|宋","渔家傲·秋思|范仲淹|宋","渔歌子|张志和|宋","游园不值|叶绍翁|宋","游山西村|陆游|宋","满庭芳|秦观|宋","满江红|岳飞|宋","澄迈驿通潮阁二首（其一）|苏轼|宋","点绛唇|姜夔|宋","牡丹|陈与义|宋","玉楼春|刘克庄|宋","玉楼春|欧阳修|宋","琴诗|苏轼|宋","生查子·元夕|欧阳修|宋","病牛|李纲|宋","病起书怀|陆游|宋","登快阁|黄庭坚|宋","登飞来峰|王安石|宋","破阵子|晏殊|宋","破阵子·为陈同甫赋壮词以寄之|辛弃疾|宋","示儿|陆游|宋","秋夜|朱淑真|宋","秋夜将晓出篱门迎凉有感|陆游|宋","秋思|陆游|宋","秋日|程颢|宋","秋月|程颢|宋","约客|赵师秀|宋","绝句|释志南|宋","舟过安仁|杨万里|宋","花影|苏轼|宋","苏幕遮|周邦彦|宋","苏幕遮|范仲淹|宋","菩萨蛮·书江西造口壁|辛弃疾|宋","落梅|刘克庄|宋","落梅|陆游|宋","虞美人·听雨|蒋捷|宋","蚕妇|张俞|宋","蝶恋花|晏殊|宋","蝶恋花|柳永|宋","蝶恋花|欧阳修|宋","蝶恋花·春景|苏轼|宋","襄邑道中|陈与义|宋","西江月·夜行黄沙道中|辛弃疾|宋","西河·金陵怀古|周邦彦|宋","观书有感|朱熹|宋","观书有感（其二）|朱熹|宋","诉衷情|陆游|宋","读史|王安石|宋","贺新郎|辛弃疾|宋","贺新郎·别茂嘉十二弟|辛弃疾|宋","贺新郎·送陈真州子华|刘克庄|宋","赠刘景文|苏轼|宋","踏莎行|欧阳修|宋","踏莎行·郴州旅舍|秦观|宋","过新息留示乡人任大中|苏轼|宋","过松源晨炊漆公店|杨万里|宋","过零丁洋|文天祥|宋","送春|王令|宋","醉花阴|李清照|宋","采桑子|欧阳修|宋","野望|翁卷|宋","钗头凤|陆游|宋","钟山即事|王安石|宋","闲居初夏午睡起|杨万里|宋","雨中登岳阳楼望君山|黄庭坚|宋","雨后池上|刘攽|宋","雨霖铃|柳永|宋","雪梅|卢梅坡|宋","雪梅（其二）|卢梅坡|宋","青玉案|贺铸|宋","青玉案·元夕|辛弃疾|宋","题临安邸|林升|宋","题花山寺壁|苏舜钦|宋","题西林壁|苏轼|宋","题青阳山庄|苏轼|宋","饮湖上初晴后雨|苏轼|宋","鹊桥仙|秦观|宋","鹧鸪天|晏几道|宋","鹧鸪天|辛弃疾|宋","丁寓田家有赠|王维|唐","三台令|戴叔伦|唐","三日寻李九庄|常建|唐","三闾庙|戴叔伦|唐","不见|杜甫|唐","与诸子登岘山|孟浩然|唐","丹青引赠曹霸将军|杜甫|唐","为有|李商隐|唐","丽人行|杜甫|唐","乌夜啼|李煜|唐","乌衣巷|刘禹锡|唐","乐游原|李商隐|唐","九日蓝田崔氏庄|杜甫|唐","九月九日忆山东兄弟|王维|唐","九月九日玄武山旅眺|卢照邻|唐","乞巧|林杰|唐","乡村四月|白居易|唐","乾元中寓居同谷县作歌七首·其二|杜甫|唐","二月二日|李商隐|唐","于易水送人|骆宾王|唐","云|杜牧|唐","从军行|杨炯|唐","从军行|王昌龄|唐","从军行（其二）|王昌龄|唐","从军行（其五）|王昌龄|唐","休假日访王侍御不遇|韦应物|唐","伤田家|聂夷中|唐","使至塞上|王维|唐","元和十年自朗州至京戏赠看花诸君子|刘禹锡|唐","八阵图|杜甫|唐","公子家|聂夷中|唐","兰溪棹歌|戴叔伦|唐","关山月|李白|唐","兵车行|杜甫|唐","再游玄都观|刘禹锡|唐","再经胡城县|杜荀鹤|唐","军行|李白|唐","农家|颜仁郁|唐","凉州词|王之涣|唐","凉州词|王翰|唐","凉思|李商隐|唐","出塞|王昌龄|唐","出塞作|王维|唐","初食笋呈座中|李商隐|唐","利州南渡|温庭筠|唐","别人|王勃|唐","别董大|高适|唐","别董大（其二）|高适|唐","前出塞|杜甫|唐","剑客|贾岛|唐","北青萝|李商隐|唐","十五夜望月|王建|唐","卖炭翁|白居易|唐","南浦别|白居易|唐","南行别弟|韦承庆|唐","卢溪别人|王昌龄|唐","又呈吴郎|杜甫|唐","古从军行|李颀|唐","古剑篇|郭震|唐","古意|李颀|唐","古朗月行（节选）|李白|唐","古柏行|杜甫|唐","叹花|杜牧|唐","同从弟南斋玩月忆山阴崔少府|王昌龄|唐","同谷七歌·其一|杜甫|唐","听张立本女吟|高适|唐","听筝|李端|唐","听董大弹胡笳声兼语弄寄房给事|李颀|唐","听蜀僧濬弹琴|李白|唐","和康五庭芝望月|杜审言|唐","和晋陵陆丞早春游望|杜审言|唐","和王七玉门关听吹笛|高适|唐","和贾舍人早朝大明宫之作|岑参|唐","和贾舍人早朝大明宫之作|王维|唐","咏史|高适|唐","咏怀古迹·其三|杜甫|唐","咏怀古迹五首·其一|杜甫|唐","咏怀古迹五首·其二|杜甫|唐","咏怀古迹五首·其五|杜甫|唐","咏怀古迹五首·其四|杜甫|唐","咏柳|贺知章|唐","咏风|虞世南|唐","咏鹅|骆宾王|唐","咸阳城东楼|许浑|唐","哀江头|杜甫|唐","哀王孙|杜甫|唐","哥舒歌|西鄙人|唐","商山早行|温庭筠|唐","回乡偶书|贺知章|唐","回乡偶书（其二）|贺知章|唐","在狱咏蝉|骆宾王|唐","垂老别|杜甫|唐","城东早春|杨巨源|唐","堤上行三首·其一|刘禹锡|唐","塞上曲|戴叔伦|唐","塞上曲|王昌龄|唐","塞下曲|卢纶|唐","塞下曲（其二）|卢纶|唐","塞下曲|常建|唐","塞下曲六首·其一|卢纶|唐","夜上受降城闻笛|李益|唐","夜宿山寺|李白|唐","夜归鹿门歌|孟浩然|唐","夜雨寄北|李商隐|唐","夜雪|白居易|唐","大林寺桃花|白居易|唐","天末怀李白|杜甫|唐","天涯|李商隐|唐","奉和圣制从蓬莱向兴庆阁道中留春雨中春望之作应制|王维|唐","奉和春日幸望春宫应制|苏颋|唐","奉赠韦左丞丈二十二韵|杜甫|唐","女耕田行|戴叔伦|唐","嫦娥|李商隐|唐","子夜吴歌·冬歌|李白|唐","子夜吴歌·夏歌|李白|唐","子夜吴歌·春歌|李白|唐","子夜吴歌·秋歌|李白|唐","孤雁|杜甫|唐","安定城楼|李商隐|唐","客中行|李白|唐","客至|杜甫|唐","宣州谢脁楼饯别校书叔云|李白|唐","宫词|张祜|唐","宿府|杜甫|唐","宿建德江|孟浩然|唐","宿桐庐江寄广陵旧游|孟浩然|唐","宿王昌龄隐居|常建|唐","宿骆氏亭寄怀崔雍崔衮|李商隐|唐","寄左省杜拾遗|岑参|唐","寄扬州韩绰判官|杜牧|唐","寄李儋元锡|韦应物|唐","寒闺怨|白居易|唐","寒食|韩翃|唐","寒食城东即事|王维|唐","寻南溪常山道人隐居|刘长卿|唐","寻隐者不遇|贾岛|唐","封丘作|高适|唐","将赴吴兴登乐游原一绝|杜牧|唐","将进酒|李白|唐","小寒食舟中作|杜甫|唐","小松|杜荀鹤|唐","小雪|戴叔伦|唐","山中|王勃|唐","山中寡妇|杜荀鹤|唐","山中问答|李白|唐","山居即事|王维|唐","山居秋暝|王维|唐","山房春事|岑参|唐","山行|杜牧|唐","岁夜咏怀|刘禹锡|唐","岁暮归南山|孟浩然|唐","岭上逢久别者又别|权德舆|唐","左迁至蓝关示侄孙湘|韩愈|唐","已凉|韩偓|唐","幽居|韦应物|唐","庐山瀑布|李白|唐","庐山谣寄卢侍御虚舟|李白|唐","度荆门望楚|陈子昂|唐","弹琴|刘长卿|唐","归嵩山作|王维|唐","归燕诗|张九龄|唐","归雁|杜甫|唐","微雨夜行|白居易|唐","忆梅|李商隐|唐","忆江南|白居易|唐","忆江南（其二）|白居易|唐","怨情|李白|唐","悯农（其二）|李绅|唐","悯农（其一）|李绅|唐","感遇|张九龄|唐","感遇三十八首（其二）|陈子昂|唐","戏为六绝句·其一|杜甫|唐","戏为六绝句·其二|杜甫|唐","房兵曹胡马|杜甫|唐","把酒问月|李白|唐","投赠哥舒开府翰二十韵|杜甫|唐","拜新月|李端|唐","敕赐百官樱桃|王维|唐","新婚别|杜甫|唐","新嫁娘词|王建|唐","新安吏|杜甫|唐","新年作|刘长卿|唐","新晴野望|王维|唐","旅夜书怀|杜甫|唐","无家别|杜甫|唐","无题|李商隐|唐","无题·昨夜星辰昨夜风|李商隐|唐","早发白帝城|李白|唐","早寒江上有怀|孟浩然|唐","早春呈水部张十八员外|韩愈|唐","早梅|张谓|唐","春中田园作|王维|唐","春兴|武元衡|唐","春夜别友人|陈子昂|唐","春夜喜雨|杜甫|唐","春宫怨|杜荀鹤|唐","春思|李白|唐","春怨|刘方平|唐","春怨|金昌绪|唐","春晓|孟浩然|唐","春望|杜甫|唐","春梦|岑参|唐","春江花月夜|张若虚|唐","春泛若耶溪|綦毋潜|唐","春行即兴|李华|唐","春闺|崔道融|唐","春雨|李商隐|唐","春雪|东方虬|唐","春雪|韩愈|唐","晚春|韩愈|唐","晚晴|李商隐|唐","晚次乐乡县|陈子昂|唐","暮江吟|白居易|唐","暮过山村|贾岛|唐","曲池荷|卢照邻|唐","月下独酌|李白|唐","月夕|崔道融|唐","月夜|刘方平|唐","月夜|杜甫|唐","月夜忆舍弟|杜甫|唐","有所思|杨炯|唐","望天门山|李白|唐","望岳|杜甫|唐","望庐山五老峰|李白|唐","望庐山瀑布|李白|唐","望月怀远|张九龄|唐","望月有感|白居易|唐","望洞庭|刘禹锡|唐","望洞庭湖赠张丞相|孟浩然|唐","望蓟门|祖咏|唐","未展芭蕉|钱珝|唐","杂诗三首（其三）|沈佺期|唐","李凭箜篌引|李贺|唐","村夜|白居易|唐","杨柳枝词九首·其一|刘禹锡|唐","枫桥夜泊|张继|唐","柳|李商隐|唐","桃源行|王维|唐","梅花|崔道融|唐","梅花落|卢照邻|唐","梦天|李贺|唐","梦游天姥吟留别|李白|唐","次北固山下|王湾|唐","汉江临泛|王维|唐","江乡故人偶集客舍|戴叔伦|唐","江亭夜月送别|王勃|唐","江南春|杜牧|唐","江南曲|李益|唐","江南逢李龟年|杜甫|唐","江村即事|司空曙|唐","江汉|杜甫|唐","江畔独步寻花|杜甫|唐","江行无题|钱珝|唐","江雪|柳宗元|唐","池上|白居易|唐","汾上惊秋|苏颋|唐","泊秦淮|杜牧|唐","泛渭州|王维|唐","泾溪|杜荀鹤|唐","洗兵马|杜甫|唐","洛阳女儿行|王维|唐","浪淘沙|刘禹锡|唐","浪淘沙|李煜|唐","浪淘沙·其八|刘禹锡|唐","淮上喜会梁川故人|韦应物|唐","深渡驿|张说|唐","清平乐·别来春半|李煜|唐","清明|杜牧|唐","清明日宴梅道士房|孟浩然|唐","渔翁|柳宗元|唐","渡汉江|宋之问|唐","渡湘江|杜审言|唐","渡荆门送别|李白|唐","渭城曲|王维|唐","渭川田家|王维|唐","游子吟|孟郊|唐","渼陂行|杜甫|唐","湖口望庐山瀑布水|张九龄|唐","溪居即事|崔道融|唐","滁州西涧|韦应物|唐","滕王阁诗|王勃|唐","漫成|李商隐|唐","漫成一首|杜甫|唐","潼关吏|杜甫|唐","燕子来舟中作|杜甫|唐","燕歌行|高适|唐","独不见|沈佺期|唐","独坐敬亭山|李白|唐","玉台体|权德舆|唐","琵琶行|白居易|唐","琵琶行并序|白居易|唐","瑶瑟怨|温庭筠|唐","田家|聂夷中|唐","画|王维|唐","画鹰|杜甫|唐","留别王侍御维|孟浩然|唐","登城春望|王勃|唐","登岳阳楼|杜甫|唐","登幽州台歌|陈子昂|唐","登柳州城楼寄漳汀封连四州|柳宗元|唐","登楼|杜甫|唐","登楼寄王卿|韦应物|唐","登高|杜甫|唐","登鹳雀楼|王之涣|唐","白云泉|白居易|唐","白帝|杜甫|唐","白雪歌送武判官归京|岑参|唐","百忧集行|杜甫|唐","相见欢|李煜|唐","石壕吏|杜甫|唐","石头城|刘禹锡|唐","碛中作|岑参|唐","碧涧驿晓思|温庭筠|唐","禹庙|杜甫|唐","离思五首（其四）|元稹|唐","秋兴八首·其一|杜甫|唐","秋夕|杜牧|唐","秋夜寄邱员外|韦应物|唐","秋思|张籍|唐","秋日登吴公台上寺远眺|刘长卿|唐","秋浦歌|李白|唐","秋登万山寄张五|孟浩然|唐","秋登宣城谢脁北楼|李白|唐","秋词|刘禹锡|唐","秋霁|崔道融|唐","秋风引|刘禹锡|唐","秦中感秋寄远上人|孟浩然|唐","积雨辋川庄作|王维|唐","端居|李商隐|唐","竹枝词|刘禹锡|唐","竹里馆|王维|唐","答陆澧|朱放|唐","筹笔驿|李商隐|唐","紫薇花|杜牧|唐","红线毯|白居易|唐","终南别业|王维|唐","终南山|王维|唐","终南望余雪|祖咏|唐","结客少年场行|虞世南|唐","绝句|杜甫|唐","绝句二首（其一）|杜甫|唐","绝句二首·其二|杜甫|唐","绝句漫兴九首·其一|杜甫|唐","绝句漫兴九首·其三|杜甫|唐","老将行|王维|唐","自君之出矣|张九龄|唐","自遣|罗隐|唐","芙蓉楼送辛渐|王昌龄|唐","苏台览古|李白|唐","苏武庙|温庭筠|唐","苏溪亭|戴叔伦|唐","茅屋为秋风所破歌|杜甫|唐","菊花|元稹|唐","菊花|黄巢|唐","菩萨蛮|温庭筠|唐","营州歌|高适|唐","落花|李商隐|唐","虞美人|李煜|唐","蚕妇|杜荀鹤|唐","蜀先主庙|刘禹锡|唐","蜀相|杜甫|唐","蜀道后期|张说|唐","蜀道难|李白|唐","蜂|罗隐|唐","蝉|李商隐|唐","蝉|虞世南|唐","行军九日思长安故园|岑参|唐","行宫|元稹|唐","行路难|李白|唐","行路难（其一）|李白|唐","行路难·其二|李白|唐","西塞山怀古|刘禹锡|唐","西施|罗隐|唐","西施咏|王维|唐","西施滩|崔道融|唐","观公孙大娘弟子舞剑器行|杜甫|唐","观刈麦|白居易|唐","观游鱼|白居易|唐","观猎|王维|唐","调笑令·胡马|韦应物|唐","谢亭送别|许浑|唐","贫交行|杜甫|唐","贾生|李商隐|唐","赋得古原草送别|白居易|唐","赋得暮雨送李胄|韦应物|唐","赋得鸡|李商隐|唐","赠别|杜牧|唐","赠别二首·其一|杜牧|唐","赠少年|温庭筠|唐","赠汪伦|李白|唐","赠花卿|杜甫|唐","赠苏书记|杜审言|唐","赠质上人|杜荀鹤|唐","赤壁|杜牧|唐","走马川行奉送封大夫出师西征|岑参|唐","越中览古|李白|唐","辋川闲居|王维|唐","辋川闲居赠裴秀才迪|王维|唐","辋川集·南垞|王维|唐","辋川集·辛夷坞|王维|唐","过分水岭|温庭筠|唐","过华清宫|杜牧|唐","过故人庄|孟浩然|唐","过陈琳墓|温庭筠|唐","过香积寺|王维|唐","近试上张水部|朱庆馀|唐","送人东游|温庭筠|唐","送人游吴|杜荀鹤|唐","送兄|七岁女|唐","送别|王维|唐","送友人|李白|唐","送孔巢父谢病归游江东兼呈李白|杜甫|唐","送李判官之润州行营|刘长卿|唐","送杜少府之任蜀州|王勃|唐","送柴侍御|王昌龄|唐","送梁六自洞庭山|张说|唐","送梓州李使君|王维|唐","送灵澈上人|刘长卿|唐","送綦毋潜落第还乡|王维|唐","送魏万之京|李颀|唐","送魏二|王昌龄|唐","逢入京使|岑参|唐","逢雪宿芙蓉山主人|刘长卿|唐","遗爱寺|白居易|唐","遣怀|杜牧|唐","邙山|沈佺期|唐","酬乐天扬州初逢席上见赠|刘禹锡|唐","酬张少府|王维|唐","醉时歌|杜甫|唐","醉歌行|杜甫|唐","采莲曲|王昌龄|唐","重送裴郎中贬吉州|刘长卿|唐","野望|王绩|唐","金缕衣|杜秋娘|唐","金谷园|杜牧|唐","钱塘湖春行|白居易|唐","锦瑟|李商隐|唐","长信怨|王昌龄|唐","长安古意|卢照邻|唐","长安遇冯著|韦应物|唐","长干行·其一|李白|唐","长恨歌|白居易|唐","长柳|王勃|唐","问刘十九|白居易|唐","闺怨|王昌龄|唐","闺情|李端|唐","闻官军收河南河北|杜甫|唐","闻王昌龄左迁龙标遥有此寄|李白|唐","阁夜|杜甫|唐","除夜作|高适|唐","除夜宿石头驿|戴叔伦|唐","隋宫|李商隐|唐","雁门太守行|李贺|唐","雨过山村|王建|唐","雪|罗隐|唐","霜月|李商隐|唐","青溪|王维|唐","静夜思|李白|唐","韦讽录事宅观曹将军画马图|杜甫|唐","题三闾大夫庙|戴叔伦|唐","题乌江亭|杜牧|唐","题李凝幽居|贾岛|唐","题破山寺后禅院|常建|唐","题稚川山水|戴叔伦|唐","题菊花|黄巢|唐","题都城南庄|崔护|唐","题金陵渡|张祜|唐","题长安壁主人|张谓|唐","风|李峤|唐","风雨|李商隐|唐","饯别王十一南游|刘长卿|唐","马嵬二首·其二|李商隐|唐","马嵬坡|郑畋|唐","马诗二十三首（其五）|李贺|唐","马诗二十三首（其四）|李贺|唐","马诗二十三首（其一）|李贺|唐","鸟鸣涧|王维|唐","鸡|崔道融|唐","鹿柴|王维|唐","黄鹤楼|崔颢|唐","黄鹤楼送孟浩然之广陵|李白|唐","七步诗|曹植|魏晋","乞食|陶渊明|魏晋","咏荆轲|陶渊明|魏晋","咏贫士|陶渊明|魏晋","庚戌岁九月中于西田获早稻|陶渊明|魏晋","归园田居(其一)|陶渊明|魏晋","归园田居(其三)|陶渊明|魏晋","归园田居（其三）|陶渊明|魏晋","归鸟|陶渊明|魏晋","拟古|陶渊明|魏晋","杂诗|曹丕|魏晋","杂诗|陶渊明|魏晋","燕歌行|曹丕|魏晋","癸卯岁始春怀古田舍|陶渊明|魏晋","白马篇|曹植|魏晋","短歌行|曹操|魏晋","移居|陶渊明|魏晋","移居(其二)|陶渊明|魏晋","美女篇|曹植|魏晋","蒿里行|曹操|魏晋","观沧海|曹操|魏晋","读山海经|陶渊明|魏晋","读山海经·其十|陶渊明|魏晋","责子|陶渊明|魏晋","赠白马王彪|曹植|魏晋","饮酒(其五)|陶渊明|魏晋","饮酒(其四)|陶渊明|魏晋","饮酒(其十四)|陶渊明|魏晋","龟虽寿|曹操|魏晋","九歌·山鬼|屈原|先秦","关雎|佚名|先秦","击壤歌|佚名|先秦","国殇|屈原|先秦","国风·桃夭|诗经|先秦","国风·相鼠|诗经|先秦","国风·采薇|诗经|先秦","国风·黍离|诗经|先秦","大雅·文王|诗经|先秦","天问(节选)|屈原|先秦","小雅·鹿鸣|诗经|先秦","弹歌|佚名|先秦","易水歌|荆轲|先秦","木瓜|佚名|先秦","橘颂|屈原|先秦","氓|佚名|先秦","湘夫人|屈原|先秦","硕鼠|诗经|先秦","离骚(节选)|屈原|先秦","蒹葭|佚名|先秦","采薇|佚名|先秦","静女|佚名|先秦","鹿鸣|佚名|先秦","黍离|佚名|先秦","凭栏人|姚燧|元","卖花声·怀古|张可久|元","四块玉·闲适|关汉卿|元","塞鸿秋|贯云石|元","墨梅|王冕|元","大德歌·春|关汉卿|元","天净沙·冬|白朴|元","天净沙·春|白朴|元","天净沙·秋|白朴|元","天净沙·秋思|马致远|元","寿阳曲·远浦帆归|马致远|元","山坡羊·潼关怀古|张养浩|元","山坡羊·骊山怀古|张养浩|元","折桂令|张可久|元","殿前欢|阿里西瑛|元","水仙子·夜雨|徐再思|元","水仙子·寻梅|乔吉|元","沉醉东风·秋景|白朴|元","沉醉东风·闲居|卢挚|元","蟾宫曲|阿鲁威|元","蟾宫曲·扬州|阿鲁威|元"];
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

function create(level, keyword, rng, difficulty, reserve) {
  const cfg = LEVELS[level] || LEVELS.normal;
  return {
    cfg,
    level,
    rng,
    difficulty: difficulty || 'mixed',
    reserve: reserve instanceof Set ? reserve : new Set(reserve || []),
    hand: deal(cfg.hand, keyword, [], rng, difficulty || 'mixed', reserve),
  };
}

/**
 * 按关键字+难度发牌：从未用、含字的池里抽 handSize 句。
 * difficulty: 'e'|'m'|'h' 按学段三档过滤；'mixed' 不限档。
 * reserve（2026-11-20）：预留句文本集合（教学局的三句教学脚本）——AI 手牌
 * 绝不许占用，否则教学回合脚本发牌 used.has(spec.line) 命中回落常规发牌、旧提示复读。
 * 档内不足则逐级放宽到全档（v1.4 §2.6 池空兜底精神，禁止 random([])）。
 */
function deal(handSize, keyword, usedKeys, rng, difficulty, reserve) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  const reserved = reserve instanceof Set ? reserve : new Set(reserve || []);
  const byLevel = lv => (corpus.char_index[keyword] || [])
    .filter(i => !used.has(lineText(i)) && !reserved.has(lineText(i))
      && (lv === undefined || corpus.lines[i].split('|')[2] === lv));
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
    const more = deal(1, keyword, usedKeys, rng, ai.difficulty, ai.reserve);
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
    // 2026-11-20 修「教学局提示复读」根因：AI 手牌预留三句教学脚本——否则诗童可抢先
    // 接走脚本句（如「月落乌啼霜满天」），第 3 回合脚本发牌 used.has 命中回落常规发牌
    const tutorialReserve = tutorial ? C.TUTORIAL_ROUNDS.map(r => r.line) : [];
    this.ai = aiLib.create(this.cfg.aiLevel, this.keyword, this.rng, this.cfg.aiDifficulty, tutorialReserve);
    this.roundSeq = 0;                  // 已完成回合数
    this.playerHits = 0; this.tigerHits = 0;
    this.timeouts = 0;                  // 玩家超时回合数（本回合判负分，不终局）
    this.skipAITurn = false;            // 超时回合跳过诗童出句
    this.combo = 0; this.maxCombo = 0;
    this.reactSum = 0; this.reactN = 0;
    this.lastPlayerLine = null; this.lastTigerLine = null;
    // 本局亮过的真句（玩家接对 + 诗童接对，去重保序）——结算页「诗笺」取释义用
    this.roundLines = [];
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
    this.revengeKills = [];             // 本局雪耻成功的错句文本（结算回写错题本）
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
          // 脚本回落（2026-11-20 修提示复读）：常规发牌没有教学提示，必须清掉上一回合
          // 的旧 hint/tip，否则 UI 继续展示过期文案（真机/冒烟均复现过）
          this.tutorialHint = null;
          this.tutorialTip = null;
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
      // 本局亮过的句子（诗笺释义的取数口径；最多 12 句，够两页卡）
      lines: this.roundLines.slice(0, 12),
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
    // 玩家回合结束 → AI 回合（错句复仇：优先甩错题本错句，压过普通出句）
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
              if (this.roundLines.indexOf(t) < 0) this.roundLines.push(t);
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
      if (this.roundLines.indexOf(text) < 0) this.roundLines.push(text);
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
    // v1.4 §2.6.6 换字重置手牌；教学局脚本句预留保持（换字后教学脚本随旧字作废，
    // 但预留无害——脚本句不含新令字本就不可能在手牌）
    this.ai = aiLib.create(this.cfg.aiLevel, next, this.rng, this.cfg.aiDifficulty, this.cfg.tutorial ? C.TUTORIAL_ROUNDS.map(r => r.line) : []);
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
      // 错句复仇：甩出错句后挂起的雪耻回合（上句区「错题本」签 + 反杀翻倍 UI 依据）
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
    // 2026-11-20 修：原实现无条件 Math.random 覆盖，smoke/测试传入的 params.seed
    // 被丢弃 → 冒烟不可复现（教学局提示复读是种子相关的间歇 bug，被随机性掩盖）。
    // 传了 seed 就用传入值；线上不传才走随机。
    seed: (params && params.seed != null) ? params.seed : (Math.random() * 0xFFFFFFFF) >>> 0,
    excludeKeywords: store.recentKeywords(),
    // 错句复仇 MVP（2026-11-19）：已熟成的错题本条目交给诗童（教学局不带）
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
            // 错句复仇：雪耻数 / 新入错题本数（行为数值，无文本）
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
      // 2026-11-20：亮相大字同因收敛（240px 设计值实测可到 ~260，压装饰线）→ 限宽 214
      const heroFs = d.fitSize(ctx, snap.keyword, 700, T.fs.hero, 'serif', 214);
      ctx.font = font(700, heroFs, 'serif');
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
    pet.setBox(sh.bustWin, 'bust');
    const tDraw = app.settings.reduceMotion ? 0.5 : t;
    const petOff = pet.offset();
    const pz = pet.pose();
    ctx.save();
    const petPivX = sh.bustWin.x + sh.bustWin.w / 2, petPivY = sh.bustWin.y + sh.bustWin.h;
    ctx.translate(petPivX + petOff.dx, petPivY + petOff.dy);
    ctx.rotate(petOff.rot);
    if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
    ctx.translate(-petPivX, -petPivY);
    tiger.bust(ctx, { win: sh.bustWin, state: pz.state || tigerState(snap), t: tDraw, phase: pz.phase });
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
        // 2026-11-21 「仇册」更名「错题本」：标签由「【仇册】诗童 · 」改为「【错题本】」，
        // 去掉「诗童 · 」抵掉多出的 3 个字宽（上句区 351px 固定 22px 字，长句否则会被省略成「…」）
        d.text(ctx, (rev ? '【错题本】' : '诗童 · ') + snap.feedback.text, tb.x, tb.y + 11,
          font(400, 22, 'sans'), rev ? c.danger : c.fg2, { maxW: tb.w });
      } else if (snap.phase === 'aiFeedback' && snap.feedback && snap.feedback.kind === 'aiFail') {
        d.text(ctx, '诗童 没接上', tb.x, tb.y + 11, font(400, 22, 'sans'), c.success, { maxW: tb.w });
      } else if (lastShown) {
        // 悬着的错题回合：上一拍诗童甩了你的错题，提示持续可见直到你接上
        const rev = snap.revenge && !snap.revenge.avenged;
        d.text(ctx, (rev ? '【错题本】' : '诗童 · ') + lastShown, tb.x, tb.y + 11,
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
        lineTxt = (snap.revenge && !snap.revenge.avenged ? '【错题本】' : '诗童接：') + snap.feedback.text;
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
        // 三版沙雕音：pet.soundFor 统一映射（head=purr/snore，paw=chirp/laugh）
        sound.play(pet.soundFor(zone, pet._fx() && pet._fx().combo));
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
    // 2026-11-20 真机截图：120px 令字溢出 116px 内框（真机字体度量偏大）
    // → fitSize 按实测宽收敛（限宽 96，内框留呼吸）
    const kwFs = d.fitSize(g, snap.keyword, 700, T.fs.keyword, 'serif', 96);
    d.text(g, snap.keyword, sh.keyword.cx, sh.keyword.mid, font(700, kwFs, 'serif'), c.onBrand, { align: 'center' });
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
  // 从诗笺返回时不重复结算（enter() 里 applyOutcome 会把局数再加一次）
  const noSave = !!(params && params.noSave);

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
      // 2026-11-20 真机追问「12 回合怎么比分 13」：雪耻反杀翻倍奖励 +1 不计回合，
      // 比分可超回合数 → 判定行点名解释（结算 stats 的「雪耻 N」已有对应数字）
      roundsFull: `${s.rounds || 12} 回合满 · 接对多者胜`
        + (s.revenge && s.revenge.kills > 0 ? `（雪耻奖励 +${s.revenge.kills}）` : ''),
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
      saved = noSave ? true : store.applyOutcome(outcome);
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
      const pz = pet.pose();
      ctx.save();
      const pivX2 = tg2.x + 400 * tg2.scale / 2, pivY2 = tg2.y + 560 * tg2.scale;
      ctx.translate(pivX2 + petOff.dx, pivY2 + petOff.dy);
      ctx.rotate(petOff.rot);
      if (petOff.sx !== 1 || petOff.sy !== 1) ctx.scale(petOff.sx, petOff.sy);
      ctx.translate(-pivX2, -pivY2);
      tiger.fullBody(ctx, { cx: L.tiger.x + 400 * L.tiger.scale / 2, y0: L.tiger.y, scale: L.tiger.scale, state: pz.state || m.state, t: st, phase: pz.phase });
      ctx.restore();
      pet.draw(ctx);

      // 入场动画（du.slow 420ms：alpha 0→1 + y+12→0；减弱动效只 alpha 180ms）
      const dur = app.settings.reduceMotion ? 0.18 : T.du.slow / 1000;
      const p = Math.min(enterT / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      ctx.save();
      ctx.globalAlpha = ease;
      const dy = app.settings.reduceMotion ? 0 : 12 * (1 - ease);
      // 结果字（设计 96px；「胜」时 2px 金方框，不实底）
      // 2026-11-20 真机截图：「胜」溢出 97px 金框（真机字体度量偏大 1.1–1.2 倍）
      // → fitSize 按实测宽收敛字号（限宽 82，框内留 ~7px 呼吸）；
      //   入场加 back-out 弹性缩放（0.86→过冲→1），亮相更有「盖章」感
      const rc = L.resultChar;
      if (outcome.result === 'win') {
        ctx.lineWidth = 2; ctx.strokeStyle = c.gold;
        ctx.strokeRect(rc.cx - 48.5, rc.mid - 48.5 + dy, 97, 97);
      }
      const charFs = d.fitSize(ctx, m.char, 700, T.fs.result, 'serif', 82);
      const backOut = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
      const pop = app.settings.reduceMotion ? 1 : 0.86 + 0.14 * backOut;
      ctx.save();
      ctx.translate(rc.cx, rc.mid + dy);
      ctx.scale(pop, pop);
      d.text(ctx, m.char, 0, 0, font(700, charFs, 'serif'), m.color(c), { align: 'center' });
      ctx.restore();
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
      // 回顾卡内容（2026-11-20 真机同因：令字印章字溢出内框 → fitSize 收敛）
      const miniFs = d.fitSize(ctx, s.keyword, 600, 38, 'serif', 34);
      d.seal(ctx, L.miniSeal.x, L.miniSeal.y, L.miniSeal.size, c.primary, 'rgba(255,249,236,0.35)',
        s.keyword, font(600, miniFs, 'serif'), c.onBrand);
      d.text(ctx, '我', L.rowMe.label.x, L.rowMe.label.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
      d.text(ctx, lastPlayer || '—', L.rowMe.text.x, L.rowMe.text.y + 14, font(400, 24, 'serif'), c.fg, { maxW: L.rowMe.text.w });
      d.text(ctx, '诗童', L.rowTiger.label.x, L.rowTiger.label.y + 10, font(400, T.scaled('caption', S), 'sans'), c.fg2);
      d.text(ctx, lastTiger || '—', L.rowTiger.text.x, L.rowTiger.text.y + 14, font(400, 24, 'serif'), c.fg, { maxW: L.rowTiger.text.w });
      // 判定原因行（回顾卡底部）
      // 2026-11-21：长文案（雪耻奖励 +N）在 375 屏会溢出屏缘（无头截图实锤）→ 三档降字号 + maxW 兜底
      const rt = reasonText();
      if (rt) {
        const rtFull = '判定：' + rt;
        let rtFs = T.scaled('caption', S);
        if (d.textWidth(ctx, rtFull, font(400, rtFs, 'sans')) > app.info.W - 24) {
          rtFs = [18, 16, 15].find(fs => d.textWidth(ctx, rtFull, font(400, fs, 'sans')) <= app.info.W - 24) || 15;
        }
        d.text(ctx, rtFull, L.review.x + L.review.w / 2, L.reasonMid, font(400, rtFs, 'sans'), c.fg2, { align: 'center', maxW: app.info.W - 24 });
      }
      // 诗笺入口（2026-11-21）：右侧竖排书签「诗笺 v」——对局结束顺手把这几句讲明白
      const gb = L.glossBtn;
      ctx.beginPath();
      ctx.moveTo(gb.x - 6, gb.y + 6); ctx.lineTo(gb.x - 6, gb.y + 70);
      ctx.lineWidth = T.st.hair; ctx.strokeStyle = c.lineSoft; ctx.stroke();
      d.text(ctx, '诗', gb.x + gb.w / 2, gb.y + 18, font(400, 17, 'serif'), c.primary, { align: 'center' });
      d.text(ctx, '笺', gb.x + gb.w / 2, gb.y + 41, font(400, 17, 'serif'), c.primary, { align: 'center' });
      ctx.beginPath();
      ctx.moveTo(gb.x + gb.w / 2 - 4.5, gb.y + 58); ctx.lineTo(gb.x + gb.w / 2, gb.y + 63); ctx.lineTo(gb.x + gb.w / 2 + 4.5, gb.y + 58);
      ctx.lineWidth = 1.5; ctx.strokeStyle = c.primary; ctx.stroke();
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
          : pressed.id === 'result.gloss' ? [L.glossBtn.x - 8, L.glossBtn.y, L.glossBtn.w + 8, L.glossBtn.h]
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
          // 三版沙雕音：pet.soundFor 统一映射（含连击过载 snore/laugh）
          sound.play(pet.soundFor(zone, pet._fx() && pet._fx().combo));
          track.track('fhl_pet', { zone: zone === 'head' ? 1 : zone === 'belly' ? 2 : 3, scr: 3 });
        }
        return;
      }
      if (hit === 'result.gloss') {
        // 进诗笺看本局诗句释义（回程带 noSave，避免重复计局）
        app.goto('gloss', { outcome });
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
__reg("src/data/gloss.js", function (module, exports, require) {
'use strict';
/**
 * 诗笺释义（样板 24 句，2026-11-21）
 *
 * 定位：小游戏 → 学习工具的那一层内容。**只做直译，不做赏析**——
 * 直译错了顶多生硬，赏析错了就是硬伤（典故/通假/创作背景是模型最容易编的三块）。
 * 有典故的句子一律只解字面，不讲来历。
 *
 * 字段：{ g: 一句白话（≤30 字）, n: 字词易错点（可选，≤24 字） }
 * key = 原句，必须等于 corpus 的 norm_key（无标点、无空格的纯汉字串）。
 * 出处不在这里存——用 corpus.norm_index 反查 lines[].sourceIdx，避免两处抄写漂移。
 *
 * 覆盖：八个令字（人山风月春花天水）× 三档（易/中/难）各一句。
 * 铺量目标 1618 句（八令字全部可达句子），先以 24 句验证质量与形态。
 *
 * 依据来源（2026-11-21 补，用户追问「明月几时有」出处后立此规矩）：
 *   白话**不是**照抄某一本书，是编者按通行译法改写的。取法：
 *   ① 字词义项——人教版/部编版教材注释、《汉语大词典》；
 *   ② 句意——中华书局、上海古籍一路校注本的通说；
 *   ③ 有争议的解读只取教材通行一说，并在 n 里点破最易被误读的方向；
 *   ④ 原句是问句的，白话必须保留问号（问句译成陈述句会丢掉整句的语气，
 *      「明月几时有」就是被这么写坏的）；
 *   ⑤ 单句不足自明时，允许在 n 里补半句上下文（如「把酒问青天」）。
 *   铺量到 1618 句时必须逐句对注本，不得凭语感生成；用户抽检发现的方向性错误，
 *   视为数据缺陷而非文案瑕疵，要回查同批条目。
 */
module.exports = {
  // ---------------- 人 ----------------
  '恐惊天上人': { g: '怕惊动了天上的仙人。', n: '「恐」是怕，不是「恐怕」。' },
  '思君令人老': { g: '思念你，让人一天天老去。', n: '「令」是使、让。' },
  '落花人独立': { g: '落花里，独自站着一个人。', n: '省略了「于」：落花中，人独立。' },

  // ---------------- 山 ----------------
  '楚水燕山万里长': { g: '楚地的水、燕地的山，相隔万里之遥。', n: '楚水、燕山是两地代称，泛指路远。' },
  '力拔山兮气盖世': { g: '力气能拔起山，气概盖过当世。', n: '「兮」是语气词，相当于「啊」。' },
  '青山依旧在': { g: '青山还是那座青山，依旧在那里。', n: '下接「几度夕阳红」：山河不变，世事已改。' },

  // ---------------- 风 ----------------
  '春风一夜到衡阳': { g: '一夜之间，春风就吹到了衡阳。', n: '「到」是吹到，写春风来得快。' },
  '风吹草低见牛羊': { g: '风吹得草伏下去，露出成群的牛羊。', n: '「见」读 xiàn，同「现」，露出。' },
  '谁念西风独自凉': { g: '有谁惦念西风里独自受凉的人？', n: '「念」是惦念，不是「想」。' },

  // ---------------- 月 ----------------
  '月照一天雪': { g: '月光照着一整片雪。', n: '「一天」是满天、整片，不是一天时间。' },
  '岁月忽已晚': { g: '一年将尽，忽然就到了岁暮。', n: '「岁月」这里指年岁、时光。' },
  // 2026-11-21 用户质疑本句释义后重写：问句不得译成陈述句；「开始有的」有口语歧义（像问家禽家畜），
  // 且丢了「把酒问青天」的动作。方向仍取教材通说（问月亮何时存在），在 n 里直接堵住常见误读。
  '明月几时有': { g: '这轮明月，是从什么时候起就有的？', n: '问月亮何时起就存在，不是问今晚何时出来。' },
  // 2026-11-21 补：长诗路径用例——《长恨歌》全诗 960 字，没有收录句时诗笺永远进不来
  '天生丽质难自弃': { g: '天生美丽，想藏也藏不住。', n: '「难自弃」是难以自我埋没。' },

  // ---------------- 春 ----------------
  '春风江上路': { g: '春风里，走在江边的路上。', n: '省略主语，是诗人自己在赶路。' },
  '聊赠一枝春': { g: '姑且送你一枝梅花，当作一枝春天。', n: '「聊」是姑且；「一枝春」指梅花。' },
  '小楼一夜听春雨': { g: '在小楼上听了一整夜的春雨。', n: '「一夜」写整夜未眠。' },

  // ---------------- 花 ----------------
  '苔花如米小': { g: '苔藓开的花，小得像米粒。', n: '「如」是像，不是「如果」。' },
  '化作春泥更护花': { g: '落花化作春泥，还在护着新开的花。', n: '「更」是更加、仍然。' },
  '花自飘零水自流': { g: '花自顾自地飘落，水自顾自地流走。', n: '「自」是各自、自顾自，写无可奈何。' },

  // ---------------- 天 ----------------
  '草长莺飞二月天': { g: '二月里，草木生长、黄莺飞舞。', n: '「天」这里指时节、天气。' },
  '各在天一涯': { g: '各自在天的一边，相隔遥远。', n: '「涯」是边际；「天一涯」即天的一角。' },
  '天际识归舟': { g: '在天边认出了归来的船。', n: '「识」是辨认出，不是「认识」。' },

  // ---------------- 水 ----------------
  '江水三千里': { g: '江水迢迢三千里，写离家之远。', n: '「三千里」是虚指，形容路远。' },
  '盈盈一水间': { g: '只隔着清清浅浅的一条水。', n: '「盈盈」形容水清浅；「间」是隔开。' },
  '滚滚长江东逝水': { g: '长江水滚滚地向东流去。', n: '「逝」是流去，也含时光流逝之意。' },
};

});
__reg("src/data/poem_gloss.js", function (module, exports, require) {
'use strict';
/**
 * 整首串讲（诗级解读，2026-11-21 样板 20 首）
 *
 * 为什么要有这一层：单句直译离开上下文会被读歪——「明月几时有」单独看像在问
 * 「今晚月亮几点出来」，放回《水调歌头》才知道是举杯问天。诗笺从「一句一页」
 * 改成「一首一页」后，全诗 + 串讲才是学习工具该有的形态，单句直译降为第三层。
 *
 * 写法红线（承接 src/data/gloss.js）：**只做内容串讲，不做赏析**。
 *   ① 讲这首诗写了什么、从哪写到哪、转折在哪——相当于把全诗用白话说一遍；
 *   ② 不做艺术手法分析（不提「以乐景写哀」「虚实结合」这类术语）；
 *   ③ 不做创作背景演绎：只有作者小序/题名自带的信息（如「丙辰中秋」）才写；
 *   ④ 典故只解字面（「赌书泼茶」就说成夫妻间的雅趣，不考据出处）；
 *   ⑤ 有争议的解读不写，宁少不编。
 *
 * 字段：{ g: 串讲（≤170 字） }
 * key = "题名|作者"，与 corpus.sources 前两段严格一致（题名以语料为准，不用别本异名）。
 * 未收录的诗：页面上只显示全诗，串讲位留「讲解还在整理」——样板期允许，铺量补齐。
 */
module.exports = {
  // ---------------- 人 ----------------
  '夜宿山寺|李白': { g: '夜里住在山顶的寺庙。楼高得伸手就能摘到星星；诗人不敢大声说话，怕惊动了天上的人。四句都在写「高」，却一次也没说高——靠摘星、怕惊天人这些夸张的想象，让读的人自己觉得高。' },
  '古诗十九首（其一）|佚名': { g: '写远别与等待。开头走了一程又一程，还是分开了；相隔万里，各在天边。胡马依恋北风、越鸟筑巢南枝，物尚且恋旧，人却越走越远。末尾落到自己：想你想到老，一年又快完了——什么也别说了，只愿你多吃点饭。' },
  '临江仙|晏几道': { g: '写梦醒后追忆一个人。上片从梦后、酒醒写起，楼台锁着、帘幕垂着，去年的春恨又回来了；落花中独自站着，细雨中燕子成双飞——人单、燕双，是全词最刺人的一句。下片想起初见时她穿两重心字的罗衣，琵琶弦上说相思；如今月亮还在，人已不在。' },
  '垓下歌|项羽': { g: '兵败被围时唱的歌。开头自夸力气能拔山、气概盖世；接着一转，说时运不利，乌骓马也不肯往前跑；最后两句是对虞姬说的：马我都带不走，你该怎么办。四句从极骄傲跌到极无力，落差就是这首歌的力量。' },

  // ---------------- 山 ----------------
  '春雁|王恭': { g: '借北归的雁写思乡。春风一夜就吹到衡阳，而楚水到燕山隔着万里；不要说春天来了就急着回去，江南虽好，到底不是家乡。雁能北归、人却滞留，两相对照，乡愁不必说出口。' },

  // ---------------- 风 ----------------
  '敕勒歌|北朝民歌': { g: '写草原。先点位置：敕勒川在阴山下；再说天像一顶大帐篷，笼盖着四野；最后一句风把草吹伏下去，才露出成群的牛羊。前面是静的辽阔，最后一句一动，草原的富饶全出来了。' },
  '浣溪沙|纳兰性德': { g: '悼念亡妻。上片写自己：西风里独自受凉，黄叶打着窗，站在残阳里想往事——「谁念」是说再没有人惦记他冷不冷了。下片回想从前：她怕他酒醉睡沉不去惊动，两人赌书泼茶，当时只当是寻常日子，如今才知道那是再也回不去的好时光。' },
  '临江仙|杨慎': { g: '《三国演义》开篇的那首词。上片说长江东流、浪花淘尽英雄，成败是非转眼成空，只有青山和几度夕阳还在；下片写江上的渔夫樵夫，看惯了秋月春风，一壶浊酒相逢，古今多少事都付与笑谈。一边是争，一边是看，全词的分量就在这个对照里。' },
  '寻胡隐君|高启': { g: '写访友的路。渡水又渡水，看花又看花，春风里沿着江边走，不知不觉就到了你家。四句全在写路，没写一句「想见你」，可「不觉」两个字把心情说尽了：路很远，走起来却不觉得远。' },

  // ---------------- 月 ----------------
  '十二月十五夜|袁枚': { g: '写深夜的雪与月。更鼓敲得急，人声已断绝；吹灭了灯，窗户反而更亮——原来是月光照着满地雪。全诗没有一句直接写月亮有多亮，靠「吹灯窗更明」这个反常的细节，把雪夜的清亮写透了。' },
  '水调歌头·明月几时有|苏轼': { g: '中秋夜喝酒到天亮，大醉，想念弟弟。开篇举杯问天：明月是从什么时候起就有的？想乘风回天上，又怕高处太冷，不如在人间月下起舞。下片月照得人睡不着，怨它偏在离别时圆；最后自己想通了——人有离合、月有圆缺，自古难全，只愿彼此长久，千里共此一月。' },

  // ---------------- 春 ----------------
  '赠范晔诗|陆凯': { g: '折花时遇到北去的信使，就托他把花带给陇头的朋友。江南没有什么好东西，姑且送你一枝春天。把一枝梅花说成「一枝春」，是全诗最妙的地方——送的不是花，是江南的春天和惦念。' },
  '临安春雨初霁|陆游': { g: '在京城客居时写的。开头说这些年把世态人情看得淡了，谁让我骑马到京城来；中间两名句写一夜听雨、次日深巷卖杏花；接着写闲得无事，铺纸写草书、窗前分茶；结尾说别叹白衣沾了风尘，清明前还赶得回家。表面闲适，底下是闲得发慌。' },
  '苔|袁枚': { g: '写背阴处的苔藓。太阳照不到的地方，绿意照样自己长出来；它的花小得像米粒，也学着牡丹的样子开。四句写的是苔，说的是人：生在没人看见的地方，也照样活、照样开。' },
  '己亥杂诗(浩荡离愁白日斜)|龚自珍': { g: '辞官离京途中写的。夕阳下离愁浩荡，马鞭一指向东就是天涯；后两句忽然转出：落花不是无情的东西，化进春泥还要护着新开的花。前两句是走，后两句是留——人走了，心还留在要护的那件事上。' },
  '一剪梅|李清照': { g: '写秋日相思。荷花残了、竹席凉了，独自上船；盼着云中谁寄信来，雁回时月满西楼。下片说花自飘零水自流——花落水流都拦不住，正如相思；一种相思分在两处，这情没法消除，刚下眉头又上心头。' },
  '村居|高鼎': { g: '写二月的乡村。草在长、莺在飞，杨柳拂着堤岸，像醉在春烟里；孩子们放学回来得早，赶着东风放风筝。前两句写景，后两句写人，一个「忙」字把整个春天写活了。' },

  // ---------------- 天 ----------------
  '八声甘州|柳永': { g: '登高望远的羁旅词。上片写景：暮雨洒江天，洗出一片清秋，霜风凄紧、关河冷落、残照当楼，花叶都衰了，只有长江默默东流。下片写情：不忍登高，怕归思收不住；叹自己常年漂泊为何滞留；接着换到对方——想她正在妆楼凝望，几回认错了天边的归舟。' },
  '京师得家书|袁凯': { g: '在京城收到家信。江水迢迢三千里，信只有十五行；每一行都没有别的话，只说要早点回家。前三句都在铺垫「少」，最后一句把十五行的分量全压了出来。' },

  // ---------------- 水 ----------------
  '迢迢牵牛星|汉乐府': { g: '写织女。牵牛星远、织女星亮，她伸出纤纤素手织布，机声札札；可一天织不成一匹，眼泪像雨落下来。银河又清又浅，相隔能有多远？只隔一条清浅的水，却只能相望不能说话。全诗写的都是「近在咫尺却见不着」。' },
};

});
__reg("src/data/poem_text.js", function (module, exports, require) {
'use strict';
// 本文件由 tools/build/build-corpus.js 生成，禁止手工编辑。
// 格式 T[i] = 该首全诗正文（含原标点），下标与 corpus.sources 一一对应。
(function () {
  var T = ["敕勒川，阴山下。天似穹庐，笼盖四野。天苍苍，野茫茫，风吹草低见牛羊。","唧唧复唧唧，木兰当户织。不闻机杼声，惟闻女叹息。问女何所思，问女何所忆。女亦无所思，女亦无所忆。昨夜见军帖，可汗大点兵，军书十二卷，卷卷有爷名。阿爷无大儿，木兰无长兄，愿为市鞍马，从此替爷征。东市买骏马，西市买鞍鞯，南市买辔头，北市买长鞭。旦辞爷娘去，暮宿黄河边，不闻爷娘唤女声，但闻黄河流水鸣溅溅。旦辞黄河去，暮至黑山头，不闻爷娘唤女声，但闻燕山胡骑鸣啾啾。万里赴戎机，关山度若飞。朔气传金柝，寒光照铁衣。将军百战死，壮士十年归。归来见天子，天子坐明堂。策勋十二转，赏赐百千强。可汗问所欲，木兰不用尚书郎，愿驰千里足，送儿还故乡。爷娘闻女来，出郭相扶将；阿姊闻妹来，当户理红妆；小弟闻姊来，磨刀霍霍向猪羊。开我东阁门，坐我西阁床，脱我战时袍，著我旧时裳。当窗理云鬓，对镜帖花黄。出门看火伴，火伴皆惊忙：同行十二年，不知木兰是女郎。雄兔脚扑朔，雌兔眼迷离；双兔傍地走，安能辨我是雄雌？","唧唧复唧唧，木兰当户织。不闻机杼声，惟闻女叹息。问女何所思，问女何所忆。女亦无所思，女亦无所忆。昨夜见军帖，可汗大点兵，军书十二卷，卷卷有爷名。阿爷无大儿，木兰无长兄，愿为市鞍马，从此替爷征。东市买骏马，西市买鞍鞯，南市买辔头，北市买长鞭。旦辞爷娘去，暮宿黄河边，不闻爷娘唤女声，但闻黄河流水鸣溅溅。旦辞黄河去，暮至黑山头，不闻爷娘唤女声，但闻燕山胡骑鸣啾啾。万里赴戎机，关山度若飞。朔气传金柝，寒光照铁衣。将军百战死，壮士十年归。归来见天子，天子坐明堂。策勋十二转，赏赐百千强。可汗问所欲，木兰不用尚书郎，愿驰千里足，送儿还故乡。爷娘闻女来，出郭相扶将；阿姊闻妹来，当户理红妆；小弟闻姊来，磨刀霍霍向猪羊。开我东阁门，坐我西阁床，脱我战时袍，著我旧时裳。当窗理云鬓，对镜帖花黄。出门看火伴，火伴皆惊忙：同行十二年，不知木兰是女郎。","上邪！我欲与君相知，长命无绝衰。山无陵，江水为竭，冬雷震震，夏雨雪，天地合，乃敢与君绝！","陟彼北芒兮，噫！顾览帝京兮，噫！宫室崔嵬兮，噫！人之劬劳兮，噫！辽辽未央兮，噫！","十五从军征，八十始得归。道逢乡里人，家中有阿谁？遥看是君家，松柏冢累累。兔从狗窦入，雉从梁上飞。中庭生旅谷，井上生旅葵。舂谷持作饭，采葵持作羹。羹饭一时熟，不知贻阿谁。出门东向看，泪落沾我衣。","行行重行行，与君生别离。相去万余里，各在天一涯。道路阻且长，会面安可知？胡马依北风，越鸟巢南枝。相去日已远，衣带日已缓。浮云蔽白日，游子不顾返。思君令人老，岁月忽已晚。弃捐勿复道，努力加餐饭。","青青河畔草，郁郁园中柳。盈盈楼上女，皎皎当窗牖。娥娥红粉妆，纤纤出素手。昔为倡家女，今为荡子妇。荡子行不归，空床难独守。","今日良宴会，欢乐难具陈。弹筝奋逸响，新声妙入神。令德唱高言，识曲听其真。齐心同所愿，含意俱未申。","西北有高楼，上与浮云齐。交疏结绮窗，阿阁三重阶。上有弦歌声，音响一何悲！谁能为此曲？无乃杞梁妻。","庭中有奇树，绿叶发华滋。攀条折其荣，将以遗所思。馨香盈怀袖，路远莫致之。此物何足贵？但感经时违。","驱车上东门，遥望郭北墓。白杨何萧萧，松柏夹广路。下有陈死人，杳杳即长暮。潜寐黄泉下，千载永不寤。","生年不满百，常怀千岁忧。昼短苦夜长，何不秉烛游！为乐当及时，何能待来兹？愚者爱惜费，但为后世嗤。","明月何皎皎，照我罗床帏。忧愁不能寐，揽衣起徘徊。客行虽云乐，不如早旋归。出户独彷徨，愁思当告谁？","我所思兮在太山，欲往从之梁父艰，侧身东望涕沾翰。","力拔山兮气盖世，时不利兮骓不逝。骓不逝兮可奈何，虞兮虞兮奈若何！","大风起兮云飞扬，威加海内兮归故乡，安得猛士兮守四方！","孔雀东南飞，五里一徘徊。十三能织素，十四学裁衣，十五弹箜篌，十六诵诗书。十七为君妇，心中常苦悲。君既为府吏，守节情不移。贱妾留空房，相见常日稀。鸡鸣入机织，夜夜不得息。三日断五匹，大人故嫌迟。非为织作迟，君家妇难为！妾不堪驱使，徒留无所施。便可白公姥，及时相遣归。","庭中有奇树，绿叶发华滋。攀条折其荣，将以遗所思。馨香盈怀袖，路远莫致之。此物何足贵？但感物候时。","新裂齐纨素，皎洁如霜雪。裁为合欢扇，团团似明月。出入君怀袖，动摇微风发。常恐秋节至，凉飙夺炎热。弃捐箧笥中，恩情中道绝。","悲歌可以当泣，远望可以当归。思念故乡，郁郁累累。欲归家无人，欲渡河无船。心思不能言，肠中车轮转。","明月皎夜光，促织鸣东壁。玉衡指孟冬，众星何历历。白露沾野草，时节忽复易。秋蝉鸣树间，玄鸟逝安适？昔我同门友，高举振六翮。不念携手好，弃我如遗迹。南箕北有斗，牵牛不负轭。良无盘石固，虚名复何益！","有所思，乃在大海南。何用问遗君？双珠玳瑁簪，用玉绍缭之。闻君有他心，拉杂摧烧之。摧烧之，当风扬其灰。从今以往，勿复相思！相思与君绝！鸡鸣狗吠，兄嫂当知之。妃呼豨！秋风肃肃晨风飔，东方须臾高知之。","有所思，乃在大海南。何用问遗君，双珠玳瑁簪。闻君有他心，拉杂摧烧之。摧烧之，当风扬其灰！从今以往，勿复相思，相思与君绝！","江南可采莲，莲叶何田田。鱼戏莲叶间。鱼戏莲叶东，鱼戏莲叶西，鱼戏莲叶南，鱼戏莲叶北。","涉江采芙蓉，兰泽多芳草。采之欲遗谁？所思在远道。还顾望旧乡，长路漫浩浩。同心而离居，忧伤以终老。","行行重行行，与君生别离。相去万余里，各在天一涯。道路阻且长，会面安可知？胡马依北风，越鸟巢南枝。相去日已远，衣带日已缓。浮云蔽白日，游子不顾反。思君令人老，岁月忽已晚。弃捐勿复道，努力加餐饭。","西北有高楼，上与浮云齐。交疏结绮窗，阿阁三重阶。上有弦歌声，音响一何悲！谁能为此曲？无乃杞梁妻。清商随风发，中曲正徘徊。一弹再三叹，慷慨有余哀。不惜歌者苦，但伤知音稀。愿为双鸿鹄，奋翅起高飞。","人生譬朝露，居世多屯蹇。忧艰常早至，欢会常苦晚。","迢迢牵牛星，皎皎河汉女。纤纤擢素手，札札弄机杼。终日不成章，泣涕零如雨。河汉清且浅，相去复几许。盈盈一水间，脉脉不得语。","青青园中葵，朝露待日晞。阳春布德泽，万物生光辉。常恐秋节至，焜黄华叶衰。百川东到海，何时复西归？少壮不努力，老大徒伤悲。","青青河畔草，绵绵思远道。远道不可思，宿昔梦见之。梦见在我傍，忽觉在他乡。他乡各异县，辗转不相见。枯桑知天风，海水知天寒。入门各自媚，谁肯相为言！客从远方来，遗我双鲤鱼。呼儿烹鲤鱼，中有尺素书。长跪读素书，书中竟何如？上言加餐食，下言长相忆。","远水长流洁白鸥，野梅初绽暗香浮。孤舟夜宿芦花岸，一枕秋声入梦来。","滚滚长江东逝水，浪花淘尽英雄。是非成败转头空。青山依旧在，几度夕阳红。白发渔樵江渚上，惯看秋月春风。一壶浊酒喜相逢。古今多少事，都付笑谈中。","秋风江口听鸣榔，远客三更倒客觞。两岸月明霜已白，一江风急水犹黄。十年往事随风过，一枕归心入梦长。世路无涯身已老，青山何处是吾乡。","江水三千里，家书十五行。行行无别语，只道早还乡。","今日复今日，今日何其少！今日又不为，此事何时了？人生百年几今日，今日不为真可惜！若言姑待明朝至，明朝又有明朝事。为君聊赋今日诗，努力请从今日始。","高田如楼梯，平田如棋局。白鹭忽飞来，点破秧针绿。","三年羁旅客，今日又南冠。无限河山泪，谁言天地宽？已知泉路近，欲别故乡难。毅魄归来日，灵旗空际看。","凿开混沌得乌金，藏蓄阳和意最深。爝火燃回春浩浩，洪炉照破夜沉沉。鼎彝元赖生成力，铁石犹存死后心。但愿苍生俱饱暖，不辞辛苦出山林。","渡水复渡水，看花还看花。春风江上路，不觉到君家。","春色醉巴陵，阑干落洞庭。水吞三楚白，山接九疑青。空阔鱼龙舞，娉婷帝子灵。何人夜吹笛，风急雨冥冥。","春风一夜到衡阳，楚水燕山万里长。莫道春来便归去，江南虽好是他乡。","风烟节物眼中稀，三月人犹恋褚衣。结就客愁云片段，唤回乡梦雨霏微。","喇叭，唢呐，曲儿小腔儿大。官船来往乱如麻，全仗你抬声价。军听了军愁，民听了民怕。哪里去辨甚么真共假？眼见的吹翻了这家，吹伤了那家，只吹的水尽鹅飞罢！","寂历秋江渔火稀，起看残月映林微。波光水鸟惊犹宿，露冷流萤湿不飞。","白发渔翁老此乡，芦花深处草为堂。一壶村酒鲈鱼美，睡到明朝又何妨。","千锤万凿出深山，烈火焚烧若等闲。粉骨碎身浑不怕，要留清白在人间。","书卷多情似故人，晨昏忧乐每相亲。眼前直下三千字，胸次全无一点尘。","风条雨叶逐风尘，横惹阶前半面春。莫道此君无用处，岁寒曾伴雪中身。","南北驱驰报主情，江花边草笑平生。一年三百六十日，多是横戈马上行。","江干远树浮，天末孤烟起。江天自如合，烟树还相似。","孤烟起新丰，归雁出吴城。草低金城雾，木下玉门风。","玉关道路远，金陵信使疏。独下千行泪，开君万里书。","暮烟起遥岸，斜日照安流。一同心赏夕，暂解去乡忧。","楚材称晋用，秦臣即赵冠。离宫延子产，羁旅接陈完。","一身仕关西，家族满山东。二年从车驾，斋祭甘泉宫。","白云满鄣来，黄尘暗天起。关山四面绝，故乡几千里。","灞涘望长安，河阳视京县。白日丽飞甍，参差皆可见。余霞散成绮，澄江静如练。","秋风吹木叶，还似洞庭波。常山临代郡，亭障绕黄河。","客心已百念，孤游重千里。江暗雨欲来，浪白风初起。","山中何所有，岭上多白云。只可自怡悦，不堪持赠君。","折花逢驿使，寄与陇头人。江南无所有，聊赠一枝春。","阳关万里道，不见一人归。惟有河边雁，秋来南向飞。","军歌应唱大刀环，誓灭胡奴出玉关。只解沙场为国死，何须马革裹尸还。","沉沉更鼓急，渐渐人声绝。吹灯窗更明，月照一天雪。","金粉东南十五州，万重恩怨属名流。牢盆狎客操全算，团扇才人踞上游。避席畏闻文字狱，著书都为稻粱谋。田横五百人安在，难道归来尽列侯？","天山万笏耸琼瑶，导我西行伴寂寥。我与山灵相对笑，满头晴雪共难消。","衙斋卧听萧萧竹，疑是民间疾苦声。些小吾曹州县吏，一枝一叶总关情。","不惜千金买宝刀，貂裘换酒也堪豪。一腔热血勤珍重，洒去犹能化碧涛。","九州生气恃风雷，万马齐喑究可哀。我劝天公重抖擞，不拘一格降人才。","浩荡离愁白日斜，吟鞭东指即天涯。落红不是无情物，化作春泥更护花。","少年哀乐过于人，歌泣无端字字真。既壮周旋杂痴黠，童心来复梦中身。","霜豪掷罢倚天寒，任作淋漓淡墨看。何敢自矜医国手，药方只贩古时丹。","牧童骑黄牛，歌声振林樾。意欲捕鸣蝉，忽然闭口立。","连宵风雨恶，蓬户不轻开。山似春归日，花如客到时。","春风如贵客，一到便繁华。来扫千山雪，归留万国花。","少闻鸡声眠，老听鸡声起。千古万代人，消磨数声里。","人生若只如初见，何事秋风悲画扇。等闲变却故人心，却道故人心易变。骊山语罢清宵半，泪雨霖铃终不怨。何如薄幸锦衣郎，比翼连枝当日愿。","草长莺飞二月天，拂堤杨柳醉春烟。儿童散学归来早，忙趁东风放纸鸢。","独立寒秋，湘江北去，橘子洲头。看万山红遍，层林尽染；漫江碧透，百舸争流。鹰击长空，鱼翔浅底，万类霜天竞自由。怅寥廓，问苍茫大地，谁主沉浮？携来百侣曾游，忆往昔峥嵘岁月稠。恰同学少年，风华正茂；书生意气，挥斥方遒。指点江山，激扬文字，粪土当年万户侯。曾记否，到中流击水，浪遏飞舟？","北国风光，千里冰封，万里雪飘。望长城内外，惟余莽莽；大河上下，顿失滔滔。山舞银蛇，原驰蜡象，欲与天公试比高。须晴日，看红装素裹，分外妖娆。江山如此多娇，引无数英雄竞折腰。惜秦皇汉武，略输文采；唐宗宋祖，稍逊风骚。一代天骄，成吉思汗，只识弯弓射大雕。俱往矣，数风流人物，还看今朝。","谁念西风独自凉，萧萧黄叶闭疏窗，沉思往事立残阳。被酒莫惊春睡重，赌书消得泼茶香，当时只道是寻常。","望门投止思张俭，忍死须臾待杜根。我自横刀向天笑，去留肝胆两昆仑。","咬定青山不放松，立根原在破岩中。千磨万击还坚劲，任尔东西南北风。","月黑见渔灯，孤光一点萤。微微风簇浪，散作满河星。","白日不到处，青春恰自来。苔花如米小，也学牡丹开。","蝉居最高树，高树亦无枝。饮露身何洁，吟风韵自奇。绝音人不识，远响尔何知。寄语螳螂辈，休将此意欺。","辛苦最怜天上月，一昔如环，昔昔都成玦。若似月轮终皎洁，不辞冰雪为卿热。","李杜诗篇万口传，至今已觉不新鲜。江山代有才人出，各领风骚数百年。","诗界千年靡靡风，兵魂销尽国魂空。集中什九从军乐，亘古男儿一放翁。","万籁无声夜正中，月华如水浸帘栊。闲愁一缕随风去，化作清光入太空。","力微任重久神疲，再竭衰庸定不支。苟利国家生死以，岂因祸福避趋之。谪居正是君恩厚，养拙刚于戍卒宜。戏与山妻谈故事，试吟断送老头皮。","爱好由来落笔难，一诗千改始心安。阿婆还似初笄女，头未梳成不许看。","我亦飘零久！十年来，深恩负尽，死生师友。宿昔齐名非忝窃，只看杜陵穷瘦。曾不减，夜郎僝僽。","山一程，水一程，身向榆关那畔行，夜深千帐灯。风一更，雪一更，聒碎乡心梦不成，故园无此声。","思亲不断如春草，一夜西风绿又生。欲寄归心无处着，月明满地是乡情。","莫唱当年长恨歌，人间亦自有银河。石壕村里夫妻别，泪比长生殿上多。","万里乘云去复来，只身东海挟春雷。忍看图画移颜色，肯使江山付劫灰。浊酒不销忧国泪，救时应仗出群才。拼将十万头颅血，须把乾坤力挽回。","红藕香残玉簟秋。轻解罗裳，独上兰舟。云中谁寄锦书来，雁字回时，月满西楼。花自飘零水自流。一种相思，两处闲愁。此情无计可消除，才下眉头，却上心头。","梅子黄时日日晴，小溪泛尽却山行。绿阴不减来时路，添得黄鹂四五声。","少年不识愁滋味，爱上层楼。爱上层楼，为赋新词强说愁。而今识尽愁滋味，欲说还休。欲说还休，却道天凉好个秋。","梨花淡白柳深青，柳絮飞时花满城。惆怅东栏一株雪，人生看得几清明。","世味年来薄似纱，谁令骑马客京华。小楼一夜听春雨，深巷明朝卖杏花。矮纸斜行闲作草，晴窗细乳戏分茶。素衣莫起风尘叹，犹及清明可到家。","梦后楼台高锁，酒醒帘幕低垂。去年春恨却来时。落花人独立，微雨燕双飞。记得小蘋初见，两重心字罗衣。琵琶弦上说相思。当时明月在，曾照彩云归。","夜饮东坡醒复醉，归来仿佛三更。家童鼻息已雷鸣。敲门都不应，倚杖听江声。长恨此身非我有，何时忘却营营。夜阑风静縠纹平。小舟从此逝，江海寄余生。","早岁那知世事艰，中原北望气如山。楼船夜雪瓜洲渡，铁马秋风大散关。塞上长城空自许，镜中衰鬓已先斑。出师一表真名世，千载谁堪伯仲间。","野水参差落涨痕，疏林欹倒出霜根。扁舟一棹归何处？家在江南黄叶村。","萧萧远树疏林外，一半秋山带夕阳。","茅檐长扫净无苔，花木成畦手自栽。一水护田将绿绕，两山排闼送青来。","庙堂无策可平戎，坐使甘泉照火光。夷甫诸人堪一笑，更从今去误苍生。","云淡风轻近午天，傍花随柳过前川。时人不识余心乐，将谓偷闲学少年。","爆竹声中一岁除，春风送暖入屠苏。千门万户曈曈日，总把新桃换旧符。","对潇潇暮雨洒江天，一番洗清秋。渐霜风凄紧，关河冷落，残照当楼。是处红衰翠减，苒苒物华休。惟有长江水，无语东流。不忍登高临远，望故乡渺邈，归思难收。叹年来踪迹，何事苦淹留？想佳人妆楼颙望，误几回、天际识归舟。争知我，倚阑杆处，正恁凝愁！","长淮望断，关塞莽然平。征尘暗，霜风劲，悄边声。黯销凝。追想当年事，殆天数，非人力，洙泗上，弦歌地，亦膻腥。隔水毡乡，落日牛羊下，区脱纵横。看名王宵猎，骑火一川明。笳鼓悲鸣。遣人惊。念腰间箭，匣中剑，空埃蠹，竟何成。时易失，心徒壮，岁将零。渺神京。干羽方怀远，静烽燧，且休兵。冠盖使，纷驰骛，若为情。闻道中原遗老，常南望、翠葆霓旌。使行人到此，忠愤气填膺。有泪如倾。","黑云翻墨未遮山，白雨跳珠乱入船。卷地风来忽吹散，望湖楼下水如天。","参横斗转欲三更，苦雨终风也解晴。云散月明谁点缀，天容海色本澄清。空余鲁叟乘桴意，粗识轩辕奏乐声。九死南荒吾不恨，兹游奇绝冠平生。","古人学问无遗力，少壮工夫老始成。纸上得来终觉浅，绝知此事要躬行。","香冷金猊，被翻红浪，起来慵自梳头。任宝奁尘满，日上帘钩。生怕离怀别苦，多少事、欲说还休。新来瘦，非干病酒，不是悲秋。休休，这回去也，千万遍《阳关》，也则难留。念武陵人远，烟锁秦楼。惟有楼前流水，应念我、终日凝眸。凝眸处，从今又添，一段新愁。","乳鸭池塘水浅深，熟梅天气半晴阴。东园载酒西园醉，摘尽枇杷一树金。","落日无情最有情，遍催万树暮蝉鸣。听来咫尺无寻处，寻到旁边却不声。","衣上征尘杂酒痕，远游无处不消魂。此身合是诗人未？细雨骑驴入剑门。","少年易老学难成，一寸光阴不可轻。未觉池塘春草梦，阶前梧叶已秋声。","北山输绿涨横陂，直堑回塘滟滟时。细数落花因坐久，缓寻芳草得归迟。","僵卧孤村不自哀，尚思为国戍轮台。夜阑卧听风吹雨，铁马冰河入梦来。","何处望神州？满眼风光北固楼。千古兴亡多少事？悠悠。不尽长江滚滚流。年少万兜鍪，坐断东南战未休。天下英雄谁敌手？曹刘。生子当如孙仲谋。","南浦东冈二月时，物华撩我有新诗。含风鸭绿粼粼起，弄日鹅黄袅袅垂。","驿外断桥边，寂寞开无主。已是黄昏独自愁，更着风和雨。无意苦争春，一任群芳妒。零落成泥碾作尘，只有香如故。","水是眼波横，山是眉峰聚。欲问行人去那边？眉眼盈盈处。才始送春归，又送君归去。若到江南赶上春，千万和春住。","缺月挂疏桐，漏断人初静。谁见幽人独往来，缥缈孤鸿影。惊起却回头，有恨无人省。拣尽寒枝不肯栖，寂寞沙洲冷。","燕子将雏语夏深，绿槐庭院不多阴。西窗一雨无人见，展尽芭蕉数尺心。","过春社了，度帘幕中间，去年尘冷。差池欲住，试入旧巢相并。还相雕梁藻井，又软语商量不定。飘然快拂花梢，翠尾分开红影。芳径，芹泥雨润。爱贴地争飞，竞夸轻俊。红楼归晚，看足柳暗花暝。应自栖香正稳，便忘了、天涯芳信。愁损翠黛双蛾，日日画阑独凭。","人生到处知何似，应似飞鸿踏雪泥。泥上偶然留指爪，鸿飞那复计东西。老僧已死成新塔，坏壁无由见旧题。往日崎岖还记否，路长人困蹇馿嘶。","昼出耘田夜绩麻，村庄儿女各当家。童孙未解供耕织，也傍桑阴学种瓜。","梅子金黄杏子肥，麦花雪白菜花稀。日长篱落无人过，唯有蜻蜓蛱蝶飞。","梅子金黄杏子肥，麦花雪白菜花稀。日长篱落无人过，惟有蜻蜓蛱蝶飞。","新筑场泥镜面平，家家打稻趁霜晴。笑歌声里轻雷动，一夜连枷响到明。","寻寻觅觅，冷冷清清，凄凄惨惨戚戚。乍暖还寒时候，最难将息。三杯两盏淡酒，怎敌他、晚来风急！雁过也，正伤心，却是旧时相识。满地黄花堆积，憔悴损，如今有谁堪摘？守着窗儿，独自怎生得黑！梧桐更兼细雨，到黄昏、点点滴滴。这次第，怎一个愁字了得！","别院深深夏席清，石榴开遍透帘明。树阴满地日当午，梦觉流莺时一声。","长夏村墟风日清，檐牙燕雀已生成。蝶衣晒粉花枝舞，蛛网惹丝罥落星。","流水阶除静，孤眠得自由。月生林欲晓，雨过夜如秋。远忆荷花浦，谁吟杜若洲。良宵恐无梦，有梦即俱游。","生当作人杰，死亦为鬼雄。至今思项羽，不肯过江东。","萧萧梧叶送寒声，江上秋风动客情。知有儿童挑促织，夜深篱落一灯明。","庭户无人秋月明，夜霜欲落气先清。梧桐真不甘衰谢，数叶迎风尚有声。","腰间羽箭久凋零，太息燕然未勒铭。老子犹堪绝大漠，诸君何至泣新亭。一身报国有万死，双鬓向人无再青。记取江湖泊船处，卧闻新雁落寒汀。","水调数声持酒听，午醉醒来愁未醒。送春春去几时回？临晚镜，伤流景，往事后期空记省。沙上并禽池上暝，云破月来花弄影。重重帘幕密遮灯，风不定，人初静，明日落红应满径。","一轮秋影转金波，飞镜又重磨。把酒问姮娥：被白发、欺人奈何！乘风好去，长空万里，直下看山河。斫去桂婆娑，人道是、清光更多。","月未到诚斋，先到万花川谷。不是诚斋无月，隔一庭修竹。如今才是十三夜，月色已如玉。未是秋光奇绝，看十五十六。","昨夜雨疏风骤，浓睡不消残酒。试问卷帘人，却道海棠依旧。知否，知否？应是绿肥红瘦。","常记溪亭日暮，沉醉不知归路。兴尽晚回舟，误入藕花深处。争渡，争渡，惊起一滩鸥鹭。","天质自森森，孤高几百寻。凌霄不屈己，得地本虚心。岁老根弥壮，阳骄叶更阴。明时思解愠，愿斲五弦琴。","莫听穿林打叶声，何妨吟啸且徐行。竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。料峭春风吹酒醒，微冷，山头斜照却相迎。回首向来萧瑟处，归去，也无风雨也无晴。","篱落疏疏一径深，树头新绿未成阴。儿童急走追黄蝶，飞入菜花无处寻。","我居北海君南海，寄雁传书谢不能。桃李春风一杯酒，江湖夜雨十年灯。持家但有四立壁，治病不蕲三折肱。想见读书头已白，隔溪猿哭瘴溪藤。","泉眼无声惜细流，树阴照水爱晴柔。小荷才露尖尖角，早有蜻蜓立上头。","昨夜寒蛩不住鸣。惊回千里梦，已三更。起来独自绕阶行。人悄悄，帘外月胧明。白首为功名。旧山松竹老，阻归程。欲将心事付瑶琴。知音少，弦断有谁听。","众芳摇落独暄妍，占尽风情向小园。疏影横斜水清浅，暗香浮动月黄昏。霜禽欲下先偷眼，粉蝶如知合断魂。","大江东去，浪淘尽，千古风流人物。故垒西边，人道是，三国周郎赤壁。乱石穿空，惊涛拍岸，卷起千堆雪。江山如画，一时多少豪杰。遥想公瑾当年，小乔初嫁了，雄姿英发。羽扇纶巾，谈笑间，樯橹灰飞烟灭。故国神游，多情应笑我，早生华发。人生如梦，一尊还酹江月。","洞庭青草，近中秋，更无一点风色。玉鉴琼田三万顷，着我扁舟一叶。素月分辉，明河共影，表里俱澄澈。悠然心会，妙处难与君说。应念岭海经年，孤光自照，肝肺皆冰雪。短发萧骚襟袖冷，稳泛沧浪空阔。尽挹西江，细斟北斗，万象为宾客。扣舷独啸，不知今夕何夕！","尽日寻春不见春，芒鞋踏遍陇头云。归来笑拈梅花嗅，春在枝头已十分。","两两归鸿欲破群，依依还似北归人。遥知朔漠多风雪，更待江南半月春。","罗浮山下四时春，卢橘杨梅次第新。日啖荔枝三百颗，不辞长作岭南人。","淮左名都，竹西佳处，解鞍少驻初程。过春风十里，尽荠麦青青。自胡马窥江去后，废池乔木，犹厌言兵。渐黄昏，清角吹寒，都在空城。杜郎俊赏，算而今、重到须惊。纵豆蔻词工，青楼梦好，难赋深情。二十四桥仍在，波心荡、冷月无声。念桥边红药，年年知为谁生！","淮左名都，竹西佳处，解鞍少驻初程。过春风十里，尽荠麦青青。自胡马窥江去后，废池乔木，犹厌言兵。渐黄昏，清角吹寒，都在空城。二十四桥仍在，波心荡、冷月无声。念桥边红药，年年知为谁生！","田夫抛秧田妇接，小儿拔秧大儿插。笠是兜鍪蓑是甲，雨从头上湿到胛。唤渠朝餐歇半霎，低头折腰只不答。秧根未牢莳未匝，照管鹅儿与雏鸭。","更能消、几番风雨，匆匆春又归去。惜春长怕花开早，何况落红无数。春且住，见说道、天涯芳草无归路。怨春不语。算只有殷勤，画檐蛛网，尽日惹飞絮。长门事，准拟佳期又误。蛾眉曾有人妒。千金纵买相如赋，脉脉此情谁诉？君莫舞，君不见、玉环飞燕皆尘土！闲愁最苦。休去倚危栏，斜阳正在，烟柳断肠处。","数日秋风欺病夫，尽吹黄叶下庭芜。林疏放得遥山出，又被云遮一半无。","黄莺也爱新凉好，飞过青山影里啼。","东风知我欲山行，吹断檐间积雨声。岭上晴云披絮帽，树头初日挂铜钲。","青苔满地初晴后，绿树无人昼梦余。唯有南风旧相识，偷开门户又翻书。","露侵驼褐晓寒轻，星斗阑干分外明。寂寞小桥和梦过，稻田深处草虫鸣。","金炉香烬漏声残，剪剪轻风阵阵寒。春色恼人眠不得，月移花影上栏杆。","春宵一刻值千金，花有清香月有阴。歌管楼台声细细，秋千院落夜沉沉。","阴阴溪曲绿交加，小雨翻萍上浅沙。鹅鸭不知春去尽，争随流水趁桃花。","胜日寻芳泗水滨，无边光景一时新。等闲识得东风面，万紫千红总是春。","一春略无十日晴，处处浮云将雨行。野田春水碧于镜，人影渡傍鸥不惊。","竹外桃花三两枝，春江水暖鸭先知。蒌蒿满地芦芽短，正是河豚欲上时。","双飞燕子几时回？夹岸桃花蘸水开。春雨断桥人不渡，小舟撑出柳阴来。","午梦扁舟花底，香满西湖烟水。急雨打篷声，梦初惊。却是池荷跳雨，散了真珠还聚。聚作水银窝，泻清波。","毕竟西湖六月中，风光不与四时同。接天莲叶无穷碧，映日荷花别样红。","紫青莼菜卷荷香，玉雪芹芽拔薤长。不待春风催暖日，只消新水满池塘。","清风无力屠得热，落日着翅飞上山。人固已惧江海竭，天岂不惜河汉干。昆仑之高有积雪，蓬莱之远常遗寒。不能手提天下往，何忍身去游其间。","旧时月色，算几番照我，梅边吹笛？唤起玉人，不管清寒与攀摘。何逊而今渐老，都忘却春风词笔。但怪得竹外疏花，香冷入瑶席。江国，正寂寂。叹寄与路遥，夜雪初积。翠尊易泣，红萼无言耿相忆。长记曾携手处，千树压西湖寒碧。又片片、吹尽也，几时见得？","双双瓦雀行书案，点点杨花入砚池。闲坐小窗读周易，不知春去几多时。","游人脚底一声雷，满座顽云拨不开。天外黑风吹海立，浙东飞雨过江来。十分潋滟金樽凸，千杖敲铿羯鼓催。唤起谪仙泉洒面，倒倾鲛室泻琼瑰。","春未老，风细柳斜斜。试上超然台上看，半壕春水一城花。烟雨暗千家。寒食后，酒醒却咨嗟。休对故人思故国，且将新火试新茶。诗酒趁年华。","东南形胜，三吴都会，钱塘自古繁华。烟柳画桥，风帘翠幕，参差十万人家。云树绕堤沙，怒涛卷霜雪，天堑无涯。市列珠玑，户盈罗绮，竞豪奢。","可怜今夕月，向何处、去悠悠？是别有人间，那边才见，光影东头？是天外空汗漫，但长风、浩浩送中秋？飞镜无根谁系？嫦娥不嫁谁留？","草满池塘水满陂，山衔落日浸寒漪。牧童归去横牛背，短笛无腔信口吹。","晓带轻烟间杏花，晚凝深翠拂平沙。长条别有风流处，密映钱塘苏小家。","登临送目，正故国晚秋，天气初肃。千里澄江似练，翠峰如簇。归帆去棹残阳里，背西风，酒旗斜矗。彩舟云淡，星河鹭起，画图难足。念往昔，繁华竞逐，叹门外楼头，悲恨相续。千古凭高对此，谩嗟荣辱。六朝旧事随流水，但寒烟衰草凝绿。至今商女，时时犹唱，后庭遗曲。","墙角数枝梅，凌寒独自开。遥知不是雪，为有暗香来。","云里溪桥独占春，天然玉质晓妆新。月中疏影霜中韵，都作人间百倍珍。","闻道梅花坼晓风，雪堆遍满四山中。何方可化身千亿？一树梅花一放翁。","天地有正气，杂然赋流形。下则为河岳，上则为日星。于人曰浩然，沛乎塞苍冥。皇路当清夷，含和吐明庭。时穷节乃见，一一垂丹青。","风住尘香花已尽，日晚倦梳头。物是人非事事休，欲语泪先流。闻说双溪春尚好，也拟泛轻舟。只恐双溪舴艋舟，载不动许多愁。","昨夜扁舟雨一蓑，满江风浪夜如何？今朝试卷孤篷看，依旧青山绿树多。","明月几时有？把酒问青天。不知天上宫阙，今夕是何年。我欲乘风归去，又恐琼楼玉宇，高处不胜寒。起舞弄清影，何似在人间。转朱阁，低绮户，照无眠。不应有恨，何事长向别时圆？人有悲欢离合，月有阴晴圆缺，此事古难全。但愿人长久，千里共婵娟。","似花还似非花，也无人惜从教坠。抛家傍路，思量却是，无情有思。萦损柔肠，困酣娇眼，欲开还闭。梦随风万里，寻郎去处，又还被莺呼起。不恨此花飞尽，恨西园落红难缀。晓来雨过，遗踪何在？一池萍碎。春色三分，二分尘土，一分流水。细看来，不是杨花，点点是离人泪。","楚天千里清秋，水随天去秋无际。遥岑远目，献愁供恨，玉簪螺髻。落日楼头，断鸿声里，江南游子。把吴钩看了，栏杆拍遍，无人会，登临意。休说鲈鱼堪脍，尽西风、季鹰归未？求田问舍，怕应羞见，刘郎才气。可惜流年，忧愁风雨，树犹如此！倩何人唤取，红巾翠袖，揾英雄泪？","千古江山，英雄无觅孙仲谋处。舞榭歌台，风流总被雨打风吹去。斜阳草树，寻常巷陌，人道寄奴曾住。想当年，金戈铁马，气吞万里如虎。元嘉草草，封狼居胥，赢得仓皇北顾。四十三年，望中犹记，烽火扬州路。可堪回首，佛狸祠下，一片神鸦社鼓。凭谁问：廉颇老矣，尚能饭否？","江上秋风吹白头，倦游空叹此身浮。只应且作乘桴客，安得长为击楫流。","江上往来人，但爱鲈鱼美。君看一叶舟，出没风波里。","十年生死两茫茫，不思量，自难忘。千里孤坟，无处话凄凉。纵使相逢应不识，尘满面，鬓如霜。夜来幽梦忽还乡，小轩窗，正梳妆。相顾无言，惟有泪千行。料得年年肠断处，明月夜，短松冈。","老夫聊发少年狂，左牵黄，右擎苍，锦帽貂裘，千骑卷平冈。为报倾城随太守，亲射虎，看孙郎。酒酣胸胆尚开张，鬓微霜，又何妨！持节云中，何日遣冯唐？会挽雕弓如满月，西北望，射天狼。","江头落日照平沙，潮退渔船阁岸斜。白鸟一双临水立，见人惊起入芦花。","经年尘土满征衣，特特寻芳上翠微。好水好山看不足，马蹄催趁月明归。","城上斜阳画角哀，沈园非复旧池台。伤心桥下春波绿，曾是惊鸿照影来。","梦断香消四十年，沈园柳老不吹绵。此身行作稽山土，犹吊遗踪一泫然。","京口瓜洲一水间，钟山只隔数重山。春风又绿江南岸，明月何时照我还？","冰肌玉骨，自清凉无汗。水殿风来暗香满。绣帘开，一点明月窥人，人未寝，欹枕钗横鬓乱。起来携素手，庭户无声，时见疏星渡河汉。试问夜如何？夜已三更，金波淡，玉绳低转。但屈指西风几时来，又不道流年暗中偷换。","一曲新词酒一杯，去年天气旧亭台。夕阳西下几时回？无可奈何花落去，似曾相识燕归来。小园香径独徘徊。","山下兰芽短浸溪，松间沙路净无泥，潇潇暮雨子规啼。谁道人生无再少？门前流水尚能西！休将白发唱黄鸡。","东风袅袅泛崇光，香雾空蒙月转廊。只恐夜深花睡去，故烧高烛照红妆。","春阴垂野草青青，时有幽花一树明。晚泊孤舟古祠下，满川风雨看潮生。","小桃无主自开花，烟草茫茫带晚鸦。几处败垣围故井，向来一一是人家。","春归何处？寂寞无行路。若有人知春去处，唤取归来同住。春无踪迹谁知？除非问取黄鹂。百啭无人能解，因风飞过蔷薇。","茅檐低小，溪上青青草。醉里吴音相媚好，白发谁家翁媪？大儿锄豆溪东，中儿正织鸡笼。最喜小儿亡赖，溪头卧剥莲蓬。","天接云涛连晓雾，星河欲转千帆舞。仿佛梦魂归帝所。闻天语，殷勤问我归何处。我报路长嗟日暮，学诗谩有惊人句。九万里风鹏正举。风休住，蓬舟吹取三山去！","塞下秋来风景异，衡阳雁去无留意。四面边声连角起，千嶂里，长烟落日孤城闭。浊酒一杯家万里，燕然未勒归无计。羌管悠悠霜满地，人不寐，将军白发征夫泪。","西塞山前白鹭飞，桃花流水鳜鱼肥。青箬笠，绿蓑衣，斜风细雨不须归。","应怜屐齿印苍苔，小扣柴扉久不开。春色满园关不住，一枝红杏出墙来。","莫笑农家腊酒浑，丰年留客足鸡豚。山重水复疑无路，柳暗花明又一村。箫鼓追随春社近，衣冠简朴古风存。从今若许闲乘月，拄杖无时夜叩门。","山抹微云，天连衰草，画角声断谯门。暂停征棹，聊共引离尊。多少蓬莱旧事，空回首、烟霭纷纷。斜阳外，寒鸦万点，流水绕孤村。销魂当此际，香囊暗解，罗带轻分。谩赢得、青楼薄幸名存。此去何时见也？襟袖上、空惹啼痕。伤情处，高城望断，灯火已黄昏。","怒发冲冠，凭栏处、潇潇雨歇。抬望眼，仰天长啸，壮怀激烈。三十功名尘与土，八千里路云和月。莫等闲，白了少年头，空悲切！靖康耻，犹未雪。臣子恨，何时灭！驾长车，踏破贺兰山缺。壮志饥餐胡虏肉，笑谈渴饮匈奴血。待从头、收拾旧山河，朝天阙。","倦客愁闻归路遥，眼明飞阁俯长桥。贪看白鹭横秋浦，不觉青林没晚潮。","燕雁无心，太湖西畔随云去。数峰清苦，商略黄昏雨。第四桥边，拟共天随住。今何许？凭阑怀古，残柳参差舞。","一自胡尘入汉关，十年伊洛路漫漫。青墩溪畔龙钟客，独立东风看牡丹。","年年跃马长安市，客舍似家家似寄。青钱换酒日无何，红烛呼卢宵不寐。易挑锦妇机中字，难得玉人心下事。男儿西北有神州，莫滴水西桥畔泪。","尊前拟把归期说，欲语春容先惨咽。人生自是有情痴，此恨不关风与月。离歌且莫翻新阕，一曲能教肠寸结。直须看尽洛城花，始共春风容易别。","若言琴上有琴声，放在匣中何不鸣？若言声在指头上，何不于君指上听？","去年元夜时，花市灯如昼。月上柳梢头，人约黄昏后。今年元夜时，月与灯依旧。不见去年人，泪湿春衫袖。","耕犁千亩实千箱，力尽筋疲谁复伤？但得众生皆得饱，不辞羸病卧残阳。","病骨支离纱帽宽，孤臣万里客江干。位卑未敢忘忧国，事定犹须待阖棺。天地神灵扶庙社，京华父老望和銮。出师一表通今古，夜半挑灯更细看。","痴儿了却公家事，快阁东西倚晚晴。落木千山天远大，澄江一道月分明。朱弦已为佳人绝，青眼聊因美酒横。万里归船弄长笛，此心吾与白鸥盟。","飞来山上千寻塔，闻说鸡鸣见日升。不畏浮云遮望眼，自缘身在最高层。","燕子来时新社，梨花落后清明。池上碧苔三四点，叶底黄鹂一两声。日长飞絮轻。巧笑东邻女伴，采桑径里逢迎。疑怪昨宵春梦好，元是今朝斗草赢。笑从双脸生。","醉里挑灯看剑，梦回吹角连营。八百里分麾下炙，五十弦翻塞外声，沙场秋点兵。马作的卢飞快，弓如霹雳弦惊。了却君王天下事，赢得生前身后名。可怜白发生！","死去元知万事空，但悲不见九州同。王师北定中原日，家祭无忘告乃翁。","夜漏添长抱影悲，明月无情偏照户。秋来纨扇合收藏，何事佳人重感伤。","三万里河东入海，五千仞岳上摩天。遗民泪尽胡尘里，南望王师又一年。","利欲驱人万火牛，江湖浪迹一沙鸥。日长似岁闲方觉，事大如天醉亦休。","闲来无事不从容，睡觉东窗日已红。万物静观皆自得，四时佳兴与人同。","清溪流过碧山头，空水澄鲜一色秋。隔断红尘三十里，白云红叶两悠悠。","黄梅时节家家雨，青草池塘处处蛙。有约不来过夜半，闲敲棋子落灯花。","古木阴中系短篷，杖藜扶我过桥东。沾衣欲湿杏花雨，吹面不寒杨柳风。","一叶渔船两小童，收篙停棹坐船中。怪生无雨都张伞，不是遮头是使风。","重重叠叠上瑶台，几度呼童扫不开。刚被太阳收拾去，却教明月送将来。","燎沉香，消溽暑。鸟雀呼晴，侵晓窥檐语。叶上初阳干宿雨，水面清圆，一一风荷举。故乡遥，何日去？家住吴门，久作长安旅。五月渔郎相忆否？小楫轻舟，梦入芙蓉浦。","碧云天，黄叶地，秋色连波，波上寒烟翠。山映斜阳天接水，芳草无情，更在斜阳外。黯乡魂，追旅思，夜夜除非，好梦留人睡。明月楼高休独倚，酒入愁肠，化作相思泪。","郁孤台下清江水，中间多少行人泪。西北望长安，可怜无数山。青山遮不住，毕竟东流去。江晚正愁余，山深闻鹧鸪。","一片能教一断肠，可堪平砌更堆墙。飘如迁客来过岭，坠似骚人去赴湘。乱点莓苔多莫数，偶粘衣袖久犹香。东风谬掌花权柄，却忌孤高不主张。","雪虐风饕愈凛然，花中气节最高坚。过时自合飘零去，耻向东君更乞怜。","少年听雨歌楼上，红烛昏罗帐。壮年听雨客舟中，江阔云低、断雁叫西风。而今听雨僧庐下，鬓已星星也。悲欢离合总无情，一任阶前、点滴到天明。","昨日入城市，归来泪满巾。遍身罗绮者，不是养蚕人。","槛菊愁烟兰泣露，罗幕轻寒，燕子双飞去。明月不谙离恨苦，斜光到晓穿朱户。昨夜西风凋碧树，独上高楼，望尽天涯路。欲寄彩笺兼尺素，山长水阔知何处！","伫倚危楼风细细，望极春愁，黯黯生天际。草色烟光残照里，无言谁会凭阑意。拟把疏狂图一醉，对酒当歌，强乐还无味。衣带渐宽终不悔，为伊消得人憔悴。","庭院深深深几许，杨柳堆烟，帘幕无重数。玉勒雕鞍游冶处，楼高不见章台路。雨横风狂三月暮，门掩黄昏，无计留春住。泪眼问花花不语，乱红飞过秋千去。","花褪残红青杏小。燕子飞时，绿水人家绕。枝上柳绵吹又少，天涯何处无芳草。墙里秋千墙外道。墙外行人，墙里佳人笑。笑渐不闻声渐悄，多情却被无情恼。","飞花两岸照船红，百里榆堤半日风。卧看满天云不动，不知云与我俱东。","明月别枝惊鹊，清风半夜鸣蝉。稻花香里说丰年，听取蛙声一片。七八个星天外，两三点雨山前。旧时茅店社林边，路转溪桥忽见。","佳丽地，南朝盛事谁记？山围故国绕清江，髻鬟对起。怒涛寂寞打孤城，风樯遥度天际。","半亩方塘一鉴开，天光云影共徘徊。问渠那得清如许？为有源头活水来。","昨夜江边春水生，蒙冲巨舰一毛轻。向来枉费推移力，此日中流自在行。","当年万里觅封侯，匹马戍梁州。关河梦断何处？尘暗旧貂裘。胡未灭，鬓先秋，泪空流。此生谁料，心在天山，身老沧洲。","自古功名亦苦辛，行藏终欲付何人。当时黮闇犹承误，末俗纷纭更乱真。","甚矣吾衰矣。怅平生、交游零落，只今余几！我见青山多妩媚，料青山见我应如是。情与貌，略相似。一尊搔首东窗里。想渊明、《停云》诗就，此时风味。江左沉酣求名者，岂识浊醪妙理。回首叫、云飞风起。不恨古人吾不见，恨古人不见吾狂耳。知我者，二三子。","绿树听鹈鴂，更那堪、鹧鸪声住，杜鹃声切。啼到春归无寻处，苦恨芳菲都歇。算未抵、人间离别。马上琵琶关塞黑，更长门翠辇辞金阙。将军百战身名裂。向河梁、回头万里，故人长绝。易水萧萧西风冷，满座衣冠似雪。正壮士、悲歌未彻。啼鸟还知如许恨，料不啼清泪长啼血。谁共我，醉明月。","北望神州路，试平章、这场公事，怎生分付？记得太行山百万，曾入宗爷驾驭。今把作、握蛇骑虎。君去京东豪杰喜，想投戈、下拜真吾父。谈笑里，定齐鲁。","荷尽已无擎雨盖，菊残犹有傲霜枝。一年好景君须记，最是橙黄橘绿时。","候馆梅残，溪桥柳细，草薰风暖摇征辔。离愁渐远渐无穷，迢迢不断如春水。寸寸柔肠，盈盈粉泪，楼高莫近危阑倚。平芜尽处是春山，行人更在春山外。","雾失楼台，月迷津渡，桃源望断无寻处。可堪孤馆闭春寒，杜鹃声里斜阳暮。驿寄梅花，鱼传尺素，砌成此恨无重数。郴江幸自绕郴山，为谁流下潇湘去？","卜宅新息仅留期，更作留侯计亦迟。黄阁风烟那复问，青山泉石本无期。","莫言下岭便无难，赚得行人空喜欢。正入万山圈子里，一山放过一山拦。","辛苦遭逢起一经，干戈寥落四周星。山河破碎风飘絮，身世浮沉雨打萍。惶恐滩头说惶恐，零丁洋里叹零丁。人生自古谁无死？留取丹心照汗青。","三月残花落更开，小檐日日燕飞来。子规夜半犹啼血，不信东风唤不回。","薄雾浓云愁永昼，瑞脑销金兽。佳节又重阳，玉枕纱厨，半夜凉初透。东篱把酒黄昏后，有暗香盈袖。莫道不销魂，帘卷西风，人比黄花瘦。","群芳过后西湖好，狼籍残红，飞絮蒙蒙，垂柳阑干尽日风。笙歌散尽游人去，始觉春空，垂下帘栊，双燕归来细雨中。","一天秋色冷晴湾，无数峰峦远近间。闲上山来看野水，忽于水底见青山。","红酥手，黄縢酒，满城春色宫墙柳。东风恶，欢情薄。一怀愁绪，几年离索。错、错、错。春如旧，人空瘦，泪痕红浥鲛绡透。桃花落，闲池阁。山盟虽在，锦书难托。莫、莫、莫！","涧水无声绕竹流，竹西花草弄春柔。茅檐相对坐终日，一鸟不鸣山更幽。","梅子留酸软齿牙，芭蕉分绿与窗纱。日长睡起无情思，闲看儿童捉柳花。","满川风雨独凭栏，绾结湘娥十二鬟。可惜不当湖水面，银山堆里看青山。","一雨池塘水面平，淡磨明镜照檐楹。东风忽起垂杨舞，更作荷心万点声。","寒蝉凄切，对长亭晚，骤雨初歇。都门帐饮无绪，留恋处，兰舟催发。执手相看泪眼，竟无语凝噎。念去去，千里烟波，暮霭沉沉楚天阔。多情自古伤离别，更那堪，冷落清秋节！今宵酒醒何处？杨柳岸，晓风残月。此去经年，应是良辰好景虚设。便纵有千种风情，更与何人说？","梅雪争春未肯降，骚人阁笔费评章。梅须逊雪三分白，雪却输梅一段香。","有梅无雪不精神，有雪无诗俗了人。日暮诗成天又雪，与梅并作十分春。","凌波不过横塘路，但目送、芳尘去。锦瑟华年谁与度？月桥花院，琐窗朱户，只有春知处。飞云冉冉蘅皋暮，彩笔新题断肠句。试问闲愁都几许？一川烟草，满城风絮，梅子黄时雨。","东风夜放花千树，更吹落、星如雨。宝马雕车香满路。凤箫声动，玉壶光转，一夜鱼龙舞。蛾儿雪柳黄金缕，笑语盈盈暗香去。众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。","山外青山楼外楼，西湖歌舞几时休？暖风熏得游人醉，直把杭州作汴州。","寺里山因花得名，繁英不见草纵横。栽培剪伐须勤力，花易凋零草易生。","横看成岭侧成峰，远近高低各不同。不识庐山真面目，只缘身在此山中。","野水参差落涨痕，疏林欹倒出霜根。","水光潋滟晴方好，山色空蒙雨亦奇。欲把西湖比西子，淡妆浓抹总相宜。","纤云弄巧，飞星传恨，银汉迢迢暗度。金风玉露一相逢，便胜却人间无数。柔情似水，佳期如梦，忍顾鹊桥归路。两情若是久长时，又岂在朝朝暮暮。","彩袖殷勤捧玉钟，当年拚却醉颜红。舞低杨柳楼心月，歌尽桃花扇底风。从别后，忆相逢，几回魂梦与君同。今宵剩把银釭照，犹恐相逢是梦中。","陌上柔桑破嫩芽，东邻蚕种已生些。平冈细草鸣黄犊，斜日寒林点暮鸦。山远近，路横斜，青旗沽酒有人家。城中桃李愁风雨，春在溪头荠菜花。","日暮鸟雀稀，稚子呼牛归。住处无利害，勿言翁独非。","南陌秋风欲老，北林暮雨初过。此际离居最苦，况复萧条岁华。","雨歇杨林东渡头，永和三日荡轻舟。故人家在桃花岸，直到门前溪水流。","沅湘流不尽，屈子怨何深。日暮秋风起，萧萧枫树林。","不见李生久，佯狂真可哀。世人皆欲杀，吾意独怜才。敏捷诗千首，飘零酒一杯。匡山读书处，头白好归来。","人事有代谢，往来成古今。江山留胜迹，我辈复登临。水落鱼梁浅，天寒梦泽深。羊公碑尚在，读罢泪沾襟。","将军魏武之子孙，于今为庶为清门。英雄割据虽已矣，文采风流今尚存。学书初学卫夫人，但恨无过王右军。丹青不知老将至，富贵于我如浮云。开元之中常引见，承恩数上南薰殿。凌烟功臣少颜色，将军下笔开生面。良骥头上盘戏龙，一洗万古凡马空。","为有云屏无限娇，凤城寒尽怕春宵。无端嫁得金龟婿，辜负香衾事早朝。","三月三日天气新，长安水边多丽人。态浓意远淑且真，肌理细腻骨肉匀。绣罗衣裳照暮春，蹙金孔雀银麒麟。头上何所有？翠微盍叶垂鬓唇。背后何所见？珠压腰衱稳称身。就中云幕椒房亲，赐名大国虢与秦。紫驼之峰出翠釜，水精之盘行素鳞。犀箸厌饫久未下，鸾刀缕切空纷纶。黄门飞鞚不动尘，御厨络绎送八珍。箫鼓哀吟感鬼神，宾从杂遝实要津。后来鞍马何逡巡，当轩下马入锦茵。杨花雪落覆白苹，青鸟飞去衔红巾。炙手可热势绝伦，慎莫近前丞相嗔！","林花谢了春红，太匆匆。无奈朝来寒雨晚来风。胭脂泪，相留醉，几时重。自是人生长恨水长东。","朱雀桥边野草花，乌衣巷口夕阳斜。旧时王谢堂前燕，飞入寻常百姓家。","向晚意不适，驱车登古原。夕阳无限好，只是近黄昏。","老去悲秋强自宽，兴来今日尽君欢。羞将短发还吹帽，笑倩旁人为正冠。蓝水远从千涧落，玉山高并两峰寒。明年此会知谁健，醉把茱萸仔细看。","独在异乡为异客，每逢佳节倍思亲。遥知兄弟登高处，遍插茱萸少一人。","九月九日眺山川，归心归望积风烟。他乡共酌金花酒，万里同悲鸿雁天。","七夕今宵看碧霄，牵牛织女渡河桥。家家乞巧望秋月，穿尽红丝几万条。","绿遍山原白满川，子规声里雨如烟。乡村四月闲人少，才了蚕桑又插田。","长镵长镵白木柄，我生托子以为命。黄精无苗山雪盛，短衣数挽不掩胫。此时与子空归来，男呻女吟四壁静。呜呼二歌兮歌始放，邻里为我色惆怅！","二月二日江上行，东风日暖闻吹笙。花须柳眼各无赖，紫蝶黄蜂俱有情。万里忆归元亮井，三年从事亚夫营。新滩莫悟游人意，更作风檐夜雨声。","此地别燕丹，壮士发冲冠。昔时人已没，今日水犹寒。","东西那有碍，出处岂虚心。晓入洞庭阔，春归云梦深。","烽火照西京，心中自不平。牙璋辞凤阙，铁骑绕龙城。雪暗凋旗画，风多杂鼓声。宁为百夫长，胜作一书生。","青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。","琵琶起舞换新声，总是关山旧别情。撩乱边愁听不尽，高高秋月照长城。","大漠风尘日色昏，红旗半卷出辕门。前军夜战洮河北，已报生擒吐谷浑。","九日驱驰一日闲，寻君不遇又空还。怪来诗思清人骨，门对寒流雪满山。","二月卖新丝，五月粜新谷。医得眼前疮，剜却心头肉。我愿君王心，化作光明烛。不照绮罗筵，只照逃亡屋。","单车欲问边，属国过居延。征蓬出汉塞，归雁入胡天。大漠孤烟直，长河落日圆。萧关逢候骑，都护在燕然。","紫陌红尘拂面来，无人不道看花回。玄都观里桃千树，尽是刘郎去后栽。","功盖三分国，名成八阵图。江流石不转，遗恨失吞吴。","种花满西园，花发青楼道。花下一禾生，去之为恶草。","凉月如眉挂柳湾，越中山色镜中看。兰溪三日桃花雨，半夜鲤鱼来上滩。","明月出天山，苍茫云海间。长风几万里，吹度玉门关。汉下白登道，胡窥青海湾。由来征战地，不见有人还。[戍]客望边色，思归多苦颜。高楼当此夜，叹息未应闲。","车辚辚，马萧萧，行人弓箭各在腰。耶娘妻子走相送，尘埃不见咸阳桥。牵衣顿足拦道哭，哭声直上干云霄。道旁过者问行人，行人但云点行频。或从十五北防河，便至四十西营田。去时里正与裹头，归来头白还戍边。边庭流血成海水，武皇开边意未已。君不闻汉家山东二百州，千村万落生荆杞。纵有健妇把锄犁，禾生陇亩无东西。况复秦兵耐苦战，被驱不异犬与鸡。长者虽有问，役夫敢申恨？且如今年冬，未休关西卒。县官急索租，租税从何出？信知生男恶，反是生女好。生女犹得嫁比邻，生男埋没随百草。君不见青海头，古来白骨无人收。新鬼烦冤旧鬼哭，天阴雨湿声啾啾。","百亩庭中半是苔，桃花净尽菜花开。种桃道士归何处？前度刘郎今又来。","去岁曾经此县城，县民无口不冤声。今来县宰加朱绂，便是生灵血染成。","骝马新跨白玉鞍，战罢沙场月色寒。城头铁鼓声犹震，匣里金刀血未干。","夜半呼儿趁晓耕，羸牛无力渐艰行。时人不识农家苦，将谓田中谷自生。","黄河远上白云间，一片孤城万仞山。羌笛何须怨杨柳，春风不度玉门关。","葡萄美酒夜光杯，欲饮琵琶马上催。醉卧沙场君莫笑，古来征战几人回。","客去波平槛，蝉休露满枝。永怀当此节，倚立自移时。北斗兼春远，南陵寓使迟。天涯占梦数，疑误有新知。","秦时明月汉时关，万里长征人未还。但使龙城飞将在，不教胡马度阴山。","居延城外猎天骄，白草连天野火烧。暮云空碛时驱马，秋日平原好射雕。护羌校尉朝乘障，破虏将军夜渡辽。玉靶角弓珠勒马，汉家将赐霍嫖姚。","嫩箨香苞初出林，於陵论价重如金。皇都陆海应无数，忍剪凌云一寸心。","澹然空水对斜晖，曲岛苍茫接翠微。波上马嘶看棹去，柳边人歇待船归。","霜华净天末，雾色锁江干。风度蝉声远，云开雁路残。","千里黄云白日曛，北风吹雁雪纷纷。莫愁前路无知己，天下谁人不识君。","六翮飘飖私自怜，一离京洛十余年。丈夫贫贱应未足，今日相逢无酒钱。","挽弓当挽强，用箭当用长。射人先射马，擒贼先擒王。杀人亦有限，列国自有疆。苟能制侵陵，岂在多杀伤！","十年磨一剑，霜刃未曾试。今日把示君，谁有不平事？","残阳西入崦，茅屋访孤僧。落叶人何在，寒云路几层。独敲初夜磬，闲倚一枝藤。世界微尘里，吾宁爱与憎。","中庭地白树栖鸦，冷露无声湿桂花。今夜月明人尽望，不知秋思落谁家。","卖炭翁，伐薪烧炭南山中。满面尘灰烟火色，两鬓苍苍十指黑。卖炭得钱何所营？身上衣裳口中食。可怜身上衣正单，心忧炭贱愿天寒。夜来城外一尺雪，晓驾炭车辗冰辙。牛困人饥日已高，市南门外泥中歇。翩翩两骑来是谁？黄衣使者白衫儿。手把文书口称敕，回车叱牛牵向北。一车炭，千余斤，宫使驱将惜不得。半匹红绡一丈绫，系向牛头充炭直。","南浦凄凄别，西风袅袅秋。一看肠一断，好去莫回头。","澹澹长江水，悠悠远客情。落花相与恨，到地一无声。","武陵溪口驻扁舟，溪水随君向北流。行到荆门上三峡，莫将孤月对猿愁。","堂前扑枣任西邻，无食无儿一妇人。不为困穷宁有此？只缘恐惧转须亲。即防远客虽多事，便插疏篱却甚真。已诉征求贫到骨，正思戎马泪盈巾。","白日登山望烽火，黄昏饮马傍交河。行人刁斗风沙暗，公主琵琶幽怨多。野云万里无城郭，雨雪纷纷连大漠。胡鴈哀鸣夜夜飞，胡儿眼泪双双落。闻道玉门犹被遮，应将性命逐轻车。年年战骨埋荒外，空见蒲桃入汉家。","虽复沉埋无所用，犹能夜夜气冲天。","男儿事长征，少小幽燕客。赌胜马蹄下，由来轻七尺。杀人莫敢前，须如猬毛磔。黄云陇底白雪飞，未得报恩不能归。辽东小妇年十五，惯弹琵琶解歌舞。今为羗笛出塞声，使我三军泪如雨。","小时不识月，呼作白玉盘。又疑瑶台镜，飞在青云端。","孔明庙前有老柏，柯如青铜根如石。霜皮溜雨四十围，黛色参天二千尺。君臣已与时际会，树木犹为人爱惜。云来气接巫峡长，月出寒通雪山白。忆昨路绕锦亭东，先主武侯同閟宫。崔嵬枝干郊原古，窈窕丹青户牖空。落落盘踞虽得地，冥冥孤高多烈风。扶持自是神明力，正直原因造化功。大厦如倾要梁栋，万牛回首丘山重。不露文章世已惊，未辞剪伐谁能送？苦心未免容蝼蚁，香叶终经宿鸾凤。志士幽人莫怨嗟，古来材大难为用。","自恨寻芳到已迟，往年曾见未开时。如今风摆花狼藉，绿叶成阴子满枝。","高卧南斋时，开帷月初吐。清辉淡水木，演漾在窗户。苒苒几盈虚，澄澄变今古。美人清江畔，是夜越吟苦。千里其如何，微风吹兰杜。","有客有客字子美，白头乱发垂过耳。岁拾橡栗随狙公，天寒日暮山谷里。中原无书归不得，手脚冻皴皮肉死。呜呼一歌兮歌已哀，悲风为我从天来！","危冠广袖楚宫妆，独步闲庭逐夜凉。自把玉钗敲砌竹，清歌一曲月如霜。","鸣筝金粟柱，素手玉房前。欲得周郎顾，时时误拂弦。","蔡女昔造胡笳声，一弹一十有八拍。胡人落泪沾边草，汉使断肠对归客。","蜀僧抱绿绮，西下峨眉峰。为我一挥手，如听万壑松。客心洗流水，余响入霜钟。不觉碧山暮，秋云暗几重。","高秋夜分后，远客雁来时。明月余清影，秋风生桂枝。","独有宦游人，偏惊物候新。云霞出海曙，梅柳渡江春。淑气催黄鸟，晴光转绿蘋。","胡人吹笛戍楼间，楼上萧条海月闲。借问落梅凡几曲，从风一夜满关山。","鸡鸣紫陌曙光寒，莺啭皇州春色阑。金阙晓钟开万户，玉阶仙仗拥千官。花迎剑佩星初落，柳拂旌旗露未干。独有凤凰池上客，阳春一曲和皆难。","绛帻鸡人报晓筹，尚衣方进翠云裘。九天阊阖开宫殿，万国衣冠拜冕旒。日色才临仙掌动，香烟欲傍衮龙浮。朝罢须裁五色诏，佩声归到凤池头。","尚有绨袍赠，应怜范叔寒。不知天下士，犹作布衣看。","群山万壑赴荆门，生长明妃尚有村。一去紫台连朔漠，独留青冢向黄昏。画图省识春风面，环珮空归夜月魂。千载琵琶作胡语，分明怨恨曲中论。","支离东北风尘际，漂泊西南天地间。三峡楼台淹日月，五溪衣服共云山。羯胡事主终无赖，词客哀时且未还。庾信平生最萧瑟，暮年诗赋动江关。","摇落深知宋玉悲，风流儒雅亦吾师。怅望千秋一洒泪，萧条异代不同时。江山故宅空文藻，云雨荒台岂梦思。最是楚宫俱泯灭，舟人指点到今疑。","诸葛大名垂宇宙，宗臣遗像肃清高。三分割据纡筹策，万古云霄一羽毛。伯仲之间见伊吕，指挥若定失萧曹。运移汉祚终难复，志决身歼军务劳。","蜀主窥吴幸三峡，崩年亦在永安宫。翠华想像空山里，玉殿虚无野寺中。古庙杉松巢水鹤，岁时伏腊走村翁。武侯祠屋常邻近，一体君臣祭祀同。","碧玉妆成一树高，万条垂下绿丝绦。不知细叶谁裁出，二月春风似剪刀。","逐舞飘轻袖，传歌共绕梁。动枝生乱影，吹花送远香。","鹅，鹅，鹅，曲项向天歌。白毛浮绿水，红掌拨清波。","一上高城万里愁，蒹葭杨柳似汀洲。溪云初起日沉阁，山雨欲来风满楼。鸟下绿芜秦苑夕，蝉鸣黄叶汉宫秋。行人莫问当年事，故国东来渭水流。","少陵野老吞声哭，春日潜行曲江曲。江头宫殿锁千门，细柳新蒲为谁绿？忆昔霓旌下南苑，苑中万物生颜色。昭阳殿里第一人，同辇随君侍君侧。辇前才人带弓箭，白马嚼啮黄金勒。翻身向天仰射云，一笑正坠双飞翼。明眸皓齿今何在？血污游魂归不得。清渭东流剑阁深，去住彼此无消息。人生有情泪沾臆，江水江花岂终极！黄昏胡骑尘满城，欲往城南望城北。","长安城头头白乌，夜飞延秋门上呼。又向人家啄大屋，屋底达官走避胡。金鞭断折九马死，骨肉不待同驰驱。腰下宝玦青珊瑚，可怜王孙泣路隅。问之不肯道姓名，但道困苦乞奴卢。已经百日窜荆棘，身上无有完肌肤。高帝子孙尽隆准，龙种自与常人殊。豺狼在邑龙在野，王孙善保千金躯。不敢长语临交衢，且为王孙立斯须。昨夜东风吹血腥，东来橐驼满旧都。朔方健儿好身手，昔何勇锐今何愚。窃闻天子已传位，圣德北服南单于。花门剺面请雪耻，慎勿出口他人狙。哀哉王孙慎勿疏，五陵佳气无时无。","北斗七星高，哥舒夜带刀。至今窥牧马，不敢过临洮。","晨起动征铎，客行悲故乡。鸡声茅店月，人迹板桥霜。槲叶落山路，枳花明驿墙。因思杜陵梦，凫雁满回塘。","少小离家老大回，乡音无改鬓毛衰。儿童相见不相识，笑问客从何处来。","离别家乡岁月多，近来人事半消磨。惟有门前镜湖水，春风不改旧时波。","西陆蝉声唱，南冠客思深。不堪玄鬓影，来对白头吟。露重飞难进，风多响易沉。无人信高洁，谁为表予心。","四郊未宁静，垂老不得安。子孙阵亡尽，焉用身独完！投杖出门去，同行为辛酸。幸有牙齿存，所悲骨髓干。男儿既介胄，长揖别上官。老妻卧路啼，岁暮衣裳单。孰知是死别，且复伤其寒。此去必不归，还闻劝加餐。土门壁甚坚，杏园度亦难。势异邺城下，纵死时犹宽。人生有离合，岂择衰老端！忆昔少壮日，迟回竟长叹。万国尽征戍，烽火被冈峦。积尸草木腥，流血川原丹。何乡为乐土，安敢尚盘桓！弃绝蓬室居，塌然摧肺肝。","诗家清景在新春，绿柳才黄半未匀。若待上林花似锦，出门俱是看花人。","酒旗相望大堤头，堤下连樯堤上楼。日暮行人争渡急，桨声幽轧满中流。","汉家旌帜满阴山，不遣胡儿匹马还。愿得此身长报国，何须生入玉门关。","蝉鸣空桑林，八月萧关道。出塞入塞寒，处处黄芦草。从来幽并客，皆共尘沙老。莫学游侠儿，矜夸紫骝好。","月黑雁飞高，单于夜遁逃。欲将轻骑逐，大雪满弓刀。","林暗草惊风，将军夜引弓。平明寻白羽，没在石棱中。","玉帛朝回望帝乡，乌孙归去不称王。天涯静处无征战，兵气销为日月光。","鹫翎金仆姑，燕尾绣蝥弧。独立扬新令，千营共一呼。","回乐烽前沙似雪，受降城外月如霜。不知何处吹芦管，一夜征人尽望乡。","危楼高百尺，手可摘星辰。不敢高声语，恐惊天上人。","山寺钟鸣昼已昏，渔梁渡头争渡喧。人随沙岸向江村，余亦乘舟归鹿门。鹿门月照开烟树，忽到庞公栖隐处。岩扉松径长寂寥，惟有幽人自来去。","君问归期未有期，巴山夜雨涨秋池。何当共剪西窗烛，却话巴山夜雨时。","已讶衾枕冷，复见窗户明。夜深知雪重，时闻折竹声。","人间四月芳菲尽，山寺桃花始盛开。长恨春归无觅处，不知转入此中来。","凉风起天末，君子意如何？鸿雁几时到？江湖秋水多。文章憎命达，魑魅喜人过。应共冤魂语，投诗赠汨罗。","春日在天涯，天涯日又斜。莺啼如有泪，为湿最高花。","渭水自萦秦塞曲，黄山旧绕汉宫斜。銮舆迥出千门柳，阁道回看上苑花。云里帝城双凤阙，雨中春树万人家。为乘阳气行时令，不是宸游玩物华。","东望望春春可怜，更逢晴日柳含烟。宫中下见南山尽，城上平临北斗悬。细草徧承回辇处，轻花微落奉觞前。宸游对此欢无极，鸟哢声声入管弦。","纨袴不饿死，儒冠多误身。丈人试静听，贱子请具陈。甫昔少年日，早充观国宾。读书破万卷，下笔如有神。赋料扬雄敌，诗看子建亲。李邕求识面，王翰愿为邻。自谓颇挺出，立登要路津。致君尧舜上，再使风俗淳。此意竟萧条，行歌非隐沦。骑驴三十载，旅食京华春。朝扣富儿门，暮随肥马尘。残杯与冷炙，到处潜悲辛。","乳燕入巢笋成竹，谁家二女种新谷。无人无牛不及犁，持刀斫地翻作泥。自言家贫母年老，长兄从军未娶嫂。去年灾疫牛囤空，截绢买刀都市中。头巾掩面畏人识，以刀代牛谁与同。姊妹相携心正苦，不见路人唯见土。疏通畦陇防乱苗，整顿沟塍待时雨。日正南冈下饷归，可怜朝雉扰惊飞。东邻西舍花发尽，共惜余芳泪满衣。","云母屏风烛影深，长河渐落晓星沉。嫦娥应悔偷灵药，碧海青天夜夜心。","明朝驿使发，一夜絮征袍。素手抽针冷，那堪把剪刀。裁缝寄远道，几日到临洮。","镜湖三百里，菡萏发荷花。五月西施采，人看隘若耶。回舟不待月，归去越王家。","秦地罗敷女，采桑绿水边。素手青条上，红妆白日鲜。蚕饥妾欲去，五马莫留连。","长安一片月，万户捣衣声。秋风吹不尽，总是玉关情。何日平胡虏，良人罢远征。","孤雁不饮啄，飞鸣声念群。谁怜一片影，相失万重云？望尽似犹见，哀多如更闻。野鸦无意绪，鸣噪自纷纷。","迢递高城百尺楼，绿杨枝外尽汀洲。贾生年少虚垂涕，王粲春来更远游。","兰陵美酒郁金香，玉碗盛来琥珀光。但使主人能醉客，不知何处是他乡。","舍南舍北皆春水，但见群鸥日日来。花径不曾缘客扫，蓬门今始为君开。盘飧市远无兼味，樽酒家贫只旧醅。肯与邻翁相对饮，隔篱呼取尽余杯。","弃我去者，昨日之日不可留；乱我心者，今日之日多烦忧。长风万里送秋雁，对此可以酣高楼。蓬莱文章建安骨，中间小谢又清发。俱怀逸兴壮思飞，欲上青天揽明月。抽刀断水水更流，举杯消愁愁更愁。人生在世不称意，明朝散发弄扁舟。","故国三千里，深宫二十年。一声何满子，双泪落君前。","清秋幕府井梧寒，独宿江城蜡炬残。永夜角声悲自语，中天月色好谁看。风尘荏苒音书绝，关塞萧条行路难。已忍伶俜十年事，强移栖息一枝安。","移舟泊烟渚，日暮客愁新。野旷天低树，江清月近人。","山暝听猿愁，沧江急夜流。风鸣两岸叶，月照一孤舟。建德非吾土，维扬忆旧游。还将两行泪，遥寄海西头。","清溪深不测，隐处唯孤云。松际露微月，清光犹为君。茅亭宿花影，药院滋苔纹。余亦谢时去，西山鸾鹤群。","竹坞无尘水槛清，相思迢递隔重城。秋阴不散霜飞晚，留得枯荷听雨声。","联步趋丹陛，分曹限紫微。晓随天仗入，暮惹御香归。白发悲花落，青云羡鸟飞。圣朝无阙事，自觉谏书稀。","青山隐隐水迢迢，秋尽江南草未凋。二十四桥明月夜，玉人何处教吹箫。","去年花里逢君别，今日花开又一年。世事茫茫难自料，春愁黯黯独成眠。","寒月沉沉洞房静，真珠帘外梧桐影。秋霜欲下手先知，灯底裁缝剪刀冷。","春城无处不飞花，寒食东风御柳斜。日暮汉宫传蜡烛，轻烟散入五侯家。","清溪一道穿桃李，演漾绿蒲涵白芷。溪上人家凡几家，落花半落东流水。蹴踘屡过飞鸟上，秋千竞出垂杨里。少年欢乐日已老，谁能今朝更如此。","一路经行处，莓苔见履痕。白云依静渚，春草闭闲门。过雨看松色，随山到水源。溪花与禅意，相对亦忘言。","松下问童子，言师采药去。只在此山中，云深不知处。","我本渔樵孟诸野，一生自是悠悠者。乍可狂歌草泽中，宁堪作吏风尘下。秪言小邑无所为，公门百事皆有期。拜迎官长心欲碎，鞭挞黎庶令人悲。归来向家问妻子，举家尽笑今如此。生事应须南亩田，世情付与东流水。梦想旧山安在哉，为衔君命且迟廻。乃知梅福徒为尔，转忆陶潜归去来。","清时有味是无能，闲爱孤云静爱僧。欲把一麾江海去，乐游原上望昭陵。","君不见黄河之水天上来，奔流到海不复回。君不见高堂明镜悲白发，朝如青丝暮成雪。人生得意须尽欢，莫使金樽空对月。天生我材必有用，千金散尽还复来。烹羊宰牛且为乐，会须一饮三百杯。岑夫子，丹丘生，将进酒，杯莫停。与君歌一曲，请君为我倾耳听。钟鼓馔玉不足贵，但愿长醉不复醒。古来圣贤皆寂寞，惟有饮者留其名。陈王昔时宴平乐，斗酒十千恣欢谑。主人何为言少钱，径须沽取对君酌。五花马，千金裘，呼儿将出换美酒，与尔同销万古愁。","佳辰强饮食犹寒，隐几萧条戴鹖冠。春水船如天上坐，老年花似雾中看。娟娟戏蝶过闲幔，片片轻鸥下急湍。云白山青万余里，愁看直北是长安。","自小刺头深草里，而今渐觉出蓬蒿。时人不识凌云木，直待凌云始道高。","花雪随风不厌看，更多还肯失林峦。愁人正在书窗下，一片飞来一片寒。","长江悲已滞，万里念将归。况属高风晚，山山黄叶飞。","夫因兵死守蓬茅，麻苎衣衫鬓发焦。桑柘废来犹纳税，田园荒后尚征苗。时挑野菜和根煮，旋斫生柴带叶烧。任是深山更深处，也应无计避征徭。","问余何意栖碧山，笑而不答心自闲。桃花流水窅然去，别有天地非人间。","寂寞掩柴扉，苍茫对落晖。鹤巢松树遍，人访荜门稀。绿竹含新粉，红莲落故衣。渡头烟火起，处处采菱归。","空山新雨后，天气晚来秋。明月松间照，清泉石上流。竹喧归浣女，莲动下渔舟。随意春芳歇，王孙自可留。","梁园日暮乱飞鸦，极目萧条三两家。庭树不知人去尽，春来还发旧时花。","远上寒山石径斜，白云生处有人家。停车坐爱枫林晚，霜叶红于二月花。","弥年不得意，新岁又如何？念昔同游者，而今有几多？以闲为自在，将寿补蹉跎。春色无情故，幽居亦见过。","北阙休上书，南山归敝庐。不才明主弃，多病故人疏。白发催年老，青阳逼岁除。永怀愁不寐，松月夜窗虚。","十年曾一别，征路此相逢。马首向何处？夕阳千万峰。","一封朝奏九重天，夕贬潮州路八千。欲为圣明除弊事，肯将衰朽惜残年！云横秦岭家何在？雪拥蓝关马不前。知汝远来应有意，好收吾骨瘴江边。","碧阑干外绣帘垂，猩色屏风画折枝。八尺龙须方锦褥，已凉天气未寒时。","贵贱虽异等，出门皆有营。独无外物牵，遂此幽居情。微雨夜来过，不知春草生。青山忽已曙，鸟雀绕舍鸣。时与道人偶，或随樵者行。自当安蹇劣，谁谓薄世荣。","西登香炉峰，南见瀑布水。挂流三百丈，喷壑数十里。欻如飞电来，隐若白虹起。初惊河汉落，半洒云天里。仰观势转雄，壮哉造化功。海风吹不断，江月照还空。","我本楚狂人，凤歌笑孔丘。手持绿玉杖，朝别黄鹤楼。五岳寻仙不辞远，一生好入名山游。庐山秀出南斗傍，屏风九叠云锦张。影落明湖青黛光，金阙前开二峰长。银河倒挂三石梁，香炉瀑布遥相望。回崖沓嶂凌苍苍，翠影红霞映朝日，鸟飞不到吴天长。登高壮观天地间，大江茫茫去不还。黄云万里动风色，白波九道流雪山。好为庐山谣，兴因庐山发。闲窥石镜清我心，谢公行处苍苔没。早服还丹无世情，琴心三叠道初成。遥见仙人彩云里，手把芙蓉朝玉京。先期汗漫九垓上，愿接卢敖游太清。","遥遥去巫峡，望望下章台。巴国山川尽，荆门烟雾开。城分苍野外，树断白云隈。今日狂歌客，谁知入楚来。","泠泠七弦上，静听松风寒。古调虽自爱，今人多不弹。","清川带长薄，车马去闲闲。流水如有意，暮禽相与还。荒城临古渡，落日满秋山。迢递嵩高下，归来且闭关。","海燕虽微眇，乘春亦暂来。岂知泥滓贱，只见玉堂开。","东来万里客，乱定几年归？肠断江城雁，高高正北飞。","漠漠秋云起，稍稍夜寒生。但觉衣裳湿，无点亦无声。","定定住天涯，依依向物华。寒梅最堪恨，常作去年花。","江南好，风景旧曾谙。日出江花红胜火，春来江水绿如蓝。能不忆江南？","江南忆，最忆是杭州。山寺月中寻桂子，郡亭枕上看潮头。何日更重游？","美人卷珠帘，深坐蹙蛾眉。但见泪痕湿，不知心恨谁。","锄禾日当午，汗滴禾下土。谁知盘中餐，粒粒皆辛苦。","春种一粒粟，秋收万颗子。四海无闲田，农夫犹饿死。","兰叶春葳蕤，桂华秋皎洁。欣欣此生意，自尔为佳节。谁知林栖者，闻风坐相悦。草木有本心，何求美人折！","兰若生春夏，芊蔚何青青。幽独空林色，朱蕤冒紫茎。迟迟白日晚，袅袅秋风生。岁华尽摇落，芳意竟何成。","庾信文章老更成，凌云健笔意纵横。今人嗤点流传赋，不觉前贤畏后生。","王杨卢骆当时体，轻薄为文哂未休。尔曹身与名俱灭，不废江河万古流。","胡马大宛名，锋棱瘦骨成。竹批双耳峻，风入四蹄轻。所向无空阔，真堪托死生。骁腾有如此，万里可横行。","青天有月来几时？我今停杯一问之。人攀明月不可得，月行却与人相随。皎如飞镜临丹阙，绿烟灭尽清辉发。但见宵从海上来，宁知晓向云间没。白兔捣药秋复春，嫦娥孤栖与谁邻？今人不见古时月，今月曾经照古人。古人今人若流水，共看明月皆如此。唯愿当歌对酒时，月光长照金樽里。","今代麒麟阁，何人第一功？君王自神武，驾驭必英雄。开府当朝杰，论兵迈古风。先锋百战在，略地两隅空。青海无传箭，天山早挂弓。廉颇仍走敌，魏绛已和戎。每惜河湟弃，新兼节制通。智谋垂睿想，出入冠诸公。日月低秦树，乾坤绕汉宫。胡人愁逐北，宛马又从东。受命边沙远，归来御席同。轩墀曾宠鹤，畋猎旧非熊。茅土加名数，山河誓始终。策行遗战伐，契合动昭融。勋业青冥上，交亲气概中。未为珠履客，已见白头翁。壮节初题柱，生涯独转蓬。几年春草歇，今日暮途穷。军事留孙楚，行间识吕蒙。防身一长剑，将欲倚崆峒。","开帘见新月，便即下阶拜。细语人不闻，北风吹裙带。","芙蓉阙下会千官，紫禁朱樱出上兰。才是寝园春荐后，非关御苑鸟衔残。归鞍竞带青丝笼，中使频倾赤玉盘。饱食不须愁内热，大官还有蔗浆寒。","兔丝附蓬麻，引蔓故不长。嫁女与征夫，不如弃路旁。结发为君妻，席不暖君床。暮婚晨告别，无乃太匆忙。君行虽不远，守边赴河阳。妾身未分明，何以拜姑嫜？父母养我时，日夜令我藏。生女有所归，鸡狗亦得将。君今往死地，沉痛迫中肠。誓欲随君去，形势反苍黄。勿为新婚念，努力事戎行。妇人在军中，兵气恐不扬。自嗟贫家女，久致罗襦裳。罗襦不复施，对君洗红妆。仰视百鸟飞，大小必双翔。人事多错迕，与君永相望。","三日入厨下，洗手作羹汤。未谙姑食性，先遣小姑尝。","客行新安道，喧呼闻点兵。借问新安吏，县小更无丁。府帖昨夜下，次选中男行。中男绝短小，何以守王城？肥男有母送，瘦男独伶俜。白水暮东流，青山犹哭声。莫自使眼枯，收汝泪纵横。眼枯即见骨，天地终无情。我军取相州，日夕望其平。岂意贼难料，归军星散营。就粮近故垒，练卒依旧京。掘壕不到水，牧马役亦轻。况乃王师顺，抚养甚分明。送行勿泣血，仆射如父兄。","乡心新岁切，天畔独潸然。老至居人下，春归在客先。岭猿同旦暮，江柳共风烟。","新晴原野旷，极目无氛垢。郭门临渡头，村树连溪口。白水明田外，碧峰出山后。农月无闲人，倾家事南亩。","细草微风岸，危樯独夜舟。星垂平野阔，月涌大江流。名岂文章著，官应老病休。飘飘何所似，天地一沙鸥。","寂寞天宝后，园庐但蒿藜。我里百余家，世乱各东西。存者无消息，死者为尘泥。贱子因阵败，归来寻旧蹊。久行见空巷，日瘦气惨凄。但对狐与狸，竖毛怒我啼。四邻何所有？一二老寡妻。宿鸟恋本枝，安辞且穷栖。方春独荷锄，日暮还灌畦。县吏知我至，召令习鼓鞞。虽从本州役，内顾无所携。近行止一身，远去终转迷。家乡既荡尽，远近理亦齐。永痛长病母，五年委沟溪。生我不得力，终身两酸嘶。人生无家别，何以为蒸黎！","相见时难别亦难，东风无力百花残。春蚕到死丝方尽，蜡炬成灰泪始干。晓镜但愁云鬓改，夜吟应觉月光寒。蓬山此去无多路，青鸟殷勤为探看。","昨夜星辰昨夜风，画楼西畔桂堂东。身无彩凤双飞翼，心有灵犀一点通。隔座送钩春酒暖，分曹射覆蜡灯红。嗟余听鼓应官去，走马兰台类转蓬。","朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。","木落雁南度，北风江上寒。我家襄水曲，遥隔楚云端。乡泪客中尽，孤帆天际看。迷津欲有问，平海夕漫漫。","天街小雨润如酥，草色遥看近却无。最是一年春好处，绝胜烟柳满皇都。","一树寒梅白玉条，迥临村路傍溪桥。不知近水花先发，疑是经冬雪未销。","屋上春鸠鸣，村边杏花白。持斧伐远扬，荷锄觇泉脉。归燕识故巢，旧人看新历。临觞忽不御，惆怅远行客。","杨柳阴阴细雨晴，残花落尽见流莺。春风一夜吹香梦，梦逐春风到洛城。","银烛吐青烟，金樽对绮筵。离堂思琴瑟，别路绕山川。","好雨知时节，当春乃发生。随风潜入夜，润物细无声。野径云俱黑，江船火独明。晓看红湿处，花重锦官城。","早被婵娟误，欲妆临镜慵。承恩不在貌，教妾若为容。风暖鸟声碎，日高花影重。年年越溪女，相忆采芙蓉。","燕草如碧丝，秦桑低绿枝。当君怀归日，是妾断肠时。春风不相识，何事入罗帏。","纱窗日落渐黄昏，金屋无人见泪痕。寂寞空庭春欲晚，梨花满地不开门。","打起黄莺儿，莫教枝上啼。啼时惊妾梦，不得到辽西。","春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。","国破山河在，城春草木深。感时花溅泪，恨别鸟惊心。烽火连三月，家书抵万金。白头搔更短，浑欲不胜簪。","洞房昨夜春风起，故人尚隔湘江水。枕上片时春梦中，行尽江南数千里。","春江潮水连海平，海上明月共潮生。滟滟随波千万里，何处春江无月明！江流宛转绕芳甸，月照花林皆似霰。空里流霜不觉飞，汀上白沙看不见。江天一色无纤尘，皎皎空中孤月轮。江畔何人初见月？江月何年初照人？人生代代无穷已，江月年年望相似。不知江月待何人，但见长江送流水。白云一片去悠悠，青枫浦上不胜愁。谁家今夜扁舟子？何处相思明月楼？可怜楼上月徘徊，应照离人妆镜台。玉户帘中卷不去，捣衣砧上拂还来。此时相望不相闻，愿逐月华流照君。鸿雁长飞光不度，鱼龙潜跃水成文。昨夜闲潭梦落花，可怜春半不还家。江水流春去欲尽，江潭落月复西斜。斜月沉沉藏海雾，碣石潇湘无限路。不知乘月几人归，落月摇情满江树。","幽意无断绝，此去随所偶。晚风吹行舟，花路入溪口。际夜转西壑，隔山望南斗。潭烟飞溶溶，林月低向后。生事且弥漫，愿为持竿叟。","宜阳城下草萋萋，涧水东流复向西。芳树无人花自落，春山一路鸟空啼。","寒食月明雨，落花香满泥。佳人持锦字，无雁寄辽西。","怅卧新春白袷衣，白门寥落意多违。红楼隔雨相望冷，珠箔飘灯独自归。","春雪满空来，触处似花开。不知园里树，若个是真梅。","新年都未有芳华，二月初惊见草芽。白雪却嫌春色晚，故穿庭树作飞花。","草树知春不久归，百般红紫斗芳菲。杨花榆荚无才思，惟解漫天作雪飞。","深居俯夹城，春去夏犹清。天意怜幽草，人间重晚晴。并添高阁迥，微注小窗明。越鸟巢干后，归飞体更轻。","故乡杳无际，日暮且孤征。川原迷旧国，道路入边城。野戍荒烟断，深山古木平。如何此时恨，噭噭夜猿鸣。","一道残阳铺水中，半江瑟瑟半江红。可怜九月初三夜，露似真珠月似弓。","数里闻寒水，山家少四邻。怪禽啼旷野，落日恐行人。初月未终夕，边烽不过秦。萧条桑柘外，烟火渐相亲。","浮香绕曲岸，圆影覆华池。常恐秋风早，飘零君不知。","花间一壶酒，独酌无相亲。举杯邀明月，对影成三人。","月上随人意，江边一院清。众星何历历，明河净无声。","更深月色半人家，北斗阑干南斗斜。今夜偏知春气暖，虫声新透绿窗纱。","今夜鄜州月，闺中只独看。遥怜小儿女，未解忆长安。香雾云鬟湿，清辉玉臂寒。何时倚虚幌，双照泪痕干。","戍鼓断人行，边秋一雁声。露从今夜白，月是故乡明。有弟皆分散，无家问死生。寄书长不达，况乃未休兵。","贱妾留南楚，征夫向北燕。三秋方一日，少别比千年。不掩嚬红楼，无论数绿钱。相思明月夜，迢递白云天。","天门中断楚江开，碧水东流至此回。两岸青山相对出，孤帆一片日边来。","岱宗夫如何？齐鲁青未了。造化钟神秀，阴阳割昏晓。荡胸生曾云，决眦入归鸟。会当凌绝顶，一览众山小。","庐山东南五老峰，青天削出金芙蓉。九江秀色可揽结，吾将此地巢云松。","日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。","海上生明月，天涯共此时。情人怨遥夜，竟夕起相思。灭烛怜光满，披衣觉露滋。不堪盈手赠，还寝梦佳期。","时难年荒世业空，弟兄羁旅各西东。田园寥落干戈后，骨肉流离道路中。吊影分为千里雁，辞根散作秋蓬飞。共看明月应垂泪，一夜乡心五处同。","湖光秋月两相和，潭面无风镜未磨。遥望洞庭山水翠，白银盘里一青螺。","八月湖水平，涵虚混太清。气蒸云梦泽，波撼岳阳城。欲济无舟楫，端居耻圣明。坐观垂钓者，徒有羡鱼情。","燕台一去客心惊，笳鼓喧喧汉将营。万里寒光生积雪，三边曙色动危旌。沙场烽火侵胡月，海畔云山拥蓟城。少小虽非投笔吏，论功还欲请长缨。","冷烛无烟绿蜡干，芳心犹卷怯春寒。一缄书札藏何事，会被东风暗拆看。","闻道黄龙戍，频年不解兵。可怜闺里月，长在汉家营。","吴丝蜀桐张高秋，空山凝云颓不流。江娥啼竹素女愁，李凭中国弹箜篌。昆山玉碎凤凰叫，芙蓉泣露香兰笑。十二门前融冷光，二十三丝动紫皇。女娲炼石补天处，石破天惊逗秋雨。梦入神山教神妪，老鱼跳波瘦蛟舞。吴质不眠倚桂树，露脚斜飞湿寒兔。","霜草苍苍虫切切，村南村北行人绝。独出门前望野田，月明荞麦花如雪。","塞北梅花羌笛吹，淮南桂树小山词。请君莫奏前朝曲，听唱新翻杨柳枝。","月落乌啼霜满天，江枫渔火对愁眠。姑苏城外寒山寺，夜半钟声到客船。","曾逐东风拂舞筵，乐游春苑断肠天。如何肯到清秋日，已带斜阳又带蝉。","渔舟逐水爱山春，两岸桃花夹古津。坐看红树不知远，行尽青溪不见人。山口潜行始隈隩，山开旷望旋平陆。遥看一处攒云树，近入千家散花竹。樵客初传汉姓名，居人未改秦衣服。居人共住武陵源，还从物外起田园。月明松下房栊静，日出云中鸡犬喧。惊闻俗客争来集，竞引还家问都邑。平明闾巷扫花开，薄暮渔樵乘水入。初因避地去人间，及至成仙遂不还。峡里谁知有人事，世中遥望空云山。不疑灵境难闻见，尘心未尽思乡县。出洞无论隔山水，辞家终拟长游衍。自谓经过旧不迷，安知峰壑今来变。当时只记入山深，青溪几度到云林。春来遍是桃花水，不辨仙源何处寻。","数萼初含雪，孤标画本难。香中别有韵，清极不知寒。横笛和愁听，斜枝倚病看。朔风如解意，容易莫摧残。","梅岭花初发，天山雪未开。雪处疑花满，花边似雪回。","老兔寒蟾泣天色，云楼半开壁斜白。玉轮轧露湿团光，鸾珮相逢桂香陌。黄尘清水三山下，更变千年如走马。遥望齐州九点烟，一泓海水杯中泻。","海客谈瀛洲，烟涛微茫信难求。越人语天姥，云霞明灭或可睹。天姥连天向天横，势拔五岳掩赤城。天台四万八千丈，对此欲倒东南倾。我欲因之梦吴越，一夜飞度镜湖月。湖月照我影，送我至剡溪。谢公宿处今尚在，渌水荡漾清猿啼。脚著谢公屐，身登青云梯。半壁见海日，空中闻天鸡。千岩万转路不定，迷花倚石忽已暝。熊咆龙吟殷岩泉，栗深林兮惊层巅。云青青兮欲雨，水澹澹兮生烟。列缺霹雳，丘峦崩摧。洞天石扉，訇然中开。青冥浩荡不见底，日月照耀金银台。霓为衣兮风为马，云之君兮纷纷而来下。虎鼓瑟兮鸾回车，仙之人兮列如麻。忽魂悸以魄动，恍惊起而长嗟。惟觉时之枕席，失向来之烟霞。世间行乐亦如此，古来万事东流水。别君去兮何时还？且放白鹿青崖间，须行即骑访名山。安能摧眉折腰事权贵，使我不得开心颜！","客路青山外，行舟绿水前。潮平两岸阔，风正一帆悬。海日生残夜，江春入旧年。乡书何处达？归雁洛阳边。","楚塞三湘接，荆门九派通。江流天地外，山色有无中。郡邑浮前浦，波澜动远空。襄阳好风日，留醉与山翁。","天秋月又满，城阙夜千重。还作江南会，翻疑梦里逢。","江送巴南水，山横塞北云。津亭秋月夜，谁见泣离群。","千里莺啼绿映红，水村山郭酒旗风。南朝四百八十寺，多少楼台烟雨中。","嫁得瞿塘贾，朝朝误妾期。早知潮有信，嫁与弄潮儿。","岐王宅里寻常见，崔九堂前几度闻。正是江南好风景，落花时节又逢君。","钓罢归来不系船，江村月落正堪眠。纵然一夜风吹去，只在芦花浅水边。","江汉思归客，乾坤一腐儒。片云天共远，永夜月同孤。落日心犹壮，秋风病欲苏。古来存老马，不必取长途。","黄四娘家花满蹊，千朵万朵压枝低。留连戏蝶时时舞，自在娇莺恰恰啼。","咫尺愁风雨，匡庐不可登。只疑云雾窟，犹有六朝僧。","千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。","小娃撑小艇，偷采白莲回。不解藏踪迹，浮萍一道开。","北风吹白云，万里渡河汾。心绪逢摇落，秋声不可闻。","烟笼寒水月笼沙，夜泊秦淮近酒家。商女不知亡国恨，隔江犹唱后庭花。","渭水清无淀，春流两岸平。忽看千骑出，共喜一舟行。映日同云气，随风散雨声。方知帝城远，宛在水中央。","泾溪石险人兢慎，终岁不闻倾覆人。却是平流无石处，时时闻说有沉沦。","中兴诸将收山东，捷书夜报清昼同。河广传闻一苇过，胡危命在破竹中。祗残邺城不日得，独任朔方无限功。京师皆骑汗血马，回纥喂肉葡萄宫。已喜皇威清海岱，常思仙仗过崆峒。三年笛里关山月，万国兵前草木风。成王功大心转小，郭相谋深古来少。司徒清鉴悬明镜，尚书气与秋天杳。二三豪俊为时出，整顿乾坤济时了。东走无复忆鲈鱼，南飞觉有安巢鸟。青春复随冠冕入，紫禁正耐烟花绕。鹤禁通霄凤辇备，鸡鸣问寝龙楼晓。攀龙附凤势莫当，天下尽化为侯王。汝等岂知蒙帝力，时来不得夸身强。关中既留萧丞相，幕下复用张子房。张公一生江海客，身长九尺须眉苍。征起适遇风云会，扶颠始知筹策良。青袍白马更何有，后汉今周喜再昌。寸地尺天皆入贡，奇祥异瑞争来送。不知何国致白环，复道诸山得银瓮。隐士休歌紫芝曲，词人解撰河清颂。田家望望惜雨干，布谷处处催春种。淇上健儿归莫懒，城南思妇愁多梦。安得壮士挽天河，净洗甲兵长不用！","洛阳女儿对门居，才可颜容十五余。良人玉勒乘骢马，侍女金盘脍鲤鱼。画阁朱楼尽相望，红桃绿柳垂檐向。罗帷送上七香车，宝扇迎归九华帐。狂夫富贵在青春，意气骄奢剧季伦。自怜碧玉亲教舞，不惜珊瑚持与人。春窗曙灭九微火，九微片片飞花琐。戏罢曾无理曲时，妆成祗是熏香坐。城中相识尽繁华，日夜经过赵李家。谁怜越女颜如玉，贫贱江头自浣纱。","九曲黄河万里沙，浪淘风簸自天涯。如今直上银河去，同到牵牛织女家。","帘外雨潺潺，春意阑珊。罗衾不耐五更寒。梦里不知身是客，一晌贪欢。独自莫凭栏，无限江山，别时容易见时难。流水落花春去也，天上人间。","莫道谗言如浪深，莫言迁客似沙沉。千淘万漉虽辛苦，吹尽狂沙始到金。","江汉曾为客，相逢每醉还。浮云一别后，流水十年间。欢笑情如旧，萧疏鬓已斑。何因不归去？淮上有秋山。","旅泊青山夜，荒庭白露秋。洞房悬月影，高枕听江流。猿响寒岩树，萤飞古驿楼。他乡对摇落，倂觉起离忧。","别来春半，触目柔肠断。砌下落梅如雪乱，拂了一身还满。雁来音信无凭，路遥归梦难成。离恨恰如春草，更行更远还生。","清明时节雨纷纷，路上行人欲断魂。借问酒家何处有？牧童遥指杏花村。","林卧愁春尽，开轩览物华。忽逢青鸟使，邀入赤松家。丹灶初开火，仙桃正发花。童颜若可驻，何惜醉流霞。","渔翁夜傍西岩宿，晓汲清湘燃楚竹。烟销日出不见人，欸乃一声山水绿。回看天际下中流，岩上无心云相逐。","岭外音书断，经冬复历春。近乡情更怯，不敢问来人。","迟日园林悲昔游，今春花鸟作边愁。独怜京国人南窜，不似湘江水北流。","渡远荆门外，来从楚国游。山随平野尽，江入大荒流。月下飞天镜，云生结海楼。仍怜故乡水，万里送行舟。","渭城朝雨浥轻尘，客舍青青柳色新。劝君更尽一杯酒，西出阳关无故人。","斜光照墟落，穷巷牛羊归。野老念牧童，倚杖候荆扉。雉雊麦苗秀，蚕眠桑叶稀。田夫荷锄至，相见语依依。即此羡闲逸，怅然吟式微。","慈母手中线，游子身上衣。临行密密缝，意恐迟迟归。谁言寸草心，报得三春晖。","岑参兄弟皆好奇，携我远来游渼陂。天地黤惨忽异色，波涛万顷堆琉璃。琉璃汗漫泛舟入，事殊兴极忧思集。鼍作鲸吞不复知，恶风白浪何不及。主人锦帆相为开，舟子喜甚无氛埃。凫鹥满散陂不及，菱叶荷花静如拭。宛在中流渤澥清，下归无极终南黑。半陂以南纯浸山，动影袅窕冲融间。船舷暝戛云际寺，水面月出蓝田关。此时骊龙亦吐珠，冯夷击鼓群龙趋。湘妃汉女出歌舞，金支翠旗光有无。咫尺但愁雷雨至，苍茫不晓神灵意。少壮几时奈老何，向来哀乐何其多！","万丈红泉落，迢迢半紫氛。奔流下杂树，洒落出重云。","篱外谁家不系船，春风吹入钓鱼湾。小童疑是有村客，急向柴门去却关。","独怜幽草涧边生，上有黄鹂深树鸣。春潮带雨晚来急，野渡无人舟自横。","滕王高阁临江渚，佩玉鸣鸾罢歌舞。画栋朝飞南浦云，珠帘暮卷西山雨。闲云潭影日悠悠，物换星移几度秋。阁中帝子今何在？槛外长江空自流。","沈约怜何逊，延年毁谢庄。清新俱有得，名誉底相伤。","江月去人只数尺，风灯照夜欲三更。沙头宿鹭联拳静，船尾跳鱼拨剌鸣。","士卒何草草，筑城潼关道。大城铁不如，小城万丈余。借问潼关吏，修关还备胡。要我下马行，为我指山隅。连云列战格，飞鸟不能逾。胡来但自守，岂复忧西都。丈人视要处，窄狭容单车。艰难奋长戟，万古用一夫。哀哉桃林战，百万化为鱼。请嘱防关将，慎勿学哥舒！","湖南为客动经春，燕子衔泥两度新。旧入故园尝识主，如今社日远看人。可怜处处巢居室，何异飘飘托此身。暂语船樯还起去，穿花贴水益沾巾。","汉家烟尘在东北，汉将辞家破残贼。男儿本自重横行，天子非常赐颜色。摐金伐鼓下榆关，旌旆逶迤碣石间。校尉羽书飞瀚海，单于猎火照狼山。山川萧条极边土，胡骑凭陵杂风雨。战士军前半死生，美人帐下犹歌舞。大漠穷秋塞草腓，孤城落日斗兵稀。身当恩遇常轻敌，力尽关山未解围。铁衣远戍辛勤久，玉箸应啼别离后。少妇城南欲断肠，征人蓟北空回首。边庭飘飖那可度，绝域苍茫更何有。杀气三时作阵云，寒声一夜传刁斗。相看白刃血纷纷，死节从来岂顾勋。君不见沙场征战苦，至今犹忆李将军。","卢家少妇郁金堂，海燕双栖玳瑁梁。九月寒砧催木叶，十年征戍忆辽阳。","众鸟高飞尽，孤云独去闲。相看两不厌，只有敬亭山。","昨夜裙带解，今朝蟢子飞。铅华不可弃，莫是藁砧归。","浔阳江头夜送客，枫叶荻花秋瑟瑟。主人下马客在船，举酒欲饮无管弦。醉不成欢惨将别，别时茫茫江浸月。忽闻水上琵琶声，主人忘归客不发。千呼万唤始出来，犹抱琵琶半遮面。转轴拨弦三两声，未成曲调先有情。弦弦掩抑声声思，似诉平生不得志。低眉信手续续弹，说尽心中无限事。轻拢慢捻抹复挑，初为霓裳后六幺。大弦嘈嘈如急雨，小弦切切如私语。嘈嘈切切错杂弹，大珠小珠落玉盘。间关莺语花底滑，幽咽泉流冰下难。冰泉冷涩弦凝绝，凝绝不通声暂歇。别有幽愁暗恨生，此时无声胜有声。银瓶乍破水浆迸，铁骑突出刀枪鸣。曲终收拨当心画，四弦一声如裂帛。东船西舫悄无言，唯见江心秋月白。自言本是京城女，家在虾蟆陵下住。十三学得琵琶成，名属教坊第一部。曲罢曾教善才服，妆成每被秋娘妒。五陵年少争缠头，一曲红绡不知数。今年欢笑复明年，秋月春风等闲度。弟走从军阿姨死，暮去朝来颜色故。门前冷落鞍马稀，老大嫁作商人妇。商人重利轻别离，前月浮梁买茶去。去来江口守空船，绕船月明江水寒。夜深忽梦少年事，梦啼妆泪红阑干。我闻琵琶已叹息，又闻此语重唧唧。同是天涯沦落人，相逢何必曾相识！我从去年辞帝京，谪居卧病浔阳城。浔阳地僻无音乐，终岁不闻丝竹声。住近湓江地低湿，黄芦苦竹绕宅生。其间旦暮闻何物，杜鹃啼血猿哀鸣。春江花朝秋月夜，往往取酒还独倾。岂无山歌与村笛，呕哑嘲哳难为听。今夜闻君琵琶语，如听仙乐耳暂明。莫辞更坐弹一曲，为君翻作琵琶行。感我此言良久立，却坐促弦弦转急。凄凄不似向前声，满座重闻皆掩泣。座中泣下谁最多？江州司马青衫湿。","元和十年，予左迁九江郡司马。明年秋，送客湓浦口，闻舟中夜弹琵琶者，听其音，铮铮然有京都声。问其人，本长安倡女，尝学琵琶于穆、曹二善才，年长色衰，委身为贾人妇。遂命酒，使快弹数曲。曲罢悯然，自叙少小时欢乐事，今漂沦憔悴，转徙于江湖间。予出官二年，恬然自安，感斯人言，是夕始觉有迁谪意。因为长句，歌以赠之，凡六百一十六言，命曰《琵琶行》。浔阳江头夜送客，枫叶荻花秋瑟瑟。主人下马客在船，举酒欲饮无管弦。醉不成欢惨将别，别时茫茫江浸月。忽闻水上琵琶声，主人忘归客不发。","冰簟银床梦不成，碧天如水夜云轻。雁声远过潇湘去，十二楼中月自明。","父耕原上田，子劚山下荒。六月禾未秀，官家已修仓。","远看山有色，近听水无声。春去花还在，人来鸟不惊。","素练风霜起，苍鹰画作殊。㧐身思狡兔，侧目似愁胡。绦镟光堪摘，轩楹势可呼。何当击凡鸟，毛血洒平芜。","寂寂竟何待，朝朝空自归。欲寻芳草去，惜与故人违。当路谁相假，知音世所稀。只应守寂寞，还掩故园扉。","物外山川近，晴初景霭新。芳郊花柳遍，何处不宜春。","昔闻洞庭水，今上岳阳楼。吴楚东南坼，乾坤日夜浮。亲朋无一字，老病有孤舟。戎马关山北，凭轩涕泗流。","前不见古人，后不见来者。念天地之悠悠，独怆然而涕下。","城上高楼接大荒，海天愁思正茫茫。惊风乱飐芙蓉水，密雨斜侵薜荔墙。岭树重遮千里目，江流曲似九回肠。共来百越文身地，犹自音书滞一乡。","花近高楼伤客心，万方多难此登临。锦江春色来天地，玉垒浮云变古今。北极朝廷终不改，西山寇盗莫相侵。可怜后主还祠庙，日暮聊为梁甫吟。","踏阁攀林恨不同，楚云沧海思无穷。数家砧杵秋山下，一郡荆榛寒雨中。","风急天高猿啸哀，渚清沙白鸟飞回。无边落木萧萧下，不尽长江滚滚来。万里悲秋常作客，百年多病独登台。艰难苦恨繁霜鬓，潦倒新停浊酒杯。","白日依山尽，黄河入海流。欲穷千里目，更上一层楼。","天平山上白云泉，云自无心水自闲。何必奔冲山下去，更添波浪向人间。","白帝城中云出门，白帝城下雨翻盆。高江急峡雷霆斗，古木苍藤日月昏。戎马不如归马逸，千家今有百家存。哀哀寡妇诛求尽，恸哭秋原何处村？","北风卷地白草折，胡天八月即飞雪。忽如一夜春风来，千树万树梨花开。散入珠帘湿罗幕，狐裘不暖锦衾薄。将军角弓不得控，都护铁衣冷难着。瀚海阑干百丈冰，愁云惨淡万里凝。中军置酒饮归客，胡琴琵琶与羌笛。纷纷暮雪下辕门，风掣红旗冻不翻。轮台东门送君去，去时雪满天山路。山回路转不见君，雪上空留马行处。","忆年十五心尚孩，健如黄犊走复来。庭前八月梨枣熟，一日上树能千回。即今倏忽已五十，坐卧只多少行立。强将笑语供主人，悲见生涯百忧集。入门依旧四壁空，老妻睹我颜色同。痴儿不知父子礼，叫怒索饭啼门东。","无言独上西楼，月如钩。寂寞梧桐深院锁清秋。剪不断，理还乱，是离愁。别是一般滋味在心头。","暮投石壕村，有吏夜捉人。老翁逾墙走，老妇出门看。吏呼一何怒！妇啼一何苦！听妇前致词：三男邺城戍。一男附书至，二男新战死。存者且偷生，死者长已矣！室中更无人，惟有乳下孙。有孙母未去，出入无完裙。老妪力虽衰，请从吏夜归。急应河阳役，犹得备晨炊。夜久语声绝，如闻泣幽咽。天明登前途，独与老翁别。","山围故国周遭在，潮打空城寂寞回。淮水东边旧时月，夜深还过女墙来。","走马西来欲到天，辞家见月两回圆。今夜不知何处宿，平沙万里绝人烟。","孤灯伴残月，客梦未全忘。香灯伴残梦，楚国在天涯。","禹庙空山里，秋风落日斜。荒庭垂橘柚，古屋画龙蛇。云气嘘青壁，江声走白沙。早知乘四载，疏凿控三巴。","曾经沧海难为水，除却巫山不是云。取次花丛懒回顾，半缘修道半缘君。","玉露凋伤枫树林，巫山巫峡气萧森。江间波浪兼天涌，塞上风云接地阴。丛菊两开他日泪，孤舟一系故园心。寒衣处处催刀尺，白帝城高急暮砧。","银烛秋光冷画屏，轻罗小扇扑流萤。天阶夜色凉如水，坐看牵牛织女星。","怀君属秋夜，散步咏凉天。空山松子落，幽人应未眠。","洛阳城里见秋风，欲作家书意万重。复恐匆匆说不尽，行人临发又开封。","古台摇落后，秋日望乡心。野寺来人少，云峰隔水深。夕阳依旧垒，寒磬满空林。","白发三千丈，缘愁似个长。不知明镜里，何处得秋霜。","北山白云里，隐者自怡悦。相望试登高，心随雁飞灭。愁因薄暮起，兴是清秋发。时见归村人，沙行渡头歇。天边树若荠，江畔洲如月。何当载酒来，共醉重阳节。","江城如画里，山晓望晴空。两水夹明镜，双桥落彩虹。人烟寒橘柚，秋色老梧桐。谁念北楼上，临风怀谢公。","自古逢秋悲寂寥，我言秋日胜春朝。晴空一鹤排云上，便引诗情到碧霄。","雨霁长空荡涤清，远山初出未知名。夜来江上秋无价，说与舟人不解情。","何处秋风至？萧萧送雁群。朝来入庭树，孤客最先闻。","一丘常欲卧，三径苦无资。北土非吾愿，东林怀我师。黄金燃桂尽，壮志逐年衰。日夕凉风至，闻蝉但益悲。","积雨空林烟火迟，蒸藜炊黍饷东菑。漠漠水田飞白鹭，阴阴夏木啭黄鹂。山中习静观朝槿，松下清斋折露葵。野老与人争席罢，海鸥何事更相疑。","远书归梦两悠悠，只有空床敌素秋。阶下青苔与红树，雨中寥落月中愁。","杨柳青青江水平，闻郎江上踏歌声。东边日出西边雨，道是无晴却有晴。","独坐幽篁里，弹琴复长啸。深林人不知，明月来相照。","松叶堪为酒，春来酿几多。不辞山路远，踏雪也相过。","猿鸟犹疑畏简书，风云常为护储胥。徒令上将挥神笔，终见降王走传车。管乐有才终不忝，关张无命欲何如。他年锦里经祠庙，梁父吟成恨有余。","晓迎秋露一枝新，不占园中最上春。桃李无言又何在，向风偏笑艳阳人。","红线毯，择茧缲丝清水煮，拣丝练线红蓝染。染为红线红于蓝，织作披香殿上毯。","中岁颇好道，晚家南山陲。兴来每独往，胜事空自知。行到水穷处，坐看云起时。偶然值林叟，谈笑无还期。","太乙近天都，连山接海隅。白云回望合，青霭入看无。分野中峰变，阴晴众壑殊。欲投人处宿，隔水问樵夫。","终南阴岭秀，积雪浮云端。林表明霁色，城中增暮寒。","结客少年场，春风满路香。韩魏多奇节，齐鲁富文章。","两个黄鹂鸣翠柳，一行白鹭上青天。窗含西岭千秋雪，门泊东吴万里船。","迟日江山丽，春风花草香。泥融飞燕子，沙暖睡鸳鸯。","江碧鸟逾白，山青花欲燃。今春看又过，何日是归年？","眼见客愁愁不醒，无赖春色到江亭。即遣花开深造次，便教莺语太丁宁。","熟知茅斋绝低小，江上燕子故来频。衔泥点污琴书内，更接飞虫打着人。","少年十五二十时，步行夺得胡马骑。射杀山中白额虎，肯数邺下黄须儿！一身转战三千里，一剑曾当百万师。汉兵奋迅如霹雳，虏骑崩腾畏蒺藜。卫青不败由天幸，李广无功缘数奇。自从弃置便衰朽，世事蹉跎成白首。昔时飞箭无全目，今日垂杨生左肘。路旁时卖故侯瓜，门前学种先生柳。苍茫古木连穷巷，寥落寒山对虚牖。誓令疏勒出飞泉，不似颍川空使酒。贺兰山下阵如云，羽檄交驰日夕闻。节使三河募年少，诏书五道出将军。试拂铁衣如雪色，聊持宝剑动星文。愿得燕弓射大将，耻令越甲鸣吾君。莫嫌旧日云中守，犹堪一战取功勋。","自君之出矣，不复理残机。思君如满月，夜夜减清辉。","得即高歌失即休，多愁多恨亦悠悠。今朝有酒今朝醉，明日愁来明日愁。","寒雨连江夜入吴，平明送客楚山孤。洛阳亲友如相问，一片冰心在玉壶。","旧苑荒台杨柳新，菱歌清唱不胜春。只今惟有西江月，曾照吴王宫里人。","苏武魂销汉使前，古祠高树两茫然。云边雁断胡天月，陇上羊归塞草烟。廻日楼台非甲帐，去时冠劒是丁年。茂陵不见封侯印，空向秋波哭逝川。","苏溪亭上草漫漫，谁倚东风十二阑。燕子不归春事晚，一汀烟雨杏花寒。","八月秋高风怒号，卷我屋上三重茅。茅飞渡江洒江郊，高者挂罥长林梢，下者飘转沉塘坳。南村群童欺我老无力，忍能对面为盗贼。公然抱茅入竹去，唇焦口燥呼不得，归来倚杖自叹息。俄顷风定云墨色，秋天漠漠向昏黑。布衾多年冷似铁，娇儿恶卧踏里裂。床头屋漏无干处，雨脚如麻未断绝。自经丧乱少睡眠，长夜沾湿何由彻！安得广厦千万间，大庇天下寒士俱欢颜！风雨不动安如山。呜呼！何时眼前突兀见此屋，吾庐独破受冻死亦足！","秋丛绕舍似陶家，遍绕篱边日渐斜。不是花中偏爱菊，此花开尽更无花。","待到秋来九月八，我花开后百花杀。冲天香阵透长安，满城尽带黄金甲。","小山重叠金明灭，鬓云欲度香腮雪。懒起画蛾眉，弄妆梳洗迟。照花前后镜，花面交相映。新帖绣罗襦，双双金鹧鸪。","营州少年厌原野，狐裘蒙茸猎城下。虏酒千钟不醉人，胡儿十岁能骑马。","高阁客竟去，小园花乱飞。参差连曲陌，迢递送斜晖。肠断未忍扫，眼穿仍欲归。芳心向春尽，所得是沾衣。","春花秋月何时了？往事知多少。小楼昨夜又东风，故国不堪回首月明中。雕栏玉砌应犹在，只是朱颜改。问君能有几多愁？恰似一江春水向东流。","粉色全无饥色加，岂知人世有荣华。年年道我蚕辛苦，底事浑身着苎麻。","天地英雄气，千秋尚凛然。势分三足鼎，业复五铢钱。得相能开国，生儿不像贤。凄凉蜀故妓，来舞魏宫前。","丞相祠堂何处寻？锦官城外柏森森。映阶碧草自春色，隔叶黄鹂空好音。三顾频烦天下计，两朝开济老臣心。出师未捷身先死，长使英雄泪满襟。","客心争日月，来往预期程。秋风不相待，先至洛阳城。","噫吁嚱，危乎高哉！蜀道之难，难于上青天！蚕丛及鱼凫，开国何茫然！尔来四万八千岁，不与秦塞通人烟。西当太白有鸟道，可以横绝峨眉巅。地崩山摧壮士死，然后天梯石栈相钩连。上有六龙回日之高标，下有冲波逆折之回川。黄鹤之飞尚不得过，猿猱欲度愁攀援。青泥何盘盘，百步九折萦岩峦。扪参历井仰胁息，以手抚膺坐长叹。问君西游何时还？畏途巉岩不可攀。但见悲鸟号古木，雄飞雌从绕林间。又闻子规啼夜月，愁空山。蜀道之难，难于上青天，使人听此凋朱颜！连峰去天不盈尺，枯松倒挂倚绝壁。飞湍瀑流争喧豗，砯崖转石万壑雷。其险也如此，嗟尔远道之人胡为乎来哉！剑阁峥嵘而崔嵬，一夫当关，万夫莫开。所守或匪亲，化为狼与豺。朝避猛虎，夕避长蛇，磨牙吮血，杀人如麻。锦城虽云乐，不如早还家。蜀道之难，难于上青天，侧身西望长咨嗟！","不论平地与山尖，无限风光尽被占。采得百花成蜜后，为谁辛苦为谁甜。","本以高难饱，徒劳恨费声。五更疏欲断，一树碧无情。薄宦梗犹泛，故园芜已平。烦君最相警，我亦举家清。","垂緌饮清露，流响出疏桐。居高声自远，非是藉秋风。","强欲登高去，无人送酒来。遥怜故园菊，应傍战场开。","寥落古行宫，宫花寂寞红。白头宫女在，闲坐说玄宗。","金樽清酒斗十千，玉盘珍羞直万钱。停杯投箸不能食，拔剑四顾心茫然。欲渡黄河冰塞川，将登太行雪满山。闲来垂钓碧溪上，忽复乘舟梦日边。长风破浪会有时，直挂云帆济沧海。","金樽清酒斗十千，玉盘珍羞直万钱。停杯投箸不能食，拔剑四顾心茫然。欲渡黄河冰塞川，将登太行雪满山。闲来垂钓碧溪上，忽复乘舟梦日边。行路难，行路难，多歧路，今安在？长风破浪会有时，直挂云帆济沧海。","大道如青天，我独不得出。羞逐长安社中儿，赤鸡白雉赌梨栗。弹剑作歌奏苦声，曳裾王门不称情。淮阴市井笑韩信，汉朝公卿忌贾生。君不见昔时燕家重郭隗，拥篲折节无嫌猜。剧辛乐毅感恩分，输肝剖胆效英才。昭王白骨萦蔓草，谁人更扫黄金台？行路难，归去来！","王濬楼船下益州，金陵王气黯然收。千寻铁锁沉江底，一片降幡出石头。人世几回伤往事，山形依旧枕寒流。今逢四海为家日，故垒萧萧芦荻秋。","家国兴亡自有时，吴人何苦怨西施。西施若解倾吴国，越国亡来又是谁。","艳色天下重，西施宁久微。朝为越溪女，暮作吴宫妃。贱日岂殊众，贵来方悟稀。邀人傅脂粉，不自著罗衣。君宠益娇态，君怜无是非。当时浣纱伴，莫得同车归。持谢邻家子，效颦安可希。","宰嚭亡吴国，西施陷恶名。浣纱春水急，似有不平声。","昔有佳人公孙氏，一舞剑器动四方。观者如山色沮丧，天地为之久低昂。㸌如羿射九日落，矫如群帝骖龙翔。来如雷霆收震怒，罢如江海凝清光。绛唇珠袖两寂寞，晚有弟子传芬芳。临颍美人在白帝，妙舞此曲神扬扬。与余问答既有以，感时抚事增惋伤。先帝侍女八千人，公孙剑器初第一。五十年间似反掌，风尘澒洞昏王室。梨园弟子散如烟，女乐余姿映寒日。金粟堆南木已拱，瞿唐石城草萧瑟。玳筵急管曲复终，乐极哀来月东出。老夫不知其所往，足茧荒山转愁疾。","田家少闲月，五月人倍忙。夜来南风起，小麦覆陇黄。妇姑荷箪食，童稚携壶浆。相随饷田去，丁壮在南冈。足蒸暑土气，背灼炎天光。力尽不知热，但惜夏日长。复有贫妇人，抱子在其旁。右手秉遗穗，左臂悬敝筐。听其相顾言，闻者为悲伤。家田输税尽，拾此充饥肠。今我何功德，曾不事农桑。吏禄三百石，岁晏有余粮。念此私自愧，尽日不能忘。","绕池闲步看鱼游，正值儿童弄钓舟。一种爱鱼心各异，我来施食尔垂钩。","风劲角弓鸣，将军猎渭城。草枯鹰眼疾，雪尽马蹄轻。忽过新丰市，还归细柳营。回看射雕处，千里暮云平。","胡马，胡马，远放燕支山下。跑沙跑雪独嘶，东望西望路迷。迷路，迷路，边草无穷日暮。","劳歌一曲解行舟，红叶青山水急流。日暮酒醒人已远，满天风雨下西楼。","翻手作云覆手雨，纷纷轻薄何须数。君不见管鲍贫时交，此道今人弃如土。","宣室求贤访逐臣，贾生才调更无伦。可怜夜半虚前席，不问苍生问鬼神。","离离原上草，一岁一枯荣。野火烧不尽，春风吹又生。远芳侵古道，晴翠接荒城。又送王孙去，萋萋满别情。","楚江微雨里，建业暮钟时。漠漠帆来重，冥冥鸟去迟。海门深不见，浦树远含滋。相送情无限，沾襟比散丝。","稻粱犹足活诸雏，妒敌专场好自娱。可要五更惊稳梦，不辞风雪为阳乌。","多情却似总无情，唯觉樽前笑不成。蜡烛有心还惜别，替人垂泪到天明。","娉娉袅袅十三余，豆蔻梢头二月初。春风十里扬州路，卷上珠帘总不如。","江海相逢客恨多，秋风一叶度关河。只应守寂寞，还掩故园扉。","李白乘舟将欲行，忽闻岸上踏歌声。桃花潭水深千尺，不及汪伦送我情。","锦城丝管日纷纷，半入江风半入云。此曲只应天上有，人间能得几回闻。","知君书记本翩翩，为许从戎赴朔边。红粉楼中应计日，燕支山下莫经年。","枿坐云游出世尘，兼无瓶钵可随身。逢人不说人间事，便是人间无事人。","折戟沉沙铁未销，自将磨洗认前朝。东风不与周郎便，铜雀春深锁二乔。","君不见走马川行雪海边，平沙莽莽黄入天。轮台九月风夜吼，一川碎石大如斗，随风满地石乱走。匈奴草黄马正肥，金山西见烟尘飞，汉家大将西出师。将军金甲夜不脱，半夜军行戈相拨，风头如刀面如割。马毛带雪汗气蒸，五花连钱旋作冰，幕中草檄砚水凝。虏骑闻之应胆慑，料知短兵不敢接，车师西门伫献捷。","越王勾践破吴归，义士还乡尽锦衣。宫女如花满春殿，只今惟有鹧鸪飞。","一从归白社，不复到青门。时倚檐前树，远看原上村。青菰临水拔，白鸟向山翻。寂寞於陵子，桔槔方灌园。","寒山转苍翠，秋水日潺湲。倚杖柴门外，临风听暮蝉。渡头余落日，墟里上孤烟。复值接舆醉，狂歌五柳前。","轻舟南垞去，北垞淼难即。隔浦望人家，遥遥不相识。","木末芙蓉花，山中发红萼。涧户寂无人，纷纷开且落。","溪水无情似有情，入山三日得同行。岭头便是分头处，惜别潺湲一夜声。","长安回望绣成堆，山顶千门次第开。一骑红尘妃子笑，无人知是荔枝来。","故人具鸡黍，邀我至田家。绿树村边合，青山郭外斜。开轩面场圃，把酒话桑麻。待到重阳日，还来就菊花。","曾于青史见遗文，今日飘蓬过此坟。词客有灵应识我，霸才无主始怜君。","不知香积寺，数里入云峰。古木无人径，深山何处钟。泉声咽危石，日色冷青松。薄暮空潭曲，安禅制毒龙。","洞房昨夜停红烛，待晓堂前拜舅姑。妆罢低声问夫婿，画眉深浅入时无。","荒戍落黄叶，浩然离故关。高风汉祖庙，秋日楚王台。江上几人在，天涯孤棹还。","君到姑苏见，人家尽枕河。古宫闲地少，水港小桥多。夜市卖菱藕，春船载绮罗。遥知未眠月，乡思在渔歌。","别路云初起，离亭叶正稀。所嗟人异雁，不作一行归。","下马饮君酒，问君何所之？君言不得意，归卧南山陲。但去莫复问，白云无尽时。","青山横北郭，白水绕东城。此地一为别，孤蓬万里征。浮云游子意，落日故人情。挥手自兹去，萧萧班马鸣。","巢父掉头不肯住，东将入海随烟雾。诗卷长留天地间，钓竿欲拂珊瑚树。深山大泽龙蛇远，春寒野阴风景暮。蓬莱织女回云车，指点虚无是征路。自是君身有仙骨，世人那得知其故。惜君只欲苦死留，富贵何如草头露？蔡侯静者意有余，清夜置酒临前除。罢琴惆怅月照席，几岁寄我空中书？南寻吴越并海峤，北过大梁逢故人。长笛一声乱愁思，乘舟木叶下纷纷。","万里辞家事鼓鼙，金陵驿路楚云西。江春不肯留行客，草色青青送马蹄。","城阙辅三秦，风烟望五津。与君离别意，同是宦游人。海内存知己，天涯若比邻。无为在歧路，儿女共沾巾。","沅水通波接武冈，送君不觉有离伤。青山一道同云雨，明月何曾是两乡。","巴陵一望洞庭秋，日见孤峰水上浮。闻道神仙不可接，心随湖水共悠悠。","万壑树参天，千山响杜鹃。山中一夜雨，树杪百重泉。汉女输橦布，巴人讼芋田。文翁翻教授，不敢倚先贤。","苍苍竹林寺，杳杳钟声晚。荷笠带斜阳，青山独归远。","圣代无隐者，英灵尽来归。遂令东山客，不得顾采薇。既至金门远，孰云吾道非。江淮度寒食，京洛缝春衣。置酒长安道，同心与我违。行当浮桂棹，未几拂荆扉。远树带行客，孤城当落晖。吾谋适不用，勿谓知音稀。","朝闻游子唱离歌，昨夜微霜初渡河。鸿雁不堪愁里听，云山况是客中过。","醉别江楼橘柚香，江风引雨入舟凉。忆君遥在潇湘月，愁听清猿梦里长。","故园东望路漫漫，双袖龙钟泪不干。马上相逢无纸笔，凭君传语报平安。","日暮苍山远，天寒白屋贫。柴门闻犬吠，风雪夜归人。","弄石临溪坐，寻花绕寺行。时时闻鸟语，处处是泉声。","落魄江南载酒行，楚腰纤细掌中轻。十年一觉扬州梦，赢得青楼薄幸名。","北邙山上列坟茔，万古千秋对洛城。城中日夕歌钟起，山上唯闻松柏声。","巴山楚水凄凉地，二十三年弃置身。怀旧空吟闻笛赋，到乡翻似烂柯人。沉舟侧畔千帆过，病树前头万木春。今日听君歌一曲，暂凭杯酒长精神。","晚年惟好静，万事不关心。自顾无长策，空知返旧林。松风吹解带，山月照弹琴。君问穷通理，渔歌入浦深。","诸公衮衮登台省，广文先生官独冷。甲第纷纷厌粱肉，广文先生饭不足。先生有道出羲皇，先生有才过屈宋。德尊一代常坎坷，名垂万古知何用！杜陵野客人更嗤，被褐短窄鬓如丝。日籴太仓五升米，时赴郑老同襟期。得钱即相觅，醉酒更同归。情亲故旧谁肯来，相访柴门独老妻。不须闻此意惨怆，生前相遇且衔杯！","陆机二十作文赋，汝更小年能缀文。总角草书又神速，世上儿子徒纷纷。骅骝作驹已汗血，鸷鸟举翮连青云。词源倒流三峡水，笔阵独扫千人军。只今年才十六七，射策君门期第一。旧穿杨叶真自知，暂蹶霜蹄未为失。偶然擢秀非难取，会是排风有毛质。汝身已见唾成珠，汝伯何由发如漆！春光淡沱秦东亭，渚蒲牙白水荇青。风吹客衣日杲杲，树搅离思花冥冥。酒尽沙头双玉瓶，众宾皆醉我独醒。乃知贫贱别更苦，吞声踯躅涕泪零。","荷叶罗裙一色裁，芙蓉向脸两边开。乱入池中看不见，闻歌始觉有人来。","猿啼客散暮江头，人自伤心水自流。同作逐臣君更远，青山万里一孤舟。","东皋薄暮望，徙倚欲何依。树树皆秋色，山山唯落晖。牧人驱犊返，猎马带禽归。相顾无相识，长歌怀采薇。","劝君莫惜金缕衣，劝君惜取少年时。花开堪折直须折，莫待无花空折枝。","繁华事散逐香尘，流水无情草自春。日暮东风怨啼鸟，落花犹似坠楼人。","孤山寺北贾亭西，水面初平云脚低。几处早莺争暖树，谁家新燕啄春泥。乱花渐欲迷人眼，浅草才能没马蹄。最爱湖东行不足，绿杨阴里白沙堤。","锦瑟无端五十弦，一弦一柱思华年。庄生晓梦迷蝴蝶，望帝春心托杜鹃。沧海月明珠有泪，蓝田日暖玉生烟。此情可待成追忆，只是当时已惘然。","奉帚平明金殿开，暂将团扇共徘徊。玉颜不及寒鸦色，犹带昭阳日影来。","长安大道连狭斜，青牛白马七香车。玉辇纵横过主第，金鞭络绎向侯家。龙衔宝盖承朝日，凤吐流苏带晚霞。百丈游丝争绕树，一群娇鸟共啼花。啼花戏蝶千门侧，碧树银台万种色。复道交窗作合欢，双阙连薨垂凤翼。梁家画阁天中起，汉帝金茎云外直。楼前相望不相知，陌上相逢讵相识。借问吹箫向紫烟，曾经学舞度芳年。得成比目何辞死，愿作鸳鸯不羡仙。比目鸳鸯真可羡，双去双来君不见。生憎帐额绣孤鸾，好取门帘帖双燕。双燕双飞绕画梁，罗帏翠被郁金香。片片行云着蝉鬓，纤纤初月上鸦黄。鸦黄粉白车中出，含娇含态情非一。妖童宝马铁连钱，娼妇盘龙金屈膝。御史府中乌夜啼，廷尉门前雀欲栖。隐隐朱城临玉道，遥遥翠幰没金堤。挟弹飞鹰杜陵北，探丸借客渭桥西。俱邀侠客芙蓉剑，共宿娼家桃李蹊。娼家日暮紫罗裙，清歌一啭口氛氲。北堂夜夜人如月，南陌朝朝骑似云。南陌北堂连北里，五剧三条控三市。弱柳青槐拂地垂，佳气红尘暗天起。汉代金吾千骑来，翡翠屠苏鹦鹉杯。罗襦宝带为君解，燕歌赵舞为君开。别有豪华称将相，转日回天不相让。意气由来排灌夫，专权判不容萧相。专权意气本豪雄，青虬紫燕坐春风。自言歌舞长千载，自谓骄奢凌五公。节物风光不相待，桑田碧海须臾改。昔时金阶白玉堂，即今唯见青松在。寂寂寥寥[扬]子居，年年岁岁一床书。独有南山桂花发，飞来飞去袭人裾。","客从东方来，衣上灞陵雨。问客何为来，采山因买斧。冥冥花正开，飏飏燕新乳。昨别今已春，鬓丝生几缕。","妾发初覆额，折花门前剧。郎骑竹马来，绕床弄青梅。同居长干里，两小无嫌猜。十四为君妇，羞颜未尝开。低头向暗壁，千唤不一回。十五始展眉，愿同尘与灰。常存抱柱信，岂上望夫台。十六君远行，瞿塘滟滪堆。五月不可触，猿声天上哀。门前迟行迹，一一生绿苔。苔深不能扫，落叶秋风早。八月蝴蝶黄，双飞西园草。感此伤妾心，坐愁红颜老。早晚下三巴，预将书报家。相迎不道远，直至长风沙。","汉皇重色思倾国，御宇多年求不得。杨家有女初长成，养在深闺人未识。天生丽质难自弃，一朝选在君王侧。回眸一笑百媚生，六宫粉黛无颜色。春寒赐浴华清池，温泉水滑洗凝脂。侍儿扶起娇无力，始是新承恩泽时。云鬓花颜金步摇，芙蓉帐暖度春宵。春宵苦短日高起，从此君王不早朝。承欢侍宴无闲暇，春从春游夜专夜。后宫佳丽三千人，三千宠爱在一身。金屋妆成娇侍夜，玉楼宴罢醉和春。姊妹弟兄皆列土，可怜光彩生门户。遂令天下父母心，不重生男重生女。骊宫高处入青云，仙乐风飘处处闻。缓歌慢舞凝丝竹，尽日君王看不足。渔阳鼙鼓动地来，惊破霓裳羽衣曲。九重城阙烟尘生，千乘万骑西南行。翠华摇摇行复止，西出都门百余里。六军不发无奈何，宛转蛾眉马前死。花钿委地无人收，翠翘金雀玉搔头。君王掩面救不得，回看血泪相和流。黄埃散漫风萧索，云栈萦纡登剑阁。峨嵋山下少人行，旌旗无光日色薄。蜀江水碧蜀山青，圣主朝朝暮暮情。行宫见月伤心色，夜雨闻铃肠断声。天旋地转回龙驭，到此踌躇不能去。马嵬坡下泥土中，不见玉颜空死处。君臣相顾尽沾衣，东望都门信马归。归来池苑皆依旧，太液芙蓉未央柳。芙蓉如面柳如眉，对此如何不泪垂。春风桃李花开日，秋雨梧桐叶落时。西宫南内多秋草，落叶满阶红不扫。梨园弟子白发新，椒房阿监青娥老。夕殿萤飞思悄然，孤灯挑尽未成眠。迟迟钟鼓初长夜，耿耿星河欲曙天。鸳鸯瓦冷霜华重，翡翠衾寒谁与共。悠悠生死别经年，魂魄不曾来入梦。临邛道士鸿都客，能以精诚致魂魄。为感君王辗转思，遂教方士殷勤觅。排空驭气奔如电，升天入地求之遍。上穷碧落下黄泉，两处茫茫皆不见。忽闻海上有仙山，山在虚无缥缈间。楼阁玲珑五云起，其中绰约多仙子。中有一人字太真，雪肤花貌参差是。金阙西厢叩玉扃，转教小玉报双成。闻道汉家天子使，九华帐里梦魂惊。揽衣推枕起徘徊，珠箔银屏迤逦开。云鬓半偏新睡觉，花冠不整下堂来。风吹仙袂飘飘举，犹似霓裳羽衣舞。玉容寂寞泪阑干，梨花一枝春带雨。含情凝睇谢君王，一别音容两渺茫。昭阳殿里恩爱绝，蓬莱宫中日月长。回头下望人寰处，不见长安见尘雾。惟将旧物表深情，钿合金钗寄将去。钗留一股合一扇，钗擘黄金合分钿。但教心似金钿坚，天上人间会相见。临别殷勤重寄词，词中有誓两心知。七月七日长生殿，夜半无人私语时。在天愿作比翼鸟，在地愿为连理枝。天长地久有时尽，此恨绵绵无绝期。","晨征犯烟磴，夕憩在云关。晚风清近壑，新月照澄湾。郊童樵唱返，津叟钓歌还。客行无与晤，赖此释愁颜。","绿蚁新醅酒，红泥小火炉。晚来天欲雪，能饮一杯无？","闺中少妇不知愁，春日凝妆上翠楼。忽见陌头杨柳色，悔教夫婿觅封侯。","月落星稀天欲明，孤灯未灭梦难成。披衣更向门前望，不忿朝来鹊喜声。","剑外忽传收蓟北，初闻涕泪满衣裳。却看妻子愁何在，漫卷诗书喜欲狂。白日放歌须纵酒，青春作伴好还乡。即从巴峡穿巫峡，便下襄阳向洛阳。","杨花落尽子规啼，闻道龙标过五溪。我寄愁心与明月，随君直到夜郎西。","岁暮阴阳催短景，天涯霜雪霁寒宵。五更鼓角声悲壮，三峡星河影动摇。野哭千家闻战伐，夷歌数处起渔樵。卧龙跃马终黄土，人事音书漫寂寥。","旅馆寒灯独不眠，客心何事转凄然。故乡今夜思千里，霜鬓明朝又一年。","旅馆谁相问，寒灯独可亲。一年将尽夜，万里未归人。寥落悲前事，支离笑此身。愁颜与衰鬓，明日又逢春。","紫泉宫殿锁烟霞，欲取芜城作帝家。玉玺不缘归日角，锦帆应是到天涯。于今腐草无萤火，终古垂杨有暮鸦。地下若逢陈后主，岂宜重问后庭花。","黑云压城城欲摧，甲光向日金鳞开。角声满天秋色里，塞上燕脂凝夜紫。半卷红旗临易水，霜重鼓寒声不起。报君黄金台上意，提携玉龙为君死。","雨里鸡鸣一两家，竹溪村路板桥斜。妇姑相唤浴蚕去，闲着中庭栀子花。","尽道丰年瑞，丰年事若何。长安有贫者，为瑞不宜多。","初闻征雁已无蝉，百尺楼高水接天。青女素娥俱耐冷，月中霜里斗婵娟。","言入黄花川，每逐青溪水。随山将万转，趣途无百里。声喧乱石中，色静深松里。漾漾泛菱荇，澄澄映葭苇。我心素已闲，清川澹如此。请留盘石上，垂钓将已矣。","床前明月光，疑是地上霜。举头望明月，低头思故乡。","国初已来画鞍马，神妙独数江都王。将军得名三十载，人间又见真乘黄。曾貌先帝照夜白，龙池十日飞霹雳。内府殷红玛瑙盘，婕妤传诏才人索。盘赐将军拜舞归，轻纨细绮相追飞。贵戚权门得笔迹，始觉屏障生光辉。昔日太宗拳毛騧，近时郭家狮子花。今之新图有二马，复令识者久叹嗟。此皆骑战一敌万，缟素漠漠开风沙。其余七匹亦殊绝，迥若寒空动烟雪。霜蹄蹴踏长楸间，马官厮养森成列。可怜九马争神骏，顾视清高气深稳。借问苦心爱者谁，后有韦讽前支遁。忆昔巡幸新丰宫，翠华拂天来向东。腾骧磊落三万匹，皆与此图筋骨同。自从献宝朝河宗，无复射蛟江水中。君不见金粟堆前松柏里，龙媒去尽鸟呼风。","沅湘流不尽，屈子怨何深。日暮秋烟起，萧萧枫树林。","胜败兵家事不期，包羞忍耻是男儿。江东子弟多才俊，卷土重来未可知。","闲居少邻并，草径入荒园。鸟宿池边树，僧敲月下门。过桥分野色，移石动云根。暂去还来此，幽期不负言。","清晨入古寺，初日照高林。曲径通幽处，禅房花木深。山光悦鸟性，潭影空人心。万籁此都寂，但余钟磬音。","松下茅亭五月凉，汀沙云树晚苍苍。行人无限秋风思，隔水青山似故乡。","飒飒西风满院栽，蕊寒香冷蝶难来。他年我若为青帝，报与桃花一处开。","去年今日此门中，人面桃花相映红。人面不知何处去，桃花依旧笑春风。","金陵津渡小山楼，一宿行人自可愁。潮落夜江斜月里，两三星火是瓜洲。","世人结交须黄金，黄金不多交不深。纵令然诺暂相许，终是悠悠行路心。","解落三秋叶，能开二月花。过江千尺浪，入竹万竿斜。","凄凉宝剑篇，羁泊欲穷年。黄叶仍风雨，青楼自管弦。新知遭薄俗，旧好隔良缘。心断新丰酒，销愁斗几千。","望君烟水阔，挥手泪沾巾。飞鸟没何处，青山空向人。长江一帆远，落日五湖春。谁见汀洲上，相思愁白苹。","海外徒闻更九州，他生未卜此生休。空闻虎旅传宵柝，无复鸡人报晓筹。此日六军同驻马，当时七夕笑牵牛。如何四纪为天子，不及卢家有莫愁。","玄宗回马杨妃死，云雨难忘日月新。终是圣明天子事，景阳宫井又何人。","大漠沙如雪，燕山月似钩。何当金络脑，快走踏清秋。","此马非凡马，房星本是星。向前敲瘦骨，犹自带铜声。","龙脊贴连钱，银蹄白踏烟。无人织锦韂，谁为铸金鞭。","人闲桂花落，夜静春山空。月出惊山鸟，时鸣春涧中。","买得晨鸡共结交，言交退食未相抛。知时每报凌晨唱，解语曾闻半夜号。","空山不见人，但闻人语响。返景入深林，复照青苔上。","昔人已乘黄鹤去，此地空余黄鹤楼。黄鹤一去不复返，白云千载空悠悠。晴川历历汉阳树，芳草萋萋鹦鹉洲。日暮乡关何处是？烟波江上使人愁。","故人西辞黄鹤楼，烟花三月下扬州。孤帆远影碧空尽，唯见长江天际流。","煮豆持作羹，漉菽以为汁。萁在釜下燃，豆在釜中泣。本自同根生，相煎何太急？","饥来驱我去，不知竟何之。行行至斯里，叩门拙言辞。主人解余意，遗赠岂虚来。谈谐终日夕，觞至辄倾杯。情欣新知欢，言咏遂赋诗。感子漂母惠，愧我非韩才。衔戢知何谢，冥报以相贻。","燕丹善养士，志在报强嬴。招集百夫良，岁暮得荆卿。君子死知己，提剑出燕京。素骥鸣广陌，慷慨送我行。雄发指危冠，猛气冲长缨。饮饯易水上，四座列群英。渐离击悲筑，宋意唱高声。萧萧哀风逝，淡淡寒波生。商音更流涕，羽奏壮士惊。心知去不归，且有后世名。登车何时顾，飞盖入秦庭。凌厉越万里，逶迤过千城。图穷事自至，豪主正怔营。惜哉剑术疏，奇功遂不成。其人虽已没，千载有余情。","凄厉岁云暮，拥褐曝前轩。南圃无遗秀，枯条盈北园。倾壶绝余沥，窥灶不见烟。诗书塞座外，日昃不遑研。闲居非陈厄，窃有愠见言。何以慰吾怀，赖古多此贤。","人生归有道，衣食固其端。孰是都不营，而以求自安？开春理常业，岁功聊可观。晨出肆微勤，日入负耒还。山中饶霜露，风气亦先寒。田家岂不苦？弗获辞此难。四体诚乃疲，庶无异患干。盥濯息檐下，斗酒散襟颜。遥遥沮溺心，千载乃相关。但愿长如此，躬耕非所叹。","少无适俗韵，性本爱丘山。误落尘网中，一去三十年。羁鸟恋旧林，池鱼思故渊。开荒南野际，守拙归园田。方宅十余亩，草屋八九间。榆柳荫后檐，桃李罗堂前。暧暧远人村，依依墟里烟。狗吠深巷中，鸡鸣桑树颠。户庭无尘杂，虚室有余闲。久在樊笼里，复得返自然。","种豆南山下，草盛豆苗稀。晨兴理荒秽，带月荷锄归。道狭草木长，夕露沾我衣。衣沾不足惜，但使愿无违。","种豆南山下，草盛豆苗稀。晨兴理荒秽，带月荷锄归。","翼翼归鸟，晨去于林。远之八表，近憩云岑。和风不洽，翻翮求心。顾俦相鸣，景庇清阴。翼翼归鸟，载翔载飞。虽不怀游，见林情依。遇云颉颃，相鸣而归。遐路诚悠，性爱无遗。翼翼归鸟，驯林徘徊。岂思天路，欣及旧栖。虽无昔侣，众声每谐。日夕气清，悠然其怀。翼翼归鸟，戢羽寒条。游不旷林，宿则森标。晨风清兴，好音时交。矰缴奚施，已卷安劳。","荣荣窗下兰，密密堂前柳。初与君别时，不谓行当久。出门万里客，中道逢嘉友。未言心相醉，不在接杯酒。兰枯柳亦衰，遂令此言负。多谢诸少年，相知不忠厚。意气倾人命，离隔复何有？","漫漫秋夜长，烈烈北风凉。展转不能寐，披衣起彷徨。彷徨忽已久，白露沾我裳。俯视清水波，仰看明月光。天汉回西流，三五正纵横。草虫鸣何悲，孤雁独南翔。郁郁多悲思，绵绵思故乡。愿飞安得翼，欲济河无梁。向风长叹息，断绝我中肠。","人生无根蒂，飘如陌上尘。分散逐风转，此已非常身。落地为兄弟，何必骨肉亲！得欢当作乐，斗酒聚比邻。盛年不重来，一日难再晨。及时当勉励，岁月不待人。","秋风萧瑟天气凉，草木摇落露为霜。群燕辞归鹄南翔，念君客游思断肠。慊慊思归恋故乡，君何淹留寄他方？贱妾茕茕守空房，忧来思君不敢忘，不觉泪下沾衣裳。援琴鸣弦发清商，短歌微吟不能长。明月皎皎照我床，星汉西流夜未央。牵牛织女遥相望，尔独何辜限河梁。","在昔闻南亩，当年竟未践。屡空既有人，春兴岂自免？夙晨装吾驾，启涂情已缅。鸟哢欢新节，泠风送余善。寒草被荒蹊，地为罕人远。是以植杖翁，悠然不复返。即理愧通识，所保讵乃浅。","白马饰金羁，连翩西北驰。借问谁家子，幽并游侠儿。少小去乡邑，扬声沙漠垂。宿昔秉良弓，楛矢何参差。控弦破左的，右发摧月支。仰手接飞猱，俯身散马蹄。狡捷过猴猿，勇剽若豹螭。边城多警急，虏骑数迁移。羽檄从北来，厉马登高堤。长驱蹈匈奴，左顾凌鲜卑。弃身锋刃端，性命安可怀？父母且不顾，何言子与妻！名编壮士籍，不得中顾私。捐躯赴国难，视死忽如归！","对酒当歌，人生几何！譬如朝露，去日苦多。慨当以慷，忧思难忘。何以解忧？唯有杜康。青青子衿，悠悠我心。但为君故，沉吟至今。呦呦鹿鸣，食野之苹。我有嘉宾，鼓瑟吹笙。明明如月，何时可掇？忧从中来，不可断绝。越陌度阡，枉用相存。契阔谈讌，心念旧恩。月明星稀，乌鹊南飞。绕树三匝，何枝可依？山不厌高，海不厌深。周公吐哺，天下归心。","昔欲居南村，非为卜其宅。闻多素心人，乐与数晨夕。怀此颇有年，今日从兹役。弊庐何必广，取足蔽床席。邻曲时时来，抗言谈在昔。奇文共欣赏，疑义相与析。","春秋多佳日，登高赋新诗。过门更相呼，有酒斟酌之。农务各自归，闲暇辄相思。相思则披衣，言笑无厌时。此理将不胜？无为忽去兹。衣食当须纪，力耕不吾欺。","美女妖且闲，采桑歧路间。柔条纷冉冉，落叶何翩翩。攘袖见素手，皓腕约金环。头上金爵钗，腰佩翠琅玕。明珠交玉体，珊瑚间木难。罗衣何飘飖，轻裾随风还。顾盼遗光彩，长啸气若兰。行徒用息驾，休者以忘餐。借问女安居，乃在城南端。青楼临大巷，幽门结重关。容华耀朝日，谁不希令颜？媒氏何所营？玉帛不时安。佳人慕高义，求贤良独难。众人徒嗷嗷，安知彼所观？盛年处房室，中夜起长叹。","关东有义士，兴兵讨群凶。初期会盟津，乃心在咸阳。军合力不齐，踌躇而雁行。势利使人争，嗣还自相戕。淮南弟称号，刻玺于北方。铠甲生虮虱，万姓以死亡。白骨露于野，千里无鸡鸣。生民百遗一，念之断人肠。","东临碣石，以观沧海。水何澹澹，山岛竦峙。树木丛生，百草丰茂。秋风萧瑟，洪波涌起。日月之行，若出其中；星汉灿烂，若出其里。幸甚至哉，歌以咏志。","孟夏草木长，绕屋树扶疏。众鸟欣有托，吾亦爱吾庐。既耕亦已种，时还读我书。穷巷隔深辙，颇回故人车。欢言酌春酒，摘我园中蔬。微雨从东来，好风与之俱。泛览周王传，流观山海图。俯仰终宇宙，不乐复何如！","精卫衔微木，将以填沧海。刑天舞干戚，猛志固常在。同物既无虑，化去不复悔。徒设在昔心，良辰讵可待！","白发被两鬓，肌肤不复实。虽有五男儿，总不好纸笔。阿舒已二八，懒惰故无匹。阿宣行志学，而不爱文术。雍端年十三，不识六与七。通子垂九龄，但觅梨与栗。天运苟如此，且进杯中物。","谒帝承明庐，逝将归旧疆。清晨发皇邑，日夕过首阳。伊洛广且深，欲济川无梁。泛舟越洪涛，怨彼东路长。顾瞻恋城阙，引领情内伤。太谷何寥廓，山树郁苍苍。霖雨泥我涂，流潦浩纵横。中逵绝无轨，改辙登高冈。修坂造云日，我马玄以黄。","结庐在人境，而无车马喧。问君何能尔？心远地自偏。采菊东篱下，悠然见南山。山气日夕佳，飞鸟相与还。此中有真意，欲辨已忘言。","秋菊有佳色，裛露掇其英。泛此忘忧物，远我遗世情。一觞虽独进，杯尽壶自倾。日入群动息，归鸟趋林鸣。啸傲东轩下，聊复得此生。","故人赏我趣，挈壶相与至。班荆坐松下，数斟已复醉。父老杂乱言，觞酌失行次。不觉知有我，安知物为贵。悠悠迷所留，酒中有深味。","神龟虽寿，犹有竟时。腾蛇乘雾，终为土灰。老骥伏枥，志在千里。烈士暮年，壮心不已。盈缩之期，不但在天；养怡之福，可得永年。幸甚至哉，歌以咏志。","若有人兮山之阿，被薜荔兮带女萝。既含睇兮又宜笑，子慕予兮善窈窕。乘赤豹兮从文狸，辛夷车兮结桂旗。被石兰兮带杜衡，折芳馨兮遗所思。余处幽篁兮终不见天，路险难兮独后来。表独立兮山之上，云容容兮而在下。杳冥冥兮羌昼晦，东风飘兮神灵雨。留灵修兮憺忘归，岁既晏兮孰华予？采三秀兮于山间，石磊磊兮葛蔓蔓。怨公子兮怅忘归，君思我兮不得闲。山中人兮芳杜若，饮石泉兮荫松柏。君思我兮然疑作。雷填填兮雨冥冥，猿啾啾兮狖夜鸣。风飒飒兮木萧萧，思公子兮徒离忧。","关关雎鸠，在河之洲。窈窕淑女，君子好逑。参差荇菜，左右流之。窈窕淑女，寤寐求之。求之不得，寤寐思服。悠哉悠哉，辗转反侧。参差荇菜，左右采之。窈窕淑女，琴瑟友之。参差荇菜，左右芼之。窈窕淑女，钟鼓乐之。","日出而作，日入而息。凿井而饮，耕田而食。帝力于我何有哉！","操吴戈兮被犀甲，车错毂兮短兵接。旌蔽日兮敌若云，矢交坠兮士争先。凌余阵兮躐余行，左骖殪兮右刃伤。霾两轮兮絷四马，援玉枹兮击鸣鼓。天时怼兮威灵怒，严杀尽兮弃原野。出不入兮往不反，平原忽兮路超远。带长剑兮挟秦弓，首身离兮心不惩。诚既勇兮又以武，终刚强兮不可凌。身既死兮神以灵，魂魄毅兮为鬼雄！","桃之夭夭，灼灼其华。之子于归，宜其室家。桃之夭夭，有蕡其实。之子于归，宜其家室。桃之夭夭，其叶蓁蓁。之子于归，宜其家人。","相鼠有皮，人而无仪！人而无仪，不死何为？相鼠有齿，人而无止！人而无止，不死何俟？相鼠有体，人而无礼！人而无礼，胡不遄死？","采薇采薇，薇亦作止。曰归曰归，岁亦莫止。靡室靡家，猃狁之故。不遑启居，猃狁之故。昔我往矣，杨柳依依。今我来思，雨雪霏霏。行道迟迟，载渴载饥。我心伤悲，莫知我哀！","彼黍离离，彼稷之苗。行迈靡靡，中心摇摇。知我者，谓我心忧；不知我者，谓我何求。悠悠苍天，此何人哉！","文王在上，于昭于天。周虽旧邦，其命维新。有周不显，帝命不时。文王陟降，在帝左右。","曰遂古之初，谁传道之？上下未形，何由考之？冥昭瞢暗，谁能极之？冯翼惟像，何以识之？明明暗暗，惟时何为？阴阳三合，何本何化？圜则九重，孰营度之？惟兹何功，孰初作之？斡维焉系，天极焉加？八柱何当，东南何亏？九天之际，安放安属？隅隈多有，谁知其数？","呦呦鹿鸣，食野之苹。我有嘉宾，鼓瑟吹笙。吹笙鼓簧，承筐是将。人之好我，示我周行。","断竹，续竹；飞土，逐宍。","风萧萧兮易水寒，壮士一去兮不复还！","投我以木瓜，报之以琼琚。匪报也，永以为好也！投我以木桃，报之以琼瑶。匪报也，永以为好也！投我以木李，报之以琼玖。匪报也，永以为好也！","后皇嘉树，橘徕服兮。受命不迁，生南国兮。深固难徙，更壹志兮。绿叶素荣，纷其可喜兮。曾枝剡棘，圆果抟兮。青黄杂糅，文章烂兮。精色内白，类任道兮。纷缊宜修，姱而不丑兮。嗟尔幼志，有以异兮。独立不迁，岂不可喜兮？深固难徙，廓其无求兮。苏世独立，横而不流兮。闭心自慎，终不失过兮。秉德无私，参天地兮。愿岁并谢，与长友兮。淑离不淫，梗其有理兮。年岁虽少，可师长兮。行比伯夷，置以为像兮。","氓之蚩蚩，抱布贸丝。匪来贸丝，来即我谋。送子涉淇，至于顿丘。匪我愆期，子无良媒。将子无怒，秋以为期。乘彼垝垣，以望复关。不见复关，泣涕涟涟。既见复关，载笑载言。尔卜尔筮，体无咎言。以尔车来，以我贿迁。桑之未落，其叶沃若。于嗟鸠兮，无食桑葚！于嗟女兮，无与士耽！士之耽兮，犹可说也。女之耽兮，不可说也！桑之落矣，其黄而陨。自我徂尔，三岁食贫。淇水汤汤，渐车帷裳。女也不爽，士贰其行。士也罔极，二三其德。三岁为妇，靡室劳矣。夙兴夜寐，靡有朝矣。言既遂矣，至于暴矣。兄弟不知，咥其笑矣。静言思之，躬自悼矣。及尔偕老，老使我怨。淇则有岸，隰则有泮。总角之宴，言笑晏晏。信誓旦旦，不思其反。反是不思，亦已焉哉！","帝子降兮北渚，目眇眇兮愁予。袅袅兮秋风，洞庭波兮木叶下。登白薠兮骋望，与佳期兮夕张。鸟何萃兮蘋中，罾何为兮木上？沅有芷兮澧有兰，思公子兮未敢言。荒忽兮远望，观流水兮潺湲。","硕鼠硕鼠，无食我黍！三岁贯女，莫我肯顾。逝将去女，适彼乐土。乐土乐土，爰得我所。","帝高阳之苗裔兮，朕皇考曰伯庸。摄提贞于孟陬兮，惟庚寅吾以降。皇览揆余初度兮，肇锡余以嘉名。名余曰正则兮，字余曰灵均。纷吾既有此内美兮，又重之以修能。扈江离与辟芷兮，纫秋兰以为佩。汩余若将不及兮，恐年岁之不吾与。朝搴阰之木兰兮，夕揽洲之宿莽。日月忽其不淹兮，春与秋其代序。惟草木之零落兮，恐美人之迟暮。不抚壮而弃秽兮，何不改此度？乘骐骥以驰骋兮，来吾道夫先路！","蒹葭苍苍，白露为霜。所谓伊人，在水一方。溯洄从之，道阻且长。溯游从之，宛在水中央。蒹葭凄凄，白露未晞。所谓伊人，在水之湄。溯洄从之，道阻且跻。溯游从之，宛在水中坻。蒹葭采采，白露未已。所谓伊人，在水之涘。溯洄从之，道阻且右。溯游从之，宛在水中沚。","采薇采薇，薇亦作止。曰归曰归，岁亦莫止。靡室靡家，猃狁之故。不遑启居，猃狁之故。采薇采薇，薇亦柔止。曰归曰归，心亦忧止。忧心烈烈，载饥载渴。我戍未定，靡使归聘。采薇采薇，薇亦刚止。曰归曰归，岁亦阳止。王事靡盬，不遑启处。忧心孔疚，我行不来。昔我往矣，杨柳依依。今我来思，雨雪霏霏。行道迟迟，载渴载饥。我心伤悲，莫知我哀！","静女其姝，俟我于城隅。爱而不见，搔首踟蹰。静女其娈，贻我彤管。彤管有炜，说怿女美。自牧归荑，洵美且异。匪女之为美，美人之贻。","呦呦鹿鸣，食野之苹。我有嘉宾，鼓瑟吹笙。吹笙鼓簧，承筐是将。人之好我，示我周行。呦呦鹿鸣，食野之蒿。我有嘉宾，德音孔昭。视民不恌，君子是则是效。我有旨酒，嘉宾式燕以敖。呦呦鹿鸣，食野之芩。我有嘉宾，鼓瑟鼓琴。鼓瑟鼓琴，和乐且湛。我有旨酒，以燕乐嘉宾之心。","彼黍离离，彼稷之苗。行迈靡靡，中心摇摇。知我者，谓我心忧；不知我者，谓我何求。悠悠苍天，此何人哉！彼黍离离，彼稷之穗。行迈靡靡，中心如醉。知我者，谓我心忧；不知我者，谓我何求。悠悠苍天，此何人哉！彼黍离离，彼稷之实。行迈靡靡，中心如噎。知我者，谓我心忧；不知我者，谓我何求。悠悠苍天，此何人哉！","寄与多情客，料峭春风寒。独自凭栏久，归期何太晚。","美人自刎乌江岸，战火曾烧赤壁山，将军空老玉门关。伤心秦汉，生民涂炭，读书人一声长叹。","旧酒投，新醅泼，老瓦盆边笑呵呵。共山僧野叟闲吟和。他出一对鸡，我出一个鹅，闲快活。","战西风几点宾鸿至，感起我南朝千古伤心事。展花笺欲写几句知心事，空教我停霜毫半晌无才思。往常得兴时，一扫无瑕疵。今日个病恹恹刚写下两个相思字。","我家洗砚池头树，朵朵花开淡墨痕。不要人夸好颜色，只留清气满乾坤。","子规啼，不如归。道是春归人未归。几日添憔悴，虚飘飘柳絮飞。一春鱼雁无消息，则见双燕斗衔泥。","一声画角谯门，半庭新月黄昏，雪里山前水滨。竹篱茅舍，淡烟衰草孤村。","春山暖日和风，阑干楼阁帘栊，杨柳秋千院中。啼莺舞燕，小桥流水飞红。","孤村落日残霞，轻烟老树寒鸦，一点飞鸿影下。青山绿水，白草红叶黄花。","枯藤老树昏鸦，小桥流水人家，古道西风瘦马。夕阳西下，断肠人在天涯。","夕阳下，酒旆闲，两三航未曾着岸。落花水香茅舍晚，断桥头卖鱼人散。","峰峦如聚，波涛如怒，山河表里潼关路。望西都，意踌躇。伤心秦汉经行处，宫阙万间都做了土。兴，百姓苦；亡，百姓苦！","骊山四顾，阿房一炬，当时奢侈今何处？只见草萧疏，水萦纡。至今遗恨迷烟树。列国周齐秦汉楚，赢，都变做了土；输，都变做了土。","对青山强整乌纱，归雁横秋，倦客思家。翠袖殷勤，金杯错落，玉手琵琶。人老去西风白发，蝶愁来明日黄花。回首天涯，一抹斜阳，数点寒鸦。","懒云窝，醒时诗酒醉时歌。瑶琴不理抛书卧，无梦南柯。得清闲尽快活，日月似撺梭过，富贵比花开落。清闲快活，清闲快活。","一声梧叶一声秋，一点芭蕉一点愁，三更归梦三更后。落灯花，棋未收，叹新丰逆旅淹留。枕上十年事，江南二老忧，都到心头。","冬前冬后几村庄，溪北溪南两履霜。树头树底孤山上。冷风来何处香？忽相逢缟袂绡裳。","挂绝壁松枯倒倚，落残霞孤鹜齐飞。四围不尽山，一望无穷水。散西风满天秋意。夜静云帆月影低，载我在潇湘画里。","雨过分畦种瓜，旱来引水浇麻。共几个田舍翁，说几句庄稼话。瓦盆边浊酒生涯。醉里乾坤大，壶中日月长。","问人间谁是英雄？有酾酒临江，横槊曹公。紫盖黄旗，多应借得，赤壁东风。更惊起南阳卧龙，便成名八阵图中。鼎足三分，一分西蜀，一分江东。","动高吟楚客秋风，故国山河，水落江空。断送离愁，江南烟雨，杳杳孤鸿。"];
  module.exports = { version: 'v0.1', texts: T };
})();

});
__reg("src/gloss.js", function (module, exports, require) {
'use strict';
/**
 * 诗笺（诗词释义）查询层
 *
 * 单一职责：把「原句」映射到释义、出处、全诗与整首串讲，不做任何排版/绘制。
 * 数据：
 *   src/data/gloss.js      单句直译（手工维护，key = corpus norm_key）
 *   src/data/poem_gloss.js 整首串讲（key = "题名|作者"）
 *   src/data/poem_text.js  全诗正文（构建期从语料源 p.text 原样带出，与 sources 同下标）
 * 出处/正文/串讲 key 全部实时对齐 corpus，不各抄一份（两处各抄一份必然漂移）。
 */
const DATA = require('./data/gloss');
const POEM_GLOSS = require('./data/poem_gloss');
const POEM_TEXT = require('./data/poem_text').texts;
const { corpus } = require('./judge');

/** 该句是否有释义 */
function has(text) {
  return Object.prototype.hasOwnProperty.call(DATA, text);
}

/** 取释义 {g, n} | null */
function of(text) {
  return has(text) ? DATA[text] : null;
}

/** 句 → 语料句下标 | null */
function lineIndex(text) {
  const i = corpus.norm_index[text];
  return i == null ? null : Number(i);
}

/** 句 → 诗集下标（sources 下标）| null */
function srcIdx(text) {
  const i = lineIndex(text);
  if (i == null) return null;
  const p = String(corpus.lines[i]).split('|');
  return p[1] == null ? null : Number(p[1]);
}

/**
 * 反查出处。sources[s] = "title|author|dynasty"。
 * @returns {{title:string, author:string, dynasty:string}|null}
 */
function source(text) {
  const si = srcIdx(text);
  if (si == null) return null;
  return sourceOf(si);
}

/** 诗集下标 → 出处三段 */
function sourceOf(si) {
  const s = corpus.sources[si];
  if (!s) return null;
  const p = String(s).split('|');
  return { title: p[0] || '', author: p[1] || '', dynasty: p[2] || '' };
}

/** 诗集下标 → 全诗正文（构建期原样带出，含原标点） */
function poemText(si) {
  return POEM_TEXT[si] || '';
}

/** 整首串讲 | null */
function introOf(si) {
  const s = sourceOf(si);
  if (!s) return null;
  const k = s.title + '|' + s.author;
  return Object.prototype.hasOwnProperty.call(POEM_GLOSS, k) ? POEM_GLOSS[k].g : null;
}

/**
 * 全诗断行：按句读切（，。！？；：、），每段带原标点。
 * 中文竖排视觉的常规做法——一个句读一行，五七言诗一行就是半联，词的长短句也自然成行。
 * 不用 String.prototype.split(/lookbehind/)：老基础库不支持后行断言，逐字符扫最稳。
 */
const BREAK = '，。！？；：、';
function splitLines(text) {
  const out = [];
  let cur = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\n' || ch === '\r') { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
    if (BREAK.indexOf(ch) >= 0) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** 去标点（高亮比对用） */
function stripPunc(s) {
  return String(s).replace(/[^\u4e00-\u9fa5]/g, '');
}

/**
 * 把全诗切成「渲染行」，并标出哪些行属于本局/本诗的句子。
 * @param {number} si 诗集下标
 * @param {string[]} marks 要高亮的句子（norm_key）
 * @returns {Array<{s:string, hl:boolean, mark:string}>}
 */
function renderLines(si, marks) {
  const set = new Set(marks || []);
  const lines = splitLines(poemText(si));
  return lines.map(s => {
    const k = stripPunc(s);
    let hit = '';
    if (set.has(k)) hit = k;
    else {
      // 跨句读的句子（词里偶见）：整段包含即高亮
      for (const m of set) { if (m && k.indexOf(m) >= 0) { hit = m; break; } }
    }
    return { s, hl: !!hit, mark: hit };
  });
}

/**
 * 按「首」聚合本页要展示的内容。
 * 优先本局真出现过的句子所属的诗（mine=true）；不足 max 首时用同令字收录句所在诗补齐。
 * 同一首诗里的多句合并成一条，避免《古诗十九首》那种一首三句被拆成三页。
 *
 * @param {string[]} lines 本局亮过的句子（Match.roundLines）
 * @param {string} keyword 本局令字
 * @param {number} max 最多几首
 */
function poems(lines, keyword, max) {
  const n = max || 6;
  const order = [];          // si 顺序
  const marksOf = new Map(); // si -> Set(句)
  const push = (si, t) => {
    if (!marksOf.has(si)) { marksOf.set(si, new Set()); order.push(si); }
    marksOf.get(si).add(t);
  };
  for (const t of lines || []) {
    if (!has(t)) continue;
    const si = srcIdx(t);
    if (si == null) continue;
    // 已满上限时只并入已有诗（同诗第二句不该被丢掉，否则一首诗会缺句）
    if (!marksOf.has(si) && order.length >= n) continue;
    push(si, t);
  }
  const mineCount = order.length;
  if (order.length < n && keyword) {
    for (const t of Object.keys(DATA)) {
      if (order.length >= n) break;
      if (t.indexOf(keyword) < 0) continue;
      const si = srcIdx(t);
      if (si == null) continue;
      push(si, t);
    }
  }
  return order.slice(0, n).map((si, i) => {
    const s = sourceOf(si);
    const marks = Array.from(marksOf.get(si));
    return {
      si,
      mine: i < mineCount,
      title: s ? s.title : '',
      author: s ? s.author : '',
      dynasty: s ? s.dynasty : '',
      text: poemText(si),
      lines: renderLines(si, marks),
      marks,
      glosses: marks.map(t => ({ text: t, g: DATA[t] ? DATA[t].g : '', n: DATA[t] ? DATA[t].n : '' })),
      intro: introOf(si),
    };
  });
}

/**
 * 挑本页要展示的句子（单句卡时代的接口，2026-11-21 起诗笺页改用 poems()。
 * 保留是因为结算页入口提示与旧测试仍在用，行为不变）。
 *
 * @param {string[]} lines 本局亮过的句子（Match.roundLines）
 * @param {string} keyword 本局令字
 * @param {number} max 最多几条
 */
function pick(lines, keyword, max) {
  const n = max || 6;
  const out = [];
  const seen = new Set();
  for (const t of lines || []) {
    if (out.length >= n) break;
    if (!has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(Object.assign({ text: t, mine: true }, DATA[t]));
  }
  if (out.length < n && keyword) {
    for (const t of Object.keys(DATA)) {
      if (out.length >= n) break;
      if (seen.has(t) || t.indexOf(keyword) < 0) continue;
      seen.add(t);
      out.push(Object.assign({ text: t, mine: false }, DATA[t]));
    }
  }
  return out;
}

/** 收录条数（测试/埋点用） */
function count() {
  return Object.keys(DATA).length;
}

/** 诗级收录条数 */
function poemCount() {
  return Object.keys(POEM_GLOSS).length;
}

module.exports = {
  has, of, source, sourceOf, srcIdx, lineIndex, poemText, introOf,
  splitLines, stripPunc, renderLines, poems, pick, count, poemCount,
  DATA, POEM_GLOSS, POEM_TEXT,
};

});
__reg("js/ui/screens/gloss.js", function (module, exports, require) {
'use strict';
/**
 * 诗笺页（2026-11-21 二版：一首一页）
 *
 * 一版是「一句一页」：大字原文 + 一句白话。用户反馈「单句解析没有意义」——
 * 离开上下文，一句诗很容易被读歪（「明月几时有」单看像在问今晚月亮几点出来）。
 * 二版改成整首：全诗（本局句高亮）→ 诗童串讲 → 该句直译（降为第三层）。
 *
 * 滚动：卡片是视口，内容超出时卡内上下拖（长诗最长 960 字，一屏放不下）。
 * 手势判据：位移超过 SLOP 才算拖动，否则按点击走按钮——避免手抖吞掉点击。
 */
const d = require('../draw');
const { font, T } = require('../tokens');
const ink = require('../ink');
const layout = require('../layout');
const tiger = require('../tiger');
const platform = require('../../platform');
const gloss = require('../../../src/gloss');
const track = require('../../app/track');

/** 行首禁则字符：标点不许落在行首（2026-11-21 实锤：「明月几时有」释义的问号孤悬第二行行首） */
const NO_LINE_HEAD = /[？！。，、；：）》」』〕…]/

/** 按字符贪心折行（中文无空格，按字符切最稳；带避头尾——断点落在标点前时标点随上一字下移） */
function wrapText(ctx, text, f, maxW, maxLines) {
  ctx.font = f;
  const out = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const next = cur + text[i];
    if (cur && ctx.measureText(next).width > maxW) {
      // 避头尾：断行点前若正好是标点，把标点连同前一字一起挪到下一行行首
      let carry = '';
      if (NO_LINE_HEAD.test(text[i]) && cur.length > 1) {
        carry = cur.slice(-1);
        cur = cur.slice(0, -1);
      }
      out.push(cur);
      cur = carry + text[i];
      if (out.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (out.length < maxLines && cur) out.push(cur);
  if (out.length === maxLines && out.join('').length < text.length) {
    out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…';
  }
  return out.slice(0, maxLines);
}

const SLOP = 8;        // 拖动判据（px）：小于这个位移当点击
const FRICTION = 4.2;  // 惯性衰减系数（越大停得越快）

function GlossScreen(app, params) {
  const outcome = (params && params.outcome) || { stats: {}, lines: [] };
  const keyword = (outcome.stats && outcome.stats.keyword) || '';
  const cards = gloss.poems(outcome.lines, keyword, 6);

  let L = null; let L0 = null;
  let idx = 0;
  let enterT = 0;
  let typeT = 0;
  let toast = null;
  let pressed = null;
  let pressDown = null;

  // 滚动状态
  let scroll = 0;          // 当前偏移（0 = 顶部）
  let vel = 0;             // 惯性速度（px/s）
  let drag = null;         // { y0, s0, moved }
  const metrics = new Map(); // idx -> 测量结果（切页后按需计算一次）

  const self = {
    id: 'gloss', hotRects: [],
    enter() {
      build();
      track.track('fhl_gloss', { n: cards.length, kw: keyword ? 1 : 0 });
    },
    leave() {},
    invalidate: build,
    update(dt) {
      enterT += dt;
      typeT += dt;
      if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
      if (pressed) { pressed.t -= dt; if (pressed.t <= 0) pressed = null; }
      // 惯性：松手后匀速衰减，到边界停
      if (!drag && vel !== 0) {
        scroll += vel * dt;
        vel -= vel * Math.min(1, FRICTION * dt);
        if (Math.abs(vel) < 12) vel = 0;
        clampScroll();
      }
    },
    draw(ctx, t) {
      const { c } = app.tokens;
      const S = app.settings.fontScale;
      const baked = d.drawBaked(ctx, L0, app.info.W, app.info.H, [c.bg, c.bgEnd]);
      if (!L) return;
      if (!baked) { L0 = null; try { drawStatic(ctx); } catch (e) { /* 直绘兜底失败不阻断 */ } }

      const st = app.settings.reduceMotion ? 0.5 : t;
      const card = cards[idx];
      // L1 小虎半身像（题名右侧，讲解者身份）
      tiger.bust(ctx, { win: L.tiger.win, state: st % 6 < 5.2 ? 'idle' : 'happy', t: st });

      const p = app.settings.reduceMotion ? 1 : Math.min(enterT / 0.24, 1);
      ctx.save();
      ctx.globalAlpha = p;

      if (card) {
        d.text(ctx, '本局诗笺', L.eyebrow.x, L.eyebrow.y, font(400, 13, 'serif'), c.fg2);
        // 题名（长题名降字号，不截断——《八声甘州》《水调歌头·明月几时有》这类都要完整）
        const tf = d.fitSize(ctx, card.title, 600, 26, 'serif', L.title.w);
        d.text(ctx, card.title, L.title.x, L.title.y, font(600, tf, 'serif'), c.fg, { maxW: L.title.w });
        const sub = `${card.dynasty} · ${card.author}`;
        d.text(ctx, sub, L.sub.x, L.sub.y, font(400, T.scaled('caption', S), 'serif'), c.fg2, { maxW: L.sub.w });
        d.text(ctx, `${idx + 1} / ${cards.length}`, L.page.x + L.page.w, L.page.y,
          font(400, T.scaled('caption', S), 'sans'), c.fg2, { align: 'right' });

        // 卡内内容（裁剪 + 滚动）
        const M = measure(ctx, idx, card);
        clampScroll(M.total);
        const v = L.view;
        ctx.save();
        d.rrect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.r);
        ctx.clip();
        drawContent(ctx, card, M, v.x, v.y - scroll, v.w, S);
        // 上下边缘渐隐：暗示还有内容（不做文字提示——压在正文上很难看，截图实锤）
        if (scroll > 1) fadeEdge(ctx, v, true, c);
        if (M.total - scroll > v.h + 1) fadeEdge(ctx, v, false, c);
        ctx.restore();
      } else {
        // 空态：本局没有收录句（样板期覆盖率低时会出现）
        d.text(ctx, '这一局还没有收进诗笺的句子', app.info.W / 2, L.card.y + L.card.h / 2 - 12,
          font(400, 22, 'serif'), c.fg2, { align: 'center', maxW: L.card.w - 40 });
        d.text(ctx, '先把这一局的诗句记住，讲解正在整理', app.info.W / 2, L.card.y + L.card.h / 2 + 26,
          font(400, 18, 'sans'), c.fg2, { align: 'center', maxW: L.card.w - 40 });
      }

      // 按钮文字
      d.text(ctx, '上一首', L.prevBtn.x + L.prevBtn.w / 2, L.prevBtn.y + 44, font(600, 20, 'serif'), c.secondary, { align: 'center' });
      d.text(ctx, '下一首', L.nextBtn.x + L.nextBtn.w / 2, L.nextBtn.y + 44, font(600, 20, 'serif'), c.onBrand, { align: 'center' });
      d.text(ctx, '回结算', L.backBtn.x + L.backBtn.w / 2, L.backBtn.y + 44, font(600, 20, 'serif'), c.secondary, { align: 'center' });
      ctx.restore();

      if (toast) {
        const ty = L.prevBtn.y - 56;
        d.pill(ctx, 48, ty, app.info.W - 96, 40, 'rgba(43,35,29,0.78)');
        d.text(ctx, toast.text, app.info.W / 2, ty + 20, font(400, 20, 'sans'), '#FFF9EC', { align: 'center' });
      }
      if (pressed) {
        const r = pressed.id === 'gloss.prev' ? L.prevBtn : pressed.id === 'gloss.next' ? L.nextBtn : L.backBtn;
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    },
    touch(phase, x, y) {
      if (phase === 'start') {
        for (const h of self.hotRects) {
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
            pressed = { id: h.id, t: 0.12 }; pressDown = h.id; return;
          }
        }
        // 卡内按下：可能是拖动，也可能是误触；先记账，位移超 SLOP 再认定
        const a = L && L.scrollArea;
        if (a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h && canScroll()) {
          drag = { y0: y, s0: scroll, moved: false };
          vel = 0;
        }
        return;
      }
      if (phase === 'move') {
        if (!drag) return;
        const dy = y - drag.y0;
        if (!drag.moved && Math.abs(dy) > SLOP) { drag.moved = true; pressDown = null; pressed = null; }
        if (drag.moved) {
          const M = measureCached();
          scroll = clamp(drag.s0 - (dy - Math.sign(dy) * SLOP), 0, Math.max(0, (M ? M.total : 0) - L.view.h));
          // 用相邻两次 move 的时间差估速度（松手后用惯性继续滑）
          const now = Date.now();
          if (drag.lastT) {
            const dtm = Math.max(0.008, (now - drag.lastT) / 1000);
            vel = clamp(-(y - drag.lastY) / dtm, -1800, 1800);
          }
          drag.lastY = y; drag.lastT = now;
        }
        return;
      }
      // end
      if (drag) {
        const moved = drag.moved;
        drag = null;
        if (moved) { vel = clamp(vel, -1800, 1800); return; }
      }
      const hit = (function () {
        for (const h of self.hotRects) {
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
        }
        return null;
      })();
      const was = pressDown; pressDown = null; pressed = null;
      if (!hit || hit !== was) return;
      if (hit === 'gloss.prev') {
        if (idx > 0) { idx--; resetPage(); }
        else toast = { text: '已经是第一首', t: 1.2 };
      } else if (hit === 'gloss.next') {
        if (idx < cards.length - 1) { idx++; resetPage(); }
        else toast = { text: '这一局就讲到这儿', t: 1.2 };
      } else if (hit === 'gloss.back') {
        // noSave：回结算不再写一次战绩（applyOutcome 会重复计局）
        app.goto('result', { outcome, noSave: true });
      }
    },
  };

  function resetPage() {
    scroll = 0; vel = 0; drag = null; typeT = 0; enterT = 0;
  }
  function canScroll() {
    const M = measureCached();
    return !!M && M.total > L.view.h + 2;
  }
  function measureCached() {
    if (!L) return null;
    return metrics.get(idx) || null;
  }
  function clampScroll(total) {
    const max = Math.max(0, (total == null ? (measureCached() || {}).total || 0 : total) - (L ? L.view.h : 0));
    scroll = clamp(scroll, 0, max);
    if (scroll <= 0 || scroll >= max) vel = 0;
  }

  /** 量一遍当前这首：行数、串讲折行、合计高度。切页时算一次，之后走缓存。 */
  function measure(ctx, i, card) {
    if (metrics.has(i)) return metrics.get(i);
    const S = app.settings.fontScale;
    const w = L.view.w;
    let y = 0;
    const rows = [];
    if (card.mine) { rows.push({ kind: 'mine', s: '本局接上过这几句' }); y += 26; }
    else { rows.push({ kind: 'mine', s: '带令字的名篇，记一首' }); y += 26; }
    for (const ln of card.lines) {
      rows.push({ kind: 'line', s: ln.s, hl: ln.hl });
      y += L.lineLH;
    }
    y += 16;
    rows.push({ kind: 'rule' }); // 分隔线占 1 行高
    y += 18;
    rows.push({ kind: 'label', s: '诗童讲' });
    y += 26;
    if (card.intro) {
      const ir = wrapText(ctx, card.intro, font(400, L.introFs, 'sans'), w, 40);
      for (const s of ir) { rows.push({ kind: 'intro', s }); y += L.introLH; }
    } else {
      const fb = wrapText(ctx, '这首诗的讲解还在整理——先把全诗读一遍，句子怎么用，下局令字里见。',
        font(400, L.introFs, 'sans'), w, 4);
      for (const s of fb) { rows.push({ kind: 'intro', s }); y += L.introLH; }
    }
    if (card.glosses && card.glosses.length) {
      y += 14;
      rows.push({ kind: 'label', s: '这句怎么说' });
      y += 26;
      for (const g of card.glosses) {
        const gr = wrapText(ctx, g.g, font(400, 18, 'sans'), w, 3);
        const nr = g.n ? wrapText(ctx, '· ' + g.n, font(400, L.noteFs, 'sans'), w, 2) : [];
        rows.push({ kind: 'gline', s: g.text, h: 26 });
        y += 26;
        for (const s of gr) { rows.push({ kind: 'gtext', s }); y += 27; }
        for (const s of nr) { rows.push({ kind: 'note', s }); y += L.noteLH; }
        y += 8;
      }
    }
    y += 6;
    const M = { rows, total: y };
    metrics.set(i, M);
    return M;
  }

  /** 画卡内内容：从 (x, y) 开始，纵向按 scroll 已经偏移过 */
  function drawContent(ctx, card, M, x, y0, w, S) {
    const { c } = app.tokens;
    let y = y0;
    for (const r of M.rows) {
      if (r.kind === 'mine') {
        d.text(ctx, r.s, x, y + 10, font(400, 15, 'sans'), c.danger, { maxW: w });
        y += 26;
      } else if (r.kind === 'line') {
        if (r.hl) {
          // 高亮：淡底 + 左侧红竖条，字色加深——靠底色和字重，不靠加粗描边（真机描边发糊）
          d.rrect(ctx, x - 8, y + 2, w + 16, L.lineLH - 4, 6);
          ctx.fillStyle = hexA(c.primary, 0.10); ctx.fill();
          ctx.fillStyle = hexA(c.primary, 0.75);
          ctx.fillRect(x - 12, y + 8, 3, L.lineLH - 16);
        }
        const lf = d.fitSize(ctx, r.s, r.hl ? 600 : 400, L.lineFs, 'serif', w);
        d.text(ctx, r.s, x + w / 2, y + L.lineLH / 2, font(r.hl ? 600 : 400, lf, 'serif'),
          r.hl ? c.fg : c.fg2, { align: 'center', maxW: w });
        y += L.lineLH;
      } else if (r.kind === 'rule') {
        d.rrect(ctx, x + w / 2 - 22, y + 8, 44, 2, 1);
        ctx.fillStyle = hexA(c.primary, 0.30); ctx.fill();
        y += 18;
      } else if (r.kind === 'label') {
        d.text(ctx, r.s, x, y + 10, font(600, 15, 'serif'), c.primary, { maxW: w });
        y += 26;
      } else if (r.kind === 'intro') {
        d.text(ctx, r.s, x, y + L.introLH / 2 - 2, font(400, L.introFs, 'sans'), c.fg, { maxW: w });
        y += L.introLH;
      } else if (r.kind === 'gline') {
        d.text(ctx, r.s, x, y + 12, font(600, 19, 'serif'), c.fg, { maxW: w });
        y += 26;
      } else if (r.kind === 'gtext') {
        d.text(ctx, r.s, x, y + 12, font(400, 18, 'sans'), c.fg2, { maxW: w });
        y += 27;
      } else if (r.kind === 'note') {
        d.text(ctx, r.s, x, y + 11, font(400, L.noteFs, 'sans'), c.fg2, { maxW: w });
        y += L.noteLH;
      }
    }
  }

  /**
   * 上下边缘渐隐：两段实色半透明条（不用渐变——draw 循环里禁建渐变对象，
   * 而且主画布与离屏画布的渐变对象在小游戏端不保证通用）。
   */
  function fadeEdge(ctx, v, top, c) {
    const h = 14;
    for (let i = 0; i < 3; i++) {
      // 靠裁切边最实、往里渐透：top 从 v.y 往下淡，bottom 从 v.y+v.h 往上淡
      ctx.fillStyle = hexA(c.surface, 0.74 - i * 0.22);
      const hh = h / 3;
      ctx.fillRect(v.x - 8, top ? v.y + i * hh : v.y + v.h - (i + 1) * hh, v.w + 16, hh);
    }
  }

  function build() {
    try {
      L = layout.gloss(app.info);
      self.hotRects = L.hotRects;
      L0 = platform.createOffscreen(Math.round(app.info.W * app.info.dpr), Math.round(app.info.H * app.info.dpr));
      if (!L0) return;
      const g = L0.getContext('2d');
      if (!g || typeof g.fillRect !== 'function' || typeof g.createLinearGradient !== 'function') { L0 = null; return; }
      g.setTransform(app.info.dpr, 0, 0, app.info.dpr, 0, 0);
      drawStatic(g);
    } catch (e) {
      L0 = null;
      console.error('[fhl] 诗笺页烘焙失败，已降级直绘:', e && (e.stack || e.message) || e);
    }
  }

  function drawStatic(g) {
    const { c } = app.tokens;
    const W = app.info.W, H = app.info.H;
    g.fillStyle = d.makeVGrad(g, 0, 0, H, c.bg, c.bgEnd);
    g.fillRect(0, 0, W, H);
    ink.bakePaperTexture(g, W, H, 0.8);
    const cd = L.card;
    d.shadow(g, cd.x, cd.y, cd.w, cd.h, cd.r, 1, c);
    d.rrect(g, cd.x, cd.y, cd.w, cd.h, cd.r);
    g.fillStyle = c.surface; g.fill();
    g.lineWidth = T.st.hair; g.strokeStyle = c.lineSoft; g.stroke();
    // 按钮：下一首是主操作（实心），另两个描边
    const nx = L.nextBtn;
    d.gradBtn(g, d.makeVGrad(g, nx.x, nx.y, nx.y + nx.h, c.primaryGrad[0], c.primaryGrad[1]), nx.x, nx.y, nx.w, nx.h, nx.r);
    for (const b of [L.prevBtn, L.backBtn]) {
      d.rrect(g, b.x, b.y, b.w, b.h, b.r);
      g.fillStyle = c.surface; g.fill();
      g.lineWidth = T.st.thin; g.strokeStyle = c.secondary; g.stroke();
    }
  }

  return self;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

module.exports = { GlossScreen, wrapText, NO_LINE_HEAD };

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
const { GlossScreen } = require('./js/ui/screens/gloss');
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
    else if (sceneName === 'gloss') app.scene = GlossScreen(app, params);
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
  var __entry = __req('', "game.js");
  if (typeof window !== 'undefined') window.__fhl = __entry;
})();