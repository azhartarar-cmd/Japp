/** Global tunables. Distances are in pixels unless a name says `Tiles`. */

export const W = 320;
export const H = 180;
export const TILE = 8;
/** Rows below this y belong to the HUD. */
export const PLAY_H = 168;
export const MAX_MAP_W = W / TILE; // 40
export const MAX_MAP_H = PLAY_H / TILE; // 21

export const STEP_DT = 1 / 60;

/** Seconds for a revealed pixel to fade back to black. */
export const FADE_TIME = 1.5;
/** Seconds a revealed tile stays at full brightness before fading. */
export const HOLD_TIME = 0.12;

// Movement (px/s)
export const SPEED = { sneak: 17, walk: 33, run: 58 } as const;
/** Distance between footstep sounds (px). */
export const STRIDE = { sneak: 8, walk: 9, run: 12 } as const;
export const PLAYER_HALF = 2.4;
export const CATCH_RADIUS = 5;

// Sound loudness = base pulse radius in tiles on a x1.0 surface.
export const LOUDNESS = {
  sneak: 1.2,
  walk: 3.5,
  run: 8,
  pebble: 10,
  bell: 26,
  guardStep: 3,
  guardHunt: 4.5,
  guardAlert: 9,
} as const;

/** Sounds at least this loud (tiles, after surface) make guards hunt at once. */
export const LOUD_RADIUS = 6;
/** Two player sounds heard within this many seconds also trigger hunting. */
export const REPEAT_WINDOW = 1.0;
/** Extra propagation cost (tiles) for a sound to pass through one wall tile. */
export const WALL_ATTENUATION = 3;

/** Reveal-pulse expansion speeds (tiles/s). */
export const PULSE_SPEED = { normal: 22, bell: 15 } as const;

// Pebble
export const PEBBLE_SPEED = 150;
export const PEBBLE_RANGE = 15 * TILE;
export const PEBBLES_DEFAULT = 4;

// Guards
export const GUARD_SPEED = { patrol: 16, suspicious: 24, hunting: 43, search: 20 } as const;
export const GUARD_PATROL_PAUSE = 1.0;
export const GUARD_LOOK_TIME = 1.4;
export const GUARD_SEARCH_POINTS = 3;
export const GUARD_SEARCH_RADIUS = 4;
export const GUARD_STEP_DIST = 10;
/** Seconds a guard silhouette stays visible after its footstep/alert reached the player. */
export const GUARD_REVEAL_TIME = 0.9;
