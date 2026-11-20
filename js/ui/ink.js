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
