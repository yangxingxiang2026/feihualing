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
