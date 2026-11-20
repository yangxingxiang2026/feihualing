'use strict';
/**
 * 音效（P0-5）回归：
 *  ① 三音都能在假 WebAudio 上下文上完成合成（每音至少 1 个振荡器 + 增益包络）；
 *  ② 开关关闭 / 未知音种 / 无上下文 → 一律静默 false，绝不抛异常（真机旧基础库兜底）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const sound = require(path.join(ROOT, 'js/app/sound'));

function fakeCtx() {
  const rec = { oscs: [], gains: 0, resumed: 0, starts: 0, stops: 0 };
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state: 'suspended',
    currentTime: 1.5,
    destination: {},
    resume() { rec.resumed++; this.state = 'running'; },
    createOscillator() {
      const o = { type: '', frequency: param(), connect() {}, start() { rec.starts++; }, stop() { rec.stops++; } };
      rec.oscs.push(o);
      return o;
    },
    createGain() { rec.gains++; return { gain: param(), connect() {} }; },
  };
  return { ctx, rec };
}

test('三音合成：pick 2 音 / pass 2 音 / fail 2 音，全部启动并停止', () => {
  const { ctx, rec } = fakeCtx();
  sound._injectContext(ctx);
  sound.setEnabled(true);
  for (const k of ['pick', 'pass', 'fail']) {
    assert.equal(sound.play(k), true, `${k} 应发声`);
  }
  assert.equal(rec.oscs.length, 6, '三音 × 2 个音符 = 6 个振荡器');
  assert.equal(rec.gains, 6, '每个音符一个增益节点（包络）');
  assert.equal(rec.starts, 6);
  assert.equal(rec.stops, 6);
  assert.equal(rec.resumed, 1, 'suspended 上下文只 resume 一次（第一次 play）');
  assert.deepEqual(rec.oscs.map(o => o.type), ['triangle', 'triangle', 'sine', 'sine', 'triangle', 'triangle']);
});

test('开关关闭 → 静默 false 且不创建节点', () => {
  const { ctx, rec } = fakeCtx();
  sound._injectContext(ctx);
  sound.setEnabled(false);
  assert.equal(sound.isEnabled(), false);
  assert.equal(sound.play('pass'), false);
  assert.equal(rec.oscs.length, 0);
  sound.setEnabled(true);
  assert.equal(sound.isEnabled(), true);
});

test('未知音种 / 无上下文 → 静默 false，不抛异常', () => {
  const { ctx } = fakeCtx();
  sound._injectContext(ctx);
  sound.setEnabled(true);
  assert.equal(sound.play('nope'), false);
  sound._injectContext(null);          // 模拟真机 createWebAudioContext 不存在
  assert.equal(sound.play('pick'), false);
});

test('合成配方自检：三音都存在、音符格式合法', () => {
  ['pick', 'pass', 'fail'].forEach(k => {
    const s = sound.SFX[k];
    assert.ok(s && Array.isArray(s.notes) && s.notes.length >= 1, `${k} 必须有音符`);
    s.notes.forEach(n => {
      assert.equal(n.length >= 4, true, `${k} 音符需 [freq, delay, dur, gain]`);
      assert.ok(n[0] > 60 && n[0] < 4000, `${k} 频率在可听范围内`);
      assert.ok(n[2] > 0 && n[2] < 1, `${k} 时长必须短（≤1s）`);
      assert.ok(n[3] > 0 && n[3] < 0.3, `${k} 音量不可过响`);
    });
  });
});
