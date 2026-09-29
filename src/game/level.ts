/**
 * Level format (JSON, see src/levels/*.json):
 *
 *   map     rows of characters, all rows padded with walls to equal width
 *             #  wall (also any unknown char / space)
 *             .  stone floor        ,  carpet        =  metal        ~  water
 *             S  player start   A  artifact   X  exit   (all on stone)
 *   guards  [{ path: [[tx,ty],...], mode?: "loop"|"pingpong", pause?: seconds }]
 *             a one-point path is a static guard
 *   pebbles number of pebbles (default PEBBLES_DEFAULT)
 *   ranks   max noise-score for S / A / B; anything worse is C
 */
import { MAX_MAP_H, MAX_MAP_W, PEBBLES_DEFAULT } from '../config';
import { Grid, Tile } from './grid';

export interface GuardSpec {
  path: [number, number][];
  mode?: 'loop' | 'pingpong';
  pause?: number;
}

export interface RankThresholds {
  S: number;
  A: number;
  B: number;
}

export interface LevelData {
  id: string;
  name: string;
  hint?: string[];
  map: string[];
  guards?: GuardSpec[];
  pebbles?: number;
  ranks?: RankThresholds;
}

export interface TilePos {
  tx: number;
  ty: number;
}

export interface Level {
  id: string;
  name: string;
  hint: string[];
  grid: Grid;
  start: TilePos;
  artifact: TilePos;
  exit: TilePos;
  guards: Required<GuardSpec>[];
  pebbles: number;
  ranks: RankThresholds;
}

const LEGEND: Record<string, Tile> = {
  '#': Tile.Wall,
  ' ': Tile.Wall,
  '.': Tile.Stone,
  ',': Tile.Carpet,
  '=': Tile.Metal,
  '~': Tile.Water,
  S: Tile.Stone,
  A: Tile.Stone,
  X: Tile.Stone,
};

export function parseLevel(data: LevelData): Level {
  const fail = (msg: string): never => {
    throw new Error(`Level "${data.id}": ${msg}`);
  };
  if (!data.map?.length) fail('map is empty');
  const w = Math.max(...data.map.map((r) => r.length));
  const h = data.map.length;
  if (w > MAX_MAP_W || h > MAX_MAP_H) fail(`map ${w}x${h} exceeds ${MAX_MAP_W}x${MAX_MAP_H}`);

  const rows = data.map.map((r) => r.padEnd(w, '#'));
  const marks: Record<string, TilePos[]> = { S: [], A: [], X: [] };
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const ch = rows[ty][tx];
      if (!(ch in LEGEND)) fail(`unknown tile '${ch}' at ${tx},${ty}`);
      marks[ch]?.push({ tx, ty });
    }
  }
  for (const [ch, label] of [['S', 'start'], ['A', 'artifact'], ['X', 'exit']] as const) {
    if (marks[ch].length !== 1) fail(`needs exactly one '${ch}' (${label}), found ${marks[ch].length}`);
  }

  const grid = Grid.fromRows(rows, LEGEND);
  const guards = (data.guards ?? []).map((g, i) => {
    if (!g.path?.length) fail(`guard ${i} has an empty path`);
    for (const [tx, ty] of g.path) {
      if (grid.isWall(tx, ty)) fail(`guard ${i} waypoint ${tx},${ty} is inside a wall`);
    }
    return { path: g.path, mode: g.mode ?? 'loop', pause: g.pause ?? 1 };
  });

  return {
    id: data.id,
    name: data.name,
    hint: data.hint ?? [],
    grid,
    start: marks.S[0],
    artifact: marks.A[0],
    exit: marks.X[0],
    guards,
    pebbles: data.pebbles ?? PEBBLES_DEFAULT,
    ranks: data.ranks ?? { S: 60, A: 100, B: 160 },
  };
}
