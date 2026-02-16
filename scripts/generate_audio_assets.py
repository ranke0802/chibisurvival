from __future__ import annotations

from pathlib import Path
import wave

import numpy as np

SR = 32000
BGM_ROOT = Path('public/audio/bgm')
SFX_ROOT = Path('public/audio/sfx')


def ensure_dirs() -> None:
    BGM_ROOT.mkdir(parents=True, exist_ok=True)
    SFX_ROOT.mkdir(parents=True, exist_ok=True)


def note_to_freq(note: str) -> float:
    table = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    if note == '-':
        return 0.0
    letter = note[0]
    sharp = 1 if '#' in note else 0
    octave = int(note[-1])
    midi = (octave + 1) * 12 + table[letter] + sharp
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def adsr(length: int, attack: float, decay: float, sustain: float, release: float) -> np.ndarray:
    env = np.zeros(length, dtype=np.float32)
    a = min(length, max(1, int(length * attack)))
    d = min(length - a, max(1, int(length * decay)))
    r = min(length - a - d, max(1, int(length * release)))
    s = max(0, length - a - d - r)

    env[:a] = np.linspace(0.0, 1.0, a, endpoint=False)
    env[a:a + d] = np.linspace(1.0, sustain, d, endpoint=False)
    env[a + d:a + d + s] = sustain
    env[a + d + s:a + d + s + r] = np.linspace(sustain, 0.0, r, endpoint=True)
    return env


def osc(kind: str, freq: float, length: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(length, dtype=np.float32) / SR
    w = 2.0 * np.pi * freq * t + phase
    if kind == 'sine':
        return np.sin(w, dtype=np.float32)
    if kind == 'triangle':
        return (2.0 / np.pi) * np.arcsin(np.sin(w))
    if kind == 'saw':
        return 2.0 * ((freq * t + phase / (2.0 * np.pi)) % 1.0) - 1.0
    if kind == 'square':
        return np.sign(np.sin(w))
    return np.zeros(length, dtype=np.float32)


def lowpass(signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
    if cutoff_hz <= 0:
        return signal
    rc = 1.0 / (2 * np.pi * cutoff_hz)
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    out = np.zeros_like(signal)
    prev = 0.0
    for i in range(signal.shape[0]):
        prev = prev + alpha * (signal[i] - prev)
        out[i] = prev
    return out


def simple_reverb(signal: np.ndarray, mix: float = 0.22) -> np.ndarray:
    taps = [(int(0.097 * SR), 0.35), (int(0.163 * SR), 0.27), (int(0.241 * SR), 0.2)]
    wet = np.copy(signal)
    for delay, gain in taps:
        delayed = np.zeros_like(signal)
        delayed[delay:] = signal[:-delay] * gain
        wet += delayed
    return signal * (1.0 - mix) + wet * mix


def soft_clip(signal: np.ndarray, drive: float = 1.35) -> np.ndarray:
    return np.tanh(signal * drive)


def write_wav(path: Path, mono: np.ndarray) -> None:
    mono = np.clip(mono, -1.0, 1.0)
    data = (mono * 32767.0).astype(np.int16)
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(data.tobytes())


def add_note(
    buf: np.ndarray,
    start_sec: float,
    dur_sec: float,
    freq: float,
    amp: float,
    wave_kind: str,
    cutoff: float,
    env_shape: tuple[float, float, float, float],
    vibrato_hz: float = 0.0,
    vibrato_depth: float = 0.0,
) -> None:
    if freq <= 0:
        return
    start = int(start_sec * SR)
    length = int(dur_sec * SR)
    if length <= 2 or start >= buf.shape[0]:
        return
    end = min(buf.shape[0], start + length)
    length = end - start
    if length <= 2:
        return

    t = np.arange(length, dtype=np.float32) / SR
    if vibrato_hz > 0 and vibrato_depth > 0:
        inst_freq = freq * (1.0 + np.sin(2.0 * np.pi * vibrato_hz * t) * vibrato_depth)
        phase = np.cumsum(inst_freq) * (2.0 * np.pi / SR)
        base = np.sin(phase, dtype=np.float32)
    else:
        base = osc(wave_kind, freq, length)

    env = adsr(length, *env_shape)
    tone = base * env * amp
    if wave_kind in {'saw', 'square'}:
        tone = lowpass(tone, cutoff)
    buf[start:end] += tone


def chord_for_symbol(symbol: str) -> list[int]:
    symbol = symbol.strip()
    if symbol.endswith('m'):
        return [0, 3, 7]
    if symbol.endswith('7'):
        return [0, 4, 7, 10]
    return [0, 4, 7]


def build_track(
    out_path: Path,
    tempo: int,
    progression: list[str],
    key_root: str,
    lead_octave: int,
    bass_octave: int,
    intensity: float,
) -> None:
    beats_per_bar = 4
    bar_sec = beats_per_bar * 60.0 / tempo
    total_sec = len(progression) * bar_sec
    length = int(total_sec * SR)
    buf = np.zeros(length, dtype=np.float32)

    root_freq = note_to_freq(f'{key_root}{bass_octave}')
    lead_root = note_to_freq(f'{key_root}{lead_octave}')

    melody_pattern = [0, 2, 4, 7, 9, 7, 4, 2]
    rhythm = [0.5, 0.5, 0.5, 0.5, 1.0, 0.5, 0.5]

    for bar, symbol in enumerate(progression):
        bar_start = bar * bar_sec
        quality = chord_for_symbol(symbol)
        is_minor = symbol.endswith('m')
        root_shift = 0
        if symbol[0] != key_root:
            note_name = symbol[0]
            sharp = 1 if '#' in symbol else 0
            key_class = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[key_root]
            chord_class = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[note_name] + sharp
            root_shift = (chord_class - key_class) % 12

        chord_freqs = [root_freq * 2 ** (semi / 12.0) for semi in [root_shift + n for n in quality]]
        pad_freqs = [f * 2.0 for f in chord_freqs]

        for cf in pad_freqs:
            add_note(
                buf,
                start_sec=bar_start,
                dur_sec=bar_sec * 1.02,
                freq=cf,
                amp=0.058 * intensity,
                wave_kind='saw',
                cutoff=1100,
                env_shape=(0.18, 0.22, 0.65, 0.3),
                vibrato_hz=4.2,
                vibrato_depth=0.003,
            )

        beat_root = chord_freqs[0]
        for beat in range(beats_per_bar):
            add_note(
                buf,
                start_sec=bar_start + beat * 60.0 / tempo,
                dur_sec=0.46 * 60.0 / tempo,
                freq=beat_root,
                amp=0.16 * intensity,
                wave_kind='triangle',
                cutoff=700,
                env_shape=(0.02, 0.16, 0.42, 0.2),
            )

        arp = [0, 2, 1, 2, 0, 2, 1, 3] if len(chord_freqs) > 3 else [0, 1, 2, 1, 0, 1, 2, 1]
        for i, idx in enumerate(arp):
            f = chord_freqs[idx % len(chord_freqs)] * 4.0
            add_note(
                buf,
                start_sec=bar_start + i * (bar_sec / 8.0),
                dur_sec=bar_sec / 9.5,
                freq=f,
                amp=0.048 * intensity,
                wave_kind='sine',
                cutoff=1800,
                env_shape=(0.01, 0.15, 0.35, 0.2),
            )

        ptr = 0.0
        motif_shift = (bar % 4) - 1
        for step, length_beats in zip(melody_pattern[: len(rhythm)], rhythm):
            freq = lead_root * 2 ** ((root_shift + step + motif_shift) / 12.0)
            if is_minor and step in {4, 9}:
                freq *= 2 ** (-1 / 12.0)
            add_note(
                buf,
                start_sec=bar_start + ptr * 60.0 / tempo,
                dur_sec=length_beats * 0.82 * 60.0 / tempo,
                freq=freq,
                amp=0.072 * intensity,
                wave_kind='triangle',
                cutoff=1400,
                env_shape=(0.03, 0.18, 0.5, 0.24),
                vibrato_hz=5.0,
                vibrato_depth=0.01,
            )
            ptr += length_beats
            if ptr >= beats_per_bar:
                break

    beat_sec = 60.0 / tempo
    for i in range(int(total_sec / beat_sec)):
        start = i * beat_sec
        add_note(
            buf,
            start_sec=start,
            dur_sec=0.16,
            freq=54 + (i % 2) * 2,
            amp=0.12 * intensity,
            wave_kind='sine',
            cutoff=320,
            env_shape=(0.0, 0.2, 0.0, 0.8),
        )
        if i % 2 == 1:
            n_start = int((start + beat_sec * 0.5) * SR)
            n_len = int(0.08 * SR)
            if n_start + n_len < buf.shape[0]:
                noise = np.random.uniform(-1.0, 1.0, n_len).astype(np.float32)
                noise = lowpass(noise, 4800) * adsr(n_len, 0.02, 0.22, 0.25, 0.56) * 0.024 * intensity
                buf[n_start:n_start + n_len] += noise

    buf = lowpass(buf, 9200)
    buf = simple_reverb(buf, mix=0.26)
    buf = soft_clip(buf)
    peak = np.max(np.abs(buf)) + 1e-9
    buf = buf / peak * 0.78
    write_wav(out_path, buf)


def tone_sfx(freq_a: float, freq_b: float, dur: float, amp: float, kind: str = 'sine') -> np.ndarray:
    length = int(dur * SR)
    sweep = np.linspace(freq_a, freq_b, length, dtype=np.float32)
    phase = np.cumsum(sweep) * (2.0 * np.pi / SR)
    if kind == 'triangle':
        sig = (2.0 / np.pi) * np.arcsin(np.sin(phase))
    elif kind == 'saw':
        sig = 2.0 * ((phase / (2.0 * np.pi)) % 1.0) - 1.0
    else:
        sig = np.sin(phase, dtype=np.float32)
    env = adsr(length, 0.04, 0.26, 0.45, 0.25)
    return sig * env * amp


def noise_sfx(dur: float, amp: float, cutoff: float) -> np.ndarray:
  length = int(dur * SR)
  sig = np.random.uniform(-1.0, 1.0, length).astype(np.float32)
  sig = lowpass(sig, cutoff)
  env = adsr(length, 0.03, 0.22, 0.3, 0.45)
  return sig * env * amp


def mix_signals(*signals: np.ndarray) -> np.ndarray:
    if not signals:
        return np.zeros(1, dtype=np.float32)
    length = max(signal.shape[0] for signal in signals)
    out = np.zeros(length, dtype=np.float32)
    for signal in signals:
        out[: signal.shape[0]] += signal
    return out


def generate_sfx() -> None:
    sfx_map: list[tuple[str, np.ndarray]] = [
        ('ui_click.wav', tone_sfx(1100, 820, 0.08, 0.35, 'triangle')),
        ('player_attack.wav', mix_signals(tone_sfx(340, 210, 0.12, 0.3, 'triangle'), noise_sfx(0.12, 0.06, 4200))),
        ('skill_lightning.wav', mix_signals(noise_sfx(0.26, 0.28, 6400), tone_sfx(880, 260, 0.22, 0.14, 'saw'))),
        ('skill_blade.wav', mix_signals(tone_sfx(640, 420, 0.11, 0.22, 'triangle'), noise_sfx(0.11, 0.08, 5200))),
        ('skill_laser.wav', mix_signals(tone_sfx(190, 980, 0.33, 0.26, 'saw'), tone_sfx(980, 520, 0.15, 0.11, 'sine'))),
        ('player_hit.wav', mix_signals(noise_sfx(0.2, 0.22, 2600), tone_sfx(170, 90, 0.2, 0.12, 'triangle'))),
        ('monster_die.wav', mix_signals(noise_sfx(0.13, 0.16, 3200), tone_sfx(230, 120, 0.13, 0.08, 'sine'))),
        ('boss_spawn.wav', tone_sfx(120, 520, 0.72, 0.34, 'saw')),
        ('boss_die.wav', tone_sfx(740, 120, 0.64, 0.28, 'triangle')),
        ('level_up.wav', mix_signals(tone_sfx(420, 820, 0.3, 0.22, 'triangle'), tone_sfx(840, 1240, 0.24, 0.14, 'sine'))),
        ('stage_clear.wav', tone_sfx(360, 1020, 0.46, 0.24, 'sine')),
        ('game_over.wav', tone_sfx(380, 70, 0.62, 0.24, 'triangle')),
        ('victory.wav', mix_signals(tone_sfx(420, 1320, 0.58, 0.27, 'triangle'), tone_sfx(1200, 860, 0.4, 0.12, 'sine'))),
        ('player_move_loop.wav', noise_sfx(0.8, 0.055, 1900)),
        ('monster_swarm_loop.wav', mix_signals(tone_sfx(66, 72, 1.4, 0.07, 'sine'), noise_sfx(1.4, 0.03, 1200))),
    ]

    for filename, signal in sfx_map:
        sig = simple_reverb(signal, mix=0.08)
        peak = np.max(np.abs(sig)) + 1e-9
        sig = sig / peak * 0.92
        write_wav(SFX_ROOT / filename, sig)


def generate_bgm() -> None:
    progression_stage = [
        'Dm', 'Bb', 'F', 'C',
        'Gm', 'Dm', 'A', 'A',
        'Dm', 'Bb', 'F', 'C',
        'Gm', 'Dm', 'A', 'A',
        'F', 'C', 'Dm', 'Bb',
        'Gm', 'Dm', 'A', 'A',
    ]

    build_track(BGM_ROOT / 'menu_theme.wav', 90, progression_stage, 'D', 5, 2, 0.84)
    build_track(BGM_ROOT / 'stage_theme_1.wav', 96, progression_stage, 'D', 5, 2, 1.0)
    build_track(BGM_ROOT / 'stage_theme_2.wav', 98, progression_stage, 'E', 5, 2, 1.02)
    build_track(BGM_ROOT / 'stage_theme_3.wav', 100, progression_stage, 'F', 5, 2, 1.04)
    build_track(BGM_ROOT / 'stage_theme_4.wav', 102, progression_stage, 'G', 5, 2, 1.06)
    build_track(BGM_ROOT / 'stage_theme_5.wav', 104, progression_stage, 'A', 5, 2, 1.08)
    build_track(BGM_ROOT / 'boss_theme.wav', 112, progression_stage, 'C', 5, 2, 1.18)
    build_track(BGM_ROOT / 'results_theme.wav', 86, progression_stage[:12], 'F', 5, 2, 0.72)


def main() -> None:
    ensure_dirs()
    generate_bgm()
    generate_sfx()


if __name__ == '__main__':
    main()
