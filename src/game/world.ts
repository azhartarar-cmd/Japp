/**
 * One level's runtime: player, tools, sound pulses, guards. DOM-free and
 * driven by a fixed timestep, so it can be simulated headlessly in tests.
 */
import {
  CATCH_RADIUS,
  FADE_TIME,
  GUARD_REVEAL_TIME,
  HOLD_TIME,
  LOUDNESS,
  PEBBLE_RANGE,
  PEBBLE_SPEED,
  PLAY_H,
  PULSE_SPEED,
  PLAYER_HALF,
  SPEED,
  STRIDE,
  TILE,
  W,
} from '../config';
import { Guard, GuardState } from './guard';
import { Surface } from './grid';
import { Level } from './level';
import { mulberry32 } from './rng';
import { emptyStats, NOISE_WEIGHT, Stats } from './scoring';
import {
  Gait,
  hearingFromMap,
  hearingMap,
  makeSound,
  revealMap,
  Sound,
  SoundSource,
} from './sound';

export interface PlayerInput {
  dx: number;
  dy: number;
  sneak: boolean;
  run: boolean;
  /** Throw a pebble toward this point (map-local pixels). */
  throwAt: { x: number; y: number } | null;
  bell: boolean;
}

export const NO_INPUT: PlayerInput = { dx: 0, dy: 0, sneak: false, run: false, throwAt: null, bell: false };

export type WorldEvent =
  | { type: 'sound'; sound: Sound }
  | { type: 'guardStep'; surface: Surface; intensity: number; pan: number; hunting: boolean }
  | { type: 'guardAlert'; to: GuardState; intensity: number; pan: number }
  | { type: 'pebbleThrown' }
  | { type: 'beacon'; kind: 'artifact' | 'exit'; intensity: number; pan: number }
  | { type: 'artifact' }
  | { type: 'caught' }
  | { type: 'complete' };

export interface Pulse {
  x: number;
  y: number;
  kind: SoundSource;
  radius: number;
  /** Path distance in tiles per tile (Infinity = unreached). */
  dist: Float64Array;
  /** Reached tile indices sorted by distance. */
  order: Int32Array;
  cursor: number;
  start: number;
  speed: number;
  strength: number;
  /** Ring front in tiles at the current time. */
  front: number;
}

export interface Pebble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  left: number;
}

export type Status = 'playing' | 'caught' | 'complete';

export class World {
  readonly grid;
  readonly stats: Stats = emptyStats();
  time = 0;
  status: Status = 'playing';
  events: WorldEvent[] = [];

  readonly ox: number;
  readonly oy: number;

  player: { x: number; y: number; gait: Gait; moving: boolean };
  guards: Guard[];
  pulses: Pulse[] = [];
  pebbles: Pebble[] = [];
  pebblesLeft: number;
  bellLeft = 1;
  hasArtifact = false;
  toast: { text: string; until: number } | null = null;

  private readonly litTime: Float32Array;
  private readonly litStr: Float32Array;
  private stepAccum = 0;
  private beaconTimer = 1.5;
  private exitToastAt = -10;
  private alertRadius: number = LOUDNESS.guardAlert;

  constructor(
    readonly level: Level,
    seed = 1,
  ) {
    this.grid = level.grid;
    this.ox = Math.floor((W - level.grid.w * TILE) / 2);
    this.oy = Math.floor((PLAY_H - level.grid.h * TILE) / 2);
    this.litTime = new Float32Array(level.grid.w * level.grid.h).fill(-100);
    this.litStr = new Float32Array(level.grid.w * level.grid.h);
    this.pebblesLeft = level.pebbles;
    this.player = {
      x: (level.start.tx + 0.5) * TILE,
      y: (level.start.ty + 0.5) * TILE,
      gait: 'walk',
      moving: false,
    };
    const rng = mulberry32(seed);
    this.guards = level.guards.map((spec, i) => {
      const g = new Guard(i, level.grid, spec, rng);
      g.onState = (guard, _from, to) => this.onGuardState(guard, to);
      return g;
    });
    // A free ping so the player can get their bearings. Not counted, not heard.
    this.spawnPulse(this.player.x, this.player.y, 'player', 3, 0.7);
  }

  // ---- queries -------------------------------------------------------------

  /** 0..1 brightness of a tile right now (drives the fade-to-black). */
  lightAt(tx: number, ty: number): number {
    if (!this.grid.inBounds(tx, ty)) return 0;
    const i = this.grid.idx(tx, ty);
    const age = this.time - this.litTime[i];
    if (age < 0) return 0;
    const k = age <= HOLD_TIME ? 1 : 1 - (age - HOLD_TIME) / (FADE_TIME - HOLD_TIME);
    return k > 0 ? this.litStr[i] * k : 0;
  }

  /** Brightness of a guard silhouette. */
  guardLight(g: Guard): number {
    let v = this.lightAt(g.tx, g.ty);
    if (this.time < g.revealUntil) {
      const k = Math.min(1, (g.revealUntil - this.time) / (GUARD_REVEAL_TIME * 0.6));
      v = Math.max(v, g.revealStrength * k);
    }
    return v;
  }

  get tileX(): number {
    return Math.floor(this.player.x / TILE);
  }
  get tileY(): number {
    return Math.floor(this.player.y / TILE);
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- simulation ------------------------------------------------------------

  update(dt: number, input: PlayerInput): void {
    if (this.status !== 'playing') {
      this.updatePulses();
      return;
    }
    this.time += dt;
    this.stats.time += dt;

    this.updatePlayer(dt, input);
    if (input.bell) this.ringBell();
    if (input.throwAt) this.throwPebble(input.throwAt.x, input.throwAt.y);
    this.updatePebbles(dt);
    this.updateGuards(dt);
    this.updatePulses();
    this.checkGoals(dt);
  }

  private updatePlayer(dt: number, input: PlayerInput): void {
    const p = this.player;
    const len = Math.hypot(input.dx, input.dy);
    p.moving = len > 0;
    p.gait = input.sneak ? 'sneak' : input.run ? 'run' : 'walk';
    if (!p.moving) return;
    const step = SPEED[p.gait] * dt;
    const nx = p.x + (input.dx / len) * step;
    const ny = p.y + (input.dy / len) * step;
    const ox = p.x;
    const oy = p.y;
    if (!this.blocked(nx, p.y)) p.x = nx;
    if (!this.blocked(p.x, ny)) p.y = ny;
    this.stepAccum += Math.hypot(p.x - ox, p.y - oy);
    const stride = STRIDE[p.gait];
    while (this.stepAccum >= stride) {
      this.stepAccum -= stride;
      this.emitPlayerStep();
    }
  }

  private blocked(x: number, y: number): boolean {
    const h = PLAYER_HALF;
    const g = this.grid;
    return (
      g.isWall(Math.floor((x - h) / TILE), Math.floor((y - h) / TILE)) ||
      g.isWall(Math.floor((x + h) / TILE), Math.floor((y - h) / TILE)) ||
      g.isWall(Math.floor((x - h) / TILE), Math.floor((y + h) / TILE)) ||
      g.isWall(Math.floor((x + h) / TILE), Math.floor((y + h) / TILE))
    );
  }

  private emitPlayerStep(): void {
    const gait = this.player.gait;
    const surface = this.grid.surfaceAt(this.tileX, this.tileY);
    const s = makeSound(this.player.x, this.player.y, 'player', surface, LOUDNESS[gait], this.time, gait);
    this.stats.sounds++;
    this.stats.noise += NOISE_WEIGHT[gait];
    this.emit(s, gait === 'sneak' ? 0.7 : gait === 'walk' ? 0.85 : 1);
  }

  private throwPebble(tx: number, ty: number): void {
    if (this.pebblesLeft <= 0) return;
    const p = this.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    this.pebblesLeft--;
    this.stats.pebblesUsed++;
    this.pebbles.push({
      x: p.x,
      y: p.y,
      vx: (dx / d) * PEBBLE_SPEED,
      vy: (dy / d) * PEBBLE_SPEED,
      left: Math.min(d, PEBBLE_RANGE),
    });
    this.events.push({ type: 'pebbleThrown' });
  }

  private updatePebbles(dt: number): void {
    const keep: Pebble[] = [];
    for (const b of this.pebbles) {
      let travel = Math.hypot(b.vx, b.vy) * dt;
      let landed = false;
      while (travel > 0 && !landed) {
        const s = Math.min(travel, 1.5, b.left);
        const k = s / Math.hypot(b.vx, b.vy);
        const nx = b.x + b.vx * k;
        const ny = b.y + b.vy * k;
        if (this.grid.isWall(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
          landed = true;
          break;
        }
        b.x = nx;
        b.y = ny;
        b.left -= s;
        travel -= s;
        if (b.left <= 0.001) landed = true;
      }
      if (landed) this.landPebble(b);
      else keep.push(b);
    }
    this.pebbles = keep;
  }

  private landPebble(b: Pebble): void {
    const surface = this.grid.surfaceAt(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    const s = makeSound(b.x, b.y, 'pebble', surface, LOUDNESS.pebble, this.time);
    this.stats.sounds++;
    this.stats.noise += NOISE_WEIGHT.pebble;
    this.emit(s, 0.9);
  }

  private ringBell(): void {
    if (this.bellLeft <= 0) return;
    this.bellLeft--;
    this.stats.bellUsed = true;
    this.stats.sounds++;
    this.stats.noise += NOISE_WEIGHT.bell;
    const s = makeSound(this.player.x, this.player.y, 'bell', 'stone', LOUDNESS.bell, this.time);
    this.emit(s, 0.9);
  }

  /** Reveal + let guards hear a sound. */
  private emit(s: Sound, strength: number): void {
    this.spawnPulse(s.x, s.y, s.source, s.radius, strength);
    this.alertRadius = s.source === 'bell' ? LOUDNESS.guardAlert * 2.2 : LOUDNESS.guardAlert;

    let map: Float64Array | null = null;
    for (const g of this.guards) {
      if (s.source !== 'bell') {
        if (Math.hypot(g.x - s.x, g.y - s.y) / TILE > s.radius) continue;
        map ??= hearingMap(this.grid, s, TILE);
        if (!hearingFromMap(map, this.grid, s, g.tx, g.ty).heard) continue;
      }
      g.hear({ x: s.x, y: s.y, source: s.source as 'player' | 'pebble' | 'bell', radius: s.radius }, this.time);
    }
    this.events.push({ type: 'sound', sound: s });
  }

  private spawnPulse(x: number, y: number, kind: SoundSource, radius: number, strength: number): void {
    const s = makeSound(x, y, kind, 'stone', radius, this.time);
    // `radius` is already effective; makeSound multiplied by the stone x1, bell x1.
    const dist = revealMap(this.grid, s, TILE);
    const idx: number[] = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] <= radius) idx.push(i);
    idx.sort((a, b) => dist[a] - dist[b]);
    this.pulses.push({
      x,
      y,
      kind,
      radius,
      dist,
      order: Int32Array.from(idx),
      cursor: 0,
      start: this.time,
      speed: kind === 'bell' ? PULSE_SPEED.bell : PULSE_SPEED.normal,
      strength,
      front: 0,
    });
  }

  private updatePulses(): void {
    const live: Pulse[] = [];
    for (const p of this.pulses) {
      p.front = (this.time - p.start) * p.speed;
      while (p.cursor < p.order.length && p.dist[p.order[p.cursor]] <= p.front) {
        const i = p.order[p.cursor++];
        const fall = p.radius > 0 ? p.dist[i] / p.radius : 0;
        const str = p.strength * (1 - 0.5 * Math.min(1, fall));
        const age = this.time - this.litTime[i];
        const cur = age >= 0 && age < FADE_TIME ? this.litStr[i] * (1 - age / FADE_TIME) : 0;
        if (str >= cur) {
          this.litTime[i] = this.time;
          this.litStr[i] = str;
        }
      }
      if (p.front < p.radius + 2.5) live.push(p);
    }
    this.pulses = live;
  }

  // ---- guards -----------------------------------------------------------------

  private updateGuards(dt: number): void {
    for (const g of this.guards) {
      if (g.update(dt, this.time)) this.guardStep(g);
      if (Math.hypot(g.x - this.player.x, g.y - this.player.y) < CATCH_RADIUS) {
        this.status = 'caught';
        this.events.push({ type: 'caught' });
        return;
      }
    }
  }

  private guardStep(g: Guard): void {
    const hunting = g.state === 'hunting';
    const surface = this.grid.surfaceAt(g.tx, g.ty);
    const s = makeSound(g.x, g.y, 'guard', surface, hunting ? LOUDNESS.guardHunt : LOUDNESS.guardStep, this.time);
    const h = this.playerHears(s);
    if (!h) return;
    g.revealUntil = this.time + GUARD_REVEAL_TIME;
    g.revealStrength = 0.4 + 0.5 * h.intensity;
    this.events.push({ type: 'guardStep', surface, intensity: h.intensity, pan: this.panTo(g.x), hunting });
  }

  private onGuardState(g: Guard, to: GuardState): void {
    if (to !== 'suspicious' && to !== 'hunting') return;
    const s = makeSound(g.x, g.y, 'guard', 'stone', this.alertRadius, this.time);
    const h = this.playerHears(s);
    if (!h) return;
    g.flashUntil = this.time + 1.2;
    g.flashKind = to;
    g.revealUntil = this.time + 1.2;
    g.revealStrength = 0.9;
    this.events.push({ type: 'guardAlert', to, intensity: h.intensity, pan: this.panTo(g.x) });
  }

  private playerHears(s: Sound): { intensity: number } | null {
    if (Math.hypot(s.x - this.player.x, s.y - this.player.y) / TILE > s.radius) return null;
    const h = hearingFromMap(hearingMap(this.grid, s, TILE), this.grid, s, this.tileX, this.tileY);
    return h.heard ? h : null;
  }

  private panTo(x: number): number {
    return Math.max(-1, Math.min(1, (x - this.player.x) / 90));
  }

  // ---- goals ------------------------------------------------------------------

  private checkGoals(dt: number): void {
    if (this.status !== 'playing') return;
    const { artifact, exit } = this.level;
    const ax = (artifact.tx + 0.5) * TILE;
    const ay = (artifact.ty + 0.5) * TILE;
    const ex = (exit.tx + 0.5) * TILE;
    const ey = (exit.ty + 0.5) * TILE;
    const p = this.player;

    if (!this.hasArtifact && Math.hypot(p.x - ax, p.y - ay) < 5) {
      this.hasArtifact = true;
      this.events.push({ type: 'artifact' });
      this.toast = { text: 'ARTIFACT STOLEN - GET OUT', until: this.time + 3 };
    }
    if (Math.hypot(p.x - ex, p.y - ey) < 5) {
      if (this.hasArtifact) {
        this.status = 'complete';
        this.events.push({ type: 'complete' });
        return;
      }
      if (this.time - this.exitToastAt > 3) {
        this.exitToastAt = this.time;
        this.toast = { text: 'FIND THE ARTIFACT FIRST', until: this.time + 2 };
      }
    }

    this.beaconTimer -= dt;
    if (this.beaconTimer <= 0) {
      this.beaconTimer = 2.2;
      const tx = this.hasArtifact ? ex : ax;
      const ty = this.hasArtifact ? ey : ay;
      const d = Math.hypot(tx - p.x, ty - p.y);
      this.events.push({
        type: 'beacon',
        kind: this.hasArtifact ? 'exit' : 'artifact',
        intensity: Math.max(0.12, 1 - d / 260),
        pan: this.panTo(tx),
      });
    }
  }
}
