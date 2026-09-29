/** A* over the tile grid (8-directional, no corner cutting). Returns tile coords, start excluded. */
import { Grid } from './grid';

export type TileXY = [number, number];

export function findPath(grid: Grid, sx: number, sy: number, gx: number, gy: number): TileXY[] | null {
  if (grid.isWall(sx, sy) || grid.isWall(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];
  const { w, h } = grid;
  const n = w * h;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const f = new Float64Array(n);
  const start = sy * w + sx;
  const goal = gy * w + gx;
  const heur = (x: number, y: number): number => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = heur(sx, sy);
  open.push(start);

  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: TileXY[] = [];
      for (let c = goal; c !== start; c = from[c]) path.push([c % w, (c / w) | 0]);
      return path.reverse();
    }
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (grid.isWall(nx, ny)) continue;
        if (dx && dy && (grid.isWall(cx + dx, cy) || grid.isWall(cx, cy + dy))) continue;
        const ni = ny * w + nx;
        if (closed[ni]) continue;
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          from[ni] = cur;
          f[ni] = ng + heur(nx, ny);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
  }
  return null;
}

/** Open tiles reachable within `radius` tiles of (cx,cy) by flood fill (Chebyshev-bounded). */
export function openTilesNear(grid: Grid, cx: number, cy: number, radius: number): TileXY[] {
  const out: TileXY[] = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!grid.isWall(x, y)) out.push([x, y]);
    }
  }
  return out;
}
