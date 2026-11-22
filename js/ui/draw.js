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
