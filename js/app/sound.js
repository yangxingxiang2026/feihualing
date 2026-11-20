'use strict';
/**
 * 最小音效集（P0-5）：落子 / 接对 / 失手 —— 三音，零音频资产、零授权风险。
 *
 * 为什么是程序化合成而不是音频文件：
 *   ① 小游戏主包体积敏感（当前 222KB，一个 2s 古筝 mp3 就要 40–80KB）；
 *   ② 免版税素材仍需留存授权链，合成音无版权瑕疵；
 *   ③ 三音都是极短音（≤0.3s），合成听感足够（木质敲击 / 琴弦拨奏 / 下行气声）。
 *
 * 平台：微信 wx.createWebAudioContext()（基础库 2.10.0+）；浏览器预览 window.AudioContext。
 * 铁律：任何一步失败（无 API / 上下文创建失败 / 节点异常）一律静默降级为无声——
 *       音效永远不该阻断玩法，也不该在控制台刷错误。
 *
 * 2026-11-20 触摸互动升级（小老虎"本身的声音"要软萌）：
 *   - note 第 6 位可选 opts：{ attack, vibHz, vibDepth, amHz, amDepth }
 *     attack=软起振秒；vib*=颤音（音高小幅摆动，猫喵的"抖"）；am*=振幅调制
 *     （26Hz 咕噜的"喉震"，真猫 purr 的本质就是 ~25Hz 的 AM）；
 *   - spec.overtone = { ratio, gain }：每个音符叠加一个 ratio 倍频副振荡器
 *     （拟"嗓音"的共振峰质感，gain 为相对主音的音量比）；
 *   - voice 标记：小老虎的叫声。发声期间其余玩法音让路（voiceUntil 门前）——
 *     背景声处理=优先级而不是混音，实现最简、无需总线。
 */

/**
 * 音色配方：notes = [起始频率, 延迟秒, 时长秒, 峰值音量, 终止频率?, opts?]
 *   pick 落子：三角波双击，像竹牌相碰（高频短促，不抢决策注意力）
 *   pass 接对：正弦五度上行（G5→D6），像拨了一下琴弦
 *   fail 失手：三角波下行（330→247），短促下沉，不刺耳、不惩罚感
 */
const SFX = {
  pick: { type: 'triangle', notes: [[1180, 0, 0.07, 0.055], [1570, 0.012, 0.05, 0.028]] },
  pass: { type: 'sine', notes: [[784, 0, 0.24, 0.070], [1174, 0.085, 0.30, 0.060]] },
  fail: { type: 'triangle', notes: [[330, 0, 0.16, 0.065, 247], [247, 0.105, 0.22, 0.050, 196]] },
  // 小诗童叫声三连（2026-11-20 三版：「嗷呜」幼虎叫 + 音量加大）——
  // 「嗷呜」= 两段式元音滑动：先上扬（嗷）再回落拖长（呜），2 倍频泛音拟幼兽嗓音；
  // 峰值从 ≤0.07 提到 0.10–0.12（用户反馈"声音大一点"，仍低于玩法音 pass 0.07×包络的可闻峰）。
  // 摸头「嗷呜~」：满足长音——上扬 0.3s → 拖长回落带颤音，底部叠 92Hz 喉震低音（咕噜垫底）
  purr: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [260, 0, 0.30, 0.11, 540, { attack: 0.04, vibHz: 5, vibDepth: 8 }],
      [540, 0.28, 0.55, 0.095, 300, { attack: 0.03, vibHz: 5, vibDepth: 8 }],
      [92, 0.05, 0.70, 0.06, 84, { attack: 0.05, amHz: 26, amDepth: 0.8 }],
    ],
  },
  // 摸肚「嗷呜嗷」：连蹦两声半——嗷→呜→嗷，俏皮
  giggle: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [320, 0, 0.16, 0.11, 600, { attack: 0.02, vibHz: 6, vibDepth: 8 }],
      [600, 0.15, 0.15, 0.095, 400, { attack: 0.015 }],
      [400, 0.29, 0.18, 0.10, 640, { attack: 0.02, vibHz: 6, vibDepth: 8 }],
    ],
  },
  // 挠脚「嗷呜！」：被挠痒的惊叫——急上扬更高、回落更快
  chirp: {
    voice: true, type: 'sine', overtone: { ratio: 2.0, gain: 0.35 },
    notes: [
      [300, 0, 0.17, 0.12, 820, { attack: 0.012 }],
      [820, 0.16, 0.22, 0.095, 340, { attack: 0.01, vibHz: 7, vibDepth: 10 }],
    ],
  },
};

let ac = null;          // AudioContext（懒创建：首次 play 才建，避免启动即占资源）
let failed = false;     // 环境不支持 / 异常 → 后续 play 直接快速返回
let enabled = true;     // 用户开关（默认开）
let voiceUntil = -1;    // 小叫声占线截止时刻（秒，ctx.currentTime 域）——其余音让路

/** 设置开关：tone 为假值即整局静音 */
function setEnabled(v) { enabled = !!v; }
function isEnabled() { return enabled; }

function ensureCtx() {
  if (ac || failed) return ac;
  try {
    if (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function') {
      ac = wx.createWebAudioContext();
    } else if (typeof AudioContext !== 'undefined') {
      ac = new AudioContext();
    } else if (typeof webkitAudioContext !== 'undefined') {
      ac = new webkitAudioContext();
    }
  } catch (e) { ac = null; }
  // 能力自检：缺 createOscillator/createGain 的上下文直接放弃（真机旧基础库）
  if (ac && (typeof ac.createOscillator !== 'function' || typeof ac.createGain !== 'function')) {
    ac = null;
  }
  if (!ac) failed = true;
  return ac;
}

/** 建一条振荡器（freq 起止 + 包络），返回是否成功。供主音/泛音复用 */
function spawnOsc(a, t0, dur, peak, freq, freqEnd, type, attackSec) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  if (!osc || !gain) return null;
  osc.type = type;
  try { osc.frequency.setValueAtTime(freq, t0); } catch (e) { osc.frequency.value = freq; }
  if (freqEnd && typeof osc.frequency.linearRampToValueAtTime === 'function') {
    osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
  }
  // 包络：软起振（默认 8ms）→ 指数衰减到接近 0（避免爆音与拖尾）
  const atk = attackSec || 0.008;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  return { osc, gain, atk };
}

/** 播一个音：kind ∈ pick | pass | fail | purr | giggle | chirp。返回是否真的发声 */
function play(kind) {
  if (!enabled) return false;
  const spec = SFX[kind];
  if (!spec) return false;
  const a = ensureCtx();
  if (!a) return false;
  try {
    const now = typeof a.currentTime === 'number' ? a.currentTime : 0;
    // 背景声处理：小老虎叫声占线时，其余玩法音让路（叫声不被混成背景）
    const total = Math.max.apply(null, spec.notes.map(n => n[1] + n[2]));
    if (!spec.voice && now < voiceUntil) return false;
    // iOS / 微信：上下文可能处于 suspended，需在用户手势链上 resume
    if (a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* resume 失败不阻断发声尝试 */ }
    }
    const ot = spec.overtone;
    for (const n of spec.notes) {
      const freq = n[0], delay = n[1], dur = n[2], peak = n[3], freqEnd = n[4];
      const opts = n[5] || {};
      const t0 = now + 0.01 + delay;
      const main = spawnOsc(a, t0, dur, peak, freq, freqEnd, spec.type, opts.attack);
      if (!main) continue;
      main.gain.connect(a.destination);
      main.osc.start(t0);
      main.osc.stop(t0 + dur + 0.02);
      // 泛音副振荡器：ratio 倍频 + 相对音量（拟嗓音质感），与主音同包络
      if (ot && typeof a.createOscillator === 'function') {
        const h = spawnOsc(a, t0, dur, peak * ot.gain, freq * ot.ratio,
          freqEnd ? freqEnd * ot.ratio : 0, spec.type, opts.attack);
        if (h) {
          h.gain.connect(a.destination);
          h.osc.start(t0);
          h.osc.stop(t0 + dur + 0.02);
        }
      }
      // 颤音（音高小幅摆动）：lfo → osc.frequency
      if (opts.vibHz) {
        try {
          const lfo = a.createOscillator(), lg = a.createGain();
          lfo.frequency.value = opts.vibHz;
          lg.gain.value = opts.vibDepth;
          lfo.connect(lg); lg.connect(main.osc.frequency);
          lfo.start(t0); lfo.stop(t0 + dur + 0.02);
        } catch (e) { /* 颤音失败不影响主音 */ }
      }
      // 振幅调制（喉震）：am lfo → gain.gain（26Hz 连通 96Hz 载波 = 猫咕噜）
      if (opts.amHz) {
        try {
          const am = a.createOscillator(), ag = a.createGain();
          am.frequency.value = opts.amHz;
          ag.gain.value = peak * opts.amDepth;
          am.connect(ag); ag.connect(main.gain.gain);
          am.start(t0); am.stop(t0 + dur + 0.02);
        } catch (e) { /* AM 失败不影响主音 */ }
      }
    }
    if (spec.voice) voiceUntil = now + total + 0.05;
    return true;
  } catch (e) {
    failed = true;   // 一次性失败即永久静音，别每帧重试
    return false;
  }
}

/** 测试钩子：注入假上下文（Node 无 WebAudio），不对外暴露于玩法代码 */
function _injectContext(ctx) { ac = ctx || null; failed = !ctx; voiceUntil = -1; }

module.exports = { play, setEnabled, isEnabled, SFX, _injectContext };
