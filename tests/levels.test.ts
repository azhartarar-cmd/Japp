import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { findPath } from '../src/game/pathfind';
import { evaluate } from '../src/game/scoring';
import { runBot, Step, tileDist } from './bot';

const far = (guard: number, tx: number, ty: number, d: number) => (w: import('../src/game/world').World) =>
  tileDist(w, guard, tx, ty) > d;

/** Sneak-only solutions with full knowledge of guard positions. */
const SOLUTIONS: Record<string, Step[]> = {
  '01-first-steps': [
    { go: [14, 6] },
    { throw: [20, 2] },
    { go: [14, 9] },
    { go: [22, 9] },
    { until: far(0, 24, 6, 5) },
    { go: [25, 6] },
    { go: [30, 4] },
    { go: [33, 8] },
  ],
  '02-cold-iron': [
    { go: [9, 15] },
    { go: [11, 15] },
    { until: (w) => w.guards[1].tx >= 22 && w.guards[1].state === 'patrol' },
    { go: [19, 15] },
    { go: [19, 8] },
    { go: [28, 8] },
    { until: far(0, 30, 8, 12), max: 200 },
    { go: [34, 8] },
  ],
  '03-drowned-vault': [
    { go: [14, 15] },
    { until: (w) => w.guards[0].ty <= 5 },
    { go: [21, 15] },
    { go: [21, 3] },
    { throw: [22, 15] },
    { go: [24, 9] },
    { go: [27, 9] },
    { until: (w) => w.guards[2].ty >= 12 && w.guards[2].tx >= 34 },
    { go: [34, 4] },
    { go: [32, 9] },
    { go: [35, 15] },
  ],
};

describe('levels', () => {
  it('has three levels with unique ids', () => {
    expect(LEVELS.length).toBe(3);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(3);
  });

  for (const l of LEVELS) {
    describe(l.name, () => {
      it('start -> artifact -> exit is connected on the tile grid', () => {
        expect(findPath(l.grid, l.start.tx, l.start.ty, l.artifact.tx, l.artifact.ty)).not.toBeNull();
        expect(findPath(l.grid, l.artifact.tx, l.artifact.ty, l.exit.tx, l.exit.ty)).not.toBeNull();
      });

      it('guard paths are walkable', () => {
        for (const g of l.guards) {
          for (let i = 1; i < g.path.length; i++) {
            const [a, b] = [g.path[i - 1], g.path[i]];
            expect(findPath(l.grid, a[0], a[1], b[0], b[1])).not.toBeNull();
          }
        }
      });

      it('can be completed by a sneaking bot', () => {
        const steps = SOLUTIONS[l.id];
        if (!steps) return;
        const r = runBot(l, steps, { trace: true });
        if (r.status !== 'complete') console.log(r.log.join('\n'));
        expect(r.status).toBe('complete');
        const { rank } = evaluate(l, r.world.stats);
        console.log(l.name, 'bot:', JSON.stringify(r.world.stats), rank);
      });
    });
  }
});
