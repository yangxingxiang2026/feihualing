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
