'use strict';
/**
 * 飞花令 v0.1 CI 门禁
 * 运行：node tools/build/ci-gate.js
 * 任一检查失败 → 非零退出。全部独立于构建脚本重算，不信任产物自述。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_CORPUS_BYTES = 260 * 1024;
const MIN_COVER = 12; // 每个 (关键字, 三档) 最少句数
const EXPECTED_POOL = ['人', '山', '风', '月', '春', '花', '天', '水'];

const corpus = require(path.join(ROOT, 'src', 'data', 'corpus.js'));
const poems = require(path.join(ROOT, 'src', 'data', 'poems.js'));
const buildLib = require('./build-corpus.js');

const failures = [];
const notes = [];
function check(name, ok, detail) {
  if (ok) notes.push(`PASS  ${name}${detail ? '  ' + detail : ''}`);
  else failures.push(`FAIL  ${name}${detail ? '  ' + detail : ''}`);
}

// ---- 1. 诗歌 id 唯一 ----
const ids = poems.poems.map(s => s.split('|')[0]);
check('poem id 唯一', new Set(ids).size === ids.length, `${ids.length} 首 / 唯一 ${new Set(ids).size}`);
check('poem id 格式 {dynasty}_{seq3}_{hash6}', ids.every(id => /^[a-z]+_\d{3}_[0-9a-z]{6}$/.test(id)));

// ---- 2. norm_key 唯一 ----
const entries = corpus.lines.map(l => l.split('|'));
const keys = entries.map(f => f[0]);
check('norm_key 全库唯一', new Set(keys).size === keys.length, `${keys.length} 句 / 唯一 ${new Set(keys).size}`);
check('norm_key 为 5/7 言', keys.every(k => k.length === 5 || k.length === 7));

// ---- 3. char_index 与句库完全一致（独立重建比对） ----
const rebuilt = {};
keys.forEach((k, i) => { for (const ch of k) (rebuilt[ch] = rebuilt[ch] || []).push(i); });
const real = corpus.char_index;
const charOk = Object.keys(rebuilt).length === Object.keys(real).length &&
  Object.keys(rebuilt).every(ch => real[ch] && real[ch].length === rebuilt[ch].length &&
    rebuilt[ch].every((v, j) => real[ch][j] === v));
check('char_index 与句库完全一致', charOk, `${Object.keys(real).length} 个字 / ${Object.values(real).reduce((a, v) => a + v.length, 0)} 处引用`);

// norm_index / author_index 一致性（require 时派生的索引）
const normOk = keys.every((k, i) => corpus.norm_index[k] === i);
check('norm_index 与句库完全一致', normOk);
const authors = entries.map(f => corpus.sources[+f[1]].split('|')[1]);
const authorOk = Object.keys(corpus.author_index).every(a =>
  corpus.author_index[a].length === authors.reduce((n, x, i) => n + (x === a ? 1 : 0), 0));
check('author_index 与句库完全一致', authorOk, `${Object.keys(corpus.author_index).length} 位作者`);

// ---- 4. 无散文文体词命中（题名黑名单全量回扫） ----
const proseHits = poems.poems
  .map(s => s.split('|'))
  .filter(f => buildLib.PROSE_TITLE_BLACKLIST.has(buildLib.normTitle(f[1])));
check('无散文题名残留', proseHits.length === 0, proseHits.map(f => f[1]).join('、') || '0 命中');
// altTitles 也回扫
const altHits = poems.poems
  .map(s => s.split('|')[3] || '')
  .flatMap(s => (s ? s.split(',') : []))
  .filter(t => buildLib.PROSE_TITLE_BLACKLIST.has(buildLib.normTitle(t)));
check('altTitles 无散文题名残留', altHits.length === 0, altHits.join('、') || '0 命中');

// ---- 5. 每字三档覆盖 ≥12 ----
const coverRows = EXPECTED_POOL.map(ch => {
  const ids0 = real[ch] || [];
  const row = { char: ch };
  ['e', 'm', 'h'].forEach(lv => {
    const arr = ids0.filter(i => entries[i][2] === lv);
    row[lv] = { lines: arr.length, authors: new Set(arr.map(i => authors[i])).size };
  });
  return row;
});
check('字池 = 人山风月春花天水', JSON.stringify(corpus.pool) === JSON.stringify(EXPECTED_POOL));
const shortCells = [];
coverRows.forEach(r => ['e', 'm', 'h'].forEach(lv => {
  if (r[lv].lines < MIN_COVER) shortCells.push(`${r.char}-${lv}=${r[lv].lines}`);
}));
check(`每字三档覆盖 ≥${MIN_COVER} 句`, shortCells.length === 0, shortCells.join(' ') || '24/24 达标');

// ---- 6. corpus 体积 ≤260KB ----
const corpusPath = path.join(ROOT, 'src', 'data', 'corpus.js');
const bytes = fs.statSync(corpusPath).size;
check(`corpus.js ≤260KB`, bytes <= MAX_CORPUS_BYTES, `${(bytes / 1024).toFixed(1)}KB`);

// ---- 7. source 非空率 100%（title|author|dynasty 三段皆非空，且句行引用越界检查） ----
const badSrc = corpus.sources.filter(s => s.split('|').length !== 3 || s.split('|').some(seg => !seg));
check('source 非空率 100%（且三段齐全）', badSrc.length === 0, `${corpus.sources.length} 条`);
const badRef = entries.filter(f => !(+f[1] >= 0 && +f[1] < corpus.sources.length) || !['e', 'm', 'h'].includes(f[2]));
check('句行 sourceIdx/level 合法', badRef.length === 0, `${entries.length} 行`);

// ---- 8. 字块干扰不变量抽样（派单硬要求：干扰块拼不出库内句） ----
const C = require(path.join(ROOT, 'js', 'game', 'candidates'));
let blocksBad = [];
for (const seed of [1, 2, 3]) {
  for (const ch of EXPECTED_POOL) {
    const b = C.genBlocks(ch, new Set(), C.mulberry32(seed * 97 + ch.charCodeAt(0)));
    if (!b) { blocksBad.push(`${ch}@${seed}:生成失败`); continue; }
    if (C.hasForbiddenArrangement(b.sentence.split('').concat(b.blocks.filter(x => x.distractor).map(x => x.char)), b.sentence)) {
      blocksBad.push(`${ch}@${seed}:违例排列`);
    }
  }
}
check('字块干扰不变量（24 组抽样全排列扫描）', blocksBad.length === 0, blocksBad.join(' ') || '0 违例');

// ---- 汇总 ----
console.log(notes.join('\n'));
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  console.error(`\nCI 门禁：${failures.length} 项失败`);
  process.exit(1);
} else {
  console.log(`\nCI 门禁：全部 ${notes.length} 项通过 ✓`);
}
