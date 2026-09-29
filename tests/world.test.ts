import { describe, expect, it } from 'vitest';
import { STEP_DT, TILE } from '../src/config';
import { LEVELS } from '../src/levels';
import { NO_INPUT, PlayerInput, World } from '../src/game/world';
import { computeScore, evaluate, rankFor } from '../src/game/scoring';
import { defaultSave, isUnlocked, loadSave, recordResult, writeSave } from '../src/game/save';
import { parseLevel } from '../src/game/level';

const L1 = LEVELS[0];

function sim(w: World, seconds: number, input: PlayerInput = NO_INPUT): void {
  for (let t = 0; t < seconds; t += STEP_DT) {
    w.update(STEP_DT, input);
    w.drainEvents();
  }
}

/** Put the player on a tile (test helper). */
function place(w: World, tx: number, ty: number): void {
  w.player.x = (tx + 0.5) * TILE;
  w.player.y = (ty + 0.5) * TILE;
}

describe('world: darkness and reveal', () => {
  it('nothing is lit unless a sound happens (after the intro ping fades)', () => {
    const w = new World(L1);
    sim(w, 2);
    for (let ty = 0; ty < w.grid.h; ty++) for (let tx = 0; tx < w.grid.w; tx++) expect(w.lightAt(tx, ty)).toBe(0);
  });

  it('a footstep lights nearby tiles, which then fade to black in ~1.5s', () => {
    const w = new World(L1);
    sim(w, 2);
    sim(w, 0.5, { ...NO_INPUT, dx: 1 });
    expect(w.lightAt(w.tileX, w.tileY)).toBeGreaterThan(0.5);
    sim(w, 2);
    expect(w.lightAt(w.tileX, w.tileY)).toBe(0);
  });

  it('sneaking lights a smaller area than running', () => {
    const lit = (input: PlayerInput): number => {
      const w = new World(L1);
      sim(w, 2);
      place(w, 9, 6);
      let max = 0;
      for (let t = 0; t < 0.6; t += STEP_DT) {
        w.update(STEP_DT, input);
        let n = 0;
        for (let ty = 0; ty < w.grid.h; ty++) for (let tx = 0; tx < w.grid.w; tx++) if (w.lightAt(tx, ty) > 0.05) n++;
        max = Math.max(max, n);
      }
      return max;
    };
    const sneak = lit({ ...NO_INPUT, dx: 1, sneak: true });
    const walk = lit({ ...NO_INPUT, dx: 1 });
    const run = lit({ ...NO_INPUT, dx: 1, run: true });
    expect(sneak).toBeLessThan(walk);
    expect(walk).toBeLessThan(run);
  });

  it('walls stop the player', () => {
    const w = new World(L1);
    sim(w, 3, { ...NO_INPUT, dx: -1 });
    expect(w.player.x).toBeGreaterThan(TILE);
  });
});

describe('world: surfaces', () => {
  it('footsteps are quieter on carpet than on stone, and metal is loudest', () => {
    // walking: force one stride on the middle tile
    const step = (tile: string): number => {
      const level = parseLevel({ id: 't', name: 't', map: ['#########', `#S${tile}${tile}${tile}${tile}AX#`, '#########'] });
      const w = new World(level);
      place(w, 4, 1);
      let r = 0;
      for (let t = 0; t < 0.4; t += STEP_DT) {
        w.update(STEP_DT, { ...NO_INPUT, dx: 1 });
        for (const e of w.drainEvents()) if (e.type === 'sound' && e.sound.source === 'player') r = e.sound.radius;
      }
      return r;
    };
    const carpet = step(',');
    const stone = step('.');
    const water = step('~');
    const metal = step('=');
    expect(carpet).toBeGreaterThan(0);
    expect(carpet).toBeLessThan(stone);
    expect(stone).toBeLessThan(water);
    expect(water).toBeLessThan(metal);
  });
});

describe('world: guards react', () => {
  it('a pebble landing near a guard makes it suspicious and it walks to the impact', () => {
    const w = new World(L1);
    place(w, 14, 6);
    const g = w.guards[0];
    expect(g.state).toBe('patrol');
    w.update(STEP_DT, { ...NO_INPUT, throwAt: { x: 20.5 * TILE, y: 2.5 * TILE } });
    expect(w.pebblesLeft).toBe(L1.pebbles - 1);
    sim(w, 1);
    expect(g.state).toBe('suspicious');
    let closest = Infinity;
    for (let t = 0; t < 5; t += STEP_DT) {
      w.update(STEP_DT, NO_INPUT);
      w.drainEvents();
      closest = Math.min(closest, Math.hypot(g.x / TILE - 20.5, g.y / TILE - 2.5));
    }
    expect(closest).toBeLessThan(1.5);
  });

  it('cannot throw with no pebbles left', () => {
    const w = new World(L1);
    w.pebblesLeft = 0;
    w.update(STEP_DT, { ...NO_INPUT, throwAt: { x: 100, y: 50 } });
    expect(w.pebbles.length).toBe(0);
    expect(w.stats.pebblesUsed).toBe(0);
  });

  it('a pebble stops at a wall', () => {
    const w = new World(L1);
    place(w, 14, 6);
    w.update(STEP_DT, { ...NO_INPUT, throwAt: { x: 14.5 * TILE, y: 0.5 * TILE } }); // up through the ceiling
    sim(w, 1);
    expect(w.pebbles.length).toBe(0);
    expect(w.stats.sounds).toBe(1);
  });

  it('the bell alerts every guard to the player position, once per level', () => {
    const l = LEVELS[2];
    const w = new World(l);
    place(w, 3, 15);
    w.update(STEP_DT, { ...NO_INPUT, bell: true });
    for (const g of w.guards) {
      expect(g.state).toBe('hunting');
      expect(g.target).toEqual([3, 15]);
    }
    expect(w.bellLeft).toBe(0);
    expect(w.stats.bellUsed).toBe(true);
    const before = w.stats.sounds;
    w.update(STEP_DT, { ...NO_INPUT, bell: true });
    expect(w.stats.sounds).toBe(before);
  });

  it('running near a guard makes it hunt', () => {
    const w = new World(L1);
    place(w, 19, 6);
    sim(w, 1, { ...NO_INPUT, dx: 1, run: true });
    expect(w.guards[0].state).toBe('hunting');
  });

  it('sneaking two tiles from a guard goes unheard; walking does not', () => {
    const sneak = new World(L1);
    place(sneak, 22, 4);
    sim(sneak, 1, { ...NO_INPUT, dx: 0.01, dy: 0, sneak: true });
    expect(sneak.guards[0].state).toBe('patrol');

    const walk = new World(L1);
    place(walk, 22, 4);
    sim(walk, 1, { ...NO_INPUT, dx: 0.01, dy: 0 });
    // walk radius 3.5 reaches a guard at ~2.8 tiles: heard at least once
    expect(walk.guards[0].state).not.toBe('patrol');
  });

  it('touching a guard means caught', () => {
    const w = new World(L1);
    place(w, 24, 6);
    sim(w, 0.1);
    expect(w.status).toBe('caught');
  });

  it('sounds are muffled by walls: a guard behind a wall does not hear a walk', () => {
    const l = parseLevel({
      id: 't', name: 't',
      map: ['#########', '#S..#..AX#', '#########'],
      guards: [{ path: [[5, 1]] }],
    });
    const w = new World(l);
    place(w, 3, 1);
    sim(w, 1, { ...NO_INPUT, dx: 0.01, dy: 0 });
    expect(w.guards[0].state).toBe('patrol');
  });

  it('a guard footstep near the player reveals the guard, far away does not', () => {
    const w = new World(L1);
    sim(w, 2);
    const g = w.guards[0];
    // send the guard walking past the player
    place(w, 22, 4);
    g.hear({ x: 20.5 * TILE, y: 2.5 * TILE, source: 'pebble', radius: 10 }, w.time);
    let seen = 0;
    for (let t = 0; t < 4; t += STEP_DT) {
      w.update(STEP_DT, NO_INPUT);
      w.drainEvents();
      if (w.guardLight(g) > 0.2) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('goals and scoring', () => {
  it('exit does nothing until the artifact is taken, then completes the level', () => {
    const w = new World(L1);
    place(w, L1.exit.tx, L1.exit.ty);
    sim(w, 0.1);
    expect(w.status).toBe('playing');
    expect(w.toast?.text).toMatch(/ARTIFACT/);
    place(w, L1.artifact.tx, L1.artifact.ty);
    sim(w, 0.1);
    expect(w.hasArtifact).toBe(true);
    place(w, L1.exit.tx, L1.exit.ty);
    sim(w, 0.1);
    expect(w.status).toBe('complete');
  });

  it('quieter play scores better', () => {
    const base = { sounds: 0, noise: 0, pebblesUsed: 0, bellUsed: false, time: 0 };
    expect(computeScore({ ...base, noise: 20 })).toBeLessThan(computeScore({ ...base, noise: 60 }));
    expect(computeScore({ ...base, noise: 20, time: 60 })).toBeGreaterThan(computeScore({ ...base, noise: 20 }));
  });

  it('ranks follow the level thresholds', () => {
    const t = { S: 30, A: 55, B: 90 };
    expect([20, 30, 31, 55, 56, 90, 91].map((s) => rankFor(s, t))).toEqual(['S', 'S', 'A', 'A', 'B', 'B', 'C']);
    const r = evaluate(L1, { sounds: 10, noise: 10, pebblesUsed: 0, bellUsed: false, time: 5 });
    expect(r.rank).toBe('S');
  });
});

describe('save data', () => {
  const mem = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  };

  it('round-trips and unlocks levels on completion', () => {
    const s = mem();
    const save = defaultSave();
    const ids = LEVELS.map((l) => l.id);
    expect(isUnlocked(save, ids, 0)).toBe(true);
    expect(isUnlocked(save, ids, 1)).toBe(false);
    recordResult(save, ids[0], { rank: 'B', score: 80, time: 30, sounds: 70 });
    writeSave(save, s);
    const loaded = loadSave(s);
    expect(isUnlocked(loaded, ids, 1)).toBe(true);
    expect(isUnlocked(loaded, ids, 2)).toBe(false);
  });

  it('keeps the best rank', () => {
    const save = defaultSave();
    expect(recordResult(save, 'a', { rank: 'B', score: 80, time: 30, sounds: 70 }).newBest).toBe(true);
    expect(recordResult(save, 'a', { rank: 'C', score: 120, time: 30, sounds: 90 })).toEqual({ newBest: false, bestRank: 'B' });
    expect(recordResult(save, 'a', { rank: 'S', score: 20, time: 30, sounds: 30 })).toEqual({ newBest: true, bestRank: 'S' });
    expect(save.completed.a.score).toBe(20);
  });

  it('survives corrupt storage', () => {
    const s = mem();
    s.setItem('echo-thief.save.v1', '{nope');
    expect(loadSave(s)).toEqual(defaultSave());
  });
});

describe('level loader', () => {
  it('rejects bad levels with clear errors', () => {
    expect(() => parseLevel({ id: 'x', name: 'x', map: ['###', '#S#', '###'] })).toThrow(/artifact/);
    expect(() => parseLevel({ id: 'x', name: 'x', map: ['#####', '#SAX#', '#####'], guards: [{ path: [[0, 0]] }] })).toThrow(/wall/);
    expect(() => parseLevel({ id: 'x', name: 'x', map: ['#Q#', '#SA', 'X##'] })).toThrow(/unknown tile/);
    expect(() => parseLevel({ id: 'x', name: 'x', map: ['#'.repeat(41), 'SAX'] })).toThrow(/exceeds/);
  });

  it('parses surfaces and markers', () => {
    const l = parseLevel({ id: 'x', name: 'x', map: ['#######', '#S,.=~A', '#X#####'] });
    expect(l.start).toEqual({ tx: 1, ty: 1 });
    expect(l.artifact).toEqual({ tx: 6, ty: 1 });
    expect(l.exit).toEqual({ tx: 1, ty: 2 });
    expect(l.grid.surfaceAt(2, 1)).toBe('carpet');
    expect(l.grid.surfaceAt(3, 1)).toBe('stone');
    expect(l.grid.surfaceAt(4, 1)).toBe('metal');
    expect(l.grid.surfaceAt(5, 1)).toBe('water');
  });
});
