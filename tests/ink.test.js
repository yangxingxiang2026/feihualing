'use strict';
/**
 * 水墨共享烘焙资产（§4.22 展示①②）回归：
 * 季节映射 / 粒子分档 / 印章烘焙 / 笔触烘焙 / 氛围层守卫 / 设备分档兜底
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ink = require(path.join(ROOT, 'js/ui/ink'));
const platform = require(path.join(ROOT, 'js/platform'));

test('季节映射：月份 → 四季（跨年边界正确）', () => {
  const cases = [[11, 'winter'], [0, 'winter'], [1, 'winter'], [2, 'spring'], [4, 'spring'],
    [5, 'summer'], [7, 'summer'], [8, 'autumn'], [10, 'autumn']];
  cases.forEach(([m, s]) => assert.equal(ink.seasonOf(m), s, `月份 ${m} 应为 ${s}`));
});

test('粒子分档：低端 6 / 中端 10 / 高端 14 / 非法档回落 10', () => {
  assert.equal(ink.particleCount(0), 6);
  assert.equal(ink.particleCount(1), 10);
  assert.equal(ink.particleCount(2), 14);
  assert.equal(ink.particleCount(9), 10);
});

test('印章烘焙：返回离屏画布、尺寸正确、1/2 字都可烘', () => {
  for (const [t, size] of [['妙', 56], ['雪耻', 56], ['对', 48]]) {
    const s = ink.bakeSeal(t, size);
    assert.ok(s && typeof s.getContext === 'function', `${t} 印章应烘焙成功`);
    assert.equal(s.width, size);
    assert.equal(s.height, size);
  }
});

test('朱批笔触：正常尺寸烘焙成功；退化尺寸（<40×12）拒绝', () => {
  const s = ink.bakeStroke(320, 28, 'rgba(201,55,44,0.85)', '#F5EFE0');
  assert.ok(s && typeof s.getContext === 'function', '正常尺寸笔触应烘焙成功');
  assert.equal(s.width, 320);
  assert.equal(ink.bakeStroke(30, 10, '#000', '#fff'), null, '过窄笔触应拒绝烘焙');
  assert.equal(ink.bakeStroke(320, 8, '#000', '#fff'), null, '过扁笔触应拒绝烘焙');
});

test('季节粒子 sprite：四季都可烘焙，冬季为软边雪粒', () => {
  for (const k of ['spring', 'summer', 'autumn', 'winter']) {
    const p = ink.bakeParticle(k, false);
    assert.ok(p && typeof p.getContext === 'function', `${k} 粒子应烘焙成功`);
    assert.equal(p.width, 16);
  }
});

test('氛围层守卫：createPattern 缺失时纸纹返回 false 不抛错', () => {
  const noPattern = {}; // 无任何方法
  assert.equal(ink.bakePaperTexture(noPattern, 375, 667, 1), false);
  assert.equal(ink.bakePaperTexture(null, 375, 667, 1), false);
  assert.equal(ink.bakeTeaStains(noPattern, 375, 667), false);
  assert.equal(ink.bakeCandleGlow(noPattern, 100, 100, 50, 0.07), false);
});

test('氛围层：带渐变能力的 ctx 上正常烘焙', () => {
  const calls = [];
  const g = {
    createRadialGradient: () => ({ addColorStop() { calls.push('stop'); } }),
    createPattern: () => ({}),
    save() {}, restore() {},
    beginPath() {}, arc() {}, fill() {}, fillRect() {},
    globalAlpha: 1, fillStyle: null,
  };
  assert.equal(ink.bakePaperTexture(g, 375, 667, 1), true);
  assert.equal(ink.bakeTeaStains(g, 375, 667), true);
  assert.equal(ink.bakeCandleGlow(g, 100, 100, 50, 0.07), true);
  assert.equal(calls.length, 9 + 2, '茶渍 3 团 ×3 色标 + 烛光 2 色标（亮核→透明）');
});

test('platform.deviceTier：Node 环境取不到设备信息 → 中档 1', () => {
  assert.equal(platform.deviceTier(), 1);
});
