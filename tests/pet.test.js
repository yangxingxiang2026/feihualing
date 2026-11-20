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

test('动画曲线 ④：摸头贴手蹭 / 肚子挤压 / 挠脚先蹲后蹬，均有限幅且归零', () => {
  // 摸头：持续歪头（贴手）+ 轻揉微摆，1.5s 包络回正
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p.trigger('head');
  let maxRot = 0, holdDx = 0, endRot = null;
  for (let i = 0; i <= 80; i++) {
    p.update(0.02);
    const o = p.offset();
    maxRot = Math.max(maxRot, Math.abs(o.rot));
    if (i > 15 && i < 55) holdDx = Math.max(holdDx, Math.abs(o.dx)); // 保持期应"贴向"手指
    endRot = o.rot;
    assert.ok(Math.abs(o.rot) <= 0.095 + 1e-9, '贴手歪头幅值 ≤0.095rad（0.075 贴 + 0.02 揉）');
    assert.ok(Math.abs(o.dx) <= 6 + 1e-9, '贴手 dx ≤6px');
  }
  assert.ok(maxRot > 0.05, '应有明显歪头');
  assert.ok(holdDx > 2, '保持期应有持续贴手位移');
  assert.ok(Math.abs(endRot) < 1e-9, '动画结束应归零');

  // 摸肚：摇摆 + 挤压弹性（sx/sy 偏离 1）
  const p2 = pet.create();
  p2.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p2.trigger('belly');
  let sq = false;
  for (let i = 0; i <= 60; i++) {
    p2.update(0.02);
    const o = p2.offset();
    assert.ok(Math.abs(o.rot) <= 0.07 + 1e-9, '摇摆幅值 ≤0.06rad');
    assert.ok(Math.abs(o.sx - 1) <= 0.05 + 1e-9 && Math.abs(o.sy - 1) <= 0.06 + 1e-9, '挤压限幅');
    if (Math.abs(o.sy - 1) > 0.01) sq = true;
  }
  assert.ok(sq, '摸肚应有挤压弹性形变');

  // 挠脚：先蹲（dy>0）后蹬（dy<0 峰值 ~14*scale）
  const p3 = pet.create();
  p3.setBox({ x: 0, y: 0, w: 200, h: 280 });
  p3.trigger('foot');
  let crouch = 0, minDy = 0;
  for (let i = 0; i <= 55; i++) {
    p3.update(0.02);
    const o = p3.offset();
    crouch = Math.max(crouch, o.dy);
    minDy = Math.min(minDy, o.dy);
    assert.ok(Math.abs(o.dy) <= 14 * (280 / 560) * 1.1 + 1e-9, '弹跳限幅 ≤14*scale*1.1');
  }
  assert.ok(crouch > 1, '应先下蹲蓄力');
  assert.ok(minDy < -4, '再向上蹬腿弹跳');

  const p4 = pet.create();
  p4.setBox({ x: 0, y: 0, w: 200, h: 280 });
  assert.deepEqual(p4.offset(), { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 }, '未触发时 transform 归零');
});

test('状态覆盖 ④b：互动期间屏侧应切到 pet 状态（眯眼/ω嘴/踩奶），结束还原', () => {
  const p = pet.create();
  p.setBox({ x: 0, y: 0, w: 200, h: 280 });
  assert.equal(p.stateOverride(), null, '未触发时为 null（用原状态）');
  p.trigger('head');
  assert.equal(p.stateOverride(), 'pet', '互动中应覆盖为 pet');
  for (let i = 0; i < 80; i++) p.update(0.02);
  assert.equal(p.stateOverride(), null, '动画结束还原');
});

test('萌音 ⑤：purr/giggle/chirp 「嗷呜」幼虎叫配方合法 + 发声/让路', () => {
  // 三版配方（2026-11-20）：两段式嗷→呜滑动 + 2 倍频泛音 + 音量加大（峰值 ≤0.12）
  const purr = sound.SFX.purr;
  assert.equal(purr.voice, true, '萌音标记 voice（其余音让路）');
  assert.ok(purr.overtone && purr.overtone.ratio > 1.8, '叫声应有 2 倍频嗓音泛音');
  assert.ok(purr.notes.some(n => n[5] && n[5].amHz === 26), '喉震 = 26Hz 振幅调制（咕噜垫底）');
  // 嗷呜形状：先上扬（嗷）后回落（呜）
  assert.ok(purr.notes[0][0] < purr.notes[0][4], '第 1 段应上扬（嗷）');
  assert.ok(purr.notes[1][0] > purr.notes[1][4], '第 2 段应回落（呜）');
  const pt = Math.max(...purr.notes.map(n => n[1] + n[2]));
  assert.ok(pt <= 1.4, `叫声总时长 ${pt.toFixed(2)}s 应 ≤1.4s`);
  for (const k of ['giggle', 'chirp']) {
    const s = sound.SFX[k];
    assert.ok(Array.isArray(s.notes) && s.notes.length >= 2, `${k} 应有多段音符`);
    assert.ok(s.notes[0][0] < s.notes[0][4] && s.notes[1][0] > s.notes[1][4], `${k} 也应是嗷→呜两段式`);
    const total = Math.max(...s.notes.map(n => n[1] + n[2]));
    assert.ok(total <= 0.55, `${k} 总时长 ${total.toFixed(2)}s 应 ≤0.55s`);
  }
  ['purr', 'giggle', 'chirp'].forEach(k => {
    sound.SFX[k].notes.forEach((n, i) => assert.ok(n[3] <= 0.12, `${k} 第 ${i + 1} 音峰值 ≤0.12（加大量程）`));
    assert.ok(sound.SFX[k].notes.some(n => n[3] >= 0.10), `${k} 至少一音 ≥0.10（确实比原来大）`);
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
  // purr：3 音 ×（主音+泛音）+ 1 个 AM lfo + 2 个颤音 lfo = 9 个振荡器
  assert.equal(rec.oscs, 9, 'purr 应建 9 个振荡器（3 主 + 3 泛音 + 1 喉震 + 2 颤音）');
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
