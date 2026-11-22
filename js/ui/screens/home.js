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
