/**
 * Every sprite is generated in code: tiles procedurally (small deterministic
 * noise), objects from inline character maps. No external assets.
 */
import { TILE } from '../config';
import { Tile } from '../game/grid';
import { C } from '../palette';

export interface Sprite {
  w: number;
  h: number;
  data: Uint8Array;
}

function fromRows(rows: string[], legend: Record<string, number>): Sprite {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = legend[rows[y][x]] ?? 0;
  return { w, h, data };
}

export const PLAYER: Sprite = fromRows(
  [
    '..sss..',
    '.sSSSs.',
    '.sSwSs.',
    '..sss..',
    '.sbbbs.',
    '.sbbbs.',
    '..b.b..',
  ],
  { s: C.SKY, S: C.CYAN, w: C.WHITE, b: C.BLUE },
);

export const GUARD: Sprite = fromRows(
  [
    '..rrr..',
    '.rrrrr.',
    '..yyy..',
    '.rrrrr.',
    'rrrrrrr',
    '.rr.rr.',
    '.oo.oo.',
  ],
  { r: C.RED, y: C.YELLOW, o: C.ORANGE },
);

export const ARTIFACT: Sprite = fromRows(
  [
    '...y...',
    '..yoy..',
    '.yowoy.',
    'yowwwoy',
    '.yowoy.',
    '..yoy..',
    '...y...',
  ],
  { y: C.YELLOW, o: C.ORANGE, w: C.WHITE },
);

const EXIT_LEGEND_OPEN = { g: C.GREEN, l: C.LIME };
const EXIT_LEGEND_LOCKED = { g: C.RED, l: C.SLATE };
const EXIT_ROWS = [
  'gggggggg',
  'g......g',
  'g..l...g',
  'g..ll..g',
  'g..lll.g',
  'g..ll..g',
  'g..l...g',
  'gggggggg',
];
export const EXIT_OPEN: Sprite = fromRows(EXIT_ROWS, EXIT_LEGEND_OPEN);
export const EXIT_LOCKED: Sprite = fromRows(EXIT_ROWS, EXIT_LEGEND_LOCKED);

export const BELL: Sprite = fromRows(
  ['..y..', '.yyy.', '.yyy.', 'yyyyy', '..o..'],
  { y: C.YELLOW, o: C.ORANGE },
);
export const PEBBLE_ICON: Sprite = fromRows(['.ww.', 'wSSw', '.SS.'], { w: C.WHITE, S: C.SILVER });

export const GLYPH_QUESTION: Sprite = fromRows(['.yy.', '...y', '..y.', '....', '..y.'], { y: C.YELLOW });
export const GLYPH_BANG: Sprite = fromRows(['.r.', '.r.', '.r.', '...', '.r.'], { r: C.RED });

// ---- tiles -----------------------------------------------------------------

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function make(fn: (x: number, y: number, v: number) => number, variant: number): Uint8Array {
  const d = new Uint8Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) d[y * TILE + x] = fn(x, y, variant);
  return d;
}

const wall = (x: number, y: number, v: number): number => {
  const row = y >> 2; // two brick rows per tile
  const mortarY = (y & 3) === 3;
  const off = (row + v) & 1 ? 4 : 0;
  const mortarX = ((x + off) & 7) === 7;
  if (mortarY || mortarX) return C.INK;
  return (y & 3) === 0 ? C.SKY : (x + row + v) % 3 === 0 ? C.NAVY : C.BLUE;
};

const stone = (x: number, y: number, v: number): number => {
  const r = hash(x, y, v);
  if (r > 0.9) return C.SILVER;
  if (r < 0.07) return C.INK;
  return C.SLATE;
};

const carpet = (x: number, y: number, v: number): number => {
  if ((x + y * 2 + v) % 4 === 0) return C.RED;
  return hash(x, y, v + 9) > 0.86 ? C.INK : C.PLUM;
};

const metal = (x: number, y: number, v: number): number => {
  if (x === 0 || y === 0) return C.SLATE;
  if ((x === 2 || x === 5) && (y === 2 || y === 5)) return C.WHITE; // rivets
  if (y % 2 === 1 && x > 0) return v % 2 ? C.SILVER : C.SLATE;
  return C.SILVER;
};

const water = (x: number, y: number, v: number): number => {
  const wave = (x + v * 3 + (y >> 1) * 2) % 6;
  if (y % 3 === 1 && wave < 2) return C.CYAN;
  if (y % 3 === 1 && wave === 2) return C.SKY;
  return hash(x, y, v + 4) > 0.8 ? C.NAVY : C.TEAL;
};

const GEN: Record<number, (x: number, y: number, v: number) => number> = {
  [Tile.Wall]: wall,
  [Tile.Stone]: stone,
  [Tile.Carpet]: carpet,
  [Tile.Metal]: metal,
  [Tile.Water]: water,
};

const VARIANTS = 4;
const tileCache = new Map<number, Uint8Array[]>();

/** 8x8 palette-index pixels for a tile; `seed` picks a variant deterministically. */
export function tilePixels(tile: Tile, tx: number, ty: number): Uint8Array {
  let list = tileCache.get(tile);
  if (!list) {
    list = Array.from({ length: VARIANTS }, (_, v) => make(GEN[tile], v));
    tileCache.set(tile, list);
  }
  return list[Math.floor(hash(tx, ty, 77) * VARIANTS)];
}
