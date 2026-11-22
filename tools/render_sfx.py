# -*- coding: utf-8 -*-
"""
离线渲染 js/app/sound.js 的 SFX 配方（不依赖浏览器/真机，先听再上机）。

为什么要这个：叫声是"听感"问题，真机试错一轮要几分钟，且没法量化。
本脚本复刻 WebAudio 链路（锯齿波 → 低通 → 双 bandpass 共振峰 → 气声 → AM 包络），
直接产出 wav + 客观指标（F0 中位/谱重心/时长），改配方后能立刻对比"萌度"：
幼兽萌音的客观特征 = 高基频（≥450Hz）、偏高谱重心、短时长（≤0.8s）、气声比例高。

用法：
  python tools/render_sfx.py                 # 渲染全部音色到 OUT
  python tools/render_sfx.py purr chirp      # 只渲染指定音色
  python tools/render_sfx.py --json          # 只打印解析出的配方（校验解析器）
  python tools/render_sfx.py --tag v8        # 输出文件名加版本标签
"""
import json
import math
import os
import re
import sys

import numpy as np
from scipy.signal import lfilter

SR = 44100
OUT = r"D:\WorkBuddyData\outputs\feihualing_audio"
SOUND_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "app", "sound.js")


# ---------------------------------------------------------------- 配方解析
def parse_sfx(path):
    """从 sound.js 抽出 `const SFX = {...};` 并转成 dict（JS 对象→JSON 的轻量转换）"""
    src = open(path, encoding="utf-8").read()
    i = src.index("const SFX = {")
    j = src.index("\n};", i)
    body = src[i + len("const SFX = "):j] + "}"   # j 指向 "\n};" 的换行处
    body = re.sub(r"//[^\n]*", "", body)          # 行注释
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)  # 块注释
    body = re.sub(r"([{,]\s*)([A-Za-z_]\w*)(\s*:)", r'\1"\2"\3', body)  # 裸 key 加引号
    body = re.sub(r"'([^'\n]*)'", r'"\1"', body)  # JS 单引号字符串 → JSON 双引号
    body = re.sub(r",(\s*[}\]])", r"\1", body)    # 尾逗号（JSON 不容）
    return json.loads(body)


def contour_at(pts, t):
    """[ [值, 秒], ... ] 线性插值（等价 WebAudio setValueAtTime + linearRamp）"""
    if t <= pts[0][1]:
        return float(pts[0][0])
    for k in range(1, len(pts)):
        t0, t1 = pts[k - 1][1], pts[k][1]
        if t <= t1:
            v0, v1 = pts[k - 1][0], pts[k][0]
            return float(v0 + (v1 - v0) * ((t - t0) / max(t1 - t0, 1e-9)))
    return float(pts[-1][0])


# ---------------------------------------------------------------- DSP 基件
def rbj_lowpass(fc, q, sr=SR):
    w0 = 2 * math.pi * fc / sr
    alpha = math.sin(w0) / (2 * q)
    cw = math.cos(w0)
    b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
    a = [1 + alpha, -2 * cw, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def rbj_bandpass(fc, q, sr=SR):
    """WebAudio 'bandpass' = 常数 0dB 峰值增益（RBJ b0=alpha）"""
    w0 = 2 * math.pi * fc / sr
    alpha = math.sin(w0) / (2 * q)
    cw = math.cos(w0)
    b = [alpha, 0.0, -alpha]
    a = [1 + alpha, -2 * cw, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def saw(phase):
    """WebAudio 锯齿：2*(p - floor(p+0.5))，相位 0..1"""
    return 2.0 * (phase - np.floor(phase + 0.5))


def adsr_exp(n, sr, t0_abs, dur, peak, attack, rel):
    """复刻 sound.js 的包络：0.0001 →(attack)→ peak →(保持)→ 0.0001（指数）"""
    t = np.arange(n) / sr + t0_abs
    env = np.full(n, 0.0001)
    atk_end = t0_abs + attack
    rel_start = t0_abs + max(attack, dur - rel)
    end = t0_abs + dur
    up = (t >= t0_abs) & (t < atk_end)
    if atk_end > t0_abs:
        env[up] = 0.0001 * (peak / 0.0001) ** ((t[up] - t0_abs) / (atk_end - t0_abs))
    hold = (t >= atk_end) & (t < rel_start)
    env[hold] = peak
    down = (t >= rel_start) & (t <= end)
    if end > rel_start:
        env[down] = peak * (0.0001 / peak) ** ((t[down] - rel_start) / (end - rel_start))
    env[t > end] = 0.0
    return env


# ---------------------------------------------------------------- 共振峰路径
def render_formant(spec):
    f = spec["formant"]
    dur = float(f["dur"])
    n = int(dur * SR) + 1
    t = np.arange(n) / SR                      # 相对起点的秒

    # ① 声源频率：轮廓 + 颤音 + jitter（都对 a-rate 频率求和）
    f0 = np.array([contour_at(f["pitch"], x) for x in t])
    if f.get("vibHz"):
        f0 = f0 + f["vibDepth"] * np.sin(2 * np.pi * f["vibHz"] * t)
    jh = f.get("jitterHz", 13)
    jd = f.get("jitterDepth", 4)
    if jh:
        # jitter 用非整数谐波叠加模拟"不规则"（WebAudio 也是一路 LFO，同样周期性）
        f0 = f0 + jd * (0.6 * np.sin(2 * np.pi * jh * t) + 0.4 * np.sin(2 * np.pi * jh * 1.7 * t + 1.1))
    phase = np.cumsum(f0 / SR)
    src = saw(phase)

    # ① 声源低通（分块更新系数，模拟 a-rate）
    s_lp = float(f.get("srcLp", 2200))
    out = block_filter(src, lowpass_fn(s_lp, 0.7))

    # ② 双共振峰：并行带通，各自的频率随时间滑动
    f1 = np.array([contour_at(f["f1"], x) for x in t])
    f2 = np.array([contour_at(f["f2"], x) for x in t])
    v1 = block_filter(out, bandpass_fn(f1, 4.5)) * float(f.get("f1Gain", 1.0))
    v2 = block_filter(out, bandpass_fn(f2, 4.5)) * float(f.get("f2Gain", 0.6))
    direct = out * float(f.get("directGain", 0.18))

    mix = v1 + v2 + direct

    # ④ 呼吸噪声层：白噪 → 宽带通（跟 F2 末端）→ 低增益
    breath = float(f.get("breath", 0.12))
    if breath:
        rng = np.random.default_rng(7)
        ns = rng.uniform(-1, 1, n)
        nb = block_filter(ns, bandpass_fn(np.full(n, f2[-1] * 0.85), 1.2))
        mix = mix + nb * (float(f["gain"]) * breath)

    # 主包络（master）
    env = adsr_exp(n, SR, 0.0, dur, float(f["gain"]), float(f.get("attack", 0.04)), float(f.get("release", 0.2)))
    mix = mix * env

    # 喉震 AM：am → master.gain（乘性）
    if f.get("amHz"):
        depth = float(f.get("amDepth", 0.3))
        mix = mix * (1.0 + depth * np.sin(2 * np.pi * f["amHz"] * t))

    return mix


def block_filter(x, coef_fn, block=64):
    """分块时变 biquad（每 block 更新一次系数，近似 WebAudio 的 a-rate 平滑）"""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = coef_fn(i)
        seg = x[i:i + block]
        y[i:i + block], zi = lfilter(b, a, seg, zi=zi)
    return y


def lowpass_fn(fc, q):
    cache = {}

    def fn(i):
        k = int(fc) if not hasattr(fc, "__len__") else int(fc[i])
        if k not in cache:
            cache[k] = rbj_lowpass(max(k, 20), q)
        return cache[k]
    return fn


def bandpass_fn(fc, q):
    cache = {}

    def fn(i):
        k = int(fc) if not hasattr(fc, "__len__") else int(fc[i])
        k = max(40, min(k, SR // 2 - 200))
        key = k // 8
        if key not in cache:
            cache[key] = rbj_bandpass(k, q)
        return cache[key]
    return fn


# ---------------------------------------------------------------- 指标
def analyze(x, sr=SR):
    """F0 中位（自相关）/ 谱重心 / 时长 / 峰值"""
    x = x / (np.max(np.abs(x)) + 1e-9)
    # 有效段：包络大于峰值 20%
    env = np.abs(x)
    win = int(0.02 * sr)
    e = np.convolve(env, np.ones(win) / win, mode="same")
    idx = np.where(e > 0.15)[0]
    if len(idx) < win * 2:
        return dict(f0=0, centroid=0, dur=0, peak=0)
    seg = x[idx[0]:idx[-1]]
    # 自相关估 F0（取 70–1200Hz）
    seg2 = seg - seg.mean()
    ac = np.correlate(seg2, seg2, mode="full")[len(seg2) - 1:]
    lo, hi = int(sr / 1200), int(sr / 70)
    lag = lo + int(np.argmax(ac[lo:hi]))
    f0 = sr / lag
    # 谱重心
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    fr = np.fft.rfftfreq(len(seg), 1 / sr)
    centroid = float((sp * fr).sum() / (sp.sum() + 1e-9))
    return dict(f0=float(f0), centroid=centroid, dur=len(seg) / sr,
                peak=float(np.max(np.abs(x))))


def write_wav(path, x, sr=SR):
    import wave
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.88     # 归一化，避免削波
    pcm = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def main():
    args = [a for a in sys.argv[1:]]
    tag = ""
    if "--tag" in args:
        k = args.index("--tag")
        tag = "-" + args[k + 1]
        del args[k:k + 2]
    sfx = parse_sfx(SOUND_JS)
    if "--json" in args:
        print(json.dumps(sfx, ensure_ascii=False, indent=1)[:4000])
        return
    names = [a for a in args if not a.startswith("--")] or [
        k for k, v in sfx.items() if "formant" in v]
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for name in names:
        spec = sfx[name]
        if "formant" not in spec:
            print(f"skip {name}（无 formant）")
            continue
        # repeat（节奏型音效）：按 gap 间隔重复同一段，模拟 play() 里的多次起音
        rep = spec.get("repeat")
        if rep:
            gap, times = float(rep["gap"]), int(rep["times"])
            one = render_formant(spec)
            total = int((gap * (times - 1) + float(spec["formant"]["dur"])) * SR) + 1
            audio = np.zeros(total)
            for i in range(times):
                a0 = int(i * gap * SR)
                audio[a0:a0 + len(one)] += one
        else:
            audio = render_formant(spec)
        path = os.path.join(OUT, f"{name}{tag}.wav")
        write_wav(path, audio)
        m = analyze(audio)
        rows.append((name, m))
        print(f"{name:9s} F0={m['f0']:6.0f}Hz  谱重心={m['centroid']:5.0f}Hz  "
              f"时长={m['dur']:.2f}s  -> {path}")
    return rows


if __name__ == "__main__":
    main()
