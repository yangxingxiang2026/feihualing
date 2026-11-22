# -*- coding: utf-8 -*-
"""
小老虎叫声 —— 离线物理模型合成器（Klatt 路线），替代 WebAudio 的「锯齿波 + 2 带通」。

为什么换：
  WebAudio 实时合成只有「锯齿振荡器 + 2 个 bandpass」可用，锯齿波的谐波幅度是
  1/n 且相位锁死（听起来像卡祖笛/电子哨），两个带通只能勾出 F1/F2 两条包络，
  F3/F4 缺失 → 声道共鸣是「空心的」。这就是无论怎么调参数都「不像活物」的根因。

本工具做的（真·声源-滤波器模型）：
  ① 声源 = Rosenberg 声门脉冲串的导数（闭合瞬间是一个尖峰，宽带谐波天然自然），
     不是锯齿波；基频轮廓 + 次谐波抖动(jitter) + 幅度抖动(shimmer) + 末尾破音(creak)；
  ② 声道 = 4 个级联二阶共振峰（F1..F4），中心频率随时间滑动（元音 a→u 的物理实现），
     带宽 90/120/170/240Hz —— 比 WebAudio 的 Q=4.5 带通宽得多，才不是哨音；
  ③ 气声 = 白噪经同一组共振峰染色（起音与收尾更多，模拟声门漏气）；
  ④ 房间 = 3 条早期反射（4/7/11ms），去掉「贴脸干声」的合成感；
  ⑤ 后级 = 一阶低通 7kHz 削闭合尖峰、tanh 软饱和、去直流、峰值归一。

用法：
  python tools/render_voice.py              # 渲染全部到 D:/WorkBuddyData/outputs/feihualing_audio/v11/
  python tools/render_voice.py --emit-js    # 追加输出 js/app/voice_data.js（base64 PCM，游戏内播放）
  python tools/render_voice.py --sheet      # 输出频谱+波形对照图，供人工核对共振峰轨迹
"""
import argparse
import base64
import json
import os
import struct
import sys

import numpy as np

SR = 22050          # 22.05kHz：共振峰到 4.8kHz 够用，体积只有 44.1k 的一半
OUT_DIR = r'D:\WorkBuddyData\outputs\feihualing_audio\v11'
JS_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'app', 'voice_data.js')


# ---------------------------------------------------------------- 基础部件
def interp(t, pts):
    """pts = [(秒, 值), ...] 线性插值成与 t 同长的曲线"""
    xs = np.array([p[0] for p in pts], dtype=float)
    ys = np.array([p[1] for p in pts], dtype=float)
    return np.interp(t, xs, ys)


def smooth_noise(n, cutoff_hz=25.0, seed=0):
    """低通随机序列，均值 0、标准差 1 —— 用来做 jitter / shimmer 的「活物感」"""
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    # 一阶低通（截止越低越「慢抖」）
    a = np.exp(-2 * np.pi * cutoff_hz / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(n):
        acc = a * acc + (1 - a) * x[i]
        y[i] = acc
    y -= y.mean()
    s = y.std()
    return y / s if s > 1e-9 else y


def rosenberg_flow(phase, oq=0.62, op=0.70):
    """
    声门气流（Rosenberg 模型）。phase ∈ [0,1) = 一个基音周期。
    oq = 开商（声门张开时间占比）；op = 开相中「渐开」所占比例，其余为「快闭」。
    """
    ph = np.mod(phase, 1.0)
    tp = oq * op
    tn = oq * (1.0 - op)
    g = np.zeros_like(ph)
    m1 = ph < tp
    if tp > 0:
        g[m1] = 0.5 * (1.0 - np.cos(np.pi * ph[m1] / tp))
    m2 = (ph >= tp) & (ph < tp + tn)
    if tn > 0:
        g[m2] = np.cos(np.pi * (ph[m2] - tp) / (2.0 * tn))
    return g


def resonator(x, f_track, bw):
    """
    级联二阶共振峰（Klatt resonator），中心频率逐样本滑动。
    y[n] = a0*x[n] + b1*y[n-1] + b2*y[n-2]
    """
    y = np.empty_like(x)
    y1 = y2 = 0.0
    for i in range(len(x)):
        f = f_track[i]
        r = np.exp(-np.pi * bw / SR)
        theta = 2.0 * np.pi * f / SR
        b1 = 2.0 * r * np.cos(theta)
        b2 = -r * r
        a0 = 1.0 - b1 - b2
        v = a0 * x[i] + b1 * y1 + b2 * y2
        y2 = y1
        y1 = v
        y[i] = v
    return y


def one_pole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def envelope(t, dur, attack, release, shape=1.0):
    """快起 + 平台 + 收尾；shape>1 让平台更「顶」"""
    env = np.ones_like(t)
    na = max(1, int(attack * SR))
    nr = max(1, int(release * SR))
    if na < len(env):
        env[:na] = np.linspace(0, 1, na) ** 0.7
    if nr < len(env):
        env[-nr:] = (np.linspace(1, 0, nr) ** shape)
    return env


# ---------------------------------------------------------------- 主合成
def synth(v):
    dur = v['dur']
    n = int(dur * SR) + 1
    t = np.arange(n) / SR
    rng = np.random.default_rng(v.get('seed', 7))

    # ---- ① 基频轮廓 + jitter + 颤音 + 破音
    f0 = interp(t, v['f0'])
    jit = v.get('jitter', 0.02) * smooth_noise(n, 18.0, v.get('seed', 7))
    vib = v.get('vib', 0.0) * np.sin(2 * np.pi * v.get('vib_hz', 6.5) * t)
    f0 = f0 * (1.0 + jit + vib)

    creak_at = v.get('creak_at')       # 破音起点（秒）：最后这一段声带松弛、周期不稳
    if creak_at is not None:
        m = t >= creak_at
        k = np.clip((t - creak_at) / max(1e-3, dur - creak_at), 0, 1)
        f0 = np.where(m, f0 * (1.0 - 0.10 * k) * (1.0 + 0.06 * k * smooth_noise(n, 45.0, 3)), f0)

    phase = np.cumsum(f0 / SR)
    src = rosenberg_flow(phase, v.get('oq', 0.62), v.get('op', 0.70))
    src = np.diff(np.concatenate([[0.0], src]))     # 气流导数 = 声源（闭合尖峰）

    # ---- ①b shimmer：周期幅度微抖（真声带每个周期的幅度都不一样）
    src = src * (1.0 + v.get('shimmer', 0.06) * smooth_noise(n, 35.0, 11))

    # ---- ② 声道：4 级级联共振峰
    y = src
    for pts, bw in zip(v['formants'], v['bw']):
        y = resonator(y, interp(t, pts), bw)

    # ---- ③ 气声：白噪过同一组共振峰（只走前两级，模拟声门漏气的宽带嘶声）。
    #     电平按人声 RMS 定标（比例 asp）， blindly 乘常数会把人声淹没（v1 实锤）。
    asp = v.get('aspiration', 0.05)
    if asp > 0:
        nz = rng.standard_normal(n)
        nz = resonator(nz, interp(t, v['formants'][1]), v['bw'][1])
        voice_rms = np.sqrt((y ** 2).mean()) + 1e-9
        nz = nz / (np.sqrt((nz ** 2).mean()) + 1e-9)      # 白噪归一到 RMS 1
        # 气声权重：起音和收尾更多（开口瞬间与收口漏气）
        w = 0.45 + 0.55 * np.clip(t / max(1e-3, v.get('attack', 0.012) * 3), 0, 1)
        w = w * (0.55 + 0.45 * np.clip((dur - t) / max(1e-3, v.get('release', 0.12) * 2), 0, 1))
        y = y + asp * voice_rms * nz * w

    # ---- 包络
    env = envelope(t, dur, v.get('attack', 0.012), v.get('release', 0.12), v.get('env_shape', 1.0))
    y = y * env

    # ---- ⑤ 后级：削尖峰 → 软饱和 → 早期反射 → 归一
    y = one_pole_lp(y, v.get('lp', 7000))
    y = np.tanh(y / (np.max(np.abs(y)) + 1e-9) * 1.6)
    y = early_reflections(y, v.get('room', 1.0))
    y = y - y.mean()
    y = y / (np.max(np.abs(y)) + 1e-9) * v.get('gain', 0.86)
    return y


def early_reflections(x, amount=1.0):
    """3 条早期反射：留一点空间感，但不要变成大厅（宠物就在手边）"""
    if amount <= 0:
        return x
    out = x.copy()
    for ms, g in ((4.0, -14.0), (7.5, -18.0), (11.0, -22.0)):
        d = int(ms * 1e-3 * SR)
        if d < len(x):
            out[d:] += x[:-d] * (10 ** (g / 20.0)) * amount
    return out


def write_wav(path, x):
    pcm = np.clip(x, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype('<i2')
    data = pcm.tobytes()
    hdr = b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack(
        '<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16) + b'data' + struct.pack('<I', len(data))
    with open(path, 'wb') as f:
        f.write(hdr + data)
    return len(data) + 44


def metrics(x):
    n = len(x)
    win = int(0.02 * SR)
    # 谱重心
    X = np.abs(np.fft.rfft(x * np.hanning(n)))
    f = np.fft.rfftfreq(n, 1 / SR)
    cen = float((X * f).sum() / (X.sum() + 1e-9))
    # F0：自相关（取 200-1200Hz 区间）
    xc = np.correlate(x, x, 'full')[n - 1:]
    lo, hi = int(SR / 1200), int(SR / 200)
    lag = lo + int(np.argmax(xc[lo:hi]))
    return dict(dur=n / SR, peak=float(np.max(np.abs(x))),
                rms=float(np.sqrt((x ** 2).mean())), centroid=cen, f0=SR / lag)


# ---------------------------------------------------------------- 音色配方
def seg_call(dur, f0_pts, f_pts, amp=1.0, **kw):
    v = dict(dur=dur, f0=f0_pts, formants=f_pts, bw=[90, 120, 170, 240])
    v.update(kw)
    return v


# 摸头「嗷呜」：a→u 的元音收圆，末尾破音（真正让叫声「活」的细节）
PURR = seg_call(0.60,
    [(0, 470), (0.05, 650), (0.13, 805), (0.21, 780), (0.34, 655), (0.46, 515), (0.60, 395)],
    [[(0, 1120), (0.13, 1310), (0.34, 1040), (0.60, 645)],
     [(0, 2420), (0.13, 2760), (0.34, 2280), (0.60, 1240)],
     [(0, 3850), (0.30, 3680), (0.60, 2870)],
     [(0, 4700), (0.60, 4180)]],
    attack=0.014, release=0.16, jitter=0.018, vib=0.006, vib_hz=6.5,
    aspiration=0.050, creak_at=0.47, oq=0.60, shimmer=0.07, seed=17)

# 挠脚「咿」：短、快升、气声多（被挠到痒的那种短促）
CHIRP = seg_call(0.28,
    [(0, 760), (0.06, 1130), (0.13, 1090), (0.28, 705)],
    [[(0, 1250), (0.08, 1520), (0.28, 800)],
     [(0, 2680), (0.08, 3120), (0.28, 1490)],
     [(0, 3980), (0.28, 3180)],
     [(0, 4750), (0.28, 4300)]],
    attack=0.009, release=0.10, jitter=0.024, vib=0.008, vib_hz=8.0,
    aspiration=0.075, oq=0.66, shimmer=0.08, seed=23)

# 摸肚「惊叫」：高、急、带哭腔（起音有上冲，收尾掉得快）
YELP = seg_call(0.34,
    [(0, 720), (0.03, 1130), (0.09, 1245), (0.18, 1010), (0.34, 640)],
    [[(0, 1330), (0.08, 1680), (0.34, 840)],
     [(0, 2820), (0.08, 3320), (0.34, 1680)],
     [(0, 3950), (0.34, 3050)],
     [(0, 4700), (0.34, 4200)]],
    attack=0.007, release=0.11, jitter=0.03, vib=0.012, vib_hz=7.5,
    aspiration=0.095, oq=0.68, shimmer=0.09, seed=31)

# 太空步单拍「嗷」：短促上扬，一点点亮（踩点要清楚）
STEP = seg_call(0.42,
    [(0, 545), (0.05, 820), (0.12, 845), (0.26, 690), (0.42, 520)],
    [[(0, 1130), (0.12, 1330), (0.42, 780)],
     [(0, 2430), (0.12, 2790), (0.42, 1560)],
     [(0, 3880), (0.42, 3200)],
     [(0, 4700), (0.42, 4250)]],
    attack=0.010, release=0.12, jitter=0.02, vib=0.007, vib_hz=7.0,
    aspiration=0.055, oq=0.62, shimmer=0.07, seed=41)

# 狂笑三连「哈·哈·哈」：一次连续发声里的 3 个幅度脉冲（v2）。
# v1 按段拼接，段边界上滤波器状态重置产生全频带爆点（频谱竖线实锤）；
# 连续声源 + 脉冲包络才像「一口气笑三声」，音高逐个上抬。
def pulse_env(t, onsets, peaks, attack, decay, dur, fade=0.05):
    env = np.zeros_like(t)
    for ti, p in zip(onsets, peaks):
        up = np.clip((t - ti) / attack, 0, 1)
        dn = np.exp(-np.clip(t - ti, 0, None) / decay)
        env = np.maximum(env, p * up * dn)
    tail = np.ones_like(t)
    nf = max(1, int(fade * SR))
    tail[-nf:] = np.linspace(1, 0, nf) ** 1.5
    return env * tail


def build_laugh():
    dur = 0.66
    t = np.arange(int(dur * SR) + 1) / SR
    v = dict(dur=dur,
        f0=[(0, 660), (0.08, 880), (0.19, 690), (0.28, 920), (0.40, 715), (0.50, 985), (0.66, 620)],
        formants=[[(0, 1180), (0.66, 860)],
                  [(0, 2620), (0.30, 2860), (0.66, 1420)],
                  [(0, 3880), (0.66, 3080)],
                  [(0, 4700), (0.66, 4200)]],
        bw=[95, 125, 175, 245],
        attack=0.010, release=0.10, jitter=0.03, vib=0.010, vib_hz=8.5,
        aspiration=0.085, oq=0.64, shimmer=0.10, seed=51)
    x = synth(v)
    # 覆盖包络：3 个脉冲（哈·哈·哈），峰逐个抬高
    env = pulse_env(t, [0.0, 0.225, 0.45], [0.95, 1.0, 1.08], 0.010, 0.085, dur)
    x = x * env / (np.max(np.abs(x * env)) + 1e-9) * 0.86
    return x


VOICES = {'purr': PURR, 'chirp': CHIRP, 'yelp': YELP, 'step': STEP}


def render_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {}
    for k, v in VOICES.items():
        x = synth(v)
        p = os.path.join(OUT_DIR, f'{k}.wav')
        size = write_wav(p, x)
        m = metrics(x)
        out[k] = x
        print('%-6s %5.2fs  F0≈%4.0fHz  谱重心%5.0fHz  峰值%.2f  %5.1fKB' %
              (k, m['dur'], m['f0'], m['centroid'], m['peak'], size / 1024))
    x = build_laugh()
    size = write_wav(os.path.join(OUT_DIR, 'laugh.wav'), x)
    m = metrics(x)
    out['laugh'] = x
    print('%-6s %5.2fs  F0≈%4.0fHz  谱重心%5.0fHz  峰值%.2f  %5.1fKB' %
          ('laugh', m['dur'], m['f0'], m['centroid'], m['peak'], size / 1024))
    return out


def emit_js(voices):
    """把 wav 的 PCM 段以 base64 内联成 JS 模块（游戏里 decodeAudioData 后播放）"""
    chunks = []
    total = 0
    for k in ('purr', 'chirp', 'yelp', 'laugh', 'step'):
        p = os.path.join(OUT_DIR, f'{k}.wav')
        with open(p, 'rb') as f:
            raw = f.read()
        # 剥掉 44 字节头，只留 PCM（游戏侧按 SR/16bit/mono 重建 AudioBuffer）
        b64 = base64.b64encode(raw[44:]).decode('ascii')
        total += len(b64)
        chunks.append((k, b64))
    lines = [
        "'use strict';",
        '/**',
        ' * 小老虎叫声采样（由 tools/render_voice.py 生成，勿手改）。',
        ' * 为什么改成采样：WebAudio 的锯齿波 + 2 带通做不出声门脉冲与 F3/F4，',
        ' * 调多久都是「电子哨」。离线用物理模型（Rosenberg 声门脉冲 + 4 级共振峰',
        ' * + 气声 + 破音）渲染成 PCM，运行时 decodeAudioData 直接播。',
        ' * 纯 PCM（无 WAV 头）：22.05kHz / 单声道 / 16bit 小端。',
        ' * 解码失败（旧基础库无 decodeAudioData）时 sound.js 自动落回实时合成。',
        ' */',
        'const SR = %d;' % SR,
    ]
    for k, b64 in chunks:
        lines.append('const %s =' % k.upper())
        # 每 120 字符切一行，避免超长单行影响调试
        for i in range(0, len(b64), 120):
            lines.append("  '%s' +" % b64[i:i + 120])
        lines[-1] = lines[-1].rstrip(' +') + ';'
    lines.append('')
    lines.append('module.exports = { SR,')
    lines.append('  purr: PURR, chirp: CHIRP, yelp: YELP, laugh: LAUGH, step: STEP };')
    with open(JS_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    print('written %s  (base64 %.1fKB)' % (os.path.relpath(JS_OUT), total / 1024))


def sheet(voices):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    keys = ['purr', 'chirp', 'yelp', 'laugh', 'step']
    fig, axes = plt.subplots(len(keys), 2, figsize=(13, 2.1 * len(keys)))
    for i, k in enumerate(keys):
        x = voices[k]
        t = np.arange(len(x)) / SR
        ax = axes[i][0]
        ax.specgram(x, NFFT=512, Fs=SR, noverlap=384, cmap='magma')
        ax.set_ylim(0, 5200); ax.set_ylabel('Hz'); ax.set_title(f'{k} spectrogram', fontsize=9)
        ax2 = axes[i][1]
        ax2.plot(t, x, lw=0.35, color='#6B4423')
        ax2.set_title(f'{k} waveform  {len(x)/SR:.2f}s', fontsize=9)
        ax2.set_xlim(0, t[-1])
    plt.tight_layout()
    p = os.path.join(OUT_DIR, 'voices-contact-sheet.png')
    plt.savefig(p, dpi=105)
    print('sheet', p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--emit-js', action='store_true')
    ap.add_argument('--sheet', action='store_true')
    a = ap.parse_args()
    v = render_all()
    if a.sheet:
        sheet(v)
    if a.emit_js:
        emit_js(v)


if __name__ == '__main__':
    main()
