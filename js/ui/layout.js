'use strict';
/**
 * 三屏坐标表（10_ui_spec.md §3/§4/§5，全部 375×667 逻辑 px）
 * 纯数据模块：输入屏幕信息 → 输出元素几何 + hotRects。
 * 适配：x 乘 k = W/375；顶部区 y 加 safeTop 偏移；底部区用底锚公式；中部弹性给小虎 scale。
 */

const KREF = 375;
const REF_SAFE_TOP = 20;

/**
 * @param {{W,H,safeTop,safeBottom}} s
 * @returns {k, dx(topOffset), yBtn(底部按钮行 y), yRecord}
 */
function frame(s) {
  const k = s.W / KREF;
  const topOff = (s.safeTop || REF_SAFE_TOP) - REF_SAFE_TOP; // 顶锚偏移
  const yBtn = s.H - (s.safeBottom || 0) - 12 - 88;          // 底锚：底部按钮行
  return { k, topOff, yBtn };
}
const X = (v, k) => Math.round(v * k * 100) / 100;
const Y = (v, off) => v + off;

// ---------------- 首页 ----------------
function home(s) {
  const { k, topOff } = frame(s);
  // 2026-11-18 P0-3：首页从「两个模式的说明书」收成「一个游戏的开始」——
  // 唯一主按钮「开始对诗」，玩法模式 / 难度 / 音效降为按钮上方的三个 chip。
  const BTN_H = 88;
  const yRecord = s.H - (s.safeBottom || 0) - 12 - 88;
  const startY = yRecord - 16 - BTN_H;      // 主按钮底锚：紧贴在战绩签上方
  const chipY = Y(240, topOff), chipH = 34; // 240：避开副标题分隔线（subtitle.mid+22）
  const zoneTop = chipY + chipH + 8;
  const zoneBot = startY - 10;
  const TIGER_H = 560;                      // 渲染器原生内容实际延伸到 y≈545（脚/尾/笔），按 560 计
  const zoneH = Math.max(zoneBot - zoneTop, 120);
  const tigerScale = Math.max(0.20, Math.min(0.46, zoneH / TIGER_H));
  const tigerH = TIGER_H * tigerScale;
  const tigerY = zoneTop + Math.max(0, (zoneH - tigerH) / 2);
  // 三个 chip 横排：模式 146 / 难度 108 / 音效 73，间距 8，右缘 359 = W-16
  const MODE_W = 146, DIFF_W = 108, SOUND_W = 73;
  return {
    k,
    // 2026-11-18：字号循环按钮移除——fontScale 1.25/1.5 档已多次引发溢出 bug（结算按钮/战绩签/上句条），
    // 收益（适老）远低于稳定性成本；界面锁定标准字号，fontScale 基础设施保留待后续整版适配
    title: { cx: X(187.5, k), mid: Y(158, topOff), size: 64, tracking: 6 },
    subtitle: { cx: X(187.5, k), mid: Y(200, topOff), size: 24 },
    tiger: { x: s.W / 2 - 200 * tigerScale, y: tigerY, scale: tigerScale },
    modeChip: { x: X(16, k), y: chipY, w: MODE_W * k, h: chipH, r: 17 },
    diffChip: { x: X(170, k), y: chipY, w: DIFF_W * k, h: chipH, r: 17 },
    soundChip: { x: X(286, k), y: chipY, w: SOUND_W * k, h: chipH, r: 17 },
    startBtn: { x: X(16, k), y: startY, w: X(343, k), h: BTN_H, r: 22,
                chev: { x: X(326, k), y: startY + BTN_H / 2 - 8 },
                hot: [X(16, k), startY - 6, X(343, k), BTN_H + 12] },
    record: { x: X(16, k), y: yRecord, w: X(343, k), h: 88, r: 44,
              seal: { x: X(34, k), y: yRecord + 18, size: 48 }, textX: X(98, k), mid: yRecord + 44,
              arrow: { x: X(330, k), y: yRecord + 36 }, hot: [X(16, k), yRecord, X(343, k), 88] },
    hotRects: [
      { id: 'home.start', x: X(16, k), y: startY - 6, w: X(343, k), h: BTN_H + 12 },
      { id: 'home.modeChoice', x: X(16, k), y: chipY, w: (MODE_W / 2) * k, h: chipH },
      { id: 'home.modeBlocks', x: X(16 + MODE_W / 2, k), y: chipY, w: (MODE_W / 2) * k, h: chipH },
      { id: 'home.diffEasy', x: X(170, k), y: chipY, w: (DIFF_W / 2) * k, h: chipH },
      { id: 'home.diffNormal', x: X(170 + DIFF_W / 2, k), y: chipY, w: (DIFF_W / 2) * k, h: chipH },
      { id: 'home.sound', x: X(286, k), y: chipY, w: SOUND_W * k, h: chipH },
      { id: 'home.record', x: X(16, k), y: yRecord, w: X(343, k), h: 88 },
    ],
  };
}

// ---------------- 对局页共用（B0–B3） ----------------
function battleShared(s) {
  const { k, topOff, yBtn } = frame(s);
  return {
    k, yBtn,
    back: { x: X(52, k), y: Y(72, topOff), r: 18, hot: [X(8, k), Y(44, topOff), 88 * k, 88] },
    roundPill: { x: X(104, k), y: Y(56, topOff), w: 96 * k, h: 32, r: 16 },
    // 2026-11-18：倒计时原画在 rightX=340（贴屏缘），真机上撞进右上角胶囊菜单领域
    // → 改为「环内数字」一体单元，整体置于胶囊左侧（胶囊占 W-96 起，环右缘 260k 恒在其左）
    timerRing: { cx: X(236, k), cy: Y(70, topOff), r: 24 },
    sealCard: { x: X(12, k), y: Y(100, topOff), w: 128 * k, h: 128, r: 18, inner: { x: X(18, k), y: Y(106, topOff), w: 116 * k, h: 116, r: 14 } },
    keyword: { cx: X(76, k), mid: Y(164, topOff) },
    bustWin: { x: X(150, k), y: Y(100, topOff), w: 100 * k, h: 108 * k },
    playerLabel: { x: X(256, k), y: Y(104, topOff), w: 107 * k, h: 20 },
    playerBar: { x: X(256, k), y: Y(126, topOff), w: 107 * k, h: 12, r: 6 },
    rivalLabel: { x: X(256, k), y: Y(150, topOff), w: 107 * k, h: 20 },
    rivalBar: { x: X(256, k), y: Y(172, topOff), w: 107 * k, h: 12, r: 6 },
    comboDots: { x: X(256, k), y: Y(196, topOff), size: 10, gap: 6 },
    // 2026-11-18：上句条 56→64（真机两行文字叠字修复），预览条/字块格随之让位
    lastBar: { x: X(12, k), y: Y(232, topOff), w: 351 * k, h: 64, r: 12 },
    lastLabel: { x: X(28, k), y: Y(240, topOff), w: 60 * k, h: 16 },
    lastText: { x: X(28, k), y: Y(258, topOff), w: 323 * k, h: 26 },
    menuBanned: s.menuRect || { x: s.W - 96, y: 0, w: 96, h: 44 },
  };
}

// ---------------- 对局 B4a · 字块拼句 ----------------
function battleBlocks(s, shared) {
  const { k, topOff, yBtn } = frame(s);
  // 2026-11-19 UI 评审 C：中部内容（预览槽/字块格）原本顶锚、按钮底锚，
  // 高屏（812+）在字块格与按钮间留出 ~200px 空洞（真机截图实锤）。
  // → 富余空间三等分塞进 预览槽上方/预览槽与字块格/字块格与按钮 三处间隙；
  //   667 基准帧 extra=0，与旧版坐标完全一致。
  const previewY0 = Y(300, topOff);
  const zoneBot = yBtn - 12;
  const refSpan = 240;               // 667 基准：preview 56 + gap 4 + 字块格纵向跨度 180
  const extra = Math.max(0, zoneBot - previewY0 - refSpan);
  const g = extra / 3;
  const previewY = previewY0 + g;
  const gridY = previewY + 60 + g;
  const cells = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      cells.push({
        x: X(11 + col * 88, k), y: gridY + row * 96, w: 88 * k, h: 96,
        vis: { x: X(11 + col * 88 + 8, k), y: gridY + row * 96 + 12, w: 72 * k, h: 72 * k, r: 14 },
      });
    }
  }
  return {
    preview: { x: X(12, k), y: previewY, w: 351 * k, h: 56, r: 12 },
    cells,
    // 2026-11-19 UI 评审 A：错因 pill 原画在 y 248（提示条两行文字正中间），
    // 真机截图实锤「超时 · 本回合判负」与「提示：王维《…》」互相穿插都读不清。
    // → 改为盖在预览槽上：失败时 seq 已清空、预览槽无内容，被 pill 暂时遮住零信息损失；
    //   也不占新槽位（667 帧垂直预算已满，无永久空槽可用）。
    errorPill: { x: X(12, k), y: previewY, w: 351 * k, h: 56, r: 14, fromY: previewY + 40 },
    undoBtn: { x: X(12, k), y: yBtn, w: 105 * k, h: 88, r: 14 },
    clearBtn: { x: X(128, k), y: yBtn, w: 105 * k, h: 88, r: 14 },
    submitBtn: { x: X(244, k), y: yBtn, w: 119 * k, h: 88, r: 14 },
  };
}

// ---------------- 对局 B4b · 点选接句 ----------------
function battleChoice(s, shared) {
  const { k, topOff, yBtn } = frame(s);
  const ys = [264, 360, 456, 552].map(v => {
    // 最后一张卡用底锚收口，前三张顶锚排布（667 参考帧两者重合）
    return Math.min(Y(v, topOff), yBtn);
  });
  const cards = ys.map((y, i) => ({
    x: X(12, k), y, w: 351 * k, h: 88, r: 14,
    num: { x: X(44, k), y: y + 44, r: 16 },
    text: { x: X(72, k), y: y + 10, w: 275 * k, h: 68 },
  }));
  return {
    thinBar: { x: X(12, k), y: Y(236, topOff), w: 351 * k, h: 22 },
    cards,
    errorPill: { x: X(12, k), y: Y(248, topOff), w: 351 * k, h: 40, r: 20, fromY: Y(288, topOff) },
  };
}

// ---------------- 出字亮相（全屏） ----------------
function reveal(s) {
  const { k, topOff } = frame(s);
  return {
    label: { cx: s.W / 2, mid: Y(180, topOff) },
    char: { cx: s.W / 2, mid: Y(333, topOff) },
    lineTop: { x: X(127, k), y: Y(213, topOff), w: 121 },
    lineBottom: { x: X(127, k), y: Y(453, topOff), w: 121 },
  };
}

// ---------------- 结算页 ----------------
function result(s) {
  const { k, topOff, yBtn } = frame(s);
  // 2026-11-18 判胜负可读性改版：副标题区加比分/统计行，回顾卡加原因行，
  // 底部三按钮（再来一局/分享/回首页）
  const yCard = Y(398, topOff);
  // 2026-11-19 UI 评审 E：回顾卡原固定 h 138，高屏在卡与按钮间留 ~180px 空白（真机截图实锤）
  // → 卡高自适应拉伸吃掉富余空间（667 基准帧 h=138 与旧版一致），卡内行距同步拉开
  const cardH = Math.max(138, yBtn - 16 - yCard);
  const hX = cardH - 138;            // 拉伸量，分配给卡内行距
  const tigerScale = 0.27;           // 2026-11-19 F：0.30→0.27 给统计行与卡之间留呼吸位
  return {
    k,
    resultChar: { cx: s.W / 2, mid: Y(99, topOff) },
    // F：结果字下装饰短横线，压住大字重心
    charLine: { x: s.W / 2 - 24, y: Y(148, topOff), w: 48, h: 4 },
    subtitle: { cx: s.W / 2, mid: Y(172, topOff) },
    statsMid: Y(202, topOff),
    tiger: { x: X(107.5, k), y: Y(212, topOff), scale: tigerScale },
    review: { x: X(12, k), y: yCard, w: 351 * k, h: cardH, r: 14 },
    miniSeal: { x: X(26, k), y: yCard + 18 + hX * 0.08, size: 56, inner: { x: X(32, k), y: yCard + 24 + hX * 0.08, size: 44 } },
    rowMe: { label: { x: X(98, k), y: yCard + 14 + hX * 0.12, w: 40 * k, h: 20 }, text: { x: X(98, k), y: yCard + 36 + hX * 0.12, w: 210 * k, h: 28 } },
    rowTiger: { label: { x: X(98, k), y: yCard + 62 + hX * 0.4, w: 60 * k, h: 20 }, text: { x: X(98, k), y: yCard + 84 + hX * 0.4, w: 210 * k, h: 28 } },
    // 诗笺入口（2026-11-21）：卡片右侧竖排书签，点击进「诗笺」看本局诗句的释义
    glossBtn: { x: X(313, k), y: yCard + 30 + hX * 0.1, w: 42 * k, h: 84 },
    reasonMid: yCard + cardH - 18,     // 判定行锚卡底，卡拉伸时行距均匀
    againBtn: { x: X(12, k), y: yBtn, w: 157 * k, h: 88, r: 14 },
    shareBtn: { x: X(176, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    homeBtn: { x: X(273, k), y: yBtn, w: 90 * k, h: 88, r: 14 },
    hotRects: [
      { id: 'result.gloss', x: X(310, k), y: yCard + 22 + hX * 0.1, w: 52 * k, h: 100 },
      { id: 'result.again', x: X(12, k), y: yBtn, w: 157 * k, h: 88 },
      { id: 'result.share', x: X(176, k), y: yBtn, w: 90 * k, h: 88 },
      { id: 'result.home', x: X(273, k), y: yBtn, w: 90 * k, h: 88 },
    ],
  };
}

/**
 * 诗笺页（2026-11-21 二版：一首一页）
 * 用户反馈「单句解析没有意义」→ 改为整首：题名 + 作者 → 全诗（本局句高亮）→ 诗童串讲 →
 * 该句直译（降为第三层）。内容超出卡片高度时卡内滚动（长诗最长 960 字，如《长恨歌》）。
 * 小虎半身像移到题名右侧，不再占一行气泡——串讲本身就是它在讲。
 */
function gloss(s) {
  const { k, topOff, yBtn } = frame(s);
  const tiger = { x: X(281, k), y: Y(24, topOff), w: X(78, k), h: X(86, k) };
  const card = { x: X(16, k), y: Y(116, topOff), w: X(343, k), h: 0, r: 16 };
  card.h = Math.max(240, yBtn - 14 - card.y);
  const padX = 22, padTop = 16, padBottom = 16;
  return {
    k,
    eyebrow: { x: X(18, k), y: Y(24, topOff) },
    title: { x: X(18, k), y: Y(52, topOff), w: X(252, k) },
    sub: { x: X(18, k), y: Y(85, topOff), w: X(168, k) },
    page: { x: X(196, k), y: Y(78, topOff), w: X(74, k), h: 20 },
    tiger: { win: tiger },
    card,
    // 卡内滚动视口（文字只画在这个矩形里，超出部分靠滚动露出）
    view: { x: card.x + padX, y: card.y + padTop, w: card.w - padX * 2, h: card.h - padTop - padBottom },
    // 正文行距（22px 字 / 34 行高）：五七言一行半联，词的长短句也自然成行
    lineFs: 22, lineLH: 34,
    introFs: 19, introLH: 31,
    noteFs: 16, noteLH: 26,
    prevBtn: { x: X(16, k), y: yBtn, w: X(100, k), h: 88, r: 14 },
    nextBtn: { x: X(122, k), y: yBtn, w: X(100, k), h: 88, r: 14 },
    backBtn: { x: X(228, k), y: yBtn, w: X(131, k), h: 88, r: 14 },
    hotRects: [
      { id: 'gloss.prev', x: X(16, k), y: yBtn, w: X(100, k), h: 88 },
      { id: 'gloss.next', x: X(122, k), y: yBtn, w: X(100, k), h: 88 },
      { id: 'gloss.back', x: X(228, k), y: yBtn, w: X(131, k), h: 88 },
    ],
    // 卡内滚动区（不是热区，只给屏幕层判断手势起手点用）
    scrollArea: { x: card.x, y: card.y, w: card.w, h: card.h },
  };
}

module.exports = { frame, home, battleShared, battleBlocks, battleChoice, reveal, result, gloss };
