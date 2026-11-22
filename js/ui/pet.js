'use strict';
/**
 * 小诗童触摸互动（2026-11-20 用户需求；同日三版「沙雕出圈」）：
 * 摸头 / 摸肚子 / 挠脚（对局页半身像为头/爪两区）。
 *
 * 三版动作设计（中规中矩出不了圈 → 保留萌点、加大沙雕梗）：
 *  - 摸头「蹭 → 化成虎饼 → 啵弹回」：0–0.46 贴手蹭（歪头 + 轻揉），0.46–0.70 被摸化
 *    ——整只塌下去但**不是压成贴纸**（十二版 sy 0.56 贴地 + 头顶 Zzz；旧版 0.30 太矮），
 *    0.80 起过冲弹回（sy 冲到 1.07 再回 1），弹回瞬间冒「啵☆」。猫被摸舒服了会"化"。
 *  - 摸肚「惊炸弹起 → 抖毛 → 害羞扭」：肚子是禁区（反差萌）——0–0.18 瞬间弹起
 *    （放大 1.12 + dy -20），0.18–0.6 落地快速抖毛（squash 抖两下 + 「!!」），
 *    0.6–1 害羞小碎步扭两下。
 *  - 挠脚/爪「蹬上天 + 哈哈哈」：先蹲 0.16，随后弹到 22px（原 14），落地颠两下；
 *    特效「哈哈哈」三字错峰上浮——被挠痒的"狂笑"体感。
 *  - 连击彩蛋（出圈钩子）：同部位 3s 内连续触发 ≥3 次 → 过载模式：动作幅度 ×1.5、
 *    金色星星环、特殊音效（摸头=打呼噜 snore / 摸肚·挠脚=狂笑 laugh）。
 *
 * 设计约束（不变）：
 *  - 零图片零音频资产：反馈 = 程序化粒子 + transform；声音走 sound.js 合成；
 *  - offset() 返回 {dx,dy,rot,sx,sy}，屏侧以盒底立足点为支点做 rotate+scale
 *    （盒底支点 = 压扁自动贴地，"化饼"天然成立）；
 *  - 冷却按区：头 450ms / 其余 600ms；玩家决策热区优先（pet.* 追加在 hotRects 末尾）。
 */

const COOLDOWN_HEAD = 0.45;             // 摸头：短冷却，支持连续撸
const COOLDOWN_OTHER = 0.6;             // 其余部位
const LIFE = { head: 1.5, belly: 1.1, foot: 1.0, paw: 1.0 };        // 常规动画时长
const LIFE_COMBO = { head: 5.0, belly: 1.3, foot: 1.5, paw: 1.5 };  // 彩蛋时长（摸头=5 秒太空步）
const STREAK_WIN = 3;     // 连击次数阈值（过载模式）
const STREAK_TTL = 3;     // 连击计时窗口（秒）
const MOONWALK_CYCLE = 1.24; // 一个完整循环（左右各一次滑步）= 2 拍
const MOONWALK_STEP = 0.62; // 一拍 = 一次滑步 = 0.62s（≈97BPM，接近 Billie Jean 的 117BPM）
const MW_SPAN = 20;         // 单脚滑程半幅（原生单位；与渲染器 drawMoonwalkLegs 同值，±20 ≈ 脚程不脱出身体轮廓）

// 摸头三段与形变深度：**offset 与特效层共用**（旧版两处各写一份 0.5/0.78，
// 改动画时特效层的 Zzz/啵会错位——单一真源，改一处即可）
const HEAD_M0 = 0.44;       // 蹭止（开始化饼）
const HEAD_M1 = 0.68;       // 化透
const HEAD_B0 = 0.76;       // 弹回起点（留 0.36s 给弹回，太快会读成「闪一下」）
const HEAD_DEEP = 0.56;     // 化饼深度：sy 塌到 0.56（0.30 只有三分之一高，太夸张）
const HEAD_WIDE = 1.20;     // 化饼横向鼓起
const HEAD_PEAK = 1.07;     // 弹回过冲峰

// ---- 缓动（十二版「再丝滑一点」的地基）----
// 旧版每段都是 sin 或平方曲线，段与段之间**速度不连续**：蹭手停下的瞬间 rot 从
// 0.09 直接归零、化饼到顶时速度突然截断、下蹲结束 dy 从 5px 跳到 0（肉眼可见的一顿）。
// 统一改成两端速度为 0 的缓动，并保证相邻段「末值=首值」，接缝处才没有顿挫。
/** 三次平滑：首尾速度均为 0（小形变够用） */
function smooth(x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  return x * x * (3 - 2 * x);
}
/** 五次平滑：首尾的速度、加速度都为 0（化饼/弹回这类大形变用它，收放都不顿） */
function smoother(x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
/** 峰形 0→1→0：幂 >1 时两端速度为 0（跳跃/弹起用它，起跳和落地都不「啪」） */
function hump(x, k) {
  const s = Math.sin(Math.PI * (x < 0 ? 0 : (x > 1 ? 1 : x)));
  return Math.pow(s, k || 1.5);
}

/**
 * 单只脚在太空步循环里的位置（原生坐标，与渲染器同一套公式）。
 * 局部相位 [0,0.5) = 整掌贴地、向后拖；[0.5,1) = 踮脚点地、向前摆。
 * @param {number} ph 局部相位 0..1
 * @param {0|1} i 0=左脚 1=右脚
 * @returns {{x:number, flat:boolean}}
 */
function moonwalkFoot(ph, i) {
  const lp = ((ph % 1) + 1) % 1;
  const baseX = i === 0 ? 122 : 278;
  if (lp < 0.5) return { x: baseX - MW_SPAN + 2 * MW_SPAN * (lp / 0.5), flat: true };
  return { x: baseX + MW_SPAN - 2 * MW_SPAN * ((lp - 0.5) / 0.5), flat: false };
}

/**
 * 太空步整体姿态（九版 v3）。
 * 八版为什么"不像"：把整体位移做成左右往返滑移（读作摇晃），两条腿都是平掌在空中摆
 * （读作蹦跳），还挂了个「太空步！」字幕——靠文字解释动作，动作本身没成立。
 * 九版按真实舞步（wikiHow/维基：一脚整掌贴地后拖、另一脚踮脚点地且不离地、上身不颠）：
 *   ① 身体**不位移**：改由地面斜刻度滚动表达"在滑"（treadmill）——到位就没有回弹跳帧；
 *   ② 重心在两只脚之间转移 → 上身只有 ±0.024rad 的微倾（不是后仰，后仰像要倒）；
 *   ③ 不上下颠（dy 恒 0）、不变形（sy 恒 1），"飘"就是靠这两条。
 * @param {number} t 彩蛋已进行秒数（相位与地面滚动都由它推，保证地面只往一个方向走）
 * @param {number} sc 小虎缩放（原生 560 高 → 屏幕）
 * @returns {{cyc:number, dx:number, lean:number, scroll:number, feet:Array, dir:number}}
 */
function moonwalkPose(t, sc) {
  const tt = Math.max(0, t);
  const c = (((tt / MOONWALK_CYCLE) % 1) + 1) % 1;
  const u = (tt / MOONWALK_STEP) % 1;            // 拍内相位
  const k = Math.max(0.55, sc * 3);              // 屏幕尺度归一（首页 sc≈0.3 → k≈0.9）
  const env = Math.exp(-u * 9);                  // 拍点重音包络：起手即满、快速衰减
  return {
    cyc: c,
    u,
    dx: 0,
    // 拍点沉降：每拍下压 2px 后指数回弹——节奏靠这一次"压"，不是走路那种持续 bob
    dy: 2.0 * k * env,
    // 压扁同步（体积感）：拍点 1.8% → 回 1，配合 dy 读成"踩下去那一下"
    squash: 1 - 0.018 * env,
    lean: 0.022 * Math.cos(c * Math.PI * 2),
    // 地面滚动 = 脚程（略快 15% 让小屏也看得出在走），按绝对时间累计 → 只往一个方向
    scroll: tt * (2 * MW_SPAN / MOONWALK_STEP) * 1.15 * sc,
    feet: [moonwalkFoot(c, 0), moonwalkFoot((c + 0.5) % 1, 1)],
    dir: -1,
  };
}

/**
 * 由小虎可见盒算互动热区。
 * @param {'full'|'bust'} kind full=全身立绘（首页/结算：头/肚/脚）；bust=对局半身窗（头/爪）
 * @param {{x:number,y:number,w:number,h:number}} box 小虎在屏幕上的可见盒
 * @returns {Array<{id:string,x:number,y:number,w:number,h:number}>}
 */
function petZones(kind, box) {
  if (kind === 'bust') {
    // 半身窗原生 (40,44,320,346)：头 44–290（占窗 0–0.71），爪 296–372（0.73–1）
    return [
      { id: 'pet.head', x: box.x, y: box.y, w: box.w, h: box.h * 0.68 },
      { id: 'pet.paw', x: box.x + box.w * 0.12, y: box.y + box.h * 0.68, w: box.w * 0.76, h: box.h * 0.32 },
    ];
  }
  // 全身原生高 560：头 60–380（≈0–0.57），身/肚 380–470（0.57–0.74），脚/尾 470–560（0.74–1）
  return [
    { id: 'pet.head', x: box.x, y: box.y, w: box.w, h: box.h * 0.54 },
    { id: 'pet.belly', x: box.x + box.w * 0.18, y: box.y + box.h * 0.54, w: box.w * 0.64, h: box.h * 0.22 },
    { id: 'pet.foot', x: box.x + box.w * 0.12, y: box.y + box.h * 0.76, w: box.w * 0.76, h: box.h * 0.24 },
  ];
}

/** 该次互动的配音（连击彩蛋换沙雕音）：屏侧统一 sound.play(pet.soundFor(zone)) */
function soundFor(zone, combo) {
  if (zone === 'head') return combo ? 'moonwalk' : 'purr';
  if (zone === 'belly') return combo ? 'laugh' : 'yelp';
  return combo ? 'laugh' : 'chirp';   // foot / paw
}

/** 每屏一个实例 */
function create() {
  let fx = null;          // {zone, t, cx, cy, scale, dir, combo, amp, life, boxW, kind}
  let coolZone = null;    // 冷却中的部位 id
  let coolT = 0;          // 冷却剩余秒
  let box = null;         // 当前小虎可见盒（供特效锚点）
  let boxKind = 'full';   // 'full' 全身立绘 / 'bust' 对局半身窗（决定地面痕迹画不画）
  let dir = 1;            // 蹭的方向（交替，左右歪头有变化）
  let clock = 0;          // 实例内部时钟（连击窗口计时）
  let streak = { zone: null, n: 0, at: -9 };   // 连击状态

  return {
    petZones,   // 模块级函数挂到实例上，屏侧统一走 pet.* 一个命名空间
    soundFor,
    /** 各屏 build/enter 时同步小虎盒（kind：半身窗不画地面参照） */
    setBox(b, kind) { box = b; boxKind = kind || 'full'; },

    /**
     * 触发互动。命中冷却或动画未结束时返回 false（屏据此决定是否发声/埋点）。
     * 同区 STREAK_TTL 秒内累计触发 ≥STREAK_WIN 次 → 过载模式（幅度放大 + 特殊音）。
     * @param {'head'|'belly'|'foot'|'paw'} zone
     */
    trigger(zone) {
      if (!box) return false;
      const cool = zone === 'head' ? COOLDOWN_HEAD : COOLDOWN_OTHER;
      if (coolT > 0 && coolZone === zone) return false;
      coolZone = zone;
      coolT = cool;
      dir = -dir;
      // 连击计数：同区且在窗口内累加，否则重新计
      if (streak.zone === zone && clock - streak.at <= STREAK_TTL) streak.n += 1;
      else streak = { zone, n: 1, at: clock };
      const combo = streak.n >= STREAK_WIN;
      // 特效锚点（屏幕坐标）：头=盒顶中心，肚=盒中心，脚/爪=盒底中心
      const anchor = zone === 'head' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.16 }
        : zone === 'belly' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.62 }
        : { x: box.x + box.w / 2, y: box.y + box.h * 0.88 };
      const life = (combo ? LIFE_COMBO : LIFE)[zone] || 1.0;
      fx = { zone, t: 0, x: anchor.x, y: anchor.y, scale: box.h / 560, dir, combo, amp: combo ? 1.5 : 1, life,
        boxW: box.w, kind: boxKind };
      return true;
    },

    update(dt) {
      clock += dt;
      if (coolT > 0) { coolT -= dt; if (coolT <= 0) { coolT = 0; coolZone = null; } }
      if (fx) { fx.t += dt; if (fx.t > fx.life) fx = null; }
    },

    /** 离屏清理（动画/冷却/连击全部归零） */
    reset() { fx = null; coolZone = null; coolT = 0; streak = { zone: null, n: 0, at: -9 }; },

    /**
     * 状态覆盖：摸头常规（含化饼）→ 'pet'（眯眼享受/融化）；摸头 3 连太空步 → null
     * （张嘴笑酷滑步，眯眼滑不像）；肚/脚惊跳保持睁眼 → null。
     */
    stateOverride() {
      if (!fx) return null;
      if (fx.zone === 'head' && !fx.combo) return 'pet';
      return null;
    },

    /**
     * 姿态 + 相位（八版）：屏侧统一 `const pz = pet.pose()` 再喂给 tiger.fullBody。
     * 太空步需要把步频相位传给渲染器（腿的贴地相与整体位移必须同频，否则脚会"打滑"）。
     */
    pose() {
      if (fx && fx.zone === 'head' && fx.combo) {
        return { state: 'moonwalk', phase: ((fx.t / MOONWALK_CYCLE) % 1 + 1) % 1 };
      }
      return { state: this.stateOverride(), phase: 0 };
    },

    /**
     * 小虎绘制 transform（区内衰减，之外归零）。支点=盒底中心（屏侧实现）。
     *  - head：蹭（rot+dx 贴手）→ 化饼（sy 0.56/sx 1.20 贴地）→ 啵弹回（过冲 1.07）；
     *  - belly：惊跳（-20px + 放大 1.12）→ 抖毛（squash 快抖）→ 害羞扭；
     *  - foot/paw：蹲 → 高蹬（-22px）→ 颠两下；连击=原地陀螺（rot 连转）。
     * 返回 {dx,dy,rot,sx,sy}，sx/sy=1 时屏侧可跳过 scale。
     */
    offset() {
      if (!fx) return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
      const z = fx.zone, p = Math.min(fx.t / fx.life, 1), sc = fx.scale, d = fx.dir, A = fx.amp;
      if (z === 'head') {
        const M0 = HEAD_M0, M1 = HEAD_M1, B0 = HEAD_B0;
        if (fx.combo) {
          // 3 连彩蛋「5 秒太空步」v3：身体不位移（地面在走），只有重心微倾——
          // 位移交给地面刻度，才不会出现末尾"滑回去"的回弹帧。
          const mw = moonwalkPose(fx.t, sc);
          return {
            dx: mw.dx, dy: mw.dy, rot: mw.lean,
            sx: 1 + (1 - mw.squash) * 0.7,   // 压扁时横向补一点（体积守恒）
            sy: mw.squash,
          };
        }
        // 十二版：化饼深度 0.30 → 0.56（模块常量 HEAD_DEEP）。sy=0.30 只有三分之一高，
        // 读成"被压扁的贴纸"而不是"化成一坨"（用户：太夸张了、太矮了）。
        const DEEP = HEAD_DEEP, WIDE = HEAD_WIDE, PEAK = HEAD_PEAK;
        if (p < M0) {
          // 蹭：包络 0–0.12 贴上去（平滑入），末尾揉动收力（不在 M0 处硬停）
          const env = smooth(p / 0.12);
          const rub = Math.sin(fx.t * 9) * 0.02 * env * smooth((M0 - p) / 0.07);
          return { dx: d * 6 * env, dy: 0, rot: d * 0.07 * env + rub, sx: 1, sy: 1 };
        }
        if (p < M1) {
          // 化饼：贴手那点歪头和位移随塌陷一起**平滑收回**（首尾速度 0），不硬切
          const q = smoother((p - M0) / (M1 - M0));
          return {
            dx: d * 6 * (1 - q), dy: 0, rot: d * 0.07 * (1 - q),
            sx: 1 + (WIDE - 1) * q, sy: 1 - (1 - DEEP) * q,
          };
        }
        if (p < B0) {
          // 化透停顿：贴地饼状，头顶 Zzz（特效层）
          return { dx: 0, dy: 0, rot: 0, sx: WIDE, sy: DEEP };
        }
        // 弹回：DEEP → 过冲峰 → 1，两段五次平滑（顶点处速度本来为 0，接缝无顿）
        const q = (p - B0) / (1 - B0);
        const sy = q < 0.55
          ? DEEP + (PEAK - DEEP) * smoother(q / 0.55)
          : PEAK - (PEAK - 1) * smoother((q - 0.55) / 0.45);
        const sx = WIDE - (WIDE - 1) * smoother(q / 0.75);
        return { dx: 0, dy: 0, rot: 0, sx, sy };
      }
      if (z === 'belly') {
        const J = 0.20, S = 0.58;
        const lift = 18 * sc * A, grow = 0.10 * A;
        if (p < J) {
          // 惊跳：峰形两端速度为 0（起跳/落地的瞬间都不「啪」）
          const j = hump(p / J, 1.4);
          return { dx: 0, dy: -lift * j, rot: 0, sx: 1 + grow * j, sy: 1 + grow * j };
        }
        if (p < S) {
          // 落地抖毛：快抖两下，起手淡入、幅度按幂次衰减（末尾速度为 0）
          const q = (p - J) / (S - J);
          const sq = Math.sin(q * Math.PI * 2) * Math.pow(1 - q, 1.2) * smooth(q / 0.12);
          // dx 也淡入：旧版从 0 直接跳到 ±3px（接缝实测 2.99 的硬位移）
          return { dx: d * 3 * (1 - q) * (1 - q) * smooth(q / 0.25), dy: 0, rot: 0,
            sx: 1 + 0.05 * A * sq, sy: 1 - 0.07 * A * sq };
        }
        // 害羞小碎步扭两下（淡入 + 幂衰减，接缝与末值都平滑归零）
        const q = (p - S) / (1 - S);
        const decay = Math.pow(1 - q, 1.4) * smooth(q / 0.16);
        const sq = Math.sin(q * Math.PI * 2) * decay;
        return { dx: 0, dy: 0, rot: Math.sin(q * Math.PI * 2) * 0.05 * decay,
          sx: 1 + 0.03 * sq, sy: 1 - 0.04 * sq };
      }
      // foot / paw：蹲 → 蹬（弧线跨过蹲深，不再从 5px 直接跳 0）→ 落地颠两下
      const C = 0.18, K = 0.55;
      const dip = 5 * sc, lift = 22 * sc * A;
      if (p < C) {
        const q = smoother(p / C);
        return { dx: 0, dy: dip * q, rot: 0, sx: 1 + 0.045 * q, sy: 1 - 0.07 * q };
      }
      if (p < K) {
        const q = (p - C) / (K - C);
        const arc = hump(q, 1.5);
        if (fx.combo) {
          // 过载：原地转一整圈（2π，落地必定正立）+ 高弹；用五次平滑加速/减速，
          // 旧版匀速转 3π 在落地瞬间硬停且停在倒立位
          return {
            dx: 0, dy: dip * (1 - smoother(q)) - 24 * sc * arc,
            rot: d * Math.PI * 2 * smoother(q),
            sx: 1, sy: 1 + 0.05 * arc,
          };
        }
        return {
          dx: 0,
          dy: dip * (1 - smooth(q)) - lift * arc,   // 蹲深平滑卸掉 + 弧线起跳
          rot: d * 0.09 * arc,
          sx: 1 + 0.045 * (1 - q) - 0.03 * arc,     // 蹲时的横向鼓起随起跳收回
          sy: 1 - 0.07 * (1 - q) + 0.06 * arc,      // 蹲扁 → 拉伸 → 落地回正
        };
      }
      // 落地颠两下：sin² 起手速度为 0（不弹跳硬切），幂次衰减
      const q = (p - K) / (1 - K);
      return { dx: 0, dy: Math.pow(Math.sin(Math.PI * 2 * q), 2) * 3 * sc * Math.pow(1 - q, 1.5), rot: 0, sx: 1, sy: 1 };
    },

    /**
     * 叠加特效（在各屏绘制完小虎后调用）。
     * head=心心音符 → 化饼期 Zzz → 弹回「啵☆」 / belly=「!!」+ 波纹 /
     * foot·paw=星花 + 「哈哈哈」三连。连击=金星环。alpha ≤0.9、数量 ≤6。
     */
    draw(ctx) {
      if (!fx) return;
      const p = Math.min(fx.t / fx.life, 1);
      const fade = 1 - p;
      ctx.save();
      const S3 = fx.scale * 3;
      if (fx.zone === 'head') {
        const M0 = HEAD_M0, M1 = HEAD_M1, B0 = HEAD_B0;
        const DEEP = HEAD_DEEP, PEAK = HEAD_PEAK;
        if (fx.combo) {
          // 太空步特效 v3（九版）：用户「不要用文字提示，要让人从动作上看出来」——
          // 删掉「太空步！」字幕与 ♪ 音符（靠文字解释动作 = 动作没成立），改由
          // **地面参照系**承担"在滑"的信息：
          //   ① 地面线 + 斜刻度随滑行滚动：身体钉住、地面在走 → 滑步的错觉；
          //   ② 贴地那只脚后方拖一条擦地痕（跟着脚走，不是画在固定点）；
          //   ③ 影子钉在脚下、不上下（影子不动 = 身体没跳，是飘着滑）；
          //   ④ 每半循环换脚时点一撮尘：节奏感来自脚，不来自字幕。
          const sc2 = fx.scale, S = 0.6 + sc2;
          const mw = moonwalkPose(fx.t, sc2);
          const cyc = mw.cyc;
          // 脚底 y：头锚点在盒高 16%（原生 89.6），脚底 536 → 偏移 446
          const gy = fx.y + 446 * sc2;
          const cx = fx.x;
          const oval = (x, y, rx, ry) => {
            ctx.beginPath();
            if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            else ctx.arc(x, y, (rx + ry) / 2, 0, Math.PI * 2);
          };
          const fadeIn = Math.min(1, p / 0.06) * Math.max(0, 1 - Math.max(0, p - 0.94) * 16);

          if (fx.kind !== 'bust') {
            const hw = 96 * S;
            ctx.strokeStyle = 'rgba(107,68,35,0.95)';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.34 * fadeIn;
            ctx.beginPath(); ctx.moveTo(cx - hw, gy); ctx.lineTo(cx + hw, gy); ctx.stroke();
            // 斜刻度：随 scroll 右移（旅行方向是左，地面相对向右）
            const gap = 17 * S;
            const off = mw.scroll % gap;
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            for (let k = -6; k <= 6; k++) {
              const tx = cx + k * gap + off;
              if (tx < cx - hw || tx > cx + hw) continue;
              const edge = 1 - Math.abs(tx - cx) / hw;
              ctx.globalAlpha = 0.46 * edge * fadeIn;
              ctx.beginPath();
              ctx.moveTo(tx, gy + 1);
              ctx.lineTo(tx - 4.5 * S, gy + 6 * S);
              ctx.stroke();
            }
          }

          // ③ 影子：钉在脚下中心，随拍点脉动（踩下去那一下影子铺开，读得出重音）
          const bp0 = Math.exp(-mw.u * 9);
          ctx.globalAlpha = (0.20 + 0.10 * bp0) * fadeIn;
          ctx.fillStyle = '#3A2410';
          oval(cx, gy + 1, 54 * sc2 * (1 + 0.10 * bp0), 8 * sc2 * (1 + 0.10 * bp0));
          ctx.fill();

          // ② 擦地痕：贴地那只脚的后方（+x），从脚后缘往后拖
          for (let i = 0; i < 2; i++) {
            const f = mw.feet[i];
            if (!f.flat) continue;
            const fxc = cx + (f.x - 200) * sc2;
            const tail = fxc + 30 * sc2;
            const len = 28 * S;
            ctx.strokeStyle = 'rgba(168,104,42,0.95)';
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.34 * fadeIn;
            ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.moveTo(tail, gy + 2); ctx.lineTo(tail + len, gy + 2); ctx.stroke();
            ctx.globalAlpha = 0.16 * fadeIn;
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(tail + 4 * S, gy + 7 * S); ctx.lineTo(tail + len * 0.7, gy + 7 * S); ctx.stroke();
          }

          // ④ 拍点（每 0.62s 一次）：落地脚下光环 + 三粒尘——节奏看脚，不看字幕。
          //    用 mw.u（拍内相位）而不是循环相位：一拍一次，和配乐的鼓点严格同拍。
          const nf = mw.feet[0].flat ? mw.feet[0] : mw.feet[1];
          const bxc = cx + (nf.x - 200) * sc2;
          if (mw.u < 0.30) {
            const bp = mw.u / 0.30;
            ctx.globalAlpha = (1 - bp) * 0.55 * fadeIn;
            ctx.strokeStyle = 'rgba(228,186,118,0.95)';
            ctx.lineWidth = 2;
            oval(bxc, gy + 2, (10 + bp * 24) * S, (3.6 + bp * 7) * S);
            ctx.stroke();
            ctx.fillStyle = 'rgba(206,170,116,0.9)';
            for (let k = 0; k < 3; k++) {
              const a = (k / 3) * Math.PI * 2 + cyc * 9;
              ctx.globalAlpha = (1 - bp) * 0.42 * fadeIn;
              ctx.beginPath();
              ctx.arc(bxc + Math.cos(a) * (7 + bp * 13) * S, gy - bp * 8 * S + Math.sin(a) * 3 * S,
                1.9 * S, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          return;
        }
        if (p < M0) {
          // 蹭：心心/音符上浮
          const marks = ['♥', '♪', '♥'];
          for (let i = 0; i < 3; i++) {
            const lp = Math.max(0, Math.min(1, p * 1.9 - i * 0.14));
            if (lp <= 0 || lp >= 1) continue;
            const sway = Math.sin(lp * Math.PI * 2 + i * 2) * 6;
            ctx.globalAlpha = (1 - lp) * 0.9;
            ctx.fillStyle = i === 1 ? 'rgba(184,115,51,0.9)' : 'rgba(214,69,69,0.85)';
            ctx.font = Math.round(13 + fx.scale * 8) + 'px serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(marks[i], fx.x + (i - 1) * 16 * S3 + sway, fx.y - 14 - lp * 26 * S3);
          }
        } else if (p < B0) {
          // 化饼：头顶 Zzz（三字错峰、越化越省略号）。
          // 十二版：Zzz 跟着**压扁后的头顶**走——旧版按未压扁的盒顶锚定，
          // 一塌下去字符就悬在半空（sy 0.3 时差 118px，肉眼是"字飘了"）。
          const mp = (p - M0) / (B0 - M0);
          const syNow = p < M1 ? 1 - (1 - DEEP) * smoother((p - M0) / (M1 - M0)) : DEEP;
          const hy = fx.y + 470.4 * fx.scale * (1 - syNow);   // 0.84×560×scale：头顶到盒底
          for (let i = 0; i < 3; i++) {
            const lp = Math.max(0, Math.min(1, mp * 1.5 - i * 0.22));
            if (lp <= 0 || lp >= 1) continue;
            ctx.globalAlpha = (1 - lp) * 0.85;
            ctx.fillStyle = 'rgba(120,110,100,0.9)';
            ctx.font = Math.round((11 + i * 2) * (0.8 + fx.scale)) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('Z', fx.x + (i + 1) * 10 * (0.6 + fx.scale) + lp * 4, hy - 8 - (i * 12 + lp * 14) * (0.6 + fx.scale));
          }
        } else {
          // 弹回：「啵」大字 + 金色星（combo 加星环）；起点仍贴着饼顶，随弹起一起抬
          const bp = (p - B0) / (1 - B0);
          const syNow = bp < 0.55
            ? DEEP + (PEAK - DEEP) * smoother(bp / 0.55)
            : PEAK - (PEAK - 1) * smoother((bp - 0.55) / 0.45);
          const hy = fx.y + 470.4 * fx.scale * (1 - syNow);
          ctx.globalAlpha = (1 - bp) * 0.95;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round((16 + fx.scale * 10) * (1 + bp * 0.6)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('啵', fx.x, hy - 20 * S3 - bp * 18);
          if (fx.combo) starRing(ctx, fx.x, fx.y + 30 * S3, bp, S3);
        }
      } else if (fx.zone === 'belly') {
        // 「!!」惊跳字 + 波纹（抖毛期两圈扩散）
        if (p < 0.35) {
          const lp = Math.min(p / 0.35, 1);
          ctx.globalAlpha = (1 - lp) * 0.95;
          ctx.fillStyle = 'rgba(214,69,69,0.95)';
          ctx.font = 'bold ' + Math.round((18 + fx.scale * 10) * (1 + lp * 0.3)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!!', fx.x, fx.y - 30 * S3 - lp * 20);
        } else {
          for (let i = 0; i < 2; i++) {
            const lp = Math.max(0, Math.min(1, (p - 0.3) * 1.6 - i * 0.25));
            if (lp <= 0 || lp >= 1) continue;
            ctx.globalAlpha = (1 - lp) * 0.5;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, (8 + lp * 26) * S3, 0, Math.PI * 2);
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(184,115,51,0.8)'; ctx.stroke();
          }
        }
        if (fx.combo) starRing(ctx, fx.x, fx.y, p, S3);
      } else {
        // 挠脚：星花迸开 + 「哈哈哈」三字错峰上浮
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2;
          const r0 = 6 * S3, r1 = (6 + p * 16) * S3;
          ctx.globalAlpha = fade * 0.8;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
          ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,195,60,0.9)'; ctx.stroke();
        }
        const hs = ['哈', '哈', '哈'];
        for (let i = 0; i < 3; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.5 - i * 0.16));
          if (lp <= 0 || lp >= 1) continue;
          ctx.globalAlpha = (1 - lp) * 0.9;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round((13 + fx.scale * 7) * (1 + i * 0.12)) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(hs[i], fx.x + (i - 1) * 20 * (0.5 + fx.scale), fx.y - 30 * S3 - lp * 30 * (0.6 + fx.scale) - i * 6);
        }
        if (fx.combo) starRing(ctx, fx.x, fx.y, p, S3);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    /** 测试/调试钩子 */
    _fx() { return fx; },
    _streak() { return streak; },
  };
}

/** 金色星星环（连击过载标记）：6 颗小星从中心扩散 */
function starRing(ctx, x, y, p, S3) {
  if (p <= 0 || p >= 1) return;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + p * 1.2;
    const r = (10 + p * 30) * S3;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.fillStyle = 'rgba(242,195,60,0.95)';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.6 * (0.6 + S3 * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
}

const api = { petZones, create, soundFor, COOLDOWN_HEAD, COOLDOWN_OTHER, LIFE, LIFE_COMBO, STREAK_WIN, STREAK_TTL, MOONWALK_STEP, MOONWALK_CYCLE, moonwalkPose };
// 双端导出：小游戏 require（module.exports）+ 浏览器预览页（window.Pet）
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)).Pet = api;
