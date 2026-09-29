/**
 * All sound is synthesized with the Web Audio API (chiptune-style square /
 * triangle voices plus filtered noise). There are no audio files.
 */
import { Surface } from '../game/grid';
import { Gait } from '../game/sound';

type Wave = OscillatorType;

interface ToneOpts {
  end?: number; // slide to this frequency
  pan?: number;
  attack?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  type?: BiquadFilterType;
  freq?: number;
  end?: number;
  q?: number;
  pan?: number;
}

export class AudioEngine {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** Must be called from a user gesture (browsers keep audio suspended until then). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  // ---- primitives ---------------------------------------------------------

  private out(pan: number | undefined, base?: AudioNode): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    const dest = base ?? this.master;
    if (!pan || !this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(dest);
    return p;
  }

  private tone(type: Wave, freq: number, t0: number, dur: number, gain: number, o: ToneOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.0005) return;
    const dest = this.out(o.pan, o.dest);
    if (!dest) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.end), t0 + dur);
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(t0: number, dur: number, gain: number, o: NoiseOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || gain <= 0.0005) return;
    const dest = this.out(o.pan);
    if (!dest) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.end) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.end), t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- game sounds --------------------------------------------------------

  /** Footstep; surfaces are clearly distinct in level, timbre and decay. */
  step(surface: Surface, gait: Gait = 'walk', gain = 1, pan = 0, pitch = 1): void {
    if (!this.ctx) return;
    const t = this.now;
    const gm = (gait === 'sneak' ? 0.45 : gait === 'run' ? 1.3 : 1) * gain;
    const pm = (gait === 'sneak' ? 0.85 : gait === 'run' ? 1.1 : 1) * pitch;
    switch (surface) {
      case 'carpet': // soft, quiet thud
        this.noise(t, 0.07, 0.09 * gm, { type: 'lowpass', freq: 380 * pm, q: 0.5, pan });
        break;
      case 'stone': // medium click
        this.noise(t, 0.06, 0.2 * gm, { type: 'bandpass', freq: 1300 * pm, q: 1.2, pan });
        this.tone('square', 170 * pm, t, 0.05, 0.05 * gm, { end: 90 * pm, pan });
        break;
      case 'metal': // loud, ringing
        this.noise(t, 0.05, 0.22 * gm, { type: 'highpass', freq: 2800, q: 0.7, pan });
        this.tone('triangle', 780 * pm, t, 0.42, 0.14 * gm, { pan });
        this.tone('triangle', 1170 * pm, t, 0.3, 0.09 * gm, { pan });
        this.tone('sine', 2010 * pm, t, 0.2, 0.05 * gm, { pan });
        break;
      case 'water': // splash
        this.noise(t, 0.24, 0.24 * gm, { type: 'bandpass', freq: 2200 * pm, end: 320, q: 3, pan });
        this.tone('sine', 300 * pm, t, 0.13, 0.08 * gm, { end: 760 * pm, pan });
        break;
    }
  }

  pebble(surface: Surface): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone('sine', 2600, t, 0.09, 0.12);
    this.tone('sine', 3450, t + 0.045, 0.08, 0.09);
    this.step(surface, 'walk', 0.55, 0, 1.25);
  }

  pebbleThrow(): void {
    if (!this.ctx) return;
    this.noise(this.now, 0.09, 0.05, { type: 'highpass', freq: 3000, end: 800 });
  }

  bell(): void {
    if (!this.ctx) return;
    const t = this.now;
    const partials: [number, number, number][] = [
      [1, 0.32, 3.2],
      [2.0, 0.2, 2.4],
      [2.76, 0.14, 1.8],
      [4.07, 0.08, 1.2],
      [5.43, 0.05, 0.8],
    ];
    for (const [m, g, d] of partials) this.tone('sine', 523 * m, t, d, g, { attack: 0.002 });
    this.noise(t, 0.05, 0.12, { type: 'highpass', freq: 3500 });
  }

  /** Guard footstep heard from a distance. */
  guardStep(surface: Surface, intensity: number, pan: number, hunting: boolean): void {
    this.step(surface, hunting ? 'run' : 'walk', 0.28 + 0.5 * intensity, pan, 0.72);
  }

  guardAlert(kind: 'suspicious' | 'hunting', intensity: number, pan: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const g = 0.35 + 0.65 * intensity;
    if (kind === 'suspicious') {
      this.tone('square', 330, t, 0.09, 0.07 * g, { end: 300, pan });
      this.tone('square', 440, t + 0.1, 0.14, 0.07 * g, { end: 520, pan });
    } else {
      this.tone('square', 880, t, 0.08, 0.1 * g, { pan });
      this.tone('square', 1175, t + 0.09, 0.14, 0.1 * g, { pan });
      this.tone('sawtooth', 600, t, 0.3, 0.05 * g, { end: 200, pan });
    }
  }

  /** Faint, panned hint of where the objective is. */
  beacon(kind: 'artifact' | 'exit', intensity: number, pan: number): void {
    if (!this.ctx) return;
    const t = this.now;
    const g = 0.05 * intensity;
    const base = kind === 'artifact' ? 1046 : 659;
    this.tone('triangle', base, t, 0.28, g, { pan });
    this.tone('triangle', base * 1.5, t + 0.11, 0.3, g * 0.8, { pan });
  }

  pickup(): void {
    if (!this.ctx) return;
    const t = this.now;
    [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, t + i * 0.07, 0.12, 0.09));
  }

  victory(): void {
    if (!this.ctx) return;
    const t = this.now;
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone('square', f, t + i * 0.1, i === notes.length - 1 ? 0.6 : 0.14, 0.09));
    [523, 659, 784].forEach((f) => this.tone('triangle', f, t + 0.7, 0.9, 0.08));
  }

  fail(): void {
    if (!this.ctx) return;
    const t = this.now;
    [392, 349, 311, 262].forEach((f, i) => this.tone('sawtooth', f, t + i * 0.16, 0.22, 0.09));
    this.tone('square', 98, t + 0.64, 0.5, 0.1, { end: 60 });
  }

  blip(high = false): void {
    if (!this.ctx) return;
    this.tone('square', high ? 880 : 660, this.now, high ? 0.09 : 0.04, 0.06);
  }
}
