/**
 * Sound model and propagation.
 *
 * A sound has an origin, a base loudness and a surface. Its effective radius
 * (in tiles) is `loudness * SURFACE_MULT[surface]`. Propagation is a
 * Dijkstra flood-fill over the tile grid with Theta*-style line-of-sight
 * shortcuts, so distances are ~Euclidean in the open (circular rings) but
 * wrap around corners in corridors.
 *
 * Two modes:
 *  - `terminal`  (reveal): walls are reached (so sonar can "hit" them) but
 *                sound goes no further.
 *  - `attenuate` (hearing): sound may pass through a wall tile at an extra
 *                distance cost, so thin walls muffle and thick walls block.
 */
import { WALL_ATTENUATION } from '../config';
import { Grid, SURFACE_MULT, Surface } from './grid';

export type SoundSource = 'player' | 'pebble' | 'bell' | 'guard';
export type Gait = 'sneak' | 'walk' | 'run';

export interface Sound {
  /** Origin in world pixels. */
  x: number;
  y: number;
  source: SoundSource;
  surface: Surface;
  /** Base loudness (tiles at surface x1.0). */
  loudness: number;
  /** Effective radius in tiles = loudness * surface multiplier. */
  radius: number;
  gait?: Gait;
  time: number;
}

export function makeSound(
  x: number,
  y: number,
  source: SoundSource,
  surface: Surface,
  loudness: number,
  time: number,
  gait?: Gait,
): Sound {
  // The bell rings out over everything regardless of the floor.
  const mult = source === 'bell' ? 1 : SURFACE_MULT[surface];
  return { x, y, source, surface, loudness, radius: loudness * mult, gait, time };
}

export interface PropagateOptions {
  walls: 'terminal' | 'attenuate';
  wallCost?: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * True when the straight line between two tile centres passes only through
 * open tiles (endpoints excluded). Conservative on exact corner grazes.
 */
export function lineOfSight(grid: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  if (x0 === x1 && y0 === y1) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let cx = x0;
  let cy = y0;
  // Amanatides & Woo grid traversal from centre to centre.
  let tMaxX = adx === 0 ? Infinity : 0.5 / adx;
  let tMaxY = ady === 0 ? Infinity : 0.5 / ady;
  const tDx = adx === 0 ? Infinity : 1 / adx;
  const tDy = ady === 0 ? Infinity : 1 / ady;
  const eps = 1e-9;
  let guard = 0;
  while ((cx !== x1 || cy !== y1) && guard++ < 512) {
    if (Math.abs(tMaxX - tMaxY) < eps) {
      // Passing exactly through a corner: both side cells must be open.
      if (grid.isWall(cx + sx, cy) || grid.isWall(cx, cy + sy)) return false;
      cx += sx;
      cy += sy;
      tMaxX += tDx;
      tMaxY += tDy;
    } else if (tMaxX < tMaxY) {
      cx += sx;
      tMaxX += tDx;
    } else {
      cy += sy;
      tMaxY += tDy;
    }
    if ((cx !== x1 || cy !== y1) && grid.isWall(cx, cy)) return false;
  }
  return true;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const k = this.keys;
    const v = this.vals;
    const topK = k[0];
    const topV = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return [topK, topV];
  }
}

/**
 * Distance (in tiles) from the origin tile to every tile, `Infinity` where
 * unreached or beyond `maxDist`.
 */
export function propagate(
  grid: Grid,
  otx: number,
  oty: number,
  maxDist: number,
  opts: PropagateOptions,
): Float64Array {
  const { w, h } = grid;
  const n = w * h;
  const dist = new Float64Array(n).fill(Infinity);
  if (!grid.inBounds(otx, oty)) return dist;
  const parent = new Int32Array(n).fill(-1);
  const wallExtra = opts.walls === 'attenuate' ? (opts.wallCost ?? WALL_ATTENUATION) : 0;
  const terminal = opts.walls === 'terminal';

  const o = grid.idx(otx, oty);
  dist[o] = 0;
  parent[o] = o;
  const heap = new MinHeap();
  heap.push(0, o);

  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const ix = i % w;
    const iy = (i / w) | 0;
    if (terminal && i !== o && grid.isWallIdx(i)) continue;
    const p = parent[i];
    const px = p % w;
    const py = (p / w) | 0;
    for (const [dx, dy] of NEIGHBORS) {
      const jx = ix + dx;
      const jy = iy + dy;
      if (!grid.inBounds(jx, jy)) continue;
      if (dx !== 0 && dy !== 0 && (grid.isWall(ix + dx, iy) || grid.isWall(ix, iy + dy))) continue;
      const j = jy * w + jx;
      const enter = grid.isWallIdx(j) ? wallExtra : 0;
      let cand: number;
      let candParent: number;
      if (p !== i && lineOfSight(grid, px, py, jx, jy)) {
        cand = dist[p] + Math.hypot(jx - px, jy - py) + enter;
        candParent = p;
      } else {
        cand = d + Math.hypot(dx, dy) + enter;
        candParent = i;
      }
      if (cand < dist[j] && cand <= maxDist) {
        dist[j] = cand;
        parent[j] = candParent;
        heap.push(cand, j);
      }
    }
  }
  return dist;
}

export interface Hearing {
  heard: boolean;
  /** Attenuated path distance in tiles. */
  distance: number;
  /** 1 at the origin, 0 at the edge of the radius. */
  intensity: number;
}

const NOT_HEARD: Hearing = { heard: false, distance: Infinity, intensity: 0 };

/** Convert a hearing distance map into a per-listener result. */
export function hearingFromMap(map: Float64Array, grid: Grid, sound: Sound, ltx: number, lty: number): Hearing {
  if (!grid.inBounds(ltx, lty)) return NOT_HEARD;
  const d = map[grid.idx(ltx, lty)];
  if (!(d <= sound.radius)) return NOT_HEARD;
  return { heard: true, distance: d, intensity: sound.radius > 0 ? 1 - d / sound.radius : 1 };
}

/** Distance map used for hearing (walls attenuate). */
export function hearingMap(grid: Grid, sound: Sound, tileSize: number): Float64Array {
  return propagate(grid, Math.floor(sound.x / tileSize), Math.floor(sound.y / tileSize), sound.radius, {
    walls: 'attenuate',
  });
}

/** Distance map used for sonar reveal (walls are terminal). */
export function revealMap(grid: Grid, sound: Sound, tileSize: number): Float64Array {
  return propagate(grid, Math.floor(sound.x / tileSize), Math.floor(sound.y / tileSize), sound.radius, {
    walls: 'terminal',
  });
}

/** One-shot convenience: can a listener on this tile hear the sound? */
export function hears(grid: Grid, sound: Sound, ltx: number, lty: number, tileSize: number): Hearing {
  return hearingFromMap(hearingMap(grid, sound, tileSize), grid, sound, ltx, lty);
}
