import { describe, expect, it } from 'vitest';
import { LOUD_RADIUS, REPEAT_WINDOW, TILE } from '../src/config';
import { Guard, GuardState, HeardSound } from '../src/game/guard';
import { mulberry32 } from '../src/game/rng';
import { grid } from './helpers';

const arena = grid([
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
]);

function makeGuard(path: [number, number][], mode: 'loop' | 'pingpong' = 'loop') {
  const g = new Guard(0, arena, { path, mode, pause: 0.5 }, mulberry32(7));
  const log: GuardState[] = [];
  g.onState = (_g, _from, to) => log.push(to);
  return { g, log };
}

const at = (tx: number, ty: number, source: HeardSound['source'], radius: number): HeardSound => ({
  x: (tx + 0.5) * TILE,
  y: (ty + 0.5) * TILE,
  source,
  radius,
});

/** Advance in fixed steps; returns the new `now`. */
function run(g: Guard, now: number, seconds: number): number {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    now += dt;
    g.update(dt, now);
  }
  return now;
}

describe('guard state machine', () => {
  it('starts in patrol and a static guard stays put', () => {
    const { g } = makeGuard([[3, 2]]);
    const x = g.x;
    run(g, 0, 5);
    expect(g.state).toBe('patrol');
    expect(g.x).toBe(x);
  });

  it('patrols between waypoints', () => {
    const { g } = makeGuard([
      [2, 2],
      [10, 2],
    ]);
    run(g, 0, 20);
    expect(g.state).toBe('patrol');
    expect(g.x).toBeGreaterThan(3 * TILE);
  });

  it('patrol -> suspicious on a single soft player sound, moving to its origin', () => {
    const { g, log } = makeGuard([[3, 2]]);
    g.hear(at(12, 2, 'player', 3.5), 1);
    expect(g.state).toBe('suspicious');
    run(g, 1, 3.6);
    expect(log[0]).toBe('suspicious');
    expect(Math.abs(g.tx - 12)).toBeLessThanOrEqual(1);
  });

  it('a pebble makes a patrolling guard suspicious, never hunting', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(12, 3, 'pebble', 6), 1);
    g.hear(at(12, 3, 'pebble', 6), 1.1);
    expect(g.state).toBe('suspicious');
  });

  it('suspicious -> search -> patrol once nothing else is heard', () => {
    const { g, log } = makeGuard([[3, 2]]);
    g.hear(at(10, 2, 'pebble', 6), 0);
    run(g, 0, 30);
    expect(log).toEqual(['suspicious', 'search', 'patrol']);
    expect(g.tx).toBe(3);
    expect(g.ty).toBe(2);
  });

  it('a loud sound (radius >= LOUD_RADIUS) sends a patrolling guard straight to hunting', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(14, 2, 'player', LOUD_RADIUS), 1);
    expect(g.state).toBe('hunting');
    expect(g.target).toEqual([14, 2]);
  });

  it('the bell always means hunting', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(16, 4, 'bell', 26), 1);
    expect(g.state).toBe('hunting');
  });

  it('two soft player sounds in quick succession escalate to hunting', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(9, 2, 'player', 3.5), 10);
    expect(g.state).toBe('suspicious');
    g.hear(at(10, 2, 'player', 3.5), 10 + REPEAT_WINDOW * 0.5);
    expect(g.state).toBe('hunting');
    expect(g.target).toEqual([10, 2]);
  });

  it('soft sounds far apart in time stay suspicious', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(9, 2, 'player', 3.5), 10);
    g.hear(at(9, 3, 'player', 3.5), 10 + REPEAT_WINDOW + 2);
    expect(g.state).toBe('suspicious');
  });

  it('hunting pursues the newest sound, then searches, then returns to patrol', () => {
    const { g, log } = makeGuard([[3, 2]]);
    g.hear(at(15, 2, 'bell', 26), 0);
    let now = run(g, 0, 2);
    g.hear(at(15, 4, 'player', 3.5), now); // new position while hunting
    expect(g.target).toEqual([15, 4]);
    now = run(g, now, 40);
    expect(log).toEqual(['hunting', 'search', 'patrol']);
    expect(g.state).toBe('patrol');
  });

  it('a hunting guard ignores pebbles', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(15, 2, 'bell', 26), 0);
    g.hear(at(2, 4, 'pebble', 6), 0.1);
    expect(g.state).toBe('hunting');
    expect(g.target).toEqual([15, 2]);
  });

  it('a searching guard that hears the player again hunts', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(8, 2, 'pebble', 6), 0);
    const now = run(g, 0, 4);
    expect(g.state).toBe('search');
    g.hear(at(8, 3, 'player', 1.2), now);
    expect(g.state).toBe('hunting');
  });

  it('search sweeps points near the last known position', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(14, 2, 'bell', 26), 0);
    let now = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 30; i++) {
      now += 1 / 60;
      g.update(1 / 60, now);
      if (g.state === 'search') seen.add(`${g.tx},${g.ty}`);
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const k of seen) {
      const [x, y] = k.split(',').map(Number);
      expect(Math.hypot(x - 14, y - 2)).toBeLessThan(8);
    }
  });

  it('emits footsteps while moving, none while standing', () => {
    const { g } = makeGuard([[3, 2]]);
    g.hear(at(15, 2, 'bell', 26), 0);
    let steps = 0;
    for (let i = 0; i < 60 * 2; i++) if (g.update(1 / 60, i / 60)) steps++;
    expect(steps).toBeGreaterThan(3);
    const still = makeGuard([[3, 2]]).g;
    let s2 = 0;
    for (let i = 0; i < 120; i++) if (still.update(1 / 60, i / 60)) s2++;
    expect(s2).toBe(0);
  });
});
