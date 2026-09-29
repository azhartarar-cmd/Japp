/** Progress persistence (localStorage). Every access is guarded: storage may be unavailable. */
import { Rank, betterRank } from './scoring';

const KEY = 'echo-thief.save.v1';

export interface LevelRecord {
  rank: Rank;
  score: number;
  time: number;
  sounds: number;
}

export interface SaveData {
  completed: Record<string, LevelRecord>;
  crt: boolean;
  muted: boolean;
}

export function defaultSave(): SaveData {
  return { completed: {}, crt: false, muted: false };
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveData {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      completed: d.completed && typeof d.completed === 'object' ? d.completed : {},
      crt: !!d.crt,
      muted: !!d.muted,
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota: progress just won't persist */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Merge a finished run into the save; returns whether the rank improved. */
export function recordResult(data: SaveData, levelId: string, r: LevelRecord): { newBest: boolean; bestRank: Rank } {
  const prev = data.completed[levelId];
  const bestRank = betterRank(prev?.rank, r.rank);
  const newBest = !prev || bestRank !== prev.rank;
  data.completed[levelId] = {
    rank: bestRank,
    score: prev ? Math.min(prev.score, r.score) : r.score,
    time: prev ? Math.min(prev.time, r.time) : r.time,
    sounds: prev ? Math.min(prev.sounds, r.sounds) : r.sounds,
  };
  return { newBest, bestRank };
}

/** Level i is playable if it is the first or the previous level was completed. */
export function isUnlocked(data: SaveData, ids: string[], i: number): boolean {
  return i === 0 || !!data.completed[ids[i - 1]];
}
