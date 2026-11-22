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
