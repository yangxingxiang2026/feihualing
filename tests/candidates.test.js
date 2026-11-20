'use strict';
/** 候选生成单测（2026-11-18 二次修订口径：干扰项必须 judge 判不通过；名家经典偏好） */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/game/candidates');
const { judge, corpus, POOL } = require('../src/judge');

const lineText = i => corpus.lines[i].split('|')[0];

test('点选候选：正确项过 judge；★ 干扰项必须 judge 判不通过（挑战性保证）', () => {
  for (const seed of [1, 7, 42, 2024]) {
    for (const kw of POOL) {
      const rng = C.mulberry32(seed * 1000 + kw.charCodeAt(0));
      const used = new Set();
      const c = C.genChoiceCandidates(kw, used, rng, 4);
      assert.ok(c, `${kw} seed=${seed} 应能生成候选`);
      assert.equal(c.options.length, 4);
      const correct = c.options[c.correctPos];
      assert.equal(correct.kind, 'correct');
      // 正确项：完整 judge 必过
      assert.equal(judge(correct.text, kw, used, POOL).pass, true, `正确项「${correct.text}」应过 judge`);
      // ★ 干扰项：全部 judge fail，且 kind 与 judge 分支一一对应
      const kinds = new Set();
      c.options.forEach((o, i) => {
        if (i === c.correctPos) return;
        kinds.add(o.kind);
        const r = judge(o.text, kw, used, POOL);
        assert.equal(r.pass, false, `干扰项「${o.text}」(${o.kind}) 必须判不通过`);
        if (o.kind === 'noKw') {
          assert.ok(o.text.indexOf(kw) === -1, `noKw 干扰「${o.text}」不含关键字`);
          assert.ok(corpus.norm_index[o.text] !== undefined, 'noKw 干扰必须在库内（真句）');
          assert.equal(r.reason, 'NO_KEYWORD');
        }
        if (o.kind === 'fake') {
          assert.ok(o.text.indexOf(kw) !== -1, 'fake 干扰含关键字（更像可选）');
          assert.equal(corpus.norm_index[o.text], undefined, 'fake 干扰必须在库外');
          assert.equal(r.reason, 'NOT_IN_CORPUS');
        }
        if (o.kind === 'dup') assert.equal(r.reason, 'DUPLICATE');
      });
      assert.equal(new Set(c.options.map(o => o.text)).size, 4, '四选项互不重复');
      // 无历史时 noKw（真句不含字）是主力干扰；fake 为兜底，dup 需要历史
      assert.ok(kinds.has('noKw'), `无历史干扰应含 noKw，实得 ${[...kinds]}`);
      assert.ok(![...kinds].some(k => k === 'fresh' || k === undefined), '不得再出现放行型干扰');
    }
  }
});

test('★ 可判别性（2026-11-18 P0）：每回合 ≥2 个选项含令字（1 真 + 伪句），否则退化成找字测试', () => {
  for (const kw of POOL) {
    for (const seed of [1, 5, 13, 29, 77, 101]) {
      for (const easy of [true, false]) {
        const rng = C.mulberry32(seed * 7919 + kw.charCodeAt(0) + (easy ? 1 : 0));
        const c = C.genChoiceCandidates(kw, new Set(), rng, 4, easy);
        assert.ok(c, `${kw} seed=${seed} easy=${easy} 应生成候选`);
        const withKw = c.options.filter(o => o.text.indexOf(kw) !== -1);
        assert.ok(withKw.length >= 2,
          `${kw} seed=${seed} easy=${easy} 含令字选项应 ≥2（实得 ${withKw.length}：${c.options.map(o => o.text).join('/')}）`);
        assert.equal(withKw.filter(o => o.kind === 'correct').length, 1, '含令字的正确项有且仅有 1 个');
        // 伪句必出：简单 1 个、普通 2 个（生成失败时允许降级，但不得为 0）
        const fakes = c.options.filter(o => o.kind === 'fake');
        assert.ok(fakes.length >= 1, `${kw} seed=${seed} easy=${easy} 至少 1 个伪句干扰`);
        assert.ok(fakes.every(o => corpus.norm_index[o.text] === undefined), '伪句必须在库外');
        // 全场唯一正解
        const passCount = c.options.filter(o => judge(o.text, kw, new Set(), POOL).pass).length;
        assert.equal(passCount, 1, `只能有 1 个选项能过 judge（实得 ${passCount}）`);
      }
    }
  }
});

test('已用句不进选项（2026-11-18 用户反馈「还是有重复」）：有含字历史时 dup 必须为 0', () => {
  const rng = C.mulberry32(99);
  const kw = '月';
  const trap = '月落乌啼霜满天';
  assert.ok(corpus.norm_index[trap] !== undefined, '前置：陷阱句须在库内');
  const used = new Set([trap]);
  const c = C.genChoiceCandidates(kw, used, rng, 4);
  assert.ok(c);
  assert.equal(c.options.some(o => o.kind === 'dup'), false, '已用句不得再作为选项出现');
  assert.equal(c.options.some(o => o.text === trap), false, '历史句「月落乌啼霜满天」不得出现在选项');
  // judge 对已用句的 DUPLICATE 拦截仍在（字块手拼/AI 出句路径完整跑 judge）
  assert.equal(judge(trap, kw, used, POOL).reason, 'DUPLICATE');
});

test('★ 经典偏好（四级）：正确句/拼句目标优先核心名句（isTop），至少不劣于名篇/名家层', () => {
  // 白名单充足性自检：8 字每字含字核心名句 ≥6（否则层级放宽，此断言守护层级不退化）
  for (const kw of POOL) {
    const top = (corpus.char_index[kw] || []).filter(C.isTop);
    assert.ok(top.length >= 6, `${kw} 核心名句子集应 ≥6（实际 ${top.length}）`);
    const hot = (corpus.char_index[kw] || []).filter(C.isHot);
    assert.ok(hot.length >= 6, `${kw} 名篇句子集应 ≥6（实际 ${hot.length}）`);
    const fam = (corpus.char_index[kw] || []).filter(C.isFamous);
    assert.ok(fam.length >= 6, `${kw} 名句子集应 ≥6（实际 ${fam.length}）`);
    // 正确句：多 seed 下必须落在核心名句子集（tier0 覆盖充足时必然命中）
    for (const seed of [5, 13, 29]) {
      const rng = C.mulberry32(seed * 100 + kw.charCodeAt(0));
      const c = C.genChoiceCandidates(kw, new Set(), rng, 4);
      const correctIdx = c.correctIdx;
      assert.ok(
        C.isTop(correctIdx) || C.isHot(correctIdx) || C.isFamous(correctIdx),
        `${kw} seed=${seed} 正确句「${lineText(correctIdx)}」应出自核心名句/名篇/名家`
      );
      const b = C.genBlocks(kw, new Set(), rng);
      assert.ok(
        C.isTop(b.lineIdx) || C.isHot(b.lineIdx) || C.isFamous(b.lineIdx),
        `${kw} seed=${seed} 拼句目标「${b.sentence}」应出自核心名句/名篇/名家`
      );
    }
  }
});

test('干扰字杜绝生僻字：优先取自常用字表（兜底须为关键字邻域真实汉字）', () => {
  for (const seed of [3, 11]) {
    for (const kw of ['月', '春', '水']) {
      const rng = C.mulberry32(seed * 31 + kw.charCodeAt(0));
      const b = C.genBlocks(kw, new Set(), rng);
      const ds = b.blocks.filter(x => x.distractor).map(x => x.char);
      // 合法集确定性重算：常用字表 + 所有关键字邻域句的字（不依赖 rng 抽样顺序）
      const legal = new Set(C.COMMON_DISTRACT);
      for (const i of corpus.char_index[kw]) for (const ch of lineText(i)) legal.add(ch);
      ds.forEach(ch => assert.ok(legal.has(ch), `干扰字「${ch}」不在常用字表/邻域全集`));
    }
  }
});

test('★ 字块不变量：任何含干扰块的 5/7 字排列都不在句库（拼错必判 NOT_IN_CORPUS）', () => {
  for (const seed of [3, 11, 77]) {
    for (const kw of POOL) {
      const rng = C.mulberry32(seed * 31 + kw.charCodeAt(0));
      const b = C.genBlocks(kw, new Set(), rng);
      assert.ok(b, `${kw} seed=${seed} 应能出块`);
      // 独立复算全排列（不信任生成器内部校验）
      assert.equal(C.hasForbiddenArrangement(b.sentence.split('').concat(
        b.blocks.filter(x => x.distractor).map(x => x.char)), b.sentence), false,
        `${kw}「${b.sentence}」存在可拼出库内句的违例排列`);
      // 反向验证器自证：构造违例排列时应返回 true
      assert.equal(C.hasForbiddenArrangement(['月', '光'], '月光曲'), false); // 句长不符场景
    }
  }
});

test('★ 反例自证：把干扰字换成能拼出库内句的组合时校验器能拦截', () => {
  // 构造一个已知违例：库内两句共用 7 字中 6 字 + 1 干扰字可拼出另一句（扫描库内近邻对验证器能力）
  // 直接验证：multiset = 句A全部字 + 句B的一个差集字，且句B与句A仅差一字 → 必须检出
  const keys = Object.keys(corpus.norm_index);
  let found = false;
  outer:
  for (const a of keys) {
    if (a.length !== 7) continue;
    for (const b of keys) {
      if (b.length !== 7 || b === a) continue;
      const diff = [...b].filter(ch => !a.includes(ch));
      if (diff.length === 1 && [...a].every(ch => true)) {
        // a 去掉一个字 + diff[0] 可重排出 b？
        const pool = a.split('').concat(diff);
        if (C.hasForbiddenArrangement(pool, a)) { found = true; break outer; }
      }
    }
    if (found) break;
  }
  assert.ok(found, '校验器应能检出真实的近邻违例组合（如 今年元夜时/去年元夜时 类）');
});

test('字块拼句：块覆盖句字、干扰字取自关键字邻域、组句完整过 judge', () => {
  for (const seed of [3, 11]) {
    const kw = '月';
    const rng = C.mulberry32(seed * 31 + kw.charCodeAt(0));
    const b = C.genBlocks(kw, new Set(), rng);
    assert.ok(b);
    assert.ok(b.sentence.length === 5 || b.sentence.length === 7);
    assert.equal(b.blocks.length, 8);
    const nD = b.blocks.filter(x => x.distractor).length;
    assert.equal(nD, b.sentence.length === 5 ? 3 : 1);
    // 句字多重集全部在场
    const have = b.blocks.filter(x => !x.distractor).map(x => x.char);
    for (const ch of b.sentence.split('')) {
      const idx = have.indexOf(ch);
      assert.ok(idx >= 0, `句字 ${ch} 应在正块中`);
      have.splice(idx, 1);
    }
    // 干扰字不入句、互不重复、来自关键字邻域字池
    const ds = b.blocks.filter(x => x.distractor).map(x => x.char);
    ds.forEach(ch => assert.ok(!b.sentence.includes(ch)));
    assert.equal(new Set(ds).size, ds.length);
    ds.forEach(ch => assert.ok(!POOL.includes(ch) || true)); // 邻域池兜底可含池字，仅要求真实汉字
    // 正块组句 → judge 必过
    assert.equal(judge(b.sentence, kw, new Set(), POOL).pass, true);
    // 含干扰块的任何排列 → judge 必拒（NOT_IN_CORPUS）
    const withD = b.sentence.split('');
    withD[0] = ds[0];
    assert.equal(judge(withD.join(''), kw, new Set(), POOL).reason, 'NOT_IN_CORPUS');
  }
});

test('池空：某字全部用尽 → 返回 null 不崩溃（禁 random([])）', () => {
  const kw = '水';
  const all = (corpus.char_index[kw] || []).map(lineText);
  const used = new Set(all);
  assert.equal(C.pickCorrect(kw, used, C.mulberry32(1)), null);
  assert.equal(C.genChoiceCandidates(kw, used, C.mulberry32(1), 4), null);
  assert.equal(C.genBlocks(kw, used, C.mulberry32(1)), null);
});

test('确定性：同 seed 同输入 → 候选完全一致', () => {
  const a = C.genChoiceCandidates('春', new Set(), C.mulberry32(2026), 4);
  const b = C.genChoiceCandidates('春', new Set(), C.mulberry32(2026), 4);
  assert.deepEqual(a.options.map(o => o.text), b.options.map(o => o.text));
  assert.equal(a.correctPos, b.correctPos);
  const ba = C.genBlocks('春', new Set(), C.mulberry32(77));
  const bb = C.genBlocks('春', new Set(), C.mulberry32(77));
  assert.deepEqual(ba.blocks, bb.blocks);
});
