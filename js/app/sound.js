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
 *   - spec.partials = [[ratio, gain], ...]：谐波堆叠（第 1 项主音），拟嗓音厚度；
 *   - spec.lowpass = Hz：整组过一遍低通，削掉刺耳高频（幼兽声音偏闷）。
 *     无 createBiquadFilter 的旧基础库自动降级为直连；
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
  // 小诗童叫声（2026-11-20 六版：用户「叫声不对」）。
  // 根因（一~五版都没解决）：「嗷呜」是元音 a→u 的变化——正弦滑音只动音高不动
  // 音色，怎么调音量/跨度都像"滑哨"。六版换共振峰（formant）合成：
  //   锯齿波声源（谐波结构像声带）→ 两个带通滤波器并行（F1=开口度 ~950Hz、
  //   F2=圆唇度 ~1500Hz），滤波器频率随时间滑到「呜」的位置（F1 380 / F2 850）
  //   → 音色本身从"张嘴嗷"变成"圆唇呜"，这才是叫声的元音变化。
  //   旧基础库无 createBiquadFilter 时自动降级为 notes 正弦滑音（五版配方保底）。
  // 小诗童叫声（2026-11-21 八版：用户「声音不萌」）。
  // 七版是"拟真"路线——240–380Hz 基频 + 1250Hz 低通 + 24Hz 喉震，客观指标 F0=342Hz、
  // 谱重心 1404Hz，落在**成年猫低吼**区间：闷、糊、像呼噜，离"奶音"越来越远。
  // 八版换"幼态"路线，四条同时动手（萌 = 幼态 = 高基频 + 短促 + 亮 + 气声）：
  //   ① 基频 520→830（0.13s 快升）→ 545：幼猫/幼虎喵叫典型 550–900Hz，
  //      短促上扬才"奶"，长音低音只会"憨"；
  //   ② 时长 1.05 → 0.62s：喊一声就收，不拖成呼噜；
  //   ③ 共振峰整体上移（F1 1120→1250→600 / F2 2150→2450→1250）：幼兽声道短，
  //      共振峰天然更高，"嗷→呜"的元音变化保留；
  //   ④ 去掉 24Hz 喉震（AM 会把泛音抖成电子味），改 srcLp 3800（保留"嫩"的亮度）
  //      + breath 0.2（气声多 = 幼态）+ jitter 17Hz（活物感）。
  purr: {
    voice: true, lowpass: 2600, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    formant: {
      src: 'sawtooth', dur: 0.62, gain: 0.50, attack: 0.02, release: 0.16,
      pitch: [[520, 0], [830, 0.13], [760, 0.33], [545, 0.62]],   // 嗷↑ 停 呜↓
      vibHz: 7.5, vibDepth: 16, jitterHz: 17, jitterDepth: 5,
      f1: [[1120, 0], [1250, 0.13], [1020, 0.33], [600, 0.62]],
      f2: [[2150, 0], [2450, 0.13], [2050, 0.33], [1250, 0.62]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 3800, breath: 0.20,
    },
    notes: [
      [520, 0, 0.13, 0.26, 830, { attack: 0.015, vibHz: 7.5, vibDepth: 12 }],
      [800, 0.13, 0.22, 0.22, 560, { attack: 0.01, vibHz: 7.5, vibDepth: 12 }],
    ],
  },
  // giggle（二版摸肚音）已于三版移除：摸肚改「惊叫 yelp」+ 连击「狂笑 laugh」，
  // giggle 无调用方（屏侧统一走 pet.soundFor）。
  chirp: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.22], [3, 0.07]],
    formant: {
      src: 'sawtooth', dur: 0.30, gain: 0.56, attack: 0.01, release: 0.10,
      pitch: [[700, 0], [1120, 0.10], [640, 0.30]],
      vibHz: 8, vibDepth: 14, jitterHz: 18, jitterDepth: 5,
      f1: [[1200, 0], [1450, 0.10], [720, 0.30]],
      f2: [[2350, 0], [2650, 0.10], [1350, 0.30]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 4200, breath: 0.22,
    },
    notes: [
      [700, 0, 0.10, 0.28, 1120, { attack: 0.01 }],
      [1100, 0.10, 0.18, 0.22, 650, { attack: 0.01, vibHz: 8, vibDepth: 10 }],
    ],
  },
  // ---- 沙雕音组（2026-11-20 互动三版「出圈」+ 彩蛋太空步）----
  // yelp 摸肚「惊叫」：肚子是禁区——短促高音急窜（860→1320→700），0.24s
  yelp: {
    voice: true, lowpass: 3400, partials: [[1, 1], [2, 0.2]],
    formant: {
      src: 'sawtooth', dur: 0.24, gain: 0.60, attack: 0.008, release: 0.08,
      pitch: [[860, 0], [1320, 0.07], [700, 0.24]],
      vibHz: 9, vibDepth: 18, jitterHz: 19, jitterDepth: 6,
      f1: [[1350, 0], [1650, 0.07], [820, 0.24]],
      f2: [[2500, 0], [2900, 0.07], [1500, 0.24]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.20,
      srcLp: 4600, breath: 0.24,
    },
    notes: [
      [860, 0, 0.08, 0.28, 1320, { attack: 0.008 }],
      [1300, 0.07, 0.15, 0.24, 700, { vibHz: 9, vibDepth: 14 }],
    ],
  },
  // laugh 连击「狂笑三连」：哈↑哈↑哈↑ 三段递升（640→1020 / 680→1080 / 740→1160），
  // 每段都往上挑才是"笑"，往下掉会读成"叹气"
  laugh: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    formant: {
      src: 'sawtooth', dur: 0.78, gain: 0.58, attack: 0.015, release: 0.12,
      pitch: [[620, 0], [1020, 0.10], [600, 0.19], [680, 0.23], [1080, 0.33], [660, 0.42], [740, 0.47], [1160, 0.58], [700, 0.66], [720, 0.78]],
      vibHz: 8, vibDepth: 12, jitterHz: 16, jitterDepth: 4,
      f1: [[1200, 0], [1500, 0.10], [820, 0.19], [1250, 0.23], [1550, 0.33], [840, 0.42], [1300, 0.47], [1600, 0.58], [860, 0.66], [880, 0.78]],
      f2: [[2400, 0], [2750, 0.10], [1400, 0.19], [2450, 0.23], [2800, 0.33], [1420, 0.42], [2500, 0.47], [2850, 0.58], [1450, 0.66], [1480, 0.78]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.18,
      srcLp: 4200, breath: 0.15,
      amHz: 26, amDepth: 0.16,
    },
    notes: [
      [620, 0, 0.10, 0.26, 1020, { attack: 0.012 }],
      [680, 0.23, 0.10, 0.26, 1080, { attack: 0.012 }],
      [740, 0.47, 0.12, 0.26, 1160, { attack: 0.012 }],
    ],
  },
  // moonwalk 摸头 3 连「太空步」配乐：**四拍独立起音**（repeat: 每拍 0.62s，与动画拍点同钟）。
  // 八版 1.12s 打完四拍（每拍 0.28s ≈ 214BPM），和 1.25s/步的动画完全对不上——用户
  // 「没有节奏感」一半出在这里。九版：一拍 0.62s 起一个短嗷（0.45s 音 + 0.17s 空隙），
  // 四个独立 attack 才有鼓点感（正弦 AM 只做出波浪，做不出拍点）。
  moonwalk: {
    voice: true, lowpass: 3000, partials: [[1, 1], [2, 0.2], [3, 0.06]],
    repeat: { times: 4, gap: 0.62 },
    formant: {
      src: 'sawtooth', dur: 0.45, gain: 0.52, attack: 0.008, release: 0.13,
      pitch: [[620, 0], [900, 0.16], [655, 0.45]],      // 一拍一个"嗷"：起→扬→落
      vibHz: 8, vibDepth: 12, jitterHz: 17, jitterDepth: 5,
      f1: [[1180, 0], [1500, 0.16], [820, 0.45]],
      f2: [[2350, 0], [2750, 0.16], [1380, 0.45]],
      f1Gain: 1.0, f2Gain: 0.55, directGain: 0.18,
      srcLp: 4200, breath: 0.16,
    },
    notes: [
      [620, 0, 0.17, 0.24, 900, { attack: 0.008 }],
      [660, 0.62, 0.17, 0.22, 960, { attack: 0.008 }],
      [700, 1.24, 0.17, 0.24, 1010, { attack: 0.008 }],
      [740, 1.86, 0.30, 0.26, 1080, { attack: 0.008 }],
    ],
  },
};

/** 十一版（2026-11-21）：叫声改为「离线物理模型采样」优先。
 *  锯齿波 + 2 带通的实时合成做不出声门脉冲与 F3/F4 共振峰，怎么调都是电子哨
 *  （一~十版用户全部不满意）。tools/render_voice.py 用 Rosenberg 声门脉冲 +
 *  4 级级联共振峰 + 气声 + 破音离线渲染成 PCM（22.05kHz/单声道/16bit），内嵌在
 *  voice_data.js；运行时 decodeAudioData 解码后用 BufferSource 播——
 *  解码失败 / 旧基础库无 decodeAudioData / Buffer 还没就绪时，自动落回
 *  下面的实时合成（合成配方保留，作为降级路径与测试桩）。 */
const VOICE_DATA = require('./voice_data');
const SAMPLE_MAP = { purr: 'purr', chirp: 'chirp', yelp: 'yelp', laugh: 'laugh', moonwalk: 'step' };

let ac = null;          // AudioContext（懒创建：首次 play 才建，避免启动即占资源）
let failed = false;     // 环境不支持 / 异常 → 后续 play 直接快速返回
let enabled = true;     // 用户开关（默认开）
let voiceUntil = -1;    // 小叫声占线截止时刻（秒，ctx.currentTime 域）——其余音让路

// ---- 采样加载（异步，一次性）：state none→loading→ready/failed ----
let sampleState = 'none';
const sampleBufs = {};

/** base64 → ArrayBuffer（微信环境无 atob，自己解） */
function b64ToArrayBuffer(s) {
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const n = s.length, pad = (s.charAt(n - 1) === '=') ? (s.charAt(n - 2) === '=' ? 2 : 1) : 0;
  const out = new Uint8Array(Math.floor(n / 4) * 3 - pad);
  let o = 0, bits = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const v = CH.indexOf(s.charAt(i));
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.buffer;
}

/** 首次拿到 AudioContext 时启动解码；任一失败→整体降级合成（不重试） */
function loadSamples(a) {
  if (sampleState !== 'none' || !VOICE_DATA) return;
  if (typeof a.decodeAudioData !== 'function') { sampleState = 'failed'; return; }
  sampleState = 'loading';
  const keys = Object.keys(SAMPLE_MAP).map(k => SAMPLE_MAP[k]);   // 注意别把 SR 也当采样解码
  let pending = keys.length;
  keys.forEach(k => {
    try {
      const raw = b64ToArrayBuffer(VOICE_DATA[k]);
      a.decodeAudioData(raw, buf => {
        sampleBufs[k] = buf;
        if (--pending === 0) sampleState = 'ready';
      }, () => { sampleState = 'failed'; });
    } catch (e) { sampleState = 'failed'; }
  });
}

/** 从 PCM（16bit 小端单声道）重建 AudioBuffer（供测试桩 / 无 decodeAudioData 但有
 *  createBuffer 的环境走同步解码；微信 wx.createWebAudioContext 两者都有） */
function pcmToBuffer(a, b64) {
  const u8 = new Uint8Array(b64ToArrayBuffer(b64));
  const n = u8.length >> 1;
  const buf = a.createBuffer(1, n, VOICE_DATA.SR);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = u8[i * 2] | (u8[i * 2 + 1] << 8);
    if (v & 0x8000) v -= 0x10000;
    ch[i] = v / 32768;
  }
  return buf;
}

/** 播采样：kind 已映射到 sample 名；repeat（moonwalk 四拍）按 gap 重复起音。
 *  节点全部建好后再 start：中途异常时不至于「响了半条又补一条合成声」 */
function playSample(spec, a, now) {
  const name = SAMPLE_MAP[spec._kind];
  const buf = sampleBufs[name];
  if (!buf) return false;
  const gap = spec.repeat ? spec.repeat.gap : 0;
  const times = spec.repeat ? spec.repeat.times : 1;
  const nodes = [];
  for (let i = 0; i < times; i++) {
    const s = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = spec.sampleGain || 0.62;
    s.buffer = buf;
    s.connect(g);
    g.connect(a.destination);
    nodes.push({ s, at: now + 0.01 + i * gap });
  }
  nodes.forEach(n => n.s.start(n.at));
  return true;
}

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
  osc.type = type || 'sine';
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

/**
 * 共振峰叫声（六版骨架 + 七版拟真层）：锯齿波声源 + 两个并行带通（F1/F2）随时间滑动，
 * 音色本身完成「嗷→呜」的元音变化。返回是否成功（失败由 play 落回正弦滑音）。
 *
 * 七版拟真（修「合成器味」——纯周期声源 + 窄带共振峰像振荡器，不像活物）：
 *   ① 声源低通 2200Hz：锯齿波高频毛刺先削掉，谐波变圆润；
 *   ② 带通 Q 7 → 4.5：Q 太窄会挑出单频「哨音」，放宽后更像声道共鸣；
 *   ③ jitter 音高微抖：13Hz ±4Hz 的次级随机感扰动（真声带的基频从来不稳定），
 *      叠在 5.5Hz 颤音下面——颤音是「唱」，jitter 是「活」；
 *   ④ 呼吸噪声层：白噪 → 1.2 带宽带通（跟随 F2 末端）→ 低增益垫进 master，
 *      纯周期源再加一点气声，立刻从「电子喵」变「毛绒喵」。
 *   无 createBufferSource 的旧基础库自动跳过噪声层；全部 try/catch 不阻断主声。
 */
function playFormant(spec, a, now) {
  const f = spec.formant;
  const t0 = now + 0.01;
  // 主包络：软起 → 保持 → 释放（exponentialRamp 不接受 0，用 0.0001 收尾）
  const master = a.createGain();
  const rel = f.release || 0.2;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(f.gain, t0 + (f.attack || 0.04));
  master.gain.setValueAtTime(f.gain, t0 + Math.max(f.attack || 0.04, f.dur - rel));
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + f.dur);
  master.connect(a.destination);

  // 声源：锯齿波（谐波结构像声带），音高轮廓 + 颤音 + jitter
  const src = a.createOscillator();
  src.type = f.src || 'sawtooth';
  const pts = f.pitch;
  try { src.frequency.setValueAtTime(pts[0][0], t0); } catch (e) { src.frequency.value = pts[0][0]; }
  if (typeof src.frequency.linearRampToValueAtTime === 'function') {
    for (let i = 1; i < pts.length; i++) src.frequency.linearRampToValueAtTime(pts[i][0], t0 + pts[i][1]);
  }
  if (f.vibHz) {
    try {
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = f.vibHz; lg.gain.value = f.vibDepth;
      lfo.connect(lg); lg.connect(src.frequency);
      lfo.start(t0); lfo.stop(t0 + f.dur + 0.02);
    } catch (e) { /* 颤音失败不影响主声 */ }
  }
  if (f.jitterHz !== 0) {
    // ② jitter：次级音高微扰（13Hz ±4Hz），让基频永远「不完全稳定」
    try {
      const jl = a.createOscillator(), jg = a.createGain();
      jl.frequency.value = f.jitterHz || 13; jg.gain.value = f.jitterDepth || 4;
      jl.connect(jg); jg.connect(src.frequency);
      jl.start(t0); jl.stop(t0 + f.dur + 0.02);
    } catch (e) { /* jitter 失败不影响主声 */ }
  }
  src.start(t0); src.stop(t0 + f.dur + 0.02);

  // ① 声源低通：削锯齿毛刺（谐波圆润），F1/F2/直通都从低通后取
  let voice = src;
  if (f.srcLp !== 0 && typeof a.createBiquadFilter === 'function') {
    try {
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = f.srcLp || 2200; lp.Q.value = 0.7;
      src.connect(lp);
      voice = lp;
    } catch (e) { voice = src; }
  }

  // ② 两个共振峰带通 + 直通垫底（并行，各占一份响度）；Q 4.5 = 声道共鸣不是哨音
  const mkFormant = (contour, g) => {
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4.5;
    try { bp.frequency.setValueAtTime(contour[0][0], t0); } catch (e) { bp.frequency.value = contour[0][0]; }
    if (typeof bp.frequency.linearRampToValueAtTime === 'function') {
      for (let i = 1; i < contour.length; i++) bp.frequency.linearRampToValueAtTime(contour[i][0], t0 + contour[i][1]);
    }
    const vg = a.createGain(); vg.gain.value = g;
    voice.connect(bp); bp.connect(vg); vg.connect(master);
  };
  mkFormant(f.f1, f.f1Gain);
  mkFormant(f.f2, f.f2Gain);
  const dg = a.createGain(); dg.gain.value = f.directGain;
  voice.connect(dg); dg.connect(master);

  // ④ 呼吸噪声层：白噪 → 宽带通（跟 F2 末端）→ 低增益，纯周期源之外的「气声」。
  // 默认 0.12（所有叫声都垫气声）；snore 显式调低（呼噜浑厚不需要）。
  const breathAmt = f.breath !== undefined ? f.breath : 0.12;
  if (breathAmt && typeof a.createBufferSource === 'function' && typeof a.createBuffer === 'function') {
    try {
      const sr = a.sampleRate || 44100;
      const len = Math.max(64, Math.ceil(sr * (f.dur + 0.05)));
      const buf = a.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const ns = a.createBufferSource(); ns.buffer = buf;
      const nbp = a.createBiquadFilter();
      nbp.type = 'bandpass'; nbp.Q.value = 1.2;
      nbp.frequency.value = f.f2[f.f2.length - 1][0] * 0.85;
      const ng = a.createGain(); ng.gain.value = f.gain * breathAmt;
      ns.connect(nbp); nbp.connect(ng); ng.connect(master);
      ns.start(t0); ns.stop(t0 + f.dur + 0.02);
    } catch (e) { /* 噪声层失败不影响主声 */ }
  }

  // 喉震（AM）：咕噜垫底
  if (f.amHz) {
    try {
      const am = a.createOscillator(), ag = a.createGain();
      am.frequency.value = f.amHz;
      ag.gain.value = f.gain * f.amDepth;
      am.connect(ag); ag.connect(master.gain);
      am.start(t0); am.stop(t0 + f.dur + 0.02);
    } catch (e) { /* AM 失败不影响主声 */ }
  }
}

/** 播一个音：kind ∈ pick | pass | fail | purr | chirp | yelp | snore | laugh。返回是否真的发声 */
function play(kind) {
  if (!enabled) return false;
  const spec = SFX[kind];
  if (!spec) return false;
  const a = ensureCtx();
  if (!a) return false;
  try {
    const now = typeof a.currentTime === 'number' ? a.currentTime : 0;
    // 背景声处理：小老虎叫声占线时，其余玩法音让路（叫声不被混成背景）
    const total = spec.repeat
      ? spec.repeat.gap * (spec.repeat.times - 1) + (spec.formant ? spec.formant.dur : 0)
      : (spec.formant ? spec.formant.dur : Math.max.apply(null, spec.notes.map(n => n[1] + n[2])));
    if (!spec.voice && now < voiceUntil) return false;
    // iOS / 微信：上下文可能处于 suspended，需在用户手势链上 resume
    if (a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* resume 失败不阻断发声尝试 */ }
    }
    // 十一版：采样优先（物理模型离线渲染，听感远好于实时合成）；没就绪/失败落回合成
    loadSamples(a);
    if (sampleState === 'ready') {
      spec._kind = kind;
      try {
        if (playSample(spec, a, now)) {
          if (spec.voice) voiceUntil = now + total + 0.05;
          return true;
        }
      } catch (e) { /* 落回实时合成 */ }
    }
    // 节奏型音效（repeat）：同一配方按 gap 间隔重复起音——每次都有独立 attack，
    // 才有鼓点那种"打"的冲击；正弦振幅调制（amHz）只做得出波浪，做不出拍点。
    if (spec.repeat && spec.formant && typeof a.createBiquadFilter === 'function') {
      try {
        for (let i = 0; i < spec.repeat.times; i++) playFormant(spec, a, now + i * spec.repeat.gap);
        if (spec.voice) voiceUntil = now + total + 0.05;
        return true;
      } catch (e) { /* 落回下面的单次路径 */ }
    }
    // 六版：共振峰叫声优先（有 BiquadFilter 能力时）；异常则落回正弦滑音
    if (spec.formant && typeof a.createBiquadFilter === 'function') {
      try {
        playFormant(spec, a, now);
        if (spec.voice) voiceUntil = now + total + 0.05;
        return true;
      } catch (e) { /* 落回 notes 正弦滑音 */ }
    }
    const partials = spec.partials || (spec.overtone ? [[1, 1], [spec.overtone.ratio, spec.overtone.gain]] : [[1, 1]]);
    // 低通：把小老虎叫声的高频毛刺削掉（幼兽声音是"闷"的）。旧基础库无 BiquadFilter 时自动跳过。
    let sink = a.destination;
    if (spec.lowpass && typeof a.createBiquadFilter === 'function') {
      try {
        const f = a.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = spec.lowpass;
        f.Q.value = 0.7;
        f.connect(a.destination);
        sink = f;
      } catch (e) { sink = a.destination; }
    }
    for (const n of spec.notes) {
      const freq = n[0], delay = n[1], dur = n[2], peak = n[3], freqEnd = n[4];
      const opts = n[5] || {};
      const t0 = now + 0.01 + delay;
      // 谐波堆叠：第 1 项为主音（ratio 1），其余为泛音；每项都与主音同包络
      const voices = [];
      for (const p of partials) {
        const v = spawnOsc(a, t0, dur, peak * p[1], freq * p[0],
          freqEnd ? freqEnd * p[0] : 0, spec.type, opts.attack);
        if (v) voices.push(v);
      }
      if (!voices.length) continue;
      const main = voices[0];
      voices.forEach(v => v.gain.connect(sink));
      voices.forEach(v => { v.osc.start(t0); v.osc.stop(t0 + dur + 0.02); });
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
