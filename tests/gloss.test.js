'use strict';
/**
 * 诗笺释义（2026-11-21 样板 25 句）回归：
 * 数据完整性（都在语料库、八令字覆盖、三档齐）→ 释义长度 → 出处反查 → 取数策略 → 页面冒烟
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const { corpus } = require(path.join(ROOT, 'src/judge'));
const gloss = require(path.join(ROOT, 'src/gloss'));

const KEYS = Object.keys(gloss.DATA);

test('数据：25 条，全部是语料库里的真句（key = norm_key）', () => {
  assert.equal(gloss.count(), 25, '样板固定 25 条（2026-11-21 补长诗路径用例）');
  for (const k of KEYS) {
    assert.ok(corpus.norm_index[k] != null, `不在语料库：${k}`);
    assert.equal(corpus.lines[corpus.norm_index[k]].split('|')[0], k, `norm_key 不一致：${k}`);
  }
});

test('数据：八个令字每个至少 3 条，且易/中/难三档各 8 条', () => {
  const byLevel = { e: 0, m: 0, h: 0 };
  for (const ch of corpus.pool) {
    const hit = KEYS.filter(k => k.indexOf(ch) >= 0);
    assert.ok(hit.length >= 3, `令字「${ch}」只有 ${hit.length} 条`);
  }
  for (const k of KEYS) {
    const lv = corpus.lines[corpus.norm_index[k]].split('|')[2];
    assert.ok(byLevel[lv] != null, `未知难度：${k}=${lv}`);
    byLevel[lv]++;
  }
  assert.deepEqual(byLevel, { e: 8, m: 8, h: 9 }, '三档各 8 条（天·难多 1：长诗路径用例《长恨歌》）');
});

test('文案：白话 ≤30 字、易错点 ≤26 字、不留空', () => {
  for (const k of KEYS) {
    const g = gloss.DATA[k].g;
    assert.ok(g && g.length <= 30, `释义超长/为空：${k}（${g && g.length}）`);
    const n = gloss.DATA[k].n;
    if (n != null) assert.ok(n.length <= 26, `易错点超长：${k}（${n.length}）`);
  }
});

test('出处：题名/作者/朝代三段都能从语料反查出来', () => {
  for (const k of KEYS) {
    const s = gloss.source(k);
    assert.ok(s && s.title && s.author && s.dynasty, `出处缺失：${k} ${JSON.stringify(s)}`);
  }
  assert.equal(gloss.source('不存在的句子'), null);
});

test('语气：原句是问句的，白话必须保留问号', () => {
  // 2026-11-21 用户质疑「明月几时有」释义后加：原条目把问句译成了陈述句
  //（「明亮的月亮，是从什么时候开始有的。」），整句的追问语气全丢了。
  // 判据取文言疑问词——它们在陈述句里几乎不出现，误伤概率低。
  const Q = ['几时', '何时', '何事', '何似', '何处', '何日', '安得', '谁念', '岂'];
  for (const k of KEYS) {
    if (!Q.some(w => k.indexOf(w) >= 0)) continue;
    const g = gloss.DATA[k].g;
    assert.ok(/[？?]$/.test(g), `问句被译成陈述句：${k} → ${g}`);
  }
  // 反面样本：这两条曾是陈述句，改后必须有问号
  assert.ok(/？$/.test(gloss.DATA['明月几时有'].g), '「明月几时有」须为问句');
  assert.ok(/？$/.test(gloss.DATA['谁念西风独自凉'].g), '「谁念西风独自凉」须为问句');
});

test('取数：本局命中优先，不足用同令字补齐，不超上限', () => {
  const mine = ['恐惊天上人', '明月几时有'];
  const list = gloss.pick(mine, '月', 4);
  assert.equal(list.length, 4);
  assert.deepEqual(list.slice(0, 2).map(c => c.text), mine, '本局句子排在最前');
  assert.equal(list[0].mine, true);
  assert.equal(list[2].mine, false, '补齐条目须标记为非本局');
  for (const c of list.slice(2)) assert.ok(c.text.indexOf('月') >= 0, '补齐只能取同令字');
  // 去重：本局句已在列表里，不应被补齐分支重复加入
  assert.equal(new Set(list.map(c => c.text)).size, list.length);
  // 没有本局句时也能给出该令字的句子
  assert.ok(gloss.pick([], '水', 3).every(c => c.mine === false));
  // 无令字、无本局命中 → 空（页面走空态）
  assert.deepEqual(gloss.pick([], '', 3), []);
});

test('避头尾：标点不许落在行首（问号孤行是实锤回归）', () => {
  const { wrapText, NO_LINE_HEAD } = require(path.join(ROOT, 'js/ui/screens/gloss.js'));
  // 每字符 32px 宽、maxW=96 → 每行 3 字，断点位置完全确定
  const ctx = { measureText: s => ({ width: String(s).length * 32 }), font: null };
  // 断点正好落在「的」和「？」之间——旧行为会把「？」单独放行首
  const lines = wrapText(ctx, '五言五言五言五言五言五言，句号句号句号。', 'f', 96, 4);
  for (const ln of lines) {
    assert.ok(!NO_LINE_HEAD.test(ln[0]), `行首出现标点：${JSON.stringify(lines)}`);
  }
  // 文本完整不丢字（允许被 maxLines 截断加省略号）
  const joined = lines.join('').replace(/…$/, '');
  assert.ok('五言五言五言五言五言五言，句号句号句号。'.startsWith(joined), `折行丢字：${JSON.stringify(lines)}`);
  // 真实回归样本：明月几时有的新释义，两行内问号不孤行
  const g = gloss.DATA['明月几时有'].g;
  const real = wrapText(ctx, g, 'f', 351, 2);
  assert.equal(real.length <= 2, true);
  for (const ln of real) assert.ok(!NO_LINE_HEAD.test(ln[0]), `行首标点：${JSON.stringify(real)}`);
});

test('诗笺页：有内容/空态各绘两帧零异常', () => {
  const game = require(path.join(ROOT, 'game.js'));
  const { app } = game;
  function stubCtx() {
    const target = { measureText: s => ({ width: String(s).length * 32 }), createLinearGradient: () => ({ addColorStop() {} }) };
    return new Proxy(target, {
      get(t, k) { if (k in t) return t[k]; return () => {}; },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  const ctx = stubCtx();
  const outcome = { result: 'win', reason: 'roundsFull', stats: { hits: 5, tigerHits: 3, rounds: 12, keyword: '月', revenge: { kills: 0, newGrudge: [] } }, lines: ['恐惊天上人', '明月几时有', '一句没有收录的句子'] };
  app.goto('gloss', { outcome });
  assert.equal(app.scene.id, 'gloss');
  app.scene.update(0.016);
  app.scene.draw(ctx, 1.1);
  app.scene.draw(ctx, 3.3);
  // 空态：没有任何收录句且令字下无收录
  app.goto('gloss', { outcome: { result: 'draw', stats: { keyword: '花' }, lines: [] } });
  app.scene.draw(ctx, 0.5);
  app.goto('home', {});
  assert.ok(true);
});

test('全诗数据：853 首与语料对齐，句子能在自己诗里高亮命中', () => {
  const texts = gloss.POEM_TEXT;
  assert.equal(texts.length, corpus.sources.length, '全诗数组须与 sources 同长同序');
  // 高亮覆盖：独占一个句读的句子要占绝大多数；两个生僻字句（㧐/㸌，源数据异体字差异）允许降级不高亮
  let hit = 0, miss = [];
  for (const raw of corpus.lines) {
    const t = String(raw).split('|')[0];
    const rows = gloss.renderLines(gloss.srcIdx(t), [t]);
    if (rows.some(r => r.hl)) hit++; else miss.push(t);
  }
  assert.ok(miss.length <= 2, `高亮未命中过多：${miss.slice(0, 5).join('/')}`);
  assert.ok(hit >= 5530, `高亮命中数不足：${hit}`);
});

test('整首串讲：20 首、key 与语料严格一致、长度红线、不写赏析术语', () => {
  const keys = Object.keys(gloss.POEM_GLOSS);
  assert.ok(keys.length >= 20, `串讲不足 20 首：${keys.length}`);
  const titles = new Set(corpus.sources.map(s => s.split('|').slice(0, 2).join('|')));
  const BANNED = ['艺术', '手法', '虚实', '意象', '烘托', '白描', '对仗工整', '写法', '借景抒情', '托物言志'];
  for (const k of keys) {
    assert.ok(titles.has(k), `串讲 key 与语料对不上：${k}`);
    const g = gloss.POEM_GLOSS[k].g;
    assert.ok(g && g.length <= 170, `串讲超长/为空：${k}（${g && g.length}）`);
    for (const b of BANNED) assert.ok(g.indexOf(b) < 0, `串讲写了赏析术语「${b}」：${k}`);
    // 红线：串讲只许句号问号收尾的正经句子，不许出现感叹号堆叠（口播腔）
    assert.ok(!/！！/.test(g), `串讲出现双感叹号：${k}`);
  }
  // introOf：收录的有讲，未收录的返回 null
  const si = gloss.srcIdx('明月几时有');
  assert.ok(gloss.introOf(si), '水调歌头应有串讲');
  assert.equal(gloss.introOf(-1), null);
});

test('按首聚合：同诗合并、上限 6 首、补齐标非本局', () => {
  // 古诗十九首（其一）三句全在本局 → 必须合并成一首一页，而不是三页。
  // keyword 传空避免补齐干扰；max=1 时只返回这一首。
  const solo = gloss.poems(['思君令人老', '岁月忽已晚', '各在天一涯'], '', 1);
  assert.equal(solo.length, 1, '同诗三句应合成一首');
  assert.equal(solo[0].marks.length, 3, '一首页应带全部三句');
  assert.equal(solo[0].mine, true);
  // 上限：本局句跨 4 首之外的空位由同令字补齐，但总数不超过 6
  const mixed = gloss.poems(['明月几时有', '月照一天雪', '谁念西风独自凉', '花自飘零水自流'], '月', 6);
  assert.ok(mixed.length <= 6 && mixed.length >= 4);
  assert.ok(mixed.slice(0, 4).every(p => p.mine), '前四首须是本局诗');
  assert.ok(mixed.length > 4 ? mixed.slice(4).every(p => !p.mine) : true, '补齐须标非本局');
  // 上限收紧到 2：仍不丢本局诗
  const tight = gloss.poems(['明月几时有', '月照一天雪', '谁念西风独自凉', '花自飘零水自流'], '月', 2);
  assert.equal(tight.length, 2);
  assert.ok(tight.every(p => p.mine), '上限收紧时只留本局诗');
  // 空态
  assert.deepEqual(gloss.poems([], '', 6), []);
});

test('诗笺页：切页与滚动多帧零异常（move 手势接入）', () => {
  const game = require(path.join(ROOT, 'game.js'));
  const { app } = game;
  function stubCtx() {
    const target = { measureText: s => ({ width: String(s).length * 32 }), createLinearGradient: () => ({ addColorStop() {} }) };
    return new Proxy(target, {
      get(t, k) { if (k in t) return t[k]; return () => {}; },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  const ctx = stubCtx();
  const outcome = { result: 'win', reason: 'roundsFull', stats: { hits: 5, tigerHits: 3, rounds: 12, keyword: '月', revenge: { kills: 0, newGrudge: [] } }, lines: ['恐惊天上人', '明月几时有', '一句没有收录的句子'] };
  app.goto('gloss', { outcome });
  assert.equal(app.scene.id, 'gloss');
  // 先画一帧（建立测量缓存），再模拟拖动：向下 60px → 内容上滚
  app.scene.draw(ctx, 1.0);
  const yBtn = app.scene.hotRects[0].y;
  app.scene.touch('start', 187, 300);
  app.scene.touch('move', 187, 240);
  app.scene.touch('end', 187, 240);
  app.scene.update(0.016);
  app.scene.draw(ctx, 1.2);
  // 拖动不许误触按钮（end 在卡内）
  app.scene.update(0.016);
  app.scene.draw(ctx, 2.0);
  // 切页：next 按钮
  app.scene.touch('start', 172, yBtn + 44);
  app.scene.touch('end', 172, yBtn + 44);
  app.scene.draw(ctx, 2.2);
  app.goto('home', {});
  assert.ok(true);
});

test('结算页：诗笺入口热区存在，且回程不重复计局', () => {
  const store = require(path.join(ROOT, 'js/app/store'));
  const game = require(path.join(ROOT, 'game.js'));
  const { app } = game;
  const mem = new Map();
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
  };
  store.saveRecord(Object.assign({}, store.DEFAULT_RECORD, { games: 3 }));
  const outcome = { result: 'win', reason: 'roundsFull', stats: { hits: 4, tigerHits: 2, rounds: 12, keyword: '花', revenge: { kills: 0, newGrudge: [] } }, lines: ['苔花如米小'] };
  app.goto('result', { outcome });
  assert.ok(app.scene.hotRects.some(h => h.id === 'result.gloss'), '结算页须有「诗笺」热区');
  assert.equal(store.loadRecord().games, 4, '首次进结算计 1 局');
  app.goto('gloss', { outcome });
  app.goto('result', { outcome, noSave: true });
  assert.equal(store.loadRecord().games, 4, '从诗笺回结算不得重复计局');
  app.goto('home', {});
});
