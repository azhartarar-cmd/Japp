import { Level, RankThresholds } from './level';

export type Rank = 'S' | 'A' | 'B' | 'C';
export const RANK_ORDER: Rank[] = ['C', 'B', 'A', 'S'];

export interface Stats {
  /** Sounds the player caused (steps, landed pebbles, bell). */
  sounds: number;
  /** Loudness-weighted sound total (sneak 0.5, walk 1, run 2, pebble 3, bell 10). */
  noise: number;
  pebblesUsed: number;
  bellUsed: boolean;
  /** Seconds of play. */
  time: number;
}

export const NOISE_WEIGHT = { sneak: 0.5, walk: 1, run: 2, pebble: 3, bell: 10 } as const;

export function emptyStats(): Stats {
  return { sounds: 0, noise: 0, pebblesUsed: 0, bellUsed: false, time: 0 };
}

/** Lower is better. Noise dominates; slow play costs a little (1 per 15 s). */
export function computeScore(s: Stats): number {
  return Math.round(s.noise) + Math.floor(s.time / 15);
}

export function rankFor(score: number, t: RankThresholds): Rank {
  if (score <= t.S) return 'S';
  if (score <= t.A) return 'A';
  if (score <= t.B) return 'B';
  return 'C';
}

export function evaluate(level: Level, s: Stats): { score: number; rank: Rank } {
  const score = computeScore(s);
  return { score, rank: rankFor(score, level.ranks) };
}

export function betterRank(a: Rank | undefined, b: Rank): Rank {
  if (!a) return b;
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b;
}
