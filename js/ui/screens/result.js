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
