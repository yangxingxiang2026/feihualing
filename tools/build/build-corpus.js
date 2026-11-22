'use strict';
/**
 * 飞花令 v0.1 诗库清洗构建管线
 * ================================================
 * 输入（只读，禁止修改）：
 *   D:/work/code/my-first-dapp/packages/nextjs/utils/game/poemsData.json （975 首）
 * 输出：
 *   src/data/corpus.js            —— 运行时语料（句库 + char_index，require 时生成 norm_index/author_index）
 *   tools/build/removed-prose.json —— 散文剔除清单（供人工复核）
 *   tools/build/stats.json        —— 覆盖率与体积统计
 *
 * 可重跑、确定性：排序与序号全部由代码点序决定，产物不含时间戳。
 * 运行：node tools/build/build-corpus.js
 */

const fs = require('fs');
const path = require('path');

const SRC = process.env.POEMS_SRC || 'D:/work/code/my-first-dapp/packages/nextjs/utils/game/poemsData.json';
const ROOT = path.resolve(__dirname, '..', '..'); // minigame/
const OUT_DATA = path.join(ROOT, 'src', 'data');
const OUT_TOOL = path.join(__dirname);

// ---------------- 字池与难度（主理人已锁定，勿改） ----------------
const POOL = ['人', '山', '风', '月', '春', '花', '天', '水'];
// difficulty(教材学段 1-6) → 三档：易(1-2)/中(3-4)/难(5-6)
function toLevel(difficulty) {
  const d = Number(difficulty);
  if (d <= 2) return 'e'; // 易
  if (d <= 4) return 'm'; // 中
  return 'h';             // 难
}

// ---------------- 朝代 slug ----------------
const DYN_SLUG = {
  '先秦': 'xianqin', '汉': 'han', '魏晋': 'weijin', '南北朝': 'nanbei',
  '北朝': 'beichao', '隋': 'sui', '唐': 'tang', '宋': 'song',
  '元': 'yuan', '明': 'ming', '清': 'qing', '近现代': 'modern',
};

// ---------------- 散文剔除 · 判据一：题名黑名单（精确匹配归一化题名） ----------------
const PROSE_TITLE_BLACKLIST = new Set([
  // 经典散文/赋论（主理人点名）
  '过秦论', '阿房宫赋', '六国论', '赤壁赋', '前赤壁赋', '陈情表', '师说', '捕蛇者说',
  '兰亭集序', '桃花源记', '岳阳楼记', '醉翁亭记', '出师表', '报任安书', '答司马谏议书',
  '与朱元思书', '马说', '爱莲说', '陋室铭', '归去来兮辞', '滕王阁序', '谏太宗十思疏',
  // 数据体检补充命中
  '秋声赋', '送李愿归盘谷序', '种树郭橐驼传', '封建论', '愚溪诗序', '始得西山宴游记',
  '小石潭记', '钴鉧潭记', '钴鉧潭西小丘记', '至小丘西小石潭记', '袁家渴记', '石渠记', '石涧记',
  '小石城山记', '游黄溪记', '贺进士王参元失火书', '与韩愈论史官书', '答韦中立论师道书',
  '梓人传', '桐叶封弟辩', '五柳先生传', '风赋', '登徒子好色赋', '洛神赋',
  '祭十二郎文', '进学解', '原毁', '逍遥游', '劝学', '鱼我所欲也',
  '生于忧患死于安乐', '邹忌讽齐王纳谏', '曹刿论战', '得道多助失道寡助', '大道之行也',
  // 2026-11-18 真机审计补充命中（散文/传状/寓言序/颂文/骈赋漏网）
  '段太尉逸事状', '三戒', '子产不毁乡校颂', '春思赋',
]);

// ---------------- 散文剔除 · 判据二：启发式（数值判据，见 docs/01） ----------------
// r57  : 5/7 言句占比        prose 通常 <0.45
// avg  : 平均句长（字）      prose 通常 >4.2（四言诗恒为 4.0）
// pDen : 之乎者也矣焉哉 密度 prose 通常 >=0.018
// r4   : 4 言句占比          四言诗 >=0.8，散文 <=0.65 → r4<0.7 才判散文
function isProseHeuristic(stats) {
  return stats.r57 < 0.5 && stats.avg >= 4.2 && stats.pDen >= 0.015 && stats.r4 < 0.7;
}
// 人工复核保护名单：启发式误报、经确认为诗词（详见 docs/01 剔除清单一节）
const HEURISTIC_PROTECT = new Set(['贺新郎']); // 辛弃疾词，长句式导致 r57 偏低

// ---------------- 归一化工具 ----------------
const CJK_RUN = /[\u3400-\u4DBF\u4E00-\u9FFF]+/g;
/** 取正文里的连续汉字段（= 切句 + norm_key：非汉字即分隔/剔除） */
function splitSentences(text) {
  return String(text || '').match(CJK_RUN) || [];
}
/** norm_key：去标点/空白/全半角差异，仅保留汉字 */
function normKey(s) {
  return (String(s || '').match(CJK_RUN) || []).join('');
}
/** 归一化题名：去括号注释与“节选” */
function normTitle(title) {
  return String(title || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/节选/g, '')
    .replace(CJK_RUN, m => m) // 仅保留汉字参与匹配
    .trim();
}
/** 确定性 6 位 hash（FNV-1a 变体，按码点运算，无时间因素） */
function hash6(s) {
  let h = 5381 >>> 0;
  for (const ch of s) {
    h = ((h * 33) + ch.codePointAt(0)) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}
/** 码点序比较（跨平台确定） */
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function cmpArr(xs, ys) {
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const c = cmp(xs[i] || '', ys[i] || '');
    if (c !== 0) return c;
  }
  return 0;
}

// ---------------- 主流程 ----------------
function build() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  console.log(`[1/7] 读入源数据 ${raw.length} 条`);

  // --- 勘误（2026-11-22）：错别字修复 + 截断诗整文替换（数据见 corrections.json，含依据注释） ---
  let fixCount = 0, fullCount = 0, warn = [];
  const corrections = JSON.parse(fs.readFileSync(path.join(__dirname, 'corrections.json'), 'utf8'));
  const norm4cmp = s => (String(s || '').match(CJK_RUN) || []).join('');
  for (const p of raw) {
    const k = `${p.title}|${p.author}`;
    // ① 按篇错字/缺句修复：find=null 前插；find 找不到则告警跳过（防误伤同题名他诗）
    for (const [find, replace] of (corrections.fixes[k] || [])) {
      if (find == null) { p.text = replace + p.text; fixCount++; continue; }
      if (String(p.text).includes(find)) { p.text = String(p.text).replace(find, replace); fixCount++; }
      else warn.push(`${k} 未命中 find: ${find}`);
    }
    // ② 截断诗整文替换：正文归一化后必须与 expect 前缀逐字一致，否则跳过
    const full = corrections.fulls[k];
    if (full && norm4cmp(p.text) === full.expect) { p.text = full.full; fullCount++; }
    else if (full) warn.push(`${k} 前缀校验未过，跳过整文替换`);
  }
  if (fixCount || fullCount) console.log(`[1.5/7] 勘误：错字修复 ${fixCount} 处，截断诗整文替换 ${fullCount} 首${warn.length ? '，告警 ' + warn.length : ''}`);
  warn.slice(0, 10).forEach(w => console.log('  [勘误告警]', w));

  // --- 散文剔除（双重判据） ---
  const removed = [];
  const kept = [];
  raw.forEach((p, idx) => {
    const ss = splitSentences(p.text);
    const n = ss.length || 1;
    const r57 = ss.filter(s => s.length === 5 || s.length === 7).length / n;
    const r4 = ss.filter(s => s.length === 4).length / n;
    const avg = ss.reduce((a, s) => a + s.length, 0) / n;
    const pDen = (String(p.text).match(/[之乎者也矣焉哉]/g) || []).length / (normKey(p.text).length || 1);
    const stats = { r57: +r57.toFixed(3), avg: +avg.toFixed(2), pDen: +pDen.toFixed(3), r4: +r4.toFixed(3) };
    const t = normTitle(p.title);
    if (PROSE_TITLE_BLACKLIST.has(t)) {
      removed.push({ origIndex: idx, origId: p.id, title: p.title, author: p.author, dynasty: p.dynasty, reason: 'title-blacklist', stats });
    } else if (isProseHeuristic(stats) && !HEURISTIC_PROTECT.has(t)) {
      removed.push({ origIndex: idx, origId: p.id, title: p.title, author: p.author, dynasty: p.dynasty, reason: 'heuristic-prose', stats });
    } else {
      kept.push({ p, idx, stats });
    }
  });
  console.log(`[2/7] 散文剔除 ${removed.length} 条，保留诗词 ${kept.length} 条`);

  // --- 确定性排序 → 重建唯一 id ---
  const dynSeq = {};
  const sorted = kept.slice().sort((a, b) => {
    const ka = [DYN_SLUG[a.p.dynasty] || 'other', normTitle(a.p.title), a.p.author, String(a.origIndex)];
    const kb = [DYN_SLUG[b.p.dynasty] || 'other', normTitle(b.p.title), b.p.author, String(b.origIndex)];
    return cmpArr(ka, kb);
  });
  sorted.forEach(item => {
    const slug = DYN_SLUG[item.p.dynasty] || 'other';
    dynSeq[slug] = (dynSeq[slug] || 0) + 1;
    const seq = String(dynSeq[slug]).padStart(3, '0');
    item.poemId = `${slug}_${seq}_${hash6(`${item.p.title}|${item.p.author}`)}`;
    // 三档难度
    item.level = toLevel(item.p.difficulty);
    item.bodyKey = normKey(item.p.text);
    item.normT = normTitle(item.p.title);
  });
  console.log(`[3/7] 重建唯一 id 完成（{dynastySlug}_{序号}_{hash6}）`);

  // --- 同正文多题名合并（确定性选主：题名短者优先 → 作者码点序 → 排序序） ---
  const groups = new Map();
  sorted.forEach(item => {
    const arr = groups.get(item.bodyKey) || [];
    arr.push(item);
    groups.set(item.bodyKey, arr);
  });
  const merged = [];
  let mergedGroupCount = 0;
  for (const [, arr] of groups) {
    const primary = arr.slice().sort((a, b) =>
      cmpArr([a.normT.length, a.p.author, a.poemId], [b.normT.length, b.p.author, b.poemId])
    )[0];
    const altTitles = [...new Set(arr.map(x => x.normT).filter(t => t !== primary.normT))];
    primary.altTitles = altTitles;
    merged.push(primary);
    if (arr.length > 1) mergedGroupCount++;
  }
  merged.sort((a, b) => cmp(a.poemId, b.poemId));
  console.log(`[4/7] 同正文合并：${mergedGroupCount} 组多题名，诗歌终版 ${merged.length} 首`);

  // --- 切句 → norm_key 去重 → 仅留 5/7 言 → 补 source ---
  const seenKey = new Set();
  const lines = []; // { key, srcIdx, level, poemId }
  const sourceMap = new Map(); // 'title|author|dynasty' -> idx
  // 2026-11-21：全诗正文（诗笺页「整体解读」需要）——按 source 顺序落盘到 poem_text.js
  const sourceText = [];
  let droppedDup = 0, droppedLen = 0;
  merged.forEach(item => {
    const { p, poemId, level } = item;
    const srcKey = `${p.title}|${p.author}|${p.dynasty}`;
    if (!sourceMap.has(srcKey)) { sourceMap.set(srcKey, sourceMap.size); sourceText[sourceMap.size - 1] = p.text; }
    const srcIdx = sourceMap.get(srcKey);
    for (const key of splitSentences(p.text)) {
      if (key.length !== 5 && key.length !== 7) { droppedLen++; continue; }
      if (seenKey.has(key)) { droppedDup++; continue; } // 全库 norm_key 唯一
      seenKey.add(key);
      lines.push({ key, srcIdx, level, poemId });
    }
  });
  const sources = [...sourceMap.keys()]; // 'title|author|dynasty'
  console.log(`[5/7] 句库：${lines.length} 句（剔重句 ${droppedDup}，剔非 5/7 言 ${droppedLen}），source ${sources.length} 条`);

  // --- 索引：char_index（字 → 句数组下标）---
  const charIndex = {};
  lines.forEach((l, i) => {
    for (const ch of l.key) {
      (charIndex[ch] = charIndex[ch] || []).push(i);
    }
  });

  // --- 产物 1：corpus.js（紧凑布局，目标 ≤260KB） ---
  const poemLines = merged.map(m => {
    const base = `${m.poemId}|${m.p.title}|${m.p.author}`;
    return m.altTitles && m.altTitles.length ? `${base}|${m.altTitles.join(',')}` : base;
  });
  // lines/sources 显式落盘；char_index/norm_index/author_index 由句库在 require 时
  // 确定性派生（5564 句扫描 <10ms），保证索引与句库永远一致，CI 独立重建校验。
  const lineEntries = lines.map(l => `${l.key}|${l.srcIdx}|${l.level}`);
  const corpusJs = `'use strict';
// 本文件由 tools/build/build-corpus.js 生成，禁止手工编辑。重跑构建脚本即可再生成。
// lines[i] = "normKey|sourceIdx|level"，level: e=易(1-2学段) m=中(3-4) h=难(5-6)
// sources[s] = "title|author|dynasty"；诗歌登记表（唯一 id/题名/altTitles）见同目录 poems.js
// norm_key 即句文本（去标点空白全半角后的纯汉字串），全库唯一。
(function () {
  var POOL = ${JSON.stringify(POOL)};
  var L = ${JSON.stringify(lineEntries)};
  var S = ${JSON.stringify(sources)};
  // —— 索引派生（确定性，与句库一一对应）——
  // char_index: 字 -> 句下标数组（即句 id）；norm_index: normKey -> 句下标；author_index: 作者 -> 句下标数组
  var C = {}, N = {}, A = {};
  L.forEach(function (entry, i) {
    var f = entry.split('|');
    N[f[0]] = i;
    for (var j = 0; j < f[0].length; j++) {
      var ch = f[0].charAt(j);
      (C[ch] = C[ch] || []).push(i);
    }
    var author = S[+f[1]].split('|')[1];
    (A[author] = A[author] || []).push(i);
  });
  module.exports = {
    version: 'v0.1',
    pool: POOL,
    lines: L,
    sources: S,
    char_index: C,
    norm_index: N,
    author_index: A
  };
})();
`;
  fs.mkdirSync(OUT_DATA, { recursive: true });
  fs.writeFileSync(path.join(OUT_DATA, 'corpus.js'), corpusJs, 'utf8');
  const corpusBytes = Buffer.byteLength(corpusJs, 'utf8');
  console.log(`[6/7] corpus.js 落盘：${(corpusBytes / 1024).toFixed(1)} KB（${corpusBytes} bytes）`);

  // --- 产物 2：poems.js 诗歌登记表（重建后的唯一 id + altTitles） ---
  const poemsJs = `'use strict';
// 本文件由 tools/build/build-corpus.js 生成，禁止手工编辑。
// 格式 poems[i] = "id|title|author|altTitle1,altTitle2"（末段仅在同正文多题名时存在）
// id 规则：{dynastySlug}_{朝代内序号3位}_{hash6(title|author)}，确定性可复现。
(function () {
  var P = ${JSON.stringify(poemLines)};
  module.exports = { version: 'v0.1', poems: P };
})();
`;
  fs.writeFileSync(path.join(OUT_DATA, 'poems.js'), poemsJs, 'utf8');
  const poemsBytes = Buffer.byteLength(poemsJs, 'utf8');
  console.log(`      poems.js 落盘：${(poemsBytes / 1024).toFixed(1)} KB（${poemsBytes} bytes）`);

  // --- 产物 2b：poem_text.js 全诗正文（2026-11-21 新增）---
  // 与 corpus.sources 同下标对齐（T[i] 即 sources[i] 那首的全文）。
  // 用途：诗笺页展示全诗 + 本局句高亮 + 整体解读；正文即 build 输入 p.text 原样，
  // 不做任何改写（异文/断句以源数据为准，和句库同源同版本）。
  const textJs = `'use strict';
// 本文件由 tools/build/build-corpus.js 生成，禁止手工编辑。
// 格式 T[i] = 该首全诗正文（含原标点），下标与 corpus.sources 一一对应。
(function () {
  var T = ${JSON.stringify(sourceText)};
  module.exports = { version: 'v0.1', texts: T };
})();
`;
  fs.writeFileSync(path.join(OUT_DATA, 'poem_text.js'), textJs, 'utf8');
  const textBytes = Buffer.byteLength(textJs, 'utf8');
  console.log(`      poem_text.js 落盘：${(textBytes / 1024).toFixed(1)} KB（${sourceText.length} 首）`);

  // --- 产物 2/3：剔除清单 + 统计 ---
  fs.writeFileSync(path.join(OUT_TOOL, 'removed-prose.json'), JSON.stringify({
    total: raw.length, removed: removed.length, list: removed,
  }, null, 2), 'utf8');

  // 覆盖率：每个 (字, 三档) 句数与作者数
  const coverage = POOL.map(ch => {
    const row = { char: ch, total: (charIndex[ch] || []).length, byLevel: {} };
    ['e', 'm', 'h'].forEach(lv => {
      const ids = (charIndex[ch] || []).filter(i => lines[i].level === lv);
      const authors = new Set(ids.map(i => sources[lines[i].srcIdx].split('|')[1]));
      row.byLevel[lv] = { lines: ids.length, authors: authors.size };
    });
    return row;
  });
  const stats = {
    pool: POOL,
    poems: { raw: raw.length, proseRemoved: removed.length, final: merged.length, mergedBodyGroups: mergedGroupCount },
    lines: { total: lines.length, droppedDup, droppedLen57: droppedLen },
    corpusBytes,
    poemsBytes,
    uniqueAuthors: new Set(merged.map(m => m.p.author)).size,
    levelDist: { e: lines.filter(l => l.level === 'e').length, m: lines.filter(l => l.level === 'm').length, h: lines.filter(l => l.level === 'h').length },
    coverage,
  };
  fs.writeFileSync(path.join(OUT_TOOL, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');
  console.log(`[7/7] removed-prose.json / stats.json 落盘`);

  // 摘要
  console.log('\n===== 覆盖率（字 × 三档句数/作者数）=====');
  coverage.forEach(r => {
    console.log(`${r.char}  总${r.total}  易:${r.byLevel.e.lines}/${r.byLevel.e.authors}  中:${r.byLevel.m.lines}/${r.byLevel.m.authors}  难:${r.byLevel.h.lines}/${r.byLevel.h.authors}`);
  });
  const shortCells = [];
  coverage.forEach(r => ['e', 'm', 'h'].forEach(lv => {
    if (r.byLevel[lv].lines < 12) shortCells.push(`${r.char}-${lv}=${r.byLevel[lv].lines}`);
  }));
  if (shortCells.length) console.log('!! 覆盖不足 12 句：' + shortCells.join(' '));
  else console.log('全部 (字,档) ≥12 句 ✓');
  return stats;
}

if (require.main === module) build();
module.exports = {
  build, normKey, splitSentences, normTitle, POOL,
  PROSE_TITLE_BLACKLIST, HEURISTIC_PROTECT, isProseHeuristic,
};

