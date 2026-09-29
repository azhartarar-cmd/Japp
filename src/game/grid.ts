/** Tile grid: tile kinds, surfaces and the sound they make. */

export enum Tile {
  Wall = 0,
  Stone = 1,
  Carpet = 2,
  Metal = 3,
  Water = 4,
}

export type Surface = 'carpet' | 'stone' | 'metal' | 'water';

/** Loudness multiplier per surface: carpet soft, stone medium, metal ringing, water splashy. */
export const SURFACE_MULT: Record<Surface, number> = {
  carpet: 0.5,
  stone: 1,
  metal: 1.8,
  water: 1.4,
};

export function surfaceOfTile(t: Tile): Surface {
  switch (t) {
    case Tile.Carpet:
      return 'carpet';
    case Tile.Metal:
      return 'metal';
    case Tile.Water:
      return 'water';
    default:
      return 'stone';
  }
}

export class Grid {
  constructor(
    readonly w: number,
    readonly h: number,
    readonly tiles: Uint8Array,
  ) {}

  static fromRows(rows: string[], legend: Record<string, Tile>): Grid {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const tiles = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) tiles[y * w + x] = legend[rows[y][x] ?? '#'] ?? Tile.Wall;
    }
    return new Grid(w, h, tiles);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }
  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }
  tileAt(tx: number, ty: number): Tile {
    return this.inBounds(tx, ty) ? (this.tiles[ty * this.w + tx] as Tile) : Tile.Wall;
  }
  isWall(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Wall;
  }
  isWallIdx(i: number): boolean {
    return this.tiles[i] === Tile.Wall;
  }
  surfaceAt(tx: number, ty: number): Surface {
    return surfaceOfTile(this.tileAt(tx, ty));
  }
}
