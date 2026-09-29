import { Grid, Tile } from '../src/game/grid';

const LEGEND: Record<string, Tile> = {
  '#': Tile.Wall,
  '.': Tile.Stone,
  ',': Tile.Carpet,
  '=': Tile.Metal,
  '~': Tile.Water,
};

export const grid = (rows: string[]): Grid => Grid.fromRows(rows, LEGEND);
