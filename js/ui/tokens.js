'use strict';
/**
 * Design Token（10_ui_spec.md §1）
 * 三层：Primitive（仅 tokens 内部）→ Semantic（业务只用这层）→ 字阶/间距/圆角/动效。
 * 亮/暗两套，主题切换只换值、不重建布局。
 */

const P = { // Primitive（唯一色彩事实源：tiger THEMES.guofeng）
  tiger: '#F2C33C', amberDeep: '#C98A28',
  vermilion: '#C9372C', vermilionDeep: '#A82A21',
  azure: '#2E6E8E', bamboo: '#7FC5A8', bambooDeep: '#3E7A5E',
  ink: '#2B231D', inkSoft: '#6A6157', inkFaint: '#8C8378',
  cream: '#FFF9EC', creamDeep: '#F6ECD7',
  pink: '#E88494', gold: '#D9A441', white: '#FFFFFF',
};

const T = {
  // —— 语义层：业务代码只准用这一层 ——
  color: {
    light: {
      bg: P.cream, bgEnd: P.creamDeep,
      surface: '#FFFDF7', surfaceAlt: 'rgba(43,35,29,0.055)', track: 'rgba(43,35,29,0.12)',
      fg: P.ink, fg2: P.inkSoft, onBrand: P.cream, disabled: P.inkFaint,
      lineSoft: 'rgba(43,35,29,0.16)', lineStrong: P.ink,
      primary: P.vermilion, primaryGrad: [P.vermilion, P.vermilionDeep],
      secondary: P.azure, success: P.bambooDeep, danger: P.vermilion, reward: P.tiger,
      // 翠绿主按钮（字块提交键，2026-11-18 用户指定）：比竹绿更鲜亮一档
      successGrad: ['#3E9C6E', '#2E7A52'],
      barPlayer: P.azure, barRival: P.vermilion,
      resultShadow: 'rgba(43,35,29,0.10)', resultShadow2: 'rgba(43,35,29,0.16)',
      badgeBg: P.tiger, badgeFg: P.ink, pillNumBg: 'rgba(46,110,142,0.12)',
      recordBg: 'rgba(46,110,142,0.10)', mask: 'rgba(255,249,236,0.96)',
      gold: P.gold,
    },
    dark: {
      bg: '#1E1A16', bgEnd: '#262019',
      surface: '#2A241E', surfaceAlt: 'rgba(243,234,217,0.07)', track: 'rgba(243,234,217,0.14)',
      fg: '#F3EAD9', fg2: '#C4B8A5', onBrand: '#1E1A16', disabled: '#6F665C',
      lineSoft: 'rgba(243,234,217,0.18)', lineStrong: '#F3EAD9',
      primary: '#E15A4B', primaryGrad: ['#E15A4B', '#C9372C'],
      secondary: '#6FA8C6', success: '#8FD3B8', danger: '#E15A4B', reward: P.tiger,
      successGrad: ['#4DB384', '#35906A'],
      barPlayer: '#6FA8C6', barRival: '#E15A4B',
      resultShadow: 'rgba(0,0,0,0.20)', resultShadow2: 'rgba(0,0,0,0.28)',
      badgeBg: P.tiger, badgeFg: P.ink, pillNumBg: 'rgba(111,168,198,0.16)',
      recordBg: 'rgba(111,168,198,0.12)', mask: 'rgba(30,26,22,0.96)',
      gold: P.gold,
    },
  },
  // —— 字阶（fs.keyword/result/title/timer/hero 不参与适老缩放）——
  fs: { hero: 240, keyword: 120, result: 96, title: 64, h1: 40, h2: 32, body: 32,
        bodyS: 28, label: 22, caption: 18, badge: 14, timer: 48, timerUrgent: 56 },
  sp: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  r: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 },
  st: { hair: 1, thin: 2, mid: 3, thick: 4 },
  du: { flash: 120, fast: 180, base: 260, slow: 420, reveal: 800 },
  // 适老：只放大允许缩放的 token（§1.3 标注可缩放者）
  scalable: { h1: 1, h2: 1, body: 1, bodyS: 1, label: 1, caption: 1 },
  scaled(name, S) { const v = T.fs[name]; if (!(name in T.scalable)) return v; return S === 1 ? v : Math.round(v * S); },
};

// 字体栈（§1.3）
const FAM_SERIF = "'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC',serif";
const FAM_SANS = "-apple-system,'PingFang SC','Helvetica Neue',sans-serif";

/** font 字符串一律函数化，禁止手拼 */
function font(weight, size, family) {
  const w = weight >= 700 ? 'bold ' : (weight >= 600 ? '600 ' : '');
  return `${w}${size}px ${family === 'serif' ? FAM_SERIF : FAM_SANS}`;
}

/** 主题解析：'light'|'dark'|'auto' → 具体 token 集 */
function resolveTokens(themeMode, systemDark) {
  const dark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);
  return { dark, c: dark ? T.color.dark : T.color.light };
}

module.exports = { T, P, font, FAM_SERIF, FAM_SANS, resolveTokens };
