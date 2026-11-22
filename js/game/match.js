'use strict';
/**
 * 对局状态机（v1.4 §2.2/§2.6 + 10_ui_spec.md §4.7）
 * 纯逻辑、update(dt) 驱动（无真实定时器），Node 可测。
 *
 * 相位流：
 * reveal(0.8s, 倒计时不启动) → player(10/15s 决策期) → judge(本地 1 帧)
 *   → playerFeedback(过 0.8s / 失败 1.6s) → aiThink(AI 思考) → aiFeedback(1.0s)
 *   → [回合 <12] reveal … ｜ [回合=12] result
 * 结束分支：玩家超时 → 本回合判负分（诗童 +1）后继续；AI 手牌耗尽 → 玩家胜；
 *   池空 → poolEmpty 等待换字确认；12 回合满 → 按接对数判定。
 * 判定铁律：玩家点选/拼句结果必须完整跑 judge()，不跳过。
 */
const { judge, corpus, POOL, normKey } = require('../../src/judge');
const C = require('./candidates');
const aiLib = require('./ai');

const lineText = i => corpus.lines[i].split('|')[0];
const DUR = { reveal: 0.8, pass: 0.8, fail: 1.6, aiShow: 1.0 };

function pickKeyword(rng, excludeKeywords) {
  // 修复（2026-11-18 用户反馈「题目会重复」）：原实现确定性取句量最多的字，
  // 导致每局开局关键字都相同。改为：排除跨局近期用字后，在可用量达标的字里真随机。
  const excl = excludeKeywords instanceof Set ? excludeKeywords : new Set(excludeKeywords || []);
  let cands = POOL.filter(ch => !excl.has(ch) && (corpus.char_index[ch] || []).length >= 6);
  if (!cands.length) cands = POOL.filter(ch => (corpus.char_index[ch] || []).length >= 6);
  if (!cands.length) cands = POOL.slice();
  return cands[Math.floor(rng() * cands.length)];
}

function suggestKeyword(usedKeys) {
  let best = null, bestN = 0;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  for (const ch of POOL) {
    const n = C.remaining(corpus, ch, used).length;
    if (n > bestN) { bestN = n; best = ch; }
  }
  return best;
}

class Match {
  constructor(opts) {
    const o = opts || {};
    this.rng = C.mulberry32(o.seed != null ? o.seed : (Math.random() * 0xFFFFFFFF) >>> 0);
    const tutorial = !!o.tutorial;
    this.cfg = {
      mode: tutorial ? 'choice' : (o.mode || 'choice'), // 教学局只用点选（字块没有"念给你听"的余地）
      roundMax: o.roundMax != null ? o.roundMax : (tutorial ? 3 : 12),
      // easy 档：15s 决策期 + 新手 AI + 名句五言优先（用户口径 2026-11-18「难度按熟悉程度分级」）
      difficulty: o.difficulty || 'normal',
      tutorial,
      // 教学局给 20s：第一次上手的人要读选项、看提示，15s 不够（P0-3 首局完成率 ≥65% 的前提）
      timerSec: o.timerSec != null ? o.timerSec : (tutorial ? 20 : (o.difficulty === 'easy' ? 15 : 10)),
      aiLevel: o.aiLevel || (o.difficulty === 'easy' ? 'rookie' : 'normal'),
      aiDifficulty: o.aiDifficulty || 'mixed',         // 幽灵出句难度：e/m/h/mixed（关键字+难度）
      candidateCount: o.candidateCount || 4,           // 裁决：v0.1 锁 4
    };
    // 教学局固定令字「月」：三句教学名句全部含月，且「月」本身就是最熟悉的令字
    this.keyword = o.keyword || (tutorial ? '月' : pickKeyword(this.rng, o.excludeKeywords));
    this.tutorialHint = null;           // 教学局当前回合提示（给答案 / 给出处 / 靠自己）
    this.tutorialTip = null;            // 教学局接对后的规则小贴士
    this.usedKeys = new Set();          // 全局已用句（玩家 + AI 共用，v1.4 §2.6.4）
    // 本局已展示文本（2026-11-20 真机复盘）：选项/题句/AI 出句只要亮过就记录——
    // 失手回合的正解与干扰项不走 usedKeys，若无此集合会随后续回合/AI 补牌再次出现，
    // 玩家视角即"同一局出现重复题目"。生成器与 AI 补牌统一经 _genUsed()/_actUsed() 避开。
    this.shown = new Set();
    // 2026-11-20 修「教学局提示复读」根因：AI 手牌预留三句教学脚本——否则诗童可抢先
    // 接走脚本句（如「月落乌啼霜满天」），第 3 回合脚本发牌 used.has 命中回落常规发牌
    const tutorialReserve = tutorial ? C.TUTORIAL_ROUNDS.map(r => r.line) : [];
    this.ai = aiLib.create(this.cfg.aiLevel, this.keyword, this.rng, this.cfg.aiDifficulty, tutorialReserve);
    this.roundSeq = 0;                  // 已完成回合数
    this.playerHits = 0; this.tigerHits = 0;
    this.timeouts = 0;                  // 玩家超时回合数（本回合判负分，不终局）
    this.skipAITurn = false;            // 超时回合跳过诗童出句
    this.combo = 0; this.maxCombo = 0;
    this.reactSum = 0; this.reactN = 0;
    this.lastPlayerLine = null; this.lastTigerLine = null;
    // 本局亮过的真句（玩家接对 + 诗童接对，去重保序）——结算页「诗笺」取释义用
    this.roundLines = [];
    this.phase = 'idle'; this.phaseT = 0;
    this.candidates = null; this.blocks = null;
    this.pending = null;                // 判定前暂存
    this.feedback = null;               // {kind:'pass'|'fail'|'timeout'|'aiFail'|'aiPlay'|'exhausted', reason, text, pos}
    this.outcome = null;                // {result:'win'|'loss'|'draw', reason, stats}
    // 错句复仇（2026-11-19 PM 唯一推荐概念，MVP）：
    // grudgeLines = 开局传入的「已熟成待甩错句」（store.grudgeRipe()，纯逻辑层不读存储）
    this.grudgeLines = Array.isArray(o.grudgeLines) ? o.grudgeLines.slice(0, 5) : [];
    this.grudgeNew = [];                // 本局玩家失手回合的正解（结算后入册）
    this.revengePlays = 0;              // 本局已甩错句数（≤2，防刷屏）
    this.revengeRound = null;           // {text, avenged}——诗童甩出错句后待玩家雪耻的回合
    this.revengeKills = [];             // 本局雪耻成功的错句文本（结算回写错题本）
    this._dealRound();
  }

  // ---------- 内部 ----------
  /**
   * 生成器用已用集合（2026-11-20 真机复盘）：叠加 AI 当前手牌（开局即发、不走 usedKeys，
   * 不预留会被题句/干扰项撞上）+ 本局已展示文本（失手正解/干扰项只展示不消费，会复现）。
   */
  _genUsed() {
    const s = new Set(this.usedKeys);
    // 教学局是手写三回合脚本（固定教学句），AI 手牌预留不适用——叠加会把
    // 「海上生明月」级教学句判成已用，genTutorialRound 回落常规发牌、提示过期
    // （2026-11-20 冒烟抓到：第 2 回合提示复读第 1 回合）。
    if (!this.cfg.tutorial) {
      ((this.ai && this.ai.hand) || []).forEach(i => s.add(lineText(i)));
    }
    this.shown.forEach(t => s.add(t));
    return s;
  }

  /** AI 补牌/滤手牌用：usedKeys ∪ 已展示（不含手牌自身，act 内部管理手牌） */
  _actUsed() {
    const s = new Set(this.usedKeys);
    this.shown.forEach(t => s.add(t));
    return s;
  }

  /** 登记本回合已展示内容：选项全文（choice/tutorial）或拼句目标（blocks） */
  _markShown() {
    if (this.candidates && this.candidates.options) {
      this.candidates.options.forEach(o => this.shown.add(o.text));
    } else if (this.blocks && this.blocks.sentence) {
      this.shown.add(this.blocks.sentence);
    }
  }

  _dealRound() {
    const easy = this.cfg.difficulty === 'easy';
    const genUsed = this._genUsed();
    if (this.cfg.mode === 'choice') {
      if (this.cfg.tutorial) {
        // 教学局：手写三回合（给答案 → 给出处 → 靠自己），失败才回落常规发牌
        const t = C.genTutorialRound(this.roundSeq, this.keyword, genUsed, this.rng);
        if (t) {
          this.candidates = t;
          this.tutorialHint = t.tutorial.hint;
          this.tutorialTip = t.tutorial.tip;
        } else {
          this.candidates = C.genChoiceCandidates(this.keyword, genUsed, this.rng, this.cfg.candidateCount, easy);
          // 脚本回落（2026-11-20 修提示复读）：常规发牌没有教学提示，必须清掉上一回合
          // 的旧 hint/tip，否则 UI 继续展示过期文案（真机/冒烟均复现过）
          this.tutorialHint = null;
          this.tutorialTip = null;
        }
      } else {
        this.candidates = C.genChoiceCandidates(this.keyword, genUsed, this.rng, this.cfg.candidateCount, easy);
      }
    } else {
      this.blocks = C.genBlocks(this.keyword, genUsed, this.rng, easy);
      this.candidates = this.blocks ? { correctIdx: this.blocks.lineIdx } : null;
    }
    if (!this.candidates) { this.phase = 'poolEmpty'; this.phaseT = 0; return; }
    this._markShown();
    this.skipAITurn = false;
    this._enter('reveal');
  }
  _enter(phase) { this.phase = phase; this.phaseT = 0; }
  _accept(lineIdx) {
    const t = lineText(lineIdx);
    this.usedKeys.add(t);
    return t;
  }
  /** 玩家失手（错选/拼错/超时）→ 本回合正解入「错句」清单（教学局不入册） */
  _noteGrudge() {
    if (this.cfg.tutorial) return;
    let t = null;
    if (this.cfg.mode === 'choice' && this.candidates && this.candidates.correctPos != null) {
      t = this.candidates.options[this.candidates.correctPos] && this.candidates.options[this.candidates.correctPos].text;
    } else if (this.blocks && this.blocks.sentence) {
      t = this.blocks.sentence;
    }
    if (t && !this.grudgeNew.includes(t)) this.grudgeNew.push(t);
  }
  /** 挑一句待甩错句：含当前令字、未用过、且当前没有悬着的雪耻回合 */
  _pickGrudge() {
    if (!this.grudgeLines.length || this.revengePlays >= 2 || this.revengeRound) return null;
    for (const text of this.grudgeLines) {
      if (this.usedKeys.has(text)) continue;
      if (this.shown.has(text)) continue;      // 本局已亮过的内容不重复甩
      if (text.indexOf(this.keyword) === -1) continue;
      const idx = corpus.norm_index[normKey(text)];
      if (idx == null) continue;               // 理论不会发生（错句皆库内句），防御
      return { action: 'play', lineIdx: +idx, thinkSec: 1.2, grudge: true };
    }
    return null;
  }
  _toResult(result, reason) {
    const avg = this.reactN ? +(this.reactSum / this.reactN).toFixed(1) : 0;
    this.outcome = {
      result, reason,
      tutorial: this.cfg.tutorial,
      // 本局亮过的句子（诗笺释义的取数口径；最多 12 句，够两页卡）
      lines: this.roundLines.slice(0, 12),
      stats: { hits: this.playerHits, tigerHits: this.tigerHits, maxCombo: this.maxCombo,
               avgReact: avg, rounds: this.roundSeq, timeouts: this.timeouts, keyword: this.keyword,
               // 错句复仇：入册前剔除当局已被玩家自己接上的句（失手后补接的不算仇）
               revenge: { kills: this.revengeKills.length, killedTexts: this.revengeKills.slice(),
                          newGrudge: this.grudgeNew.filter(t => !this.usedKeys.has(t)) } },
    };
    this._enter('result');
  }
  _afterPlayerFeedback() {
    // 2026-11-18 P0-3「哇时刻」：教学局最后一回合让诗童必失手——
    // 玩家第一次看到"它也会接不上"，同时第一次赢，建立继续玩的动机。
    if (this.cfg.tutorial && this.roundSeq >= this.cfg.roundMax - 1) {
      this.pendingAI = { action: 'skip', thinkSec: 0.8 };
      this._enter('aiThink');
      return;
    }
    // 玩家回合结束 → AI 回合（错句复仇：优先甩错题本错句，压过普通出句）
    const act = this._pickGrudge() || aiLib.act(this.ai, this.keyword, this._actUsed(), this.phaseT);
    this.pendingAI = act;
    if (act.action === 'exhausted') { this._toResult('win', 'aiExhausted'); return; }
    this._enter('aiThink');
  }
  _finishRound() {
    this.roundSeq++;
    if (this.roundSeq >= this.cfg.roundMax) { this._judgeFinal(); return; }
    this._dealRound();
  }
  _judgeFinal() {
    if (this.playerHits > this.tigerHits) this._toResult('win', 'roundsFull');
    else if (this.playerHits < this.tigerHits) this._toResult('loss', 'roundsFull');
    else this._toResult('draw', 'roundsFull');
  }

  // ---------- 驱动 ----------
  update(dt) {
    if (this.phase === 'result' || this.phase === 'idle') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'reveal':
        if (this.phaseT >= DUR.reveal) this._enter('player');
        break;
      case 'player': {
        const left = this.cfg.timerSec - this.phaseT;
        if (left <= 0) {
          // 2026-11-18 P0（产品评估：一次失误归零对 40+ 用户是劝退设计）：
          // 超时不再整局判负，改为【本回合判负分】——诗童 +1，玩家连对清零，
          // 直接跳过 AI 回合进入下一回合，对局继续到 12 回合或池空。
          this.feedback = { kind: 'fail', reason: 'TIMEOUT', text: null };
          this._noteGrudge();
          this.combo = 0;
          this.tigerHits++;
          this.timeouts++;
          this.skipAITurn = true;
          this._enter('playerFeedback');
        }
        break;
      }
      case 'playerFeedback':
        if (this.phaseT >= (this.feedback && this.feedback.kind === 'pass' ? DUR.pass : DUR.fail)) {
          if (this.skipAITurn) { this.skipAITurn = false; this._finishRound(); }
          else this._afterPlayerFeedback();
        }
        break;
      case 'aiThink':
        if (this.phaseT >= (this.pendingAI.thinkSec || 1)) {
          const act = this.pendingAI;
          if (act.action === 'play') {
            // 2026-11-18 重大修复：原实现先 _accept（入 usedKeys）再 judge——
            // AI 句自己撞自己的 DUPLICATE，诗童每句必败（用户实测 7 回合 0 接对）。
            // 与玩家路径同序：先判，过判再入 usedKeys。
            const t = lineText(act.lineIdx);
            const r = judge(t, this.keyword, this.usedKeys, POOL);
            if (r.pass) {
              this._accept(act.lineIdx);
              this.tigerHits++; this.combo = 0;
              this.lastTigerLine = t;
              if (this.roundLines.indexOf(t) < 0) this.roundLines.push(t);
              this.feedback = { kind: 'aiPlay', reason: 'OK', text: t, grudge: !!act.grudge };
              // 甩出错句 → 挂起雪耻回合：玩家下一次接对即反杀翻倍
              if (act.grudge) { this.revengePlays++; this.revengeRound = { text: t, avenged: false }; }
            } else {
              this.shown.add(t); // AI 失手句也已亮给玩家，后续不再复用
              this.feedback = { kind: 'aiFail', reason: r.reason, text: t };
            }
          } else {
            this.feedback = { kind: 'aiFail', reason: 'TIMEOUT', text: null };
          }
          this._enter('aiFeedback');
        }
        break;
      case 'aiFeedback':
        if (this.phaseT >= DUR.aiShow) this._finishRound();
        break;
      default: break;
    }
  }

  // ---------- 玩家输入（点选/拼句都必须完整跑 judge） ----------
  _judgeAndRecord(text, extra0) {
    const react = Math.max(0, this.cfg.timerSec - (this.cfg.timerSec - this.phaseT));
    this.reactSum += this.phaseT; this.reactN++;
    const r = judge(text, this.keyword, this.usedKeys, POOL);
    if (r.pass) {
      this.usedKeys.add(text);
      this.playerHits++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.lastPlayerLine = text;
      if (this.roundLines.indexOf(text) < 0) this.roundLines.push(text);
      const extra = extra0 || {};
      // 错句复仇反杀：诗童甩出的错句被接上 → 本回合得分翻倍 + 雪耻标记
      if (this.revengeRound && !this.revengeRound.avenged) {
        this.revengeRound.avenged = true;
        this.playerHits++;                    // 翻倍 = 正常 +1 再奖 +1
        this.revengeKills.push(this.revengeRound.text);
        extra.revenge = true;
        this.revengeRound = null;
      }
      this.feedback = Object.assign({ kind: 'pass', reason: 'OK', text }, extra);
    } else {
      this.combo = 0;
      this._noteGrudge();
      this.feedback = Object.assign({ kind: 'fail', reason: r.reason, text }, extra0 || {});
    }
    this._enter('playerFeedback');
    return r;
  }
  /** 点选接句：pos = 候选卡下标 */
  submitChoice(pos) {
    if (this.phase !== 'player' || !this.candidates) return { pass: false, reason: 'INVALID_STATE' };
    const opt = this.candidates.options[pos];
    if (!opt) return { pass: false, reason: 'INVALID_STATE' };
    return this._judgeAndRecord(opt.text, { pos });
  }
  /** 字块拼句：UI 组好整句提交 */
  submitBlocksText(text) {
    if (this.phase !== 'player') return { pass: false, reason: 'INVALID_STATE' };
    return this._judgeAndRecord(text, {});
  }

  // ---------- 池空兜底（v1.4 §2.6：放宽难度→换字→判接不上；禁止 random([]) 崩溃） ----------
  confirmSwitch() {
    if (this.phase !== 'poolEmpty') return false;
    const next = suggestKeyword(this.usedKeys);
    if (!next || next === this.keyword) { // 全池尽 → 判 AI 接不上
      this._toResult('win', 'poolExhausted');
      return true;
    }
    this.keyword = next;
    // v1.4 §2.6.6 换字重置手牌；教学局脚本句预留保持（换字后教学脚本随旧字作废，
    // 但预留无害——脚本句不含新令字本就不可能在手牌）
    this.ai = aiLib.create(this.cfg.aiLevel, next, this.rng, this.cfg.aiDifficulty, this.cfg.tutorial ? C.TUTORIAL_ROUNDS.map(r => r.line) : []);
    this.usedKeys = new Set();                                 // 与手牌一并重置
    this.revengeRound = null;                                  // 悬着的雪耻回合随旧字上下文一并作废
    this._dealRound();
    return true;
  }

  // ---------- UI 快照 ----------
  snapshot() {
    return {
      phase: this.phase,
      phaseT: this.phaseT,
      mode: this.cfg.mode,
      keyword: this.keyword,
      round: this.roundSeq + (this.phase === 'idle' ? 0 : 1),
      roundMax: this.cfg.roundMax,
      timeLeft: this.phase === 'player' ? Math.max(0, this.cfg.timerSec - this.phaseT) : null,
      playerHits: this.playerHits, tigerHits: this.tigerHits,
      combo: this.combo,
      usedKeys: this.usedKeys,
      // 2026-11-18 玩法可读性：携带 kind（'correct'|'noKw'|'dup'|'fake'），
      // dup 选项 UI 可提前标注「已用」角标——玩家无需记忆历史回合也能理解判定
      candidates: (this.cfg.mode === 'choice' && this.candidates) ? this.candidates.options.map(o => ({ text: o.text, kind: o.kind })) : null,
      blocks: this.blocks,
      feedback: this.feedback,
      lastSentence: this.lastTigerLine || this.lastPlayerLine,
      suggestKeyword: this.phase === 'poolEmpty' ? suggestKeyword(this.usedKeys) : null,
      // 教学局上下文（提示行/贴士；非教学局为 null，UI 不额外渲染）
      tutorial: this.cfg.tutorial
        ? { step: Math.min(this.roundSeq + 1, this.cfg.roundMax), total: this.cfg.roundMax, hint: this.tutorialHint, tip: this.tutorialTip }
        : null,
      // 错句复仇：甩出错句后挂起的雪耻回合（上句区「错题本」签 + 反杀翻倍 UI 依据）
      revenge: this.revengeRound ? { text: this.revengeRound.text, avenged: this.revengeRound.avenged } : null,
      outcome: this.outcome,
    };
  }
}

module.exports = { Match, DUR, POOL };
