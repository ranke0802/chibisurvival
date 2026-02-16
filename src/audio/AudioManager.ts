import bgmData from './bgm.json';
import sfxData from './sfx.json';
import type { AudioEventType } from '../game/types';

type SfxPreset = {
  file: string;
  volume: number;
  cooldownMs?: number;
  pitchJitter?: number;
  duck?: number;
  loop?: boolean;
};

type BgmPreset = {
  file: string;
  volume: number;
  fadeInSec?: number;
  fadeOutSec?: number;
};

type LoopVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  file: string;
};

const SFX_PRESETS = sfxData as Record<AudioEventType, SfxPreset>;
const BGM_TRACKS = bgmData as Record<string, BgmPreset>;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export class AudioManager {
  private context: AudioContext | null = null;

  private unlocked = false;

  private masterGain: GainNode | null = null;

  private sfxGain: GainNode | null = null;

  private bgmGain: GainNode | null = null;

  private bgmDuckGain: GainNode | null = null;

  private desiredTrack: string | null = null;

  private currentTrack: string | null = null;

  private activeBgmSource: AudioBufferSourceNode | null = null;

  private activeBgmTrackGain: GainNode | null = null;

  private bufferCache = new Map<string, AudioBuffer>();

  private loadPromise: Promise<void> | null = null;

  private loopVoices = new Map<AudioEventType, LoopVoice>();

  private lastPlayAtMs = new Map<AudioEventType, number>();

  private bgmRequestId = 0;

  private masterLevel = 0.82;

  private bgmLevel = 0.68;

  private sfxLevel = 0.76;

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    this.unlocked = true;
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => {
        void this.ensureBuffersLoaded().then(() => {
          void this.syncDesiredBgm();
        });
      });
      return;
    }

    void this.ensureBuffersLoaded().then(() => {
      void this.syncDesiredBgm();
    });
  }

  destroy(): void {
    this.stopAllLoops();
    this.fadeOutCurrentBgm(0.08);

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.bgmDuckGain = null;
    this.bufferCache.clear();
    this.loadPromise = null;
    this.currentTrack = null;
    this.desiredTrack = null;
    this.unlocked = false;
  }

  setBgmTrack(trackName: string | null): void {
    this.desiredTrack = trackName;
    if (!this.unlocked) {
      return;
    }
    void this.syncDesiredBgm();
  }

  setMasterVolume(level: number): void {
    this.masterLevel = clamp(level, 0, 1);
    const ctx = this.context;
    const gain = this.masterGain;
    if (!ctx || !gain) {
      return;
    }
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0.0001, this.masterLevel), ctx.currentTime, 0.05);
  }

  setBgmVolume(level: number): void {
    this.bgmLevel = clamp(level, 0, 1);
    const ctx = this.context;
    const gain = this.bgmGain;
    if (!ctx || !gain) {
      return;
    }
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0.0001, this.bgmLevel), ctx.currentTime, 0.08);
  }

  setSfxVolume(level: number): void {
    this.sfxLevel = clamp(level, 0, 1);
    const ctx = this.context;
    const gain = this.sfxGain;
    if (!ctx || !gain) {
      return;
    }
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0.0001, this.sfxLevel), ctx.currentTime, 0.08);
  }

  playSfx(type: AudioEventType, intensity = 1): void {
    const preset = SFX_PRESETS[type];
    if (!preset) {
      return;
    }

    const level = clamp(intensity, 0, 1);
    if (preset.loop) {
      this.setLoop(type, level > 0.01, level);
      return;
    }

    const ctx = this.context;
    const sfxOut = this.sfxGain;
    if (!ctx || !sfxOut || !this.unlocked || ctx.state !== 'running') {
      return;
    }

    const nowMs = performance.now();
    const cooldownMs = preset.cooldownMs ?? 0;
    const lastMs = this.lastPlayAtMs.get(type) ?? -1_000_000;
    if (nowMs - lastMs < cooldownMs) {
      return;
    }
    this.lastPlayAtMs.set(type, nowMs);

    const buffer = this.bufferCache.get(preset.file);
    if (!buffer) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;

    const pitchJitter = preset.pitchJitter ?? 0;
    const jitter = pitchJitter > 0 ? (Math.random() * 2 - 1) * pitchJitter : 0;
    source.playbackRate.value = clamp(1 + jitter, 0.75, 1.25);

    const gain = ctx.createGain();
    const volume = preset.volume * level;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), ctx.currentTime);

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 9000;
    toneFilter.Q.value = 0.65;

    source.connect(toneFilter);
    toneFilter.connect(gain);
    gain.connect(sfxOut);
    source.start();

    this.applyBgmDuck(preset.duck ?? 0);
  }

  setLoop(type: AudioEventType, enabled: boolean, intensity = 1): void {
    const preset = SFX_PRESETS[type];
    if (!preset || !preset.loop) {
      return;
    }

    const ctx = this.context;
    const sfxOut = this.sfxGain;
    if (!ctx || !sfxOut || !this.unlocked || ctx.state !== 'running') {
      return;
    }

    if (!enabled) {
      this.stopLoop(type);
      return;
    }

    const cached = this.loopVoices.get(type);
    const target = clamp(preset.volume * intensity, 0, 1);

    if (cached) {
      cached.gain.gain.cancelScheduledValues(ctx.currentTime);
      cached.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      return;
    }

    const buffer = this.bufferCache.get(preset.file);
    if (!buffer) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'monster_swarm_loop' ? 520 : 1300;
    filter.Q.value = 0.7;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxOut);
    source.start();

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);

    this.loopVoices.set(type, {
      source,
      gain,
      file: preset.file,
    });
  }

  private stopLoop(type: AudioEventType): void {
    const voice = this.loopVoices.get(type);
    const ctx = this.context;
    if (!voice || !ctx) {
      return;
    }

    const stopAt = ctx.currentTime + 0.2;
    voice.gain.gain.cancelScheduledValues(ctx.currentTime);
    voice.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    try {
      voice.source.stop(stopAt);
    } catch {
      // source might already be stopped
    }
    this.loopVoices.delete(type);
  }

  private stopAllLoops(): void {
    for (const type of this.loopVoices.keys()) {
      this.stopLoop(type);
    }
  }

  private applyBgmDuck(amount: number): void {
    const ctx = this.context;
    const duck = this.bgmDuckGain;
    if (!ctx || !duck || amount <= 0) {
      return;
    }

    const target = clamp(1 - amount, 0.5, 1);
    duck.gain.cancelScheduledValues(ctx.currentTime);
    duck.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
    duck.gain.setTargetAtTime(1, ctx.currentTime + 0.12, 0.25);
  }

  private fadeOutCurrentBgm(seconds: number): void {
    const ctx = this.context;
    const source = this.activeBgmSource;
    const gain = this.activeBgmTrackGain;
    if (!ctx || !source || !gain) {
      this.activeBgmSource = null;
      this.activeBgmTrackGain = null;
      this.currentTrack = null;
      return;
    }

    const safe = Math.max(0.02, seconds);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0.0001, ctx.currentTime, safe / 2);

    try {
      source.stop(ctx.currentTime + safe + 0.06);
    } catch {
      // already stopped
    }

    this.activeBgmSource = null;
    this.activeBgmTrackGain = null;
    this.currentTrack = null;
  }

  private async syncDesiredBgm(): Promise<void> {
    const ctx = this.context;
    if (!ctx || !this.unlocked) {
      return;
    }

    const requestId = ++this.bgmRequestId;

    if (!this.desiredTrack) {
      this.fadeOutCurrentBgm(0.5);
      return;
    }

    if (this.currentTrack === this.desiredTrack) {
      return;
    }

    const preset = BGM_TRACKS[this.desiredTrack];
    if (!preset) {
      return;
    }

    await this.ensureBuffersLoaded();
    if (requestId !== this.bgmRequestId) {
      return;
    }

    const buffer = this.bufferCache.get(preset.file);
    if (!buffer || !this.bgmDuckGain || !this.context) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const trackGain = this.context.createGain();
    trackGain.gain.value = 0.0001;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 8500;
    filter.Q.value = 0.5;

    source.connect(filter);
    filter.connect(trackGain);
    trackGain.connect(this.bgmDuckGain);
    source.start();

    const fadeIn = preset.fadeInSec ?? 0.8;
    trackGain.gain.cancelScheduledValues(this.context.currentTime);
    trackGain.gain.setTargetAtTime(Math.max(0.0001, preset.volume), this.context.currentTime, fadeIn / 2);

    this.fadeOutCurrentBgm(preset.fadeOutSec ?? 0.6);

    this.activeBgmSource = source;
    this.activeBgmTrackGain = trackGain;
    this.currentTrack = this.desiredTrack;
  }

  private async ensureBuffersLoaded(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const files = new Set<string>();
    for (const preset of Object.values(SFX_PRESETS)) {
      files.add(preset.file);
    }
    for (const preset of Object.values(BGM_TRACKS)) {
      files.add(preset.file);
    }

    this.loadPromise = Promise.all(
      [...files].map(async (file) => {
        if (this.bufferCache.has(file)) {
          return;
        }
        const res = await fetch(file);
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        this.bufferCache.set(file, decoded);
      }),
    ).then(() => undefined);

    return this.loadPromise;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    if (typeof window === 'undefined') {
      return null;
    }

    const legacyWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtor = window.AudioContext ?? legacyWindow.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }

    const ctx = new AudioCtor();

    const master = ctx.createGain();
    master.gain.value = this.masterLevel;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.24;

    const sfx = ctx.createGain();
    sfx.gain.value = this.sfxLevel;

    const bgm = ctx.createGain();
    bgm.gain.value = this.bgmLevel;

    const bgmDuck = ctx.createGain();
    bgmDuck.gain.value = 1;

    sfx.connect(compressor);
    bgm.connect(compressor);
    bgmDuck.connect(bgm);
    compressor.connect(master);
    master.connect(ctx.destination);

    this.context = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.bgmGain = bgm;
    this.bgmDuckGain = bgmDuck;

    return ctx;
  }
}
