'use strict';
/**
 * 最小埋点集（P0-4）—— 6 个事件，先把"能不能测"这件事解决。
 *
 * 事件契约（键名固定，mp 后台需按同名事件名逐条配置，否则 reportAnalytics 会被静默丢弃）：
 *   fhl_start  开局     mode(1择句/2字块) difficulty(1简/2难) tutorial(0/1) kw(令字索引)
 *   fhl_round  每回合   mode difficulty round kw ok(1/0) reason(枚举) ms(决策毫秒)
 *   fhl_end    局终     mode difficulty result(1胜/2负/3和) hits tiger rounds dur timeouts
 *   fhl_again  再来一局  tutorial(0/1)
 *   fhl_share  分享点击  result hits
 *   fhl_exit   退出     from(1对战返回/2切后台) round
 *   fhl_pet    摸小诗童 zone(1头/2肚/3脚/4爪) scr(1首页/2对局/3结算)
 *
 * 合规铁律（PM 明确要求）：只上报行为与数值，绝不上报任何可识别信息——
 * 无 openid、无昵称、无头像、无设备号、无位置。字符串字段一律截断到 32 字符。
 *
 * 双写策略：
 *   ① wx.reportAnalytics(name, payload)：官方自定义分析，键值只能是 string/number；
 *   ② 本地环形缓冲（≤200 条，仅内存）：调试与"埋点是否真的触发"的现场证据，
 *      dump() 可随时取出——不持久化，避免占用用户存储与合规风险。
 */
const platform = require('../platform');

const EVENTS = ['fhl_start', 'fhl_round', 'fhl_end', 'fhl_again', 'fhl_share', 'fhl_exit'];
const MAX = 200;
let buf = [];

/** 清洗：布尔 → 1/0；数字保留两位；字符串截断；其余丢弃（reportAnalytics 不接受对象） */
function clean(data) {
  const out = {};
  if (!data) return out;
  Object.keys(data).forEach(k => {
    const v = data[k];
    if (v === undefined || v === null) return;
    if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (typeof v === 'number') out[k] = isFinite(v) ? Math.round(v * 100) / 100 : 0;
    else if (typeof v === 'string') { if (v) out[k] = v.slice(0, 32); }
  });
  return out;
}

/**
 * 记录一个事件。name 必须是契约内事件（拼错的直接忽略，避免污染后台事件表）。
 * @returns {{t:number,e:string,d:object}|null}
 */
function track(name, data) {
  if (EVENTS.indexOf(name) === -1) return null;
  const payload = clean(data);
  const ev = { t: Date.now(), e: name, d: payload };
  buf.push(ev);
  if (buf.length > MAX) buf.shift();
  try {
    if (platform.isWx && typeof wx !== 'undefined' && typeof wx.reportAnalytics === 'function') {
      wx.reportAnalytics(name, payload);
    }
  } catch (e) { /* 埋点失败绝不阻断玩法 */ }
  try {
    // 浏览器预览控制台自检用；Node 测试环境（有 process）不打日志，避免污染断言输出
    if (!platform.isWx && typeof process === 'undefined' && typeof console !== 'undefined' && console.log) {
      console.log('[fhl][track]', name, JSON.stringify(payload));
    }
  } catch (e) { /* 无控制台环境忽略 */ }
  return ev;
}

/** 调试导出：本地缓冲快照（不含任何可识别信息） */
function dump() { return buf.map(e => ({ t: e.t, e: e.e, d: Object.assign({}, e.d) })); }
/** 测试用：清空缓冲 */
function reset() { buf = []; }
/** 某事件出现次数（测试/自检用） */
function count(name) { return buf.reduce((n, e) => n + (e.e === name ? 1 : 0), 0); }

module.exports = { track, dump, reset, count, clean, EVENTS };
