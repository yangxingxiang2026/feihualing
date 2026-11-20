'use strict';
/**
 * 盖章震动曲线回归（2026-11-19 真机反馈「选对时晃动有点晕」）
 *
 * 原实现把整屏每 25ms 硬切到 ±1.2px 的横向往复方波——水平往复 + 20Hz 硬切换是晕动
 * 最敏感的刺激形态。现改为「一次冲击 + 阻尼回位」：单周期正弦、无横向分量。
 * 本文件锁死三条形状不变量，防止后续又改回抖动：
 *   ① 横向位移恒为 0（只有垂直分量）
 *   ② 全程 |位移| ≤ 1.3px（不会出现整屏大跳）
 *   ③ 只有一个来回（零点穿越 2 次），不是往复振荡
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { shakeOffset } = require(path.join(ROOT, 'js/ui/screens/battle'));

const DUR = 0.13;
/** 以 1ms 步长采样整条曲线 */
function samples() {
  const out = [];
  for (let i = 0; i <= Math.round(DUR * 1000); i++) out.push(shakeOffset(i / 1000));
  return out;
}

test('震动 ①：只有垂直分量——shakeOffset 是标量（y 位移），无 x 参数、无横向往复', () => {
  // 纯标量返回 + 单参数签名 = 结构上就不可能有横向抖动
  assert.equal(shakeOffset.length, 1, 'shakeOffset 只接收时间一个参数（横向位移无处可出）');
  samples().forEach((v, i) => assert.ok(Number.isFinite(v), `第 ${i}ms 采样应为有限数`));
  assert.ok(Number.isFinite(shakeOffset(0)), '标量位移，非坐标对');
});

test('震动 ②：全程幅度 ≤ 1.3px——单次冲击，不是整屏大跳', () => {
  const peak = Math.max(...samples().map(Math.abs));
  assert.ok(peak <= 1.3, `峰值 ${peak.toFixed(3)}px 应 ≤ 1.3px`);
  assert.ok(peak >= 0.8, `峰值 ${peak.toFixed(3)}px 应 ≥ 0.8px（否则没有手感）`);
});

test('震动 ③：只有一个来回（正→负只翻转 1 次），不是往复振荡', () => {
  const s = samples();
  // 翻转 = 真正穿过零点（采样恰好为 0 的触底/收尾点不算，它在两段之间）
  let sign = 0, flips = 0;
  s.forEach(v => {
    const sg = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (sg !== 0) { if (sign !== 0 && sg !== sign) flips++; sign = sg; }
  });
  assert.equal(flips, 1, `符号翻转应恰为 1 次（下沉→回弹，之后收住），实际 ${flips}——两次以上即往复抖动`);
});

test('震动 ④：首尾归零，且先下沉后微回弹（下沉幅度 > 回弹幅度）', () => {
  const s = samples();
  assert.equal(s[0], 0, 't=0 位移为 0');
  assert.equal(shakeOffset(DUR), 0, 't=结束时位移归零（不留偏移）');
  const down = Math.max(...s);      // 正 = 下沉
  const up = Math.min(...s);        // 负 = 回弹
  assert.ok(down > 0, '应有向下的冲击位移');
  assert.ok(down > Math.abs(up) * 2, `下沉 ${down.toFixed(2)} 应明显大于回弹 ${Math.abs(up).toFixed(2)}（回弹只是余韵）`);
});

test('震动 ⑤：三段单调（0→峰 增 / 峰→谷 减 / 谷→0 增），曲线平滑无折返', () => {
  const s = samples();
  const iDown = s.indexOf(Math.max(...s));
  const iUp = s.indexOf(Math.min(...s));
  for (let i = 1; i <= iDown; i++) assert.ok(s[i] >= s[i - 1], `下沉段第 ${i}ms 不应回头`);
  for (let i = iDown + 1; i <= iUp; i++) assert.ok(s[i] <= s[i - 1], `回升段第 ${i}ms 不应回头`);
  for (let i = iUp + 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1], `回位段第 ${i}ms 不应回头`);
});

test('震动 ⑥：超出时长后恒为 0（不会越界继续位移）', () => {
  [DUR + 0.01, DUR + 0.5, 5].forEach(t => assert.equal(shakeOffset(t), 0, `t=${t}s 应无位移`));
});

test('震动 ⑦：低帧率下仍能采到有效冲击（30fps 采样峰值 ≥ 0.9px）', () => {
  [1 / 30, 1 / 60].forEach(dt => {
    let peak = 0;
    for (let t = 0; t <= DUR; t += dt) peak = Math.max(peak, Math.abs(shakeOffset(t)));
    assert.ok(peak >= 0.9, `${Math.round(1 / dt)}fps 采样峰值 ${peak.toFixed(2)}px 应 ≥ 0.9px（冲击不被低帧率吞掉）`);
  });
});

test('震动 ⑧：位移在整屏绘制中被应用为纯垂直 translate(0, dy)', () => {
  // 源码级不变量：drawDynamic 里的震动只允许 translate(0, y)，一旦出现非零 x 分量
  // 就意味着横向抖动回来了（这是上次「晕」的根因）
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/screens/battle.js'), 'utf8');
  const lines = src.split('\n').filter(l => /shake/.test(l) && /translate/.test(l));
  assert.equal(lines.length, 1, '震动位移应只有一处 translate');
  assert.match(lines[0], /translate\(\s*0\s*,/, '震动 translate 的 x 分量必须为 0');
});
