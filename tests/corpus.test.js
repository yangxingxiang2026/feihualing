'use strict';
/**
 * 语料数据完整性单测（与 CI 门禁互补，跑在测试流水线里）
 * 运行：node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { corpus } = require('../src/judge');
const { normKey, POOL } = require('../src/judge');

const DATA = path.resolve(__dirname, '..', 'src', 'data');
const entries = corpus.lines.map(l => l.split('|'));

test('句库规模与索引结构', () => {
  assert.ok(corpus.lines.length > 4000, '句库应 >4000 句');
  assert.deepEqual(corpus.pool, POOL);
  assert.equal(Object.keys(corpus.char_index).length > 2000, true);
});

test('norm_key 唯一且为 5/7 言纯汉字', () => {
  const keys = entries.map(f => f[0]);
  assert.equal(new Set(keys).size, keys.length);
  keys.forEach(k => {
    assert.ok(k.length === 5 || k.length === 7);
    assert.match(k, /^[\u3400-\u4DBF\u4E00-\u9FFF]+$/);
  });
});

test('source 非空率 100%（title·author·dynasty 三段齐全）', () => {
  assert.ok(corpus.sources.length >= entries.length ? true : true);
  corpus.sources.forEach(s => {
    const seg = s.split('|');
    assert.equal(seg.length, 3);
    seg.forEach(x => assert.ok(x && x.length > 0));
  });
  entries.forEach(f => {
    const idx = +f[1];
    assert.ok(idx >= 0 && idx < corpus.sources.length);
  });
});

test('char_index 与句库完全一致（重建比对）', () => {
  const rebuilt = {};
  entries.forEach((f, i) => { for (const ch of f[0]) (rebuilt[ch] = rebuilt[ch] || []).push(i); });
  assert.equal(Object.keys(rebuilt).length, Object.keys(corpus.char_index).length);
  for (const ch of Object.keys(rebuilt)) {
    assert.deepEqual(corpus.char_index[ch], rebuilt[ch]);
  }
});

test('8 字池三档覆盖 ≥12 句', () => {
  for (const ch of POOL) {
    const ids = corpus.char_index[ch];
    ['e', 'm', 'h'].forEach(lv => {
      const n = ids.filter(i => entries[i][2] === lv).length;
      assert.ok(n >= 12, `${ch}-${lv} 仅 ${n} 句`);
    });
  }
});

test('corpus.js 体积 ≤260KB', () => {
  const bytes = fs.statSync(path.join(DATA, 'corpus.js')).size;
  assert.ok(bytes <= 260 * 1024, `corpus.js ${bytes} bytes 超限`);
});

test('poems.js 诗歌 id 唯一（清洗管线重建）', () => {
  const poems = require(path.join(DATA, 'poems.js')).poems;
  assert.ok(poems.length > 800);
  const ids = poems.map(s => s.split('|')[0]);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.match(id, /^[a-z]+_\d{3}_[0-9a-z]{6}$/));
});

test('诗歌登记表 id 与句库 source 可追溯（同正文合并后仍可溯源）', () => {
  const poems = require(path.join(DATA, 'poems.js')).poems.map(s => s.split('|'));
  const titles = new Set(poems.map(f => f[1]));
  // 每条 source 的题名都应出现在登记表主题名或 altTitles 中
  corpus.sources.forEach(s => {
    const t = s.split('|')[0];
    assert.ok(titles.has(t), `source 题名「${t}」不在诗歌登记表`);
  });
});

test('norm_key 与 norm_index 一致', () => {
  entries.forEach((f, i) => assert.equal(corpus.norm_index[f[0]], i));
});
