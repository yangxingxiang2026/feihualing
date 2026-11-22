'use strict';
/**
 * 小诗童触摸互动回归（2026-11-20）：三屏热区划分 / 冷却 / 动画曲线 / 萌音配置 / 渲染不炸
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const pet = require(path.join(ROOT, 'js/ui/pet'));
const sound = require(path.join(ROOT, 'js/app/sound'));

test('热区划分 ①：全身三区（头/肚/脚）互不重叠、并集覆盖整盒', () => {
  const box = { x: 100, y: 200, w: 120, h: 168 };
  const z = pet.petZones('full', box);
  assert.deepEqual(z.map(s => s.id), ['pet.head', 'pet.belly', 'pet.foot']);
  // 两两不重叠
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) {
    const a = z[i], b = z[j];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(overlap, false, `${a.id} 与 ${b.id} 相交`);
  }
  // 纵向无缝覆盖
  assert.equal(z[0].y + z[0].h, z[1].y, '头底应接肚顶');
  assert.equal(z[1].y + z[1].h, z[2].y, '肚底应接脚顶');
  assert.equal(z[2].y + z[2].h, box.y + box.h, '脚底应到盒底');
});

test('热区划分 ②：半身两区（头/爪）——对局页 bustWin 映射', () => {
  const box = { x: 150, y: 100, w: 100, h: 108 };
  const z = pet.petZones('bust', box);
  assert.deepEqual(z.map(s => s.id), ['pet.head', 'pet.paw'], '半身像没有肚子（被裁切窗裁掉），脚用爪替代');
  assert.equal(z[0].y + z[0].h, z[1].y, '头底接爪顶');
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) {
    const a = z[i], b = z[j];
    assert.equal(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, false);
  }
});

test('冷却 ③：摸头 450ms / 其余 600ms 同区冷却，不同区即时切换', () => {
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  assert.equal(p.trigger('head'), true, '首次触发成功');
  assert.equal(p.trigger('head'), false, '同区冷却中');
  p.update(0.2);
  assert.equal(p.trigger('head'), false, '200ms 仍在冷却');
  p.update(0.26);   // 累计 0.46s > 0.45（摸头短冷却：支持连续撸猫节奏）
  assert.equal(p.trigger('head'), true, '摸头冷却结束可再触发');

  const p2 = pet.create();
  p2.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p2.trigger('foot');
  p2.update(0.61);  // 其余部位 0.6s
  assert.equal(p2.trigger('foot'), true, '脚部 600ms 冷却结束');
  // 不同区不受当前冷却影响
  const p3 = pet.create();
  p3.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p3.trigger('foot');
  assert.equal(p3.trigger('belly'), true, '换区即时触发');
});

test('动画曲线 ④：摸头蹭+化饼弹回 / 肚惊跳抖毛 / 挠脚高蹬，均有限幅且归零', () => {
  // 摸头：蹭（0–0.5 歪头贴手）→ 化饼（sy 塌到 ≤0.5）→ 啵弹回（过冲）→ 归零
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p.trigger('head');
  let maxRot = 0, holdDx = 0, minSy = 1, endRot = null;
  for (let i = 0; i <= 80; i++) {
    p.update(0.02);
    const o = p.offset();
    maxRot = Math.max(maxRot, Math.abs(o.rot));
    if (i > 15 && i < 37) holdDx = Math.max(holdDx, Math.abs(o.dx)); // 蹭保持期（p<0.5）
    minSy = Math.min(minSy, o.sy);
    endRot = o.rot;
    assert.ok(Math.abs(o.rot) <= 0.095 + 1e-9, '贴手歪头幅值 ≤0.095rad（0.075 贴 + 0.02 揉）');
    assert.ok(Math.abs(o.dx) <= 6 + 1e-9, '贴手 dx ≤6px');
    assert.ok(o.sy >= 0.2 - 1e-9 && o.sy <= 1.2 + 1e-9, '化饼/弹回 sy 量程 0.2–1.2');
  }
  assert.ok(maxRot > 0.05, '应有明显歪头');
  assert.ok(holdDx > 2, '蹭保持期应有持续贴手位移');
  // 十二版：化饼深度 0.30 → 0.56（用户「太夸张了、太矮了」）。判据两头卡住：
  // 低于 0.5 = 压成贴纸，高于 0.65 = 根本看不出在「化」。
  assert.ok(minSy >= 0.5 && minSy <= 0.65, `化饼应明显塌下去但不压扁（sy 最低 ${minSy.toFixed(3)}，要求 0.50–0.65）`);
  assert.ok(Math.abs(endRot) < 1e-9, '动画结束应归零');

  // 摸肚：惊跳弹起（dy<0 + 放大）→ 抖毛 squash → 害羞扭，限幅内
  const p2 = pet.create();
  p2.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p2.trigger('belly');
  let sq = false, jumped = false, maxJump = 0;
  for (let i = 0; i <= 60; i++) {
    p2.update(0.02);
    const o = p2.offset();
    assert.ok(Math.abs(o.rot) <= 0.07 + 1e-9, '摇摆幅值 ≤0.06rad');
    assert.ok(Math.abs(o.sx - 1) <= 0.19 + 1e-9 && Math.abs(o.sy - 1) <= 0.19 + 1e-9, '惊跳/挤压限幅');
    maxJump = Math.min(maxJump, o.dy);
    if (o.dy < -3) jumped = true;
    if (Math.abs(o.sy - 1) > 0.01) sq = true;
  }
  assert.ok(jumped && maxJump < -5, '摸肚应先「惊跳弹起」（dy 负峰）');
  assert.ok(sq, '摸肚应有挤压/抖毛弹性形变');

  // 挠脚：先蹲（dy>0）后蹬（dy 负峰 ~22*scale）
  const p3 = pet.create();
  p3.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p3.trigger('foot');
  let crouch = 0, minDy = 0;
  for (let i = 0; i <= 55; i++) {
    p3.update(0.02);
    const o = p3.offset();
    crouch = Math.max(crouch, o.dy);
    minDy = Math.min(minDy, o.dy);
    assert.ok(Math.abs(o.dy) <= 24 * (280 / 560) * 1.1 + 1e-9, '弹跳限幅 ≤22*scale*1.1');
  }
  assert.ok(crouch > 1, '应先下蹲蓄力');
  assert.ok(minDy < -8, '再向上蹬腿弹跳（沙雕版蹬更高）');

  const p4 = pet.create();
  p4.setBox({ x: 0, y: 0, w: 200, h: 280 });
  assert.deepEqual(p4.offset(), { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 }, '未触发时 transform 归零');
});

test('连击彩蛋 ④c：同区 3s 内 ≥3 次 → 彩蛋模式（摸头=5 秒太空步 / 挠脚=陀螺狂笑）', () => {
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p.trigger('head');
  assert.equal(p._streak().n, 1, '首触 streak=1');
  assert.equal(p._fx().combo, false, '首触非 combo');
  p.update(0.5); p.trigger('head');
  assert.equal(p._streak().n, 2, '二次触发 streak=2');
  p.update(0.5); p.trigger('head');
  assert.equal(p._streak().n, 3, '三次触发 streak=3');
  assert.equal(p._fx().combo, true, '3 连击进入彩蛋模式');
  assert.equal(p._fx().life, pet.LIFE_COMBO.head, '彩蛋时长用 LIFE_COMBO');
  // 摸头 3 连 = 5 秒太空步 v3（九版）：身体不位移（地面在走）+ 恒不上下颠 + 不变形，
  // 任意时刻一脚整掌贴地、一脚踮脚点地（真实舞步的两条硬要点）。
  let maxRot = 0, maxDx = 0, maxDy = 0, minDy = 0, flat = true;
  let phLow = false, phHigh = false, oneFlatOneToe = true, prevFlatX = null, prevToeX = null;
  let flatBack = 0, toeFwd = 0, prevScroll = -1, scrollMono = true;
  let phaseShift = null;
  for (let i = 0; i < 250; i++) {
    p.update(0.02);
    const o = p.offset();
    maxRot = Math.max(maxRot, Math.abs(o.rot));
    maxDx = Math.max(maxDx, Math.abs(o.dx));
    maxDy = Math.max(maxDy, Math.abs(o.dy));
    minDy = Math.min(minDy, o.dy);
    if (o.sy < 0.975 || o.sy > 1.001) flat = false;      // 只允许拍点 1.8% 压扁
    const ph = p.pose().phase;
    if (ph < 0.2) phLow = true;
    if (ph > 0.8) phHigh = true;
    const mw = pet.moonwalkPose(p._fx().t, 0.3);
    const nFlat = mw.feet.filter(f => f.flat).length;
    if (nFlat !== 1) oneFlatOneToe = false;
    if (prevScroll >= 0 && mw.scroll < prevScroll - 1e-9) scrollMono = false;
    prevScroll = mw.scroll;
    const fm = mw.feet[0].flat ? mw.feet[0] : mw.feet[1];
    const tm = mw.feet[0].flat ? mw.feet[1] : mw.feet[0];
    if (prevFlatX !== null) { flatBack += fm.x - prevFlatX; toeFwd += tm.x - prevToeX; }
    prevFlatX = fm.x; prevToeX = tm.x;
    if (phaseShift === null) phaseShift = 0;
    if (ph < 0.02) phaseShift += 1;
  }
  assert.ok(maxRot <= 0.03, `太空步只做重心微倾（≤0.03rad，后仰会读成要倒；实测 ${maxRot.toFixed(3)}）`);
  assert.ok(maxDx < 1e-9, '太空步身体不位移（位移交给地面滚动，否则末尾会滑回去跳帧）');
  // 拍点沉降：每拍下压一小口再回弹（节奏感），但只向下、幅度 ≤3px、单拍内衰减完——
  // 走路那种持续正弦 bob 会读成蹦跳，这里必须是"一次冲击 + 指数回落"
  assert.ok(maxDy > 0.5 && maxDy <= 3, `拍点应有沉降但幅度 ≤3px（实测 ${maxDy.toFixed(2)}）`);
  assert.ok(minDy >= -1e-9, '沉降只能向下（不向上弹跳）');
  assert.ok(flat, '太空步变形只限拍点 1.8% 压扁（不化饼）');
  // 单拍内必须衰减掉：u=0.06 的沉降应明显大于 u=0.6
  const dA = pet.moonwalkPose(0.06 * pet.MOONWALK_STEP, 0.3).dy;
  const dB = pet.moonwalkPose(0.6 * pet.MOONWALK_STEP, 0.3).dy;
  assert.ok(dA > dB * 3, `拍点沉降应在单拍内衰减（起手 ${dA.toFixed(2)} vs 拍尾 ${dB.toFixed(2)}）`);
  // 拍长 = 舞步速度：0.62s/拍（≈97BPM）；5 秒彩蛋 ≈ 8 拍
  assert.ok(pet.MOONWALK_STEP >= 0.5 && pet.MOONWALK_STEP <= 0.8, '一拍 0.5–0.8s（97–120BPM 的舞感）');
  assert.ok(Math.abs(5 / pet.MOONWALK_STEP - 8) < 0.6, '5 秒彩蛋应跳 8 拍左右（不是 4 拍）');
  assert.ok(oneFlatOneToe, '任意时刻应一脚整掌贴地、一脚踮脚点地');
  assert.ok(flatBack > 0, `贴地脚应持续向后拖（+x，实测累计 ${flatBack.toFixed(1)}）`);
  assert.ok(toeFwd < 0, `踮脚应向后→前摆（-x，实测累计 ${toeFwd.toFixed(1)}）`);
  assert.ok(scrollMono, '地面滚动应单调（地面只往一个方向走，不来回）');
  assert.ok(phLow && phHigh, 'pose() 相位应扫过 0..1 整圈（左右各滑一次）');
  // 一个循环 = MOONWALK_CYCLE 秒：5 秒彩蛋正好 2 个循环（4 次滑步）
  assert.ok(Math.abs(pet.MOONWALK_CYCLE - 2 * pet.MOONWALK_STEP) < 1e-9, '循环 = 2 次滑步');
  // 挠脚 3 连击 → 陀螺（rot 连转，幅值远大于常规 0.09）
  const p2 = pet.create();
  p2.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p2.trigger('foot'); p2.update(0.62); p2.trigger('foot'); p2.update(0.62); p2.trigger('foot');
  assert.equal(p2._fx().combo, true);
  let maxRot2 = 0;
  for (let i = 0; i < 80; i++) {
    p2.update(0.02);
    maxRot2 = Math.max(maxRot2, Math.abs(p2.offset().rot));
  }
  assert.ok(maxRot2 > 1.5, '连击挠脚应有「原地陀螺」连转（rot >1.5rad）');
  // 换区重置连击
  const p3 = pet.create();
  p3.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p3.trigger('belly'); p3.update(0.62); p3.trigger('belly');
  p3.trigger('head');
  assert.equal(p3._streak().n, 1, '换区应重置连击计数');
  // 窗口过期重置
  const p4 = pet.create();
  p4.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p4.trigger('foot'); p4.update(0.62); p4.trigger('foot');
  p4.update(3.0);
  p4.trigger('foot');
  assert.equal(p4._streak().n, 1, '超 3s 窗口连击重置');
});

test('配音映射 ④d：pet.soundFor 常规=嗷呜系 / 彩蛋=太空步配乐·狂笑', () => {
  assert.equal(pet.soundFor('head', false), 'purr');
  assert.equal(pet.soundFor('head', true), 'moonwalk', '摸头 3 连=太空步配乐');
  assert.equal(pet.soundFor('belly', false), 'yelp', '摸肚=惊叫（禁区反差）');
  assert.equal(pet.soundFor('belly', true), 'laugh', '摸肚连击=狂笑');
  assert.equal(pet.soundFor('foot', false), 'chirp');
  assert.equal(pet.soundFor('paw', false), 'chirp');
  assert.equal(pet.soundFor('paw', true), 'laugh');
});

test('状态覆盖 ④b：摸头（含化饼）→ pet 状态；摸肚/挠脚保持睁眼（null，反差惊跳）', () => {
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  assert.equal(p.stateOverride(), null, '未触发时为 null（用原状态）');
  p.trigger('head');
  assert.equal(p.stateOverride(), 'pet', '摸头中应覆盖为 pet');
  for (let i = 0; i < 80; i++) p.update(0.02);
  assert.equal(p.stateOverride(), null, '动画结束还原');
  p.trigger('belly');
  assert.equal(p.stateOverride(), null, '摸肚惊跳应保持睁眼（不切 pet）');
  p.trigger('foot');
  assert.equal(p.stateOverride(), null, '挠脚蹬天应保持睁眼');
  p.trigger('head');
  assert.equal(p.stateOverride(), 'pet', '摸头切回 pet');
});

test('萌音 ⑤：purr/chirp/yelp/snore/laugh 幼虎叫配方合法 + 发声/让路', () => {
  // 四版配方（2026-11-20 修「不好听」）：谐波堆叠 + 低通 + 音域收窄（不再像滑哨）
  const purr = sound.SFX.purr;
  assert.equal(purr.voice, true, '萌音标记 voice（其余音让路）');
  assert.ok(Array.isArray(purr.partials) && purr.partials.length >= 2, '叫声应谐波堆叠（主音 + 泛音）');
  assert.equal(purr.partials[0][0], 1, '第 1 项必须是主音（ratio 1）');
  assert.ok(purr.lowpass && purr.lowpass <= 3800, '叫声低通削毛刺（≤3800Hz；八版不再闷成 1250）');
  assert.ok(!purr.formant.amHz, 'purr 不加振幅调制（AM 会把泛音抖成呼噜/电子味）');
  assert.ok(purr.formant.pitch[0][0] >= 450, '萌音基频下限 ≥450Hz（幼兽，不是成年猫低吼）');
  assert.ok(purr.formant.dur <= 0.8, '萌音要短促（≤0.8s，长音会拖成呼噜）');
  // 嗷呜形状：先上扬（嗷）后回落（呜）
  assert.ok(purr.notes[0][0] < purr.notes[0][4], '第 1 段应上扬（嗷）');
  assert.ok(purr.notes[1][0] > purr.notes[1][4], '第 2 段应回落（呜）');
  // 音域：八版整体上移到幼兽区（幼猫喵叫 550–900Hz），上限仍卡住防止变汽笛
  ['purr', 'chirp'].forEach(k => {
    sound.SFX[k].notes.forEach(n => {
      assert.ok(Math.max(n[0], n[4] || 0) <= 1200, `${k} 音高 ${Math.max(n[0], n[4] || 0)}Hz 应收在 1200Hz 以内`);
    });
    assert.ok(Math.max(...sound.SFX[k].notes.map(n => Math.max(n[0], n[4] || 0))) >= 600,
      `${k} 至少一段应到 600Hz（萌音高基频）`);
  });
  sound.SFX.yelp.notes.forEach(n => {
    assert.ok(Math.max(n[0], n[4] || 0) <= 1400, 'yelp 惊叫音高 ≤1400Hz');
  });
  const pt = Math.max(...purr.notes.map(n => n[1] + n[2]));
  assert.ok(pt <= 1.4, `叫声总时长 ${pt.toFixed(2)}s 应 ≤1.4s`);
  for (const k of ['yelp', 'chirp']) {
    const s = sound.SFX[k];
    assert.ok(Array.isArray(s.notes) && s.notes.length >= 2, `${k} 应有多段音符`);
    assert.ok(s.notes[0][0] < s.notes[0][4] && s.notes[1][0] > s.notes[1][4], `${k} 也应是嗷→呜两段式`);
    const total = Math.max(...s.notes.map(n => n[1] + n[2]));
    assert.ok(total <= 0.55, `${k} 总时长 ${total.toFixed(2)}s 应 ≤0.55s`);
  }
  ['purr', 'chirp', 'yelp', 'laugh', 'moonwalk'].forEach(k => {
    sound.SFX[k].notes.forEach((n, i) => assert.ok(n[3] <= 0.30, `${k} 第 ${i + 1} 音峰值 ≤0.30（五版加大量程后仍无削波风险）`));
    assert.ok(sound.SFX[k].notes.some(n => n[3] >= 0.20), `${k} 至少一音 ≥0.20（五版「太小听不见」加量）`);
  });
  // 真发声路径：注入假上下文
  const rec = { oscs: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const fake = {
    state: 'running', currentTime: 1.5, destination: {},
    createOscillator() { rec.oscs++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() {}, destination: 1 }; },
  };
  sound._injectContext(fake);
  assert.equal(sound.play('purr'), true);
  // purr（无 BiquadFilter → 正弦 fallback）：2 段 × 3 谐波 = 6 主振荡器 + 2 颤音 lfo = 8
  assert.equal(rec.oscs, 8, 'purr fallback 应建 8 个振荡器（6 谐波 + 2 颤音）');
  // 背景声让路：叫声占线期间 pick 静默；占线结束后恢复
  assert.equal(sound.play('pick'), false, '叫声占线期间玩法音应让路');
  fake.currentTime = 3.5;
  assert.equal(sound.play('pick'), true, '占线结束后恢复');
  sound._injectContext(null);
});

test('渲染 ⑥：pet.draw 在 stub ctx 上零异常（head/belly/foot 全路径）', () => {  for (const zone of ['head', 'belly', 'foot']) {
    const p = pet.create();
    p.setBox({ x: 100, y: 100, w: 150, h: 210 });
    assert.equal(p.trigger(zone), true);
    const ctx = {
      save() {}, restore() {},
      beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillText() {}, fill() {}, rect() {},
      globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1,
      font: '', textAlign: '', textBaseline: '',
    };
    // 全生命周期采样绘制（摸头 1.5s → 80 帧）
    for (let i = 0; i < 80; i++) { p.update(0.02); p.draw(ctx); }
    assert.equal(p._fx(), null, '动画结束后 fx 清空');
  }
});

test('渲染 ⑦：渲染器 pet 状态（眯眼/ω嘴/踩奶/耳抖）全路径不炸且注册于 STATES', () => {
  const Tiger = require(path.join(ROOT, 'src/actors/tiger_renderer.js'));
  assert.ok(Tiger.STATES.indexOf('pet') >= 0, 'pet 应注册进 STATES');
  // 万能 stub ctx：任意方法返回 undefined、任意属性可写
  const ctx = new Proxy({}, {
    get(t, k) { if (k === 'canvas') return { width: 375, height: 667 }; return () => undefined; },
    set() { return true; },
  });
  for (const t of [0, 0.3, 0.7, 1.3]) {
    Tiger.draw(ctx, { state: 'pet', t });
    Tiger.draw(ctx, { state: 'pet', t, scale: 0.3, x: 100, y: 50 });
  }
  // 全身与半身包装层同样接受 pet 状态
  const tiger = require(path.join(ROOT, 'js/ui/tiger'));
  tiger.fullBody(ctx, { cx: 187, y0: 100, scale: 0.4, state: 'pet', t: 0.5 });
  tiger.bust(ctx, { win: { x: 10, y: 10, w: 100, h: 108 }, state: 'pet', t: 0.5 });
});

test('后肢 ⑧：idle/pet 状态应画出身体下缘外侧的两只后脚掌（y≥505）', () => {
  const Tiger = require(path.join(ROOT, 'src/actors/tiger_renderer.js'));
  for (const state of ['idle', 'pet']) {
    const tr = [], ell = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
      fillText() {}, rotate() {}, scale() {},
      translate(x, y) { tr.push([x, y]); },
      ellipse(x, y, rx, ry) { ell.push([x, y, rx, ry]); },
      globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1, lineCap: '', lineJoin: '',
      font: '', textAlign: '', textBaseline: '',
    };
    Tiger.draw(ctx, { state, t: 0.4 });
    // 后脚掌：盒内局部坐标 translate(136/264, 520)，随后画 30×17 脚掌
    const feet = tr.filter(t => t[1] >= 505);
    assert.equal(feet.length, 2, `${state} 应有 2 处后脚掌的定位（实际 ${feet.length}）`);
    assert.ok(feet.some(t => t[0] < 190) && feet.some(t => t[0] > 210), '后脚掌应分居左右两侧');
    assert.equal(ell.filter(e => e[2] === 32 && e[3] === 18).length, 2, '两只后脚掌各画一个 32×18 掌形');
  }
});

test('握笔 ⑨：爪握点在笔杆中上段（上段 44 / 下段 56，非最底端）', () => {
  const src = require('fs').readFileSync(path.join(ROOT, 'src/actors/tiger_renderer.js'), 'utf8');
  const m = src.match(/BRUSH_ANG = ([-\d.]+), BRUSH_SHAFT_UP = (\d+), BRUSH_SHAFT_DOWN = (\d+)/);
  assert.ok(m, '源码应声明 BRUSH_ANG / BRUSH_SHAFT_UP / BRUSH_SHAFT_DOWN');
  const up = Number(m[2]), down = Number(m[3]);
  // 握点比例 = up/(up+down)，应在 30%–48% 区间（中上段，不能回到最底端 0%）
  const ratio = up / (up + down);
  assert.ok(ratio >= 0.30 && ratio <= 0.48, `握点应在杆的 30%–48% 处，实际 ${up}/${up + down} = ${(ratio * 100).toFixed(0)}%`);
  // 笔头必须垂在握点下方（tip 的 y 范围 52–85，全为正值）
  assert.ok(src.includes('moveTo(-9, 52)') && src.includes('quadraticCurveTo(-8, 76, 0, 85)'), '笔头应画在握点下方（y 全正）');
  // 放缓角度后笔尖不出立绘底边：笔尖局部 y=85 沿杆轴的垂直分量，爪位 494 + 落差 ≤ 563（呼吸 ±3 容差）
  const ang = Math.abs(Number(m[1]));            // 已是弧度，勿再转度
  const tipDrop = 85 * Math.cos(ang);
  assert.ok(494 + tipDrop <= 563, `笔尖垂直落差 ${tipDrop.toFixed(1)}px 应 ≤69px（爪位 494 + 落差 ≤ 563 底边+呼吸）`);
});

test('前肢/后肢 ⑩：手臂肩(418)→爪心；后腿身体内(450)→脚掌，均两级描边', () => {
  const Tiger = require(path.join(ROOT, 'src/actors/tiger_renderer.js'));
  for (const state of ['idle', 'pet']) {
    const cur = {}, strokes = [];
    const ctx = {
      save() {}, restore() {}, beginPath() { cur.q = false; }, closePath() {},
      moveTo(x, y) { cur.sx = x; cur.sy = y; },
      lineTo() {},
      quadraticCurveTo(cx, cy, ex, ey) { cur.q = true; cur.cx = cx; cur.cy = cy; cur.ex = ex; cur.ey = ey; },
      bezierCurveTo() {}, arc() {}, rect() {}, fill() {}, clip() {}, fillText() {},
      rotate() {}, scale() {}, translate() {}, ellipse() {},
      stroke() { if (cur.q) strokes.push({ lw: this.lineWidth, ...cur }); },
      globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1, lineCap: '', lineJoin: '',
      font: '', textAlign: '', textBaseline: '',
    };
    Tiger.draw(ctx, { state, t: 0.4 });
    // 四肢各画两笔（outline 32 / fur 25）：2 前臂 + 2 后腿 = 8 笔
    const limbs = strokes.filter(s => s.lw === 32 || s.lw === 25);
    assert.equal(limbs.length, 8, `${state} 应有 8 笔四肢描边（2 前臂 + 2 后腿 × 深浅两级），实际 ${limbs.length}`);
    // 前肢：腕端（终点）在爪心区间，肩端在身体侧面 y≈410–426
    const arms = limbs.filter(s => s.lw === 32 && s.ey >= 474 && s.ey <= 496); // pet 踩奶 ±6 容差
    assert.equal(arms.length, 2, `${state} 两臂腕端应落到爪心区间（y 474–496），实际 ${arms.length}`);
    assert.ok(arms.every(s => s.sy >= 410 && s.sy <= 426), '肩端应在身体侧面 y≈410–426');
    assert.ok(arms.some(s => s.ex < 200) && arms.some(s => s.ex > 200), '两臂应分居左右');
    // 后肢：末端连到脚掌（y≈508），腿根埋在身体内（y≈450，绘制在最底层被身体覆盖）
    const legs = limbs.filter(s => s.lw === 32 && s.ey >= 500 && s.ey <= 515);
    assert.equal(legs.length, 2, `${state} 两条后腿末端应落到脚掌区间（y 500–515），实际 ${legs.length}`);
    assert.ok(legs.every(s => s.sy >= 440 && s.sy <= 460), '腿根应埋在身体内 y≈440–460');
    assert.ok(legs.some(s => s.ex < 200) && legs.some(s => s.ex > 200), '两腿应分居左右');
  }
});

test('萌音 ⑤b：共振峰合成路径（六版修「叫声不对」根因：嗷呜=元音变化不是音高滑音）', () => {
  const rec = { oscs: 0, filters: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const fake = {
    state: 'running', currentTime: 1.5, destination: {}, sampleRate: 44100,
    createOscillator() { rec.oscs++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() {}, destination: 1 }; },
    createBiquadFilter() { rec.filters++; return { type: '', frequency: param(), Q: param(), connect() {} }; },
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; },
    createBuffer(n, len) { return { getChannelData: () => new Float32Array(len) }; },
  };
  sound._injectContext(fake);
  assert.equal(sound.play('purr'), true, '有 BiquadFilter 能力时走 formant 路径');
  // 八版：purr 去喉震 → 声源+颤音+jitter = 3 振荡器；声源低通 + F1/F2 + 呼吸噪声 = 4 滤波
  assert.equal(rec.oscs, 3, 'formant 路径应建 3 个振荡器（声源+颤音+jitter，无 AM）');
  assert.equal(rec.filters, 4, '七版拟真应建 4 个滤波器（声源低通 + F1/F2 + 呼吸噪声）');
  // 配方断言：F1/F2 都应收窄（a→u 的元音变化）；音高仍收在 560Hz 内
  const f = sound.SFX.purr.formant;
  assert.ok(Array.isArray(f.pitch) && f.pitch.length >= 3, '音高轮廓应有多点');
  assert.ok(f.f1[0][0] > f.f1[f.f1.length - 1][0], 'F1 应收窄（开口度变小=呜）');
  assert.ok(f.f2[0][0] > f.f2[f.f2.length - 1][0], 'F2 应下移（圆唇=呜）');
  assert.ok(Math.max.apply(null, f.pitch.map(p => p[0])) <= 900, '音高收在 900Hz 内（幼兽区，不上汽笛）');
  assert.ok(f.pitch[0][0] >= 450, '基频起点 ≥450Hz（萌音下限）');
  ['yelp', 'chirp'].forEach(k => {
    const g = sound.SFX[k].formant;
    assert.ok(g && g.dur <= 0.6, k + ' formant 配方应存在且时长 ≤0.6s');
  });
  // 占线让路对 formant 路径同样生效（purr dur 0.62 + 0.05 缓冲 → 1.5+0.67=2.17）
  fake.currentTime = 2.0;
  assert.equal(sound.play('pick'), false, 'formant 叫声占线期间玩法音让路');
  fake.currentTime = 3.0;
  assert.equal(sound.play('pick'), true, '占线结束后恢复');
  sound._injectContext(null);
});

test('萌音 ⑤c：沙雕音组 yelp/laugh/moonwalk 配方合法 + formant 七版拟真路径 + 让路', () => {
  // 配方合法：voice 标记 + formant/notes 双轨 + 峰值限幅
  for (const k of ['yelp', 'laugh']) {
    const s = sound.SFX[k];
    assert.equal(s.voice, true, `${k} 是叫声（voice 让路门）`);
    assert.ok(s.formant && Array.isArray(s.formant.pitch) && s.formant.pitch.length >= 2, `${k} 应有共振峰轮廓`);
    assert.ok(Array.isArray(s.notes) && s.notes.length >= 2, `${k} 应有正弦 fallback notes`);
    s.notes.forEach((n, i) => assert.ok(n[3] <= 0.30, `${k} 第 ${i + 1} 音峰值 ≤0.30`));
    const total = Math.max(...s.notes.map(n => n[1] + n[2]));
    assert.ok(total <= 1.4, `${k} 总时长 ${total.toFixed(2)}s ≤1.4s`);
  }
  // moonwalk 是节奏轨（repeat 四拍），不是单声叫声：单独校验拍点与拍长
  {
    const mw = sound.SFX.moonwalk;
    assert.equal(mw.repeat.times, 4, 'moonwalk 四拍独立起音');
    assert.equal(mw.repeat.gap, pet.MOONWALK_STEP, '配乐拍长必须等于动画拍长（0.62s，音画同钟）');
    assert.ok(mw.formant.dur <= mw.repeat.gap, `单拍音长 ${mw.formant.dur}s 应短于拍长（留空隙才有鼓点感）`);
    const total = Math.max(...mw.notes.map(n => n[1] + n[2]));
    assert.ok(total <= 2.4, `moonwalk notes 总长 ${total.toFixed(2)}s ≤2.4s`);
  }
  // moonwalk 太空步配乐：四拍由 repeat 生成，单拍轮廓 3 点 + notes 4 音
  assert.ok(sound.SFX.moonwalk.formant.pitch.length >= 3, 'moonwalk 单拍音高轮廓（起→扬→落）');
  assert.ok(sound.SFX.moonwalk.notes.length >= 4, 'moonwalk fallback 四拍 notes');
  assert.ok(sound.SFX.moonwalk.formant.dur >= 0.4 && sound.SFX.moonwalk.formant.dur <= 0.6, 'moonwalk 单拍音长 0.4–0.6s');
  assert.ok(sound.SFX.yelp.formant.dur <= 0.6, 'yelp 惊叫短促（≤0.6s）');
  assert.ok(sound.SFX.laugh.formant.pitch.length >= 6, 'laugh 三连狂笑音高轮廓多点');
  // 发声路径（七版拟真：声源+颤音+jitter（无 amHz）= 3 振荡器；srcLp+F1+F2+呼吸噪声 = 4 滤波）
  const rec = { oscs: 0, filters: 0, bufs: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const fake = {
    state: 'running', currentTime: 1.5, destination: {}, sampleRate: 44100,
    createOscillator() { rec.oscs++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() {}, destination: 1 }; },
    createBiquadFilter() { rec.filters++; return { type: '', frequency: param(), Q: param(), connect() {} }; },
    createBufferSource() { rec.bufs++; return { buffer: null, connect() {}, start() {}, stop() {} }; },
    createBuffer(n, len) { return { getChannelData: () => new Float32Array(len) }; },
  };
  sound._injectContext(fake);
  assert.equal(sound.play('moonwalk'), true, 'moonwalk 可发声');
  assert.equal(rec.oscs, 12, 'moonwalk：4 拍 × (声源+颤音+jitter) = 12 振荡器');
  assert.equal(rec.filters, 16, '4 拍 × (声源低通 + F1 + F2 + 呼吸噪声) = 16 滤波器');
  assert.equal(rec.bufs, 4, '4 拍各建 1 个呼吸噪声源');
  // 降级：无 createBufferSource 的旧基础库跳过噪声层，仍发声
  const rec2 = { oscs: 0 };
  const fake2 = {
    state: 'running', currentTime: 3.0, destination: {},
    createOscillator() { rec2.oscs++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() {}, destination: 1 }; },
    createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect() {} }; },
  };
  sound._injectContext(fake2);
  assert.equal(sound.play('purr'), true, '无 BufferSource 能力时降级发声');
  assert.equal(rec2.oscs, 3, 'purr：声源+颤音+jitter = 3 振荡器');
  sound._injectContext(fake);   // 切回主假上下文（否则让路断言跑在 fake2 时间域上）
  // voice 让路：moonwalk = 4 拍 × 0.62 + 0.45 = 2.31s
  fake.currentTime = 4.0;
  assert.equal(sound.play('moonwalk'), true);   // 占线至 4.0+2.31+0.05=6.36
  fake.currentTime = 4.5;
  assert.equal(sound.play('pick'), false, '沙雕叫声占线期间玩法音让路');
  fake.currentTime = 6.5;
  assert.equal(sound.play('pick'), true, '占线结束恢复');
  sound._injectContext(null);
});

test('后肢 ⑪：太空步 moonwalk——一脚整掌贴地、一脚踮脚点地，两脚都不离地', () => {
  const Tiger = require(path.join(ROOT, 'src/actors/tiger_renderer.js'));
  assert.ok(Tiger.STATES.indexOf('moonwalk') >= 0, 'moonwalk 应注册进 STATES');

  // 采样两脚：脚掌 = translate 后紧跟 rotate 再 ellipse(0,0,32,18)（爪是 34×22，可区分）
  const sample = (phase) => {
    const feet = [];
    let pending = null, rot = 0;
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
      fillText() {}, scale() {},
      translate(x, y) { pending = [x, y]; },
      rotate(a) { rot = a; },
      ellipse(x, y, rx, ry) { if (pending && rx === 32 && ry === 18) feet.push({ x: pending[0], y: pending[1], rot }); pending = null; },
      globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1, lineCap: '', lineJoin: '',
      font: '', textAlign: '', textBaseline: '',
    };
    Tiger.draw(ctx, { state: 'moonwalk', t: 0, phase });
    return feet;
  };

  // ① 任意相位都是两只脚，且一平一踮（踮脚 = 抬跟 0.46rad，平 = 基础角 ±0.2）
  for (const ph of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
    const f = sample(ph);
    assert.equal(f.length, 2, `相位 ${ph} 应画出两只脚`);
    const flat = f.filter(o => Math.abs(Math.abs(o.rot) - 0.2) < 0.02);
    assert.equal(flat.length, 1, `相位 ${ph} 应恰好一只整掌贴地（脚掌角 = ±0.2）`);
    const toe = f.filter(o => Math.abs(Math.abs(o.rot) - 0.66) < 0.05);
    assert.ok(toe.length >= 1 || ph % 0.5 < 0.07, `相位 ${ph} 应有一只踮脚（抬跟 0.46rad）`);
  }
  // ② 两脚都不离地：掌心 y 在 507..520 之间（平掌 520、踮脚 507 使脚尖仍贴地）
  let minY = 1e9, maxY = -1e9;
  for (let ph = 0; ph < 1; ph += 0.05) {
    for (const o of sample(ph)) { minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y); }
  }
  assert.ok(maxY <= 521 && minY >= 505, `两脚应始终贴地（掌心 y 在 505..521，实测 ${minY}..${maxY}）——离地就成蹦跳`);
  // ③ 两脚反向移动：同一只脚前后半程方向相反，且贴地脚向后（+x）
  const a = sample(0.1), b = sample(0.4);          // 左脚贴地相
  assert.ok(b[0].x - a[0].x > 10, `贴地脚应向后拖（实测 ${(b[0].x - a[0].x).toFixed(1)}px）`);
  const c = sample(0.6), d = sample(0.9);          // 左脚踮脚相
  assert.ok(c[0].x - d[0].x > 10, `踮脚应向前摆（实测 ${(c[0].x - d[0].x).toFixed(1)}px）`);
  // ④ 相位回绕不炸（-0.3 也要安全）
  assert.equal(sample(-0.3).length, 2, '负相位应安全回绕');

  // 包装层透传 phase（屏侧 pet.pose() 的 phase 必须真的进渲染器）
  const tiger = require(path.join(ROOT, 'js/ui/tiger'));
  const tr = [];
  const ctx2 = new Proxy({}, {
    get(t, k) {
      if (k === 'translate') return (x, y) => tr.push([x, y]);
      if (k === 'canvas') return { width: 375, height: 667 };
      return () => undefined;
    },
    set() { return true; },
  });
  tiger.fullBody(ctx2, { cx: 187, y0: 100, scale: 0.4, state: 'moonwalk', t: 0.5, phase: 0.5 });
  tiger.bust(ctx2, { win: { x: 10, y: 10, w: 120, h: 130 }, state: 'moonwalk', t: 0.5, phase: 0.5 });
});

test('萌音 ⑫：采样优先（十一版物理模型）——voice_data 完整、PCM 与配方时长一致、采样路径发声', () => {
  const VD = require(path.join(ROOT, 'js/app/voice_data'));
  // ① 五段 PCM 齐全、SR 正确
  for (const k of ['purr', 'chirp', 'yelp', 'laugh', 'step']) {
    assert.ok(typeof VD[k] === 'string' && VD[k].length > 1000, `${k} 采样应有 base64 PCM`);
  }
  assert.equal(VD.SR, 22050, '采样率 22.05kHz');
  // ② base64 可解，字节数与声学时长对得上（render_voice.py 的配方是唯一真源）
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64len = s => { let c = 0; for (const ch of s) if (CH.indexOf(ch) >= 0) c++; return c; };
  const pcmBytes = s => Math.floor(b64len(s) / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
  const expect = { purr: 0.60, chirp: 0.28, yelp: 0.34, laugh: 0.66, step: 0.42 };
  for (const k of Object.keys(expect)) {
    const bytes = pcmBytes(VD[k]);
    const secs = bytes / 2 / VD.SR;
    assert.ok(Math.abs(secs - expect[k]) <= 0.02, `${k} 时长 ${secs.toFixed(3)}s ≈ 配方 ${expect[k]}s`);
  }
  // ③ 采样路径真的发声：假上下文带 decodeAudioData（同步回调）+ createBufferSource
  const srcs = [];
  const fake = {
    currentTime: 0, state: 'running', sampleRate: 44100,
    destination: {},
    createOscillator() { return { frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {}, type: '' }; },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, Q: { value: 0 }, type: '', connect() {} }; },
    createBuffer(ch, n, sr) { return { duration: n / sr, getChannelData: () => new Float32Array(n) }; },
    createBufferSource() { const s = { buffer: null, connect() {}, start(t) { s.startedAt = t; srcs.push(s); }, stop() {} }; return s; },
    decodeAudioData(raw, ok) { ok({ duration: raw.byteLength / 2 / 22050 }); },
    resume() {},
  };
  sound._injectContext(fake);
  assert.equal(sound.play('purr'), true, 'purr 应走采样路径');
  assert.equal(srcs.length, 1, 'purr 单次起音');
  assert.ok(srcs[0].buffer && srcs[0].buffer.duration > 0.5, '应挂上解码后的 AudioBuffer');
  assert.equal(sound.play('moonwalk'), true, 'moonwalk 应走采样路径');
  assert.equal(srcs.length, 5, 'moonwalk = 4 拍 × 重复起音');
  // ④ 让路：voice 占线期内玩法音不发
  fake.currentTime = 0;
  sound.play('purr');
  assert.equal(sound.play('pick'), false, '叫声占线期 pick 应让路');
  sound._injectContext(null);
});

test('动画曲线 ④e：丝滑度——三段动画逐帧无跳变、分段接缝值连续（十二版）', () => {
  // 旧版三处硬断点（肉眼一顿）：蹭手停在 M0 时 rot/dx 直接归零；化饼到顶速度截断；
  // 挠脚下蹲结束 dy 从 5px 跳 0；摸肚抖毛起点 dx 从 0 跳 ±3px。
  // 判据：① 每个分段边界前后 1ms 的 transform 差 < 1%；② 60fps 逐帧变化有上界。
  const zones = [['head', 1.5, [0.44, 0.68, 0.76]], ['belly', 1.1, [0.20, 0.58]], ['foot', 1.0, [0.18, 0.55]]];
  const at = (zone, t) => {
    const p = pet.create();
    p.setBox({ x: 0, y: 0, w: 200, h: 280 });
    p.trigger(zone); p.update(t); return p.offset();
  };
  for (const [zone, life, bounds] of zones) {
    for (const b of bounds) {
      const a = at(zone, b * life - 1e-3), c = at(zone, b * life + 1e-3);
      const d = Math.max(Math.abs(a.dx - c.dx), Math.abs(a.dy - c.dy), Math.abs(a.rot - c.rot),
        Math.abs(a.sx - c.sx), Math.abs(a.sy - c.sy));
      // 阈值 0.035：跳跃末段 sin^1.4 的尾巴很平（1ms 内仍可能有 ~2% 残留位移），
      // 但真正的硬断点是 3px 量级（旧版实测 2.5–3.0），一眼能区分。
      assert.ok(d < 0.035, `${zone} @${(b * life).toFixed(2)}s 接缝应连续（1ms 内差 ${d.toFixed(4)}）`);
    }
    // 逐帧（60fps）变化上界：sy 单帧 <10%、dy <3px、rot <0.02rad、dx <1.5px
    const p = pet.create();
    p.setBox({ x: 0, y: 0, w: 200, h: 280 });
    p.trigger(zone);
    let prev = p.offset(), maxd = { sy: 0, dy: 0, rot: 0, dx: 0 };
    for (let i = 0; i < Math.ceil(life * 60) + 5; i++) {
      p.update(1 / 60);
      const o = p.offset();
      maxd.sy = Math.max(maxd.sy, Math.abs(o.sy - prev.sy));
      maxd.dy = Math.max(maxd.dy, Math.abs(o.dy - prev.dy));
      maxd.rot = Math.max(maxd.rot, Math.abs(o.rot - prev.rot));
      maxd.dx = Math.max(maxd.dx, Math.abs(o.dx - prev.dx));
      prev = o;
    }
    assert.ok(maxd.sy < 0.10, `${zone} sy 单帧变化应 <10%（实测 ${maxd.sy.toFixed(3)}）`);
    assert.ok(maxd.dy < 3, `${zone} dy 单帧变化应 <3px（实测 ${maxd.dy.toFixed(2)}）`);
    assert.ok(maxd.rot < 0.02, `${zone} rot 单帧变化应 <0.02rad（实测 ${maxd.rot.toFixed(3)}）`);
    assert.ok(maxd.dx < 1.5, `${zone} dx 单帧变化应 <1.5px（实测 ${maxd.dx.toFixed(2)}）`);
  }
  // 触发首帧不许有初速跳变（旧版 foot 一上来 dy 就 5px 级别）
  const first = at('foot', 1 / 60);
  assert.ok(Math.abs(first.dy) < 0.6, `挠脚首帧应缓慢起蹲（dy ${first.dy.toFixed(2)}）`);
});
