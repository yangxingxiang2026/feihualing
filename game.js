'use strict';
/**
 * 飞花令 v0.1 · 微信小游戏入口
 * 主循环：update(dt) → draw。场景：home ↔ battle ↔ result。
 * 画布：canvas.width = screenW*dpr，ctx.scale(dpr,dpr)，全部按 375 基准逻辑 px 绘制。
 * 触摸：wx.onTouchStart/End 为逻辑 px，直接与 hotRects 比对。
 */
const platform = require('./js/platform');
const { resolveTokens, T } = require('./js/ui/tokens');
const { HomeScreen } = require('./js/ui/screens/home');
const { BattleScreen } = require('./js/ui/screens/battle');
const { ResultScreen } = require('./js/ui/screens/result');
const { GlossScreen } = require('./js/ui/screens/gloss');
const store = require('./js/app/store');
const sound = require('./js/app/sound');
const track = require('./js/app/track');

// ---------- 初始化 ----------
const canvas = platform.createMainCanvas();
const info = platform.screenInfo();
canvas.width = Math.round(info.W * info.dpr);
canvas.height = Math.round(info.H * info.dpr);
const ctx = canvas.getContext('2d');

// 暗色跟随（auto 时监听系统）
let systemDark = false;
if (platform.isWx && wx.getSystemInfoSync) {
  try { systemDark = wx.getSystemInfoSync().theme === 'dark'; } catch (e) { /* 默认亮色 */ }
}
platform.onThemeChange(e => {
  systemDark = e.theme === 'dark';
  app.applySettings();
});

const app = {
  info,
  isWx: platform.isWx,
  settings: store.loadSettings(),
  tokens: null,
  scene: null,
  goto(sceneName, params) {
    app.scene && app.scene.leave && app.scene.leave();
    if (sceneName === 'battle') app.scene = BattleScreen(app, params);
    else if (sceneName === 'result') app.scene = ResultScreen(app, params);
    else if (sceneName === 'gloss') app.scene = GlossScreen(app, params);
    else app.scene = HomeScreen(app);
    app.scene.enter();
  },
  applySettings() {
    app.tokens = resolveTokens(app.settings.theme, systemDark);
    app.scene && app.scene.invalidate && app.scene.invalidate();
  },
};

app.applySettings();
// 音效开关（P0-5）：默认开；老版本存档里没有 sound 字段时同样视为开
sound.setEnabled(app.settings.sound !== false);
app.goto('home', {});

// 被动分享：右上角菜单转发带战绩标题（2026-11-18：去「来接招 →」诱导话术，降低风控风险）
platform.initShare(() => {
  try {
    const r = store.loadRecord();
    return `我在飞花令与诗童对诗，累计胜 ${r.wins} 局`;
  } catch (e) { return '飞花令 · 与诗童对诗'; }
});

// ---------- 触摸 ----------
platform.onTouch((phase, touch) => {
  if (!app.scene || !touch) return;
  app.scene.touch(phase, touch.clientX, touch.clientY);
});

// ---------- 全局错误面（真机调试时在 vConsole 可见） ----------
if (platform.isWx) {
  if (wx.onError) wx.onError(e => console.error('[fhl] onError:', e));
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(r => console.error('[fhl] unhandledRejection:', r && r.reason));
  // 埋点 fhl_exit（切后台/小游戏隐藏）：撤退点分析的关键一环
  if (wx.onHide) {
    wx.onHide(() => {
      const s = app.scene;
      track.track('fhl_exit', { from: 2, round: s && s.match ? Math.min(s.match.roundSeq + 1, s.match.cfg.roundMax) : 0 });
    });
  }
}

// ---------- 主循环（dt 钳位防切后台大跳） ----------
let lastT = 0;
function loop(t) {
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.016;
  lastT = t;
  ctx.setTransform(info.dpr, 0, 0, info.dpr, 0, 0);
  // 安全清屏：即使烘焙层 drawImage 失效也不会堆帧（真机兼容兜底）
  ctx.clearRect(0, 0, info.W, info.H);
  try {
    app.scene.update(dt);
    app.scene.draw(ctx, t / 1000);
  } catch (e) {
    // 单帧异常不再杀死 rAF 循环（否则画布冻结成"叠帧"假死）
    console.error('[fhl] 场景异常（已兜底继续）:', e && (e.stack || e.message) || e);
  }
  platform.requestFrame(loop);
}
platform.requestFrame(loop);

// 供无头测试驱动场景路由（微信侧无影响；Node 下 requestFrame 为空实现，主循环不自启）
module.exports = { app, goto: (s, p) => app.goto(s, p) };
