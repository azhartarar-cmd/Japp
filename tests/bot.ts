/**
 * Headless "player" used to prove every level can be finished. Scripts are
 * lists of steps; the bot has full knowledge of the world (it is a test
 * oracle, not a fair player), so it can wait for guards to move away.
 */
import { STEP_DT, TILE } from '../src/config';
import { Level } from '../src/game/level';
import { findPath } from '../src/game/pathfind';
import { NO_INPUT, PlayerInput, World } from '../src/game/world';

export type Mode = 'sneak' | 'walk' | 'run';

export type Step =
  | { go: [number, number]; mode?: Mode }
  | { wait: number }
  | { until: (w: World) => boolean; max?: number }
  | { throw: [number, number] }
  | { bell: true };

export interface BotResult {
  status: World['status'];
  time: number;
  world: World;
  log: string[];
}

export const tileDist = (w: World, i: number, tx: number, ty: number): number => {
  const g = w.guards[i];
  return Math.hypot(g.x / TILE - (tx + 0.5), g.y / TILE - (ty + 0.5));
};

export function runBot(level: Level, steps: Step[], opts: { seed?: number; maxTime?: number; trace?: boolean } = {}): BotResult {
  const w = new World(level, opts.seed ?? 1);
  const log: string[] = [];
  const maxTime = opts.maxTime ?? 400;
  let nextTrace = 0;

  const tick = (input: PlayerInput): boolean => {
    w.update(STEP_DT, input);
    w.drainEvents();
    if (opts.trace && w.time >= nextTrace) {
      nextTrace += 1;
      log.push(
        `t=${w.time.toFixed(0)} p=(${w.tileX},${w.tileY}) ` +
          w.guards.map((g) => `G${g.id}:${g.state}@${g.tx},${g.ty}`).join(' '),
      );
    }
    return w.status === 'playing' && w.time < maxTime;
  };

  outer: for (const step of steps) {
    if ('go' in step) {
      const mode = step.mode ?? 'sneak';
      const path = findPath(w.grid, w.tileX, w.tileY, step.go[0], step.go[1]);
      if (!path) throw new Error(`bot: no path to ${step.go}`);
      for (const [tx, ty] of path) {
        const cx = (tx + 0.5) * TILE;
        const cy = (ty + 0.5) * TILE;
        while (Math.hypot(cx - w.player.x, cy - w.player.y) > 1.2) {
          const input: PlayerInput = {
            ...NO_INPUT,
            dx: cx - w.player.x,
            dy: cy - w.player.y,
            sneak: mode === 'sneak',
            run: mode === 'run',
          };
          if (!tick(input)) break outer;
        }
      }
    } else if ('wait' in step) {
      for (let t = 0; t < step.wait; t += STEP_DT) if (!tick(NO_INPUT)) break outer;
    } else if ('until' in step) {
      const limit = w.time + (step.max ?? 120);
      while (!step.until(w)) {
        if (w.time > limit) throw new Error(`bot: until() timed out at t=${w.time.toFixed(1)}\n${log.slice(-5).join('\n')}`);
        if (!tick(NO_INPUT)) break outer;
      }
    } else if ('throw' in step) {
      const at = { x: (step.throw[0] + 0.5) * TILE, y: (step.throw[1] + 0.5) * TILE };
      if (!tick({ ...NO_INPUT, throwAt: at })) break outer;
    } else if ('bell' in step) {
      if (!tick({ ...NO_INPUT, bell: true })) break outer;
    }
  }
  return { status: w.status, time: w.time, world: w, log };
}
