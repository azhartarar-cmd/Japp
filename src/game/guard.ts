/**
 * Guard AI. Guards are blind: they react only to sounds that reach them.
 *
 *   patrol ──hear──▶ suspicious ──arrive+look──▶ search ──sweep done──▶ patrol
 *      │                 │                          ▲
 *      └──loud/repeat────┴──▶ hunting ──arrive──────┘
 *
 * The module is pure (no DOM, no clock): the caller passes `now` and `dt`.
 */
import {
  GUARD_LOOK_TIME,
  GUARD_SEARCH_POINTS,
  GUARD_SEARCH_RADIUS,
  GUARD_SPEED,
  GUARD_STEP_DIST,
  LOUD_RADIUS,
  REPEAT_WINDOW,
  TILE,
} from '../config';
import { Grid } from './grid';
import { GuardSpec } from './level';
import { findPath, openTilesNear, TileXY } from './pathfind';
import { Rng } from './rng';

export type GuardState = 'patrol' | 'suspicious' | 'hunting' | 'search';

/** A sound as perceived by a guard. */
export interface HeardSound {
  /** Origin, world pixels. */
  x: number;
  y: number;
  source: 'player' | 'pebble' | 'bell';
  /** Effective radius of the sound in tiles (before distance falloff). */
  radius: number;
}

export type StateListener = (guard: Guard, from: GuardState, to: GuardState) => void;

export class Guard {
  x: number;
  y: number;
  state: GuardState = 'patrol';
  /** Tile the guard is currently walking toward because of a sound. */
  target: TileXY | null = null;

  /** Visual feedback set by the world (not used by the AI). */
  revealUntil = 0;
  revealStrength = 0;
  flashUntil = 0;
  flashKind: 'suspicious' | 'hunting' = 'suspicious';

  onState: StateListener | null = null;

  private route: TileXY[] = [];
  private wpIdx = 0;
  private wpDir = 1;
  private wait = 0;
  private look = 0;
  private sweep: TileXY[] = [];
  private lastPlayerHeard = -Infinity;
  private stepAccum = 0;

  constructor(
    readonly id: number,
    private readonly grid: Grid,
    private readonly spec: Required<GuardSpec>,
    private readonly rng: Rng,
  ) {
    const [tx, ty] = spec.path[0];
    this.x = (tx + 0.5) * TILE;
    this.y = (ty + 0.5) * TILE;
  }

  get tx(): number {
    return Math.floor(this.x / TILE);
  }
  get ty(): number {
    return Math.floor(this.y / TILE);
  }

  private setState(to: GuardState): void {
    const from = this.state;
    this.state = to;
    if (from !== to) this.onState?.(this, from, to);
  }

  /** Feed a heard sound into the state machine. */
  hear(s: HeardSound, now: number): void {
    const tile = this.soundTile(s);
    if (s.source === 'pebble') {
      // A committed hunter ignores distractions.
      if (this.state === 'hunting') return;
      this.investigate(tile);
      return;
    }
    const loud = s.source === 'bell' || s.radius >= LOUD_RADIUS;
    const repeated = now - this.lastPlayerHeard <= REPEAT_WINDOW;
    this.lastPlayerHeard = now;
    if (loud || repeated || this.state === 'hunting' || this.state === 'search') this.hunt(tile);
    else this.investigate(tile);
  }

  private soundTile(s: HeardSound): TileXY {
    const tx = Math.floor(s.x / TILE);
    const ty = Math.floor(s.y / TILE);
    if (!this.grid.isWall(tx, ty)) return [tx, ty];
    // Origin inside a wall (shouldn't happen): use the nearest open tile.
    const near = openTilesNear(this.grid, tx, ty, 2).sort(
      (a, b) => Math.hypot(a[0] - tx, a[1] - ty) - Math.hypot(b[0] - tx, b[1] - ty),
    );
    return near[0] ?? [this.tx, this.ty];
  }

  private investigate(tile: TileXY): void {
    this.target = tile;
    this.route = findPath(this.grid, this.tx, this.ty, tile[0], tile[1]) ?? [];
    this.look = 0;
    this.wait = 0;
    this.setState('suspicious');
  }

  private hunt(tile: TileXY): void {
    this.target = tile;
    this.route = findPath(this.grid, this.tx, this.ty, tile[0], tile[1]) ?? [];
    this.wait = 0;
    this.setState('hunting');
  }

  private beginSearch(center: TileXY): void {
    const candidates = openTilesNear(this.grid, center[0], center[1], GUARD_SEARCH_RADIUS);
    this.sweep = [];
    for (let tries = 0; tries < 24 && this.sweep.length < GUARD_SEARCH_POINTS && candidates.length; tries++) {
      const c = candidates[Math.floor(this.rng() * candidates.length)];
      if (findPath(this.grid, center[0], center[1], c[0], c[1])) this.sweep.push(c);
    }
    this.route = [];
    this.look = 0;
    this.target = null;
    this.setState('search');
  }

  private beginPatrol(): void {
    // Resume from the nearest waypoint.
    let best = 0;
    let bd = Infinity;
    this.spec.path.forEach(([wx, wy], i) => {
      const d = Math.hypot(wx - this.tx, wy - this.ty);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.wpIdx = best;
    this.route = [];
    this.wait = 0;
    this.target = null;
    this.setState('patrol');
  }

  /**
   * Advance the guard. Returns true when the guard took a footstep this tick.
   */
  update(dt: number, now: number): boolean {
    void now;
    switch (this.state) {
      case 'patrol':
        return this.updatePatrol(dt);
      case 'suspicious': {
        if (this.route.length) return this.walk(dt, GUARD_SPEED.suspicious);
        this.look += dt;
        if (this.look >= GUARD_LOOK_TIME) this.beginSearch(this.target ?? [this.tx, this.ty]);
        return false;
      }
      case 'hunting': {
        if (this.route.length) return this.walk(dt, GUARD_SPEED.hunting);
        this.beginSearch(this.target ?? [this.tx, this.ty]);
        return false;
      }
      case 'search':
        return this.updateSearch(dt);
    }
  }

  private updatePatrol(dt: number): boolean {
    if (this.wait > 0) {
      this.wait -= dt;
      return false;
    }
    if (this.route.length === 0) {
      const wp = this.spec.path[this.wpIdx];
      if (this.tx === wp[0] && this.ty === wp[1]) {
        if (this.spec.path.length === 1) return false; // static guard
        this.advanceWaypoint();
      }
      const next = this.spec.path[this.wpIdx];
      this.route = findPath(this.grid, this.tx, this.ty, next[0], next[1]) ?? [];
      if (this.route.length === 0) return false;
    }
    const stepped = this.walk(dt, GUARD_SPEED.patrol);
    if (this.route.length === 0) this.wait = this.spec.pause;
    return stepped;
  }

  private advanceWaypoint(): void {
    const n = this.spec.path.length;
    if (this.spec.mode === 'pingpong') {
      if (this.wpIdx + this.wpDir < 0 || this.wpIdx + this.wpDir >= n) this.wpDir = -this.wpDir;
      this.wpIdx += this.wpDir;
    } else {
      this.wpIdx = (this.wpIdx + 1) % n;
    }
  }

  private updateSearch(dt: number): boolean {
    if (this.look > 0) {
      this.look -= dt;
      return false;
    }
    if (this.route.length === 0) {
      const next = this.sweep.shift();
      if (!next) {
        this.beginPatrol();
        return false;
      }
      this.route = findPath(this.grid, this.tx, this.ty, next[0], next[1]) ?? [];
      if (this.route.length === 0) {
        this.look = 0.5;
        return false;
      }
    }
    const stepped = this.walk(dt, GUARD_SPEED.search);
    if (this.route.length === 0) this.look = 0.7;
    return stepped;
  }

  private walk(dt: number, speed: number): boolean {
    let remaining = speed * dt;
    let moved = 0;
    while (remaining > 0 && this.route.length) {
      const [rx, ry] = this.route[0];
      const cx = (rx + 0.5) * TILE;
      const cy = (ry + 0.5) * TILE;
      const dx = cx - this.x;
      const dy = cy - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) {
        this.x = cx;
        this.y = cy;
        this.route.shift();
        remaining -= d;
        moved += d;
      } else {
        this.x += (dx / d) * remaining;
        this.y += (dy / d) * remaining;
        moved += remaining;
        remaining = 0;
      }
    }
    this.stepAccum += moved;
    if (this.stepAccum >= GUARD_STEP_DIST) {
      this.stepAccum -= GUARD_STEP_DIST;
      return true;
    }
    return false;
  }
}
