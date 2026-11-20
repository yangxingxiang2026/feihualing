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
