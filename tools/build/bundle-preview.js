'use strict';
/**
 * 浏览器预览打包器：把 CommonJS 工程打进单个 preview/bundle.js
 * 用法：node tools/build/bundle-preview.js
 * 仅开发辅助，不进小游戏包。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = 'game.js';

function resolveSpec(fromFile, spec) {
  let p;
  if (spec.startsWith('.') || spec.startsWith('/')) {
    p = path.join(path.dirname(fromFile), spec);
  } else {
    p = spec; // 本工程无裸模块依赖
  }
  if (!path.extname(p)) p += '.js';
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`module not found: ${spec} (from ${fromFile})`);
  return rel;
}

function collect(file, seen, order) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = fs.readFileSync(file, 'utf8');
  const re = /require\((['"])([^'"]+)\1\)/g;
  let m;
  while ((m = re.exec(src))) {
    const dep = resolveSpec(file, m[2]);
    collect(path.join(ROOT, dep), seen, order);
  }
  order.push({ rel, src });
}

const order = [];
collect(path.join(ROOT, ENTRY), new Set(), order);

const out = [];
out.push(`/* 预览 bundle，由 tools/build/bundle-preview.js 生成，勿手改 */`);
out.push(`(function () {`);
out.push(`  var __defs = {}, __cache = {};`);
out.push(`  function __reg(id, fn) { __defs[id] = fn; }`);
out.push(`  function __dir(id) { var i = id.lastIndexOf('/'); return i < 0 ? '' : id.slice(0, i); }`);
out.push(`  function __req(fromDir, spec) {`);
out.push(`    var p = (spec.charAt(0) === '.') ? __norm(fromDir + '/' + spec) : spec;`);
out.push(`    if (!/\\.[a-zA-Z]+$/.test(p)) p += '.js';`);
out.push(`    if (__cache[p]) return __cache[p].exports;`);
out.push(`    var fn = __defs[p];`);
out.push(`    if (!fn) throw new Error('module not found: ' + p + ' (from ' + fromDir + ')');`);
out.push(`    var mod = { exports: {} };`);
out.push(`    __cache[p] = mod;`);
out.push(`    fn(mod, mod.exports, function (s) { return __req(__dir(p), s); });`);
out.push(`    return mod.exports;`);
out.push(`  }`);
out.push(`  function __norm(p) {`);
out.push(`    var parts = p.split('/'), stack = [];`);
out.push(`    for (var i = 0; i < parts.length; i++) {`);
out.push(`      var s = parts[i];`);
out.push(`      if (s === '' || s === '.') continue;`);
out.push(`      if (s === '..') stack.pop(); else stack.push(s);`);
out.push(`    }`);
out.push(`    return stack.join('/');`);
out.push(`  }`);
for (const { rel, src } of order) {
  out.push(`__reg(${JSON.stringify(rel)}, function (module, exports, require) {`);
  out.push(src);
  out.push(`});`);
}
out.push(`  __req('', ${JSON.stringify(ENTRY)});`);
out.push(`})();`);

const destDir = path.join(ROOT, 'preview');
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir);
const dest = path.join(destDir, 'bundle.js');
fs.writeFileSync(dest, out.join('\n'), 'utf8');
console.log(`bundle ok: preview/bundle.js (${(out.join('\n').length / 1024).toFixed(1)} KB, ${order.length} modules)`);
