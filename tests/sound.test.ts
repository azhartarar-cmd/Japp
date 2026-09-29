import { describe, expect, it } from 'vitest';
import { LOUDNESS, TILE } from '../src/config';
import { hears, lineOfSight, makeSound, propagate, revealMap } from '../src/game/sound';
import { grid } from './helpers';

const px = (t: number) => (t + 0.5) * TILE;

describe('sound model', () => {
  it('scales radius by surface: carpet < stone < water < metal', () => {
    const r = (s: 'carpet' | 'stone' | 'metal' | 'water') => makeSound(0, 0, 'player', s, LOUDNESS.walk, 0, 'walk').radius;
    expect(r('carpet')).toBeLessThan(r('stone'));
    expect(r('stone')).toBeLessThan(r('water'));
    expect(r('water')).toBeLessThan(r('metal'));
  });

  it('bell ignores the floor surface', () => {
    const a = makeSound(0, 0, 'bell', 'carpet', LOUDNESS.bell, 0);
    const b = makeSound(0, 0, 'bell', 'metal', LOUDNESS.bell, 0);
    expect(a.radius).toBe(b.radius);
  });

  it('sneak < walk < run on the same surface', () => {
    const r = (g: 'sneak' | 'walk' | 'run') => makeSound(0, 0, 'player', 'stone', LOUDNESS[g], 0, g).radius;
    expect(r('sneak')).toBeLessThan(r('walk'));
    expect(r('walk')).toBeLessThan(r('run'));
  });
});

describe('propagation', () => {
  const open = grid(['.........', '.........', '.........', '.........', '.........']);

  it('is ~Euclidean in open space', () => {
    const d = propagate(open, 4, 2, 10, { walls: 'terminal' });
    expect(d[open.idx(4, 2)]).toBe(0);
    expect(d[open.idx(7, 2)]).toBeCloseTo(3, 4);
    expect(d[open.idx(7, 4)]).toBeCloseTo(Math.hypot(3, 2), 3);
  });

  it('never reaches beyond maxDist', () => {
    const d = propagate(open, 0, 2, 3, { walls: 'terminal' });
    expect(d[open.idx(3, 2)]).toBeCloseTo(3, 4);
    expect(d[open.idx(4, 2)]).toBe(Infinity);
  });

  it('reveal mode: sonar hits a wall but does not pass it', () => {
    const g = grid(['...#...']);
    const d = propagate(g, 0, 0, 10, { walls: 'terminal' });
    expect(d[3]).toBeLessThan(Infinity); // wall face is reached
    expect(d[4]).toBe(Infinity);
    expect(d[6]).toBe(Infinity);
  });

  it('wraps around a corner: path distance exceeds straight-line distance', () => {
    const g = grid(['.....', '.###.', '.###.', '.....']);
    // (2,0) -> (2,3): straight line is 3, but the wall forces a detour
    const d = propagate(g, 2, 0, 20, { walls: 'terminal' });
    expect(d[g.idx(2, 3)]).toBeGreaterThan(3.5);
    expect(d[g.idx(2, 3)]).toBeLessThan(Infinity);
  });

  it('hearing: a thin wall muffles, a thick wall blocks', () => {
    const thin = grid(['..#..']);
    const thick = grid(['..###..']);
    const s = makeSound(px(0), px(0), 'player', 'stone', 4, 0);
    const heardThin = hears(thin, s, 4, 0, TILE);
    const heardThick = hears(thick, s, 6, 0, TILE);
    expect(heardThin.heard).toBe(false); // 4 tiles + 3 wall cost > 4
    expect(heardThick.heard).toBe(false);
    const loud = makeSound(px(0), px(0), 'player', 'stone', 8, 0);
    const t1 = hears(thin, loud, 4, 0, TILE);
    const t2 = hears(thick, loud, 6, 0, TILE);
    expect(t1.heard).toBe(true);
    expect(t2.heard).toBe(false);
    expect(t1.distance).toBeGreaterThan(4); // attenuated
  });

  it('hearing: intensity falls with distance and is 1 at the origin', () => {
    const s = makeSound(px(0), px(0), 'player', 'stone', 6, 0);
    const near = hears(open, s, 0, 0, TILE);
    const far = hears(open, s, 4, 0, TILE);
    expect(near.intensity).toBe(1);
    expect(far.intensity).toBeCloseTo(1 - 4 / 6, 3);
    expect(hears(open, s, 8, 0, TILE).heard).toBe(false);
  });

  it('carpet is quieter than metal for the same footstep', () => {
    const row = grid(['.........']);
    const carpet = makeSound(px(0), px(0), 'player', 'carpet', LOUDNESS.walk, 0);
    const metal = makeSound(px(0), px(0), 'player', 'metal', LOUDNESS.walk, 0);
    expect(hears(row, carpet, 4, 0, TILE).heard).toBe(false);
    expect(hears(row, metal, 4, 0, TILE).heard).toBe(true);
  });

  it('revealMap matches the sound radius', () => {
    const s = makeSound(px(4), px(2), 'pebble', 'stone', 3, 0);
    const d = revealMap(open, s, TILE);
    expect(d[open.idx(4, 2)]).toBe(0);
    expect(d[open.idx(7, 2)]).toBeCloseTo(3, 4);
    expect(d[open.idx(8, 2)]).toBe(Infinity);
  });
});

describe('lineOfSight', () => {
  const g = grid(['.....', '..#..', '.....']);
  it('is blocked by a wall in between', () => {
    expect(lineOfSight(g, 0, 1, 4, 1)).toBe(false);
  });
  it('is clear in the open', () => {
    expect(lineOfSight(g, 0, 0, 4, 0)).toBe(true);
    expect(lineOfSight(g, 0, 0, 4, 2)).toBe(false); // grazes the wall corner
  });
});
