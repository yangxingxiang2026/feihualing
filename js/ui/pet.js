'use strict';
/**
 * 小诗童触摸互动（2026-11-20 用户需求；同日二版升级「再生动一些」）：
 * 摸头 / 摸肚子 / 挠脚（对局页半身像为头/爪两区）。
 *
 * 二版动作设计（像摸小猫）：
 *  - 摸头「贴手蹭」：歪头贴向手指 + 轻揉微摆（往手心蹭的劲），持续 1.5s；
 *    渲染器 'pet' 状态同步眯眼 + ω 猫嘴 + 耳朵轻抖 + 前爪踩奶 + 尾巴慢摇；
 *  - 摸肚「扭一扭」：左右摇摆 + 挤压弹性（squash/stretch），配合波纹与软喵；
 *  - 挠脚「先蹲后蹬」：先下蹲蓄力 0.1s 再弹起蹬腿，像被挠痒的猫，星花迸开。
 *
 * 设计约束：
 *  - 零图片零音频资产：反馈 = 程序化粒子 + 小幅 transform；声音走 sound.js 合成萌音；
 *  - offset() 返回 {dx,dy,rot,sx,sy}，屏侧以盒底立足点为支点做 rotate+scale；
 *  - 冷却按区：头 450ms（连续撸猫节奏）/ 其余 600ms；不同区可即时切换；
 *  - 玩家决策热区（按钮/选项/字块）优先：pet 热区一律追加在各屏 hotRects 末尾，
 *    且按下态 tint 跳过 pet.*（摸头时罩黑不萌）。
 */

const COOLDOWN_HEAD = 0.45;             // 摸头：短冷却，支持连续撸
const COOLDOWN_OTHER = 0.6;             // 其余部位
const LIFE = { head: 1.5, belly: 1.1, foot: 1.0, paw: 1.0 };  // 各区动画时长

/**
 * 由小虎可见盒算互动热区。
 * @param {'full'|'bust'} kind full=全身立绘（首页/结算：头/肚/脚）；bust=对局半身窗（头/爪）
 * @param {{x:number,y:number,w:number,h:number}} box 小虎在屏幕上的可见盒
 *        full: w=400*scale, h=560*scale；bust: 直接传 bustWin
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

const ZONE_LIFE = z => LIFE[z] || 1.0;

/** 每屏一个实例 */
function create() {
  let fx = null;          // {zone, t, cx, cy, scale, dir}
  let coolZone = null;    // 冷却中的部位 id
  let coolT = 0;          // 冷却剩余秒
  let box = null;         // 当前小虎可见盒（供特效锚点）
  let dir = 1;            // 蹭的方向（交替，左右歪头有变化）

  return {
    petZones,   // 模块级函数挂到实例上，屏侧统一走 pet.* 一个命名空间
    /** 各屏 build/enter 时同步小虎盒 */
    setBox(b) { box = b; },

    /**
     * 触发互动。命中冷却或动画未结束时返回 false（屏据此决定是否发声/埋点）。
     * @param {'head'|'belly'|'foot'|'paw'} zone
     */
    trigger(zone) {
      if (!box) return false;
      const cool = zone === 'head' ? COOLDOWN_HEAD : COOLDOWN_OTHER;
      if (coolT > 0 && coolZone === zone) return false;
      coolZone = zone;
      coolT = cool;
      dir = -dir;
      // 特效锚点（屏幕坐标）：头=盒顶中心，肚=盒中心，脚/爪=盒底中心
      const anchor = zone === 'head' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.16 }
        : zone === 'belly' ? { x: box.x + box.w / 2, y: box.y + box.h * 0.62 }
        : { x: box.x + box.w / 2, y: box.y + box.h * 0.88 };
      fx = { zone, t: 0, x: anchor.x, y: anchor.y, scale: box.h / 560, dir };
      return true;
    },

    update(dt) {
      if (coolT > 0) { coolT -= dt; if (coolT <= 0) { coolT = 0; coolZone = null; } }
      if (fx) { fx.t += dt; if (fx.t > ZONE_LIFE(fx.zone)) fx = null; }
    },

    /** 离屏清理（动画/冷却全部归零） */
    reset() { fx = null; coolZone = null; coolT = 0; },

    /** 互动进行中屏侧应给小虎 'pet' 状态（眯眼/ω嘴/踩奶），否则返回 null 用原状态 */
    stateOverride() { return fx ? 'pet' : null; },

    /**
     * 小虎绘制 transform（区内衰减，之外归零）。
     *  - head 贴手蹭：缓入缓出的持续歪头（rot+dx 同向"贴向手指"）+ 9Hz 轻揉微摆；
     *  - belly 扭一扭：摇摆 2 个来回 + 底部 squash 挤压；
     *  - foot/paw 先蹲后蹬：0.16 相位下蹲（dy 下沉 + 压扁），随后蹬腿弹起（拉长 + 歪身）。
     * 返回 {dx,dy,rot,sx,sy}，sx/sy=1 时屏侧可跳过 scale。
     */
    offset() {
      if (!fx) return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };
      const z = fx.zone, p = Math.min(fx.t / ZONE_LIFE(z), 1), sc = fx.scale, d = fx.dir;
      if (z === 'head') {
        // 包络：0–0.2 贴上去，0.2–0.72 保持（含轻揉），0.72–1 松开回正
        let env;
        if (p < 0.2) env = Math.sin((p / 0.2) * Math.PI / 2);
        else if (p < 0.72) env = 1;
        else env = Math.sin(((1 - p) / 0.28) * Math.PI / 2);
        const rub = Math.sin(fx.t * 9) * 0.02 * env;   // 轻揉微摆（往手心蹭）
        return { dx: d * 5 * env, dy: 0, rot: d * 0.075 * env + rub, sx: 1, sy: 1 };
      }
      if (z === 'belly') {
        const decay = 1 - p * 0.6;
        const sq = Math.sin(p * Math.PI * 3) * (1 - p);
        return {
          dx: 0,
          dy: Math.sin(p * Math.PI * 2) * 2.5 * decay,
          rot: Math.sin(p * Math.PI * 4) * 0.06 * decay,
          sx: 1 + 0.035 * sq,      // 挤压时横宽纵扁（体积守恒近似）
          sy: 1 - 0.05 * sq,
        };
      }
      // foot / paw：先蹲后蹬
      if (p < 0.16) {
        const q = p / 0.16;
        return { dx: 0, dy: 5 * sc * q, rot: 0, sx: 1 + 0.04 * q, sy: 1 - 0.06 * q };
      }
      const q = Math.min((p - 0.16) / 0.5, 1);
      const jump = Math.sin(q * Math.PI);
      return {
        dx: 0,
        dy: -14 * sc * jump,
        rot: d * 0.09 * jump,
        sx: 1 - 0.03 * jump,
        sy: 1 + 0.05 * jump,      // 蹬起瞬间拉长
      };
    },

    /**
     * 叠加特效（在各屏绘制完小虎后调用）。
     * head=心心+音符上浮 / belly=波纹扩散+音符 / foot·paw=星花迸开。
     * 全程 alpha ≤0.9、数量 ≤4，与四季粒子同一量级，不构成性能负担。
     */
    draw(ctx) {
      if (!fx) return;
      const p = Math.min(fx.t / ZONE_LIFE(fx.zone), 1);
      const fade = 1 - p;
      ctx.save();
      if (fx.zone === 'head') {
        // 3 个心心/音符错峰上浮
        const marks = ['♥', '♪', '♥'];
        for (let i = 0; i < 3; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.6 - i * 0.18));
          if (lp <= 0 || lp >= 1) continue;
          const sway = Math.sin(lp * Math.PI * 2 + i * 2) * 6;
          ctx.globalAlpha = (1 - lp) * 0.9;
          ctx.fillStyle = i === 1 ? 'rgba(184,115,51,0.9)' : 'rgba(214,69,69,0.85)';
          ctx.font = Math.round(13 + fx.scale * 8) + 'px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(marks[i], fx.x + (i - 1) * 16 * fx.scale * 3 + sway, fx.y - 14 - lp * 26 * fx.scale * 3);
        }
      } else if (fx.zone === 'belly') {
        // 两圈波纹从肚心扩散 + 一个音符飘出
        for (let i = 0; i < 2; i++) {
          const lp = Math.max(0, Math.min(1, p * 1.5 - i * 0.25));
          if (lp <= 0) continue;
          ctx.globalAlpha = (1 - lp) * 0.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, (8 + lp * 26) * fx.scale * 3, 0, Math.PI * 2);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(184,115,51,0.8)'; ctx.stroke();
        }
        const lp2 = Math.max(0, Math.min(1, p * 1.3 - 0.1));
        if (lp2 > 0 && lp2 < 1) {
          ctx.globalAlpha = (1 - lp2) * 0.85;
          ctx.fillStyle = 'rgba(184,115,51,0.9)';
          ctx.font = Math.round(12 + fx.scale * 7) + 'px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('♪', fx.x + 20 * fx.scale * 3, fx.y - 10 - lp2 * 20 * fx.scale * 3);
        }
      } else {
        // 4 道星花（短线十字）从底心迸开 + 中央一个小「!」跳字
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2;
          const r0 = 6 * fx.scale * 3, r1 = (6 + p * 16) * fx.scale * 3;
          ctx.globalAlpha = fade * 0.8;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
          ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,195,60,0.9)'; ctx.stroke();
        }
        if (p > 0.12 && p < 0.5) {
          ctx.globalAlpha = (1 - (p - 0.12) / 0.38) * 0.9;
          ctx.fillStyle = 'rgba(242,195,60,0.95)';
          ctx.font = 'bold ' + Math.round(14 + fx.scale * 8) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', fx.x, fx.y - 26 * fx.scale * 3);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    /** 测试/调试钩子 */
    _fx() { return fx; },
  };
}

module.exports = { petZones, create, COOLDOWN_HEAD, COOLDOWN_OTHER, LIFE };
