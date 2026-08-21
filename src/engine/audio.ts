import { SOUNDS, type SoundDef, type SoundName } from '../game/balance';

/**
 * Everything is synthesized: one oscillator-or-noise voice per layer, shaped by
 * an envelope. No audio files ship with the build (spec section 13).
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private musicTimer = 0;
  private musicMode: 'day' | 'night' | null = null;

  enabled = true;
  /**
   * The ambient bed, separate from the action sounds. Off by default: it is a
   * sustained drone, and the sounds that carry information are the short ones.
   */
  music = false;
  /** Rising-pitch ladder for consecutive pickups (spec section 13). */
  private ladder = 0;
  private ladderAt = 0;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    // 2 s of white noise, reused by every noise layer.
    const frames = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  /** Starts or silences the bed without disturbing the action sounds. */
  setMusicEnabled(on: boolean, mode: 'day' | 'night'): void {
    this.music = on;
    if (!on) {
      this.musicMode = null;
      const ctx = this.ctx;
      if (ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      return;
    }
    this.setMusic(mode);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** Semitone offset helper for the pickup ladder. */
  private nextLadderStep(now: number, resetAfter: number, cap: number): number {
    if (now - this.ladderAt > resetAfter) this.ladder = 0;
    this.ladderAt = now;
    const step = this.ladder;
    this.ladder = Math.min(cap, this.ladder + 1);
    return step;
  }

  play(name: SoundName, semitones = 0, gainScale = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || !this.master) return;
    const def: SoundDef = SOUNDS[name];
    let shift = semitones;
    if (def.ladder) {
      shift += this.nextLadderStep(ctx.currentTime, def.ladder.resetAfter, def.ladder.cap);
    }
    this.render(def, ctx.currentTime, shift, gainScale);
  }

  private render(def: SoundDef, at: number, semitones: number, gainScale: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const bend = Math.pow(2, semitones / 12);
    for (const layer of def.layers) {
      const start = at + (layer.delay ?? 0);
      const dur = layer.dur;
      const gain = ctx.createGain();
      const peak = layer.gain * gainScale;
      const attack = Math.max(0.001, layer.attack ?? 0.004);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      let tail: AudioNode = gain;
      if (layer.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = layer.filter.type;
        filter.Q.value = layer.filter.q ?? 1;
        filter.frequency.setValueAtTime(layer.filter.freq * bend, start);
        if (layer.filter.freqTo !== undefined) {
          filter.frequency.exponentialRampToValueAtTime(
            Math.max(40, layer.filter.freqTo * bend),
            start + dur,
          );
        }
        gain.connect(filter);
        tail = filter;
      }
      tail.connect(master);

      if (layer.noise) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        src.playbackRate.value = layer.rate ?? 1;
        src.connect(gain);
        src.start(start, Math.random() * 1.5);
        src.stop(start + dur + 0.02);
      } else {
        const osc = ctx.createOscillator();
        osc.type = layer.wave ?? 'sine';
        const f0 = Math.max(20, layer.freq * bend);
        osc.frequency.setValueAtTime(f0, start);
        if (layer.freqTo !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(20, layer.freqTo * bend),
            start + dur,
          );
        }
        if (layer.detune) osc.detune.value = layer.detune;
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      }
    }
  }

  /**
   * Two ambient beds on the same root: major by day, minor at night, with a
   * faint irregular clicking layer over both.
   */
  setMusic(mode: 'day' | 'night' | 'off'): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    if (mode === 'off' || !this.music) {
      this.musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      this.musicMode = null;
      return;
    }
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    for (const voice of this.musicVoices) {
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      voice.osc.stop(ctx.currentTime + 2.2);
    }
    this.musicVoices = [];
    // Root A2. Major third by day, minor third at night.
    const root = 110;
    const ratios = mode === 'day' ? [1, 1.5, 2.5, 3] : [1, 1.4983, 2.245, 3];
    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = root * ratios[i];
      osc.detune.value = (i % 2 === 0 ? -1 : 1) * (5 + i * 3);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.05 / (i + 1), ctx.currentTime, 1.2);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start();
      this.musicVoices.push({ osc, gain });
    }
    this.musicGain.gain.setTargetAtTime(mode === 'day' ? 0.5 : 0.62, ctx.currentTime, 1.2);
  }

  /** Called once per frame; drops the faint colony clicks under the music bed. */
  tickAmbience(dt: number): void {
    if (!this.ctx || !this.enabled || !this.music || this.musicMode === null) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.18 + Math.random() * 0.6;
    this.render(SOUNDS.ambientClick, this.ctx.currentTime, Math.random() * 10 - 5, 1);
  }
}
