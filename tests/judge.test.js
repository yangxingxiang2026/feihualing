'use strict';
/**
 * judge 判定引擎单测（node:test，Node v22）
 * 运行：node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, normKey, POOL, REPEAT_LIMIT, corpus } = require('../src/judge');

const lines = corpus.lines.map(l => l.split('|')); // [key, srcIdx, level]
const lineText = i => lines[i][0];

/** 找一条不含指定字、且含另一指定字的库内句（确定性：取首个命中） */
function findLine(contain, notContain) {
  const i = lines.findIndex(f => f[0].indexOf(contain) !== -1 && (!notContain || f[0].indexOf(notContain) === -1));
  assert.ok(i >= 0, `找不到测试句：含 ${contain} 不含 ${notContain}`);
  return i;
}

test('不含关键字 → 拒（NO_KEYWORD）', () => {
  const i = findLine('月', '春'); // 含月不含春
  const r = judge(lineText(i), '春', []);
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'NO_KEYWORD');
});

test('重复句 → 拒（DUPLICATE，v1.4 全局去重）', () => {
  const i = findLine('春', '月');
  const key = lineText(i);
  // usedKeys 已含该句（全局集合）
  const r1 = judge(key, '春', [key]);
  assert.equal(r1.pass, false);
  assert.equal(r1.reason, 'DUPLICATE');
  // usedKeys 存的是带标点/空格的原始句，同样命中（归一后再比对）
  const r2 = judge(key, '春', [key.split('').join('　')]);
  assert.equal(r2.reason, 'DUPLICATE');
  assert.equal(REPEAT_LIMIT, 1);
});

test('库外杜撰句 → 拒（NOT_IN_CORPUS）', () => {
  const fake5 = '床前明月黑'; // 改一字杜撰
  const fake7 = '疑是地上霜洋洋'; // 杜撰拼接
  // 自证：这两个 key 确实不在库内（防止语料变更导致测试失效）
  assert.equal(corpus.norm_index[normKey(fake5)], undefined);
  assert.equal(corpus.norm_index[normKey(fake7)], undefined);
  assert.deepEqual(judge(fake5, '月', []), { pass: false, reason: 'NOT_IN_CORPUS' });
  assert.deepEqual(judge(fake7, '天', []), { pass: false, reason: 'NOT_IN_CORPUS' });
  // 库外真实诗句也不放行（管你是杜撰还是真诗，不在库就是不出）
  assert.equal(judge('绿水青山枉自多', '水', []).reason, 'NOT_IN_CORPUS');
});

test('全角/标点/空格差异句 → 通过（norm_key 归一）', () => {
  const i5 = findLine('山', null);      // 5 言含山
  const i7 = findLine('天', null);      // 7 言含天
  const k5 = lineText(i5), k7 = lineText(i7);
  // 基线：原文通过
  assert.equal(judge(k5, '山', []).pass, true);
  // 全角标点 + 全角空格 + 逗号顿号穿插
  const noisy5 = k5.split('').join('　').replace('　', '、');
  assert.equal(judge(noisy5, '山', []).pass, true);
  const noisy7 = '「' + k7.slice(0, 1) + '，' + k7.slice(1) + '」！';
  assert.equal(judge(noisy7, '天', []).pass, true);
  // 半角标点/空格/英文字母混入同样剔除
  const noisyHalf = k5.slice(0, 2) + ' , ' + k5.slice(2) + '.!?abc123';
  assert.equal(normKey(noisyHalf), k5);
  assert.equal(judge(noisyHalf, '山', []).pass, true);
});

test('近似句「今年元夜时」「去年元夜时」两条独立通过（norm_key 全等，绝不模糊匹配）', () => {
  const a = normKey('今年元夜时'), b = normKey('去年元夜时');
  // 1) 两条都是库内独立句，norm_key 不同、各占一位
  assert.notEqual(a, b);
  assert.ok(corpus.norm_index[a] !== undefined, '今年元夜时 应在句库');
  assert.ok(corpus.norm_index[b] !== undefined, '去年元夜时 应在句库');
  assert.notEqual(corpus.norm_index[a], corpus.norm_index[b]);
  // 2) 二者互不误判为重复：用过「去年」不影响「今年」
  const ra = judge('今年元夜时', '月', [b]);
  assert.notEqual(ra.reason, 'DUPLICATE');
  assert.notEqual(ra.reason, 'NOT_IN_CORPUS'); // 库内命中，仅因无字池关键字而拒
  // 3) 两句均不含 8 字池关键字（元夜句无池字），判定应统一落在 NO_KEYWORD，而非库外/重复
  assert.equal(judge('今年元夜时', '月', []).reason, 'NO_KEYWORD');
  assert.equal(judge('去年元夜时', '月', []).reason, 'NO_KEYWORD');
  // 4) 同一首的带池字句可正常通过（证明该诗入库完整）
  const passR = judge('月与灯依旧', '月', []);
  assert.equal(passR.pass, true);
  assert.equal(lineText(passR.lineId), '月与灯依旧');
});

test('同字不同句 → 各自通过（字可复用，句不可复用）', () => {
  const arr = corpus.char_index['月'];
  assert.ok(arr.length >= 2);
  const r1 = judge(lineText(arr[0]), '月', []);
  const r2 = judge(lineText(arr[1]), '月', []);
  assert.equal(r1.pass, true);
  assert.equal(r2.pass, true);
  assert.notEqual(r1.lineId, r2.lineId);
  // 用过第一句后，第二句仍可通过；第一句再出则拒
  const used = [lineText(arr[0])];
  assert.equal(judge(lineText(arr[1]), '月', used).pass, true);
  assert.equal(judge(lineText(arr[0]), '月', used).reason, 'DUPLICATE');
});

test('8 字池每字抽样 3 句全部通过', () => {
  for (const ch of POOL) {
    const ids = corpus.char_index[ch];
    assert.ok(ids && ids.length >= 3, `${ch} 池内句不足 3`);
    for (let s = 0; s < 3; s++) {
      const key = lineText(ids[s]);
      assert.ok(key.indexOf(ch) !== -1, `抽样句未含关键字 ${ch}`);
      const r = judge(key, ch, []);
      assert.equal(r.pass, true, `${ch} 抽样句「${key}」应通过`);
    }
  }
});

test('格式错误 → 拒（FORMAT_ERROR）', () => {
  assert.equal(judge('', '月', []).reason, 'FORMAT_ERROR');          // 空串
  assert.equal(judge(null, '月', []).reason, 'FORMAT_ERROR');        // 非字符串
  assert.equal(judge('！！！', '月', []).reason, 'FORMAT_ERROR');    // 归一后为空
  assert.equal(judge('床前明月', '月', []).reason, 'FORMAT_ERROR');   // 4 言
  assert.equal(judge('月落乌啼霜满天时', '月', []).reason, 'FORMAT_ERROR'); // 8 言
});

test('关键字不合法 → 拒（INVALID_KEYWORD）', () => {
  assert.equal(judge('明月几时有', '笛', []).reason, 'INVALID_KEYWORD'); // 笛已出池
  assert.equal(judge('明月几时有', '月月', []).reason, 'INVALID_KEYWORD');
  assert.equal(judge('明月几时有', '', []).reason, 'INVALID_KEYWORD');
});

test('usedKeys 形态兼容：Set / 数组 / 对象', () => {
  const key = lineText(findLine('春', '月'));
  assert.equal(judge(key, '春', new Set([key])).reason, 'DUPLICATE');
  assert.equal(judge(key, '春', { [key]: 1 }).reason, 'DUPLICATE');
  assert.equal(judge(key, '春', []).pass, true);
});

test('传入字池参数生效（pool 覆盖默认池）', () => {
  const key = lineText(findLine('月', '春'));
  assert.equal(judge(key, '月', [], ['月']).pass, true);
  assert.equal(judge(key, '月', [], ['春']).reason, 'INVALID_KEYWORD');
});
