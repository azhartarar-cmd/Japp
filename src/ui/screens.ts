/** Pixel-art screens drawn straight into the framebuffer. */
import { H, W } from '../config';
import { Rank } from '../game/scoring';
import { C } from '../palette';
import { drawText, drawTextCentered, textWidth } from '../render/font';
import { Framebuffer } from '../render/framebuffer';
import { Menu } from './menu';

const RANK_COLOR: Record<Rank, number> = { S: C.YELLOW, A: C.LIME, B: C.SKY, C: C.SLATE };

const RING_PERIOD = 3.4;
const RING_SPEED = 120; // px/s

/**
 * Text that is "revealed" by a sonar ring expanding from a point and fades
 * back to black, like everything else in the game.
 */
function ringReveal(cx: number, cy: number, t: number): (x: number, y: number) => number {
  const phase = t % RING_PERIOD;
  const r = phase * RING_SPEED;
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) return 0;
    const since = (r - d) / RING_SPEED; // seconds since the ring passed
    return Math.max(0.22, 1 - since / 1.5);
  };
}

function drawRing(fb: Framebuffer, cx: number, cy: number, t: number): void {
  const r = (t % RING_PERIOD) * RING_SPEED;
  if (r > 200) return;
  const ramp = [C.WHITE, C.CYAN, C.SKY, C.BLUE, C.NAVY];
  const color = ramp[Math.min(ramp.length - 1, Math.floor((r / 200) * ramp.length))];
  const x0 = Math.max(0, Math.floor(cx - r - 3));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 3));
  for (let y = Math.max(0, Math.floor(cy - r - 3)); y <= Math.min(H - 1, Math.ceil(cy + r + 3)); y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15);
      if (d <= r && d > r - 2.4) fb.set(x, y, color);
    }
  }
}

export function drawTitle(fb: Framebuffer, menu: Menu, t: number, sub: string): void {
  fb.clear();
  drawRing(fb, 160, 52, t);
  const k = ringReveal(160, 52, t);
  drawTextCentered(fb, 'ECHO', 160, 30, C.CYAN, 5, k);
  drawTextCentered(fb, 'THIEF', 160, 58, C.WHITE, 5, k);
  drawTextCentered(fb, sub, 160, 90, C.SLATE);
  menu.draw(fb);
  const hint = 'ARROWS/WASD + ENTER   ESC = BACK';
  drawTextCentered(fb, hint, 160, H - 9, C.SLATE);
}

export interface LevelRow {
  name: string;
  unlocked: boolean;
  best: Rank | null;
}

export function drawLevelSelect(fb: Framebuffer, menu: Menu, rows: LevelRow[], t: number): void {
  fb.clear();
  drawRing(fb, 160, 26, t);
  drawTextCentered(fb, 'SELECT LEVEL', 160, 20, C.WHITE, 2, ringReveal(160, 26, t + 1.5));
  menu.draw(fb);
  rows.forEach((r, i) => {
    const y = menu.y + i * 10;
    const label = r.unlocked ? (r.best ? `BEST ${r.best}` : 'NEW') : 'LOCKED';
    const col = r.best ? RANK_COLOR[r.best] : r.unlocked ? C.SLATE : C.INK;
    drawText(fb, label, 232, y, col);
  });
  drawTextCentered(fb, 'ENTER = PLAY   ESC = BACK', 160, H - 9, C.SLATE);
}

export function drawPauseOverlay(fb: Framebuffer, menu: Menu): void {
  const x = 90;
  const y = 44;
  const w = 140;
  const h = 84;
  fb.rect(x, y, w, h, C.BLACK);
  fb.frame(x, y, w, h, C.SLATE);
  drawTextCentered(fb, 'PAUSED', 160, y + 8, C.WHITE, 2);
  menu.draw(fb);
}

export interface Result {
  rank: Rank;
  score: number;
  sounds: number;
  pebbles: number;
  bell: boolean;
  time: number;
  newBest: boolean;
  bestRank: Rank;
}

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function drawComplete(fb: Framebuffer, menu: Menu, r: Result, name: string): void {
  fb.clear();
  drawTextCentered(fb, 'LEVEL COMPLETE', 160, 8, C.LIME, 2);
  drawTextCentered(fb, name, 160, 22, C.SLATE);
  drawTextCentered(fb, r.rank, 62, 46, RANK_COLOR[r.rank], 8);
  const lines: [string, string][] = [
    ['SOUNDS', String(r.sounds)],
    ['PEBBLES USED', String(r.pebbles)],
    ['BELL', r.bell ? 'RUNG' : 'SILENT'],
    ['TIME', fmtTime(r.time)],
    ['NOISE SCORE', String(r.score)],
  ];
  lines.forEach(([a, b], i) => {
    const y = 40 + i * 9;
    drawText(fb, a, 110, y, C.SILVER);
    drawText(fb, b, 300 - textWidth(b), y, C.WHITE);
  });
  drawTextCentered(fb, r.newBest ? `NEW BEST RANK: ${r.bestRank}` : `BEST RANK: ${r.bestRank}`, 160, 92, r.newBest ? C.YELLOW : C.SLATE);
  drawTextCentered(fb, 'LOWER NOISE SCORE = BETTER RANK', 160, 102, C.SLATE);
  menu.draw(fb);
}

export function drawCaught(fb: Framebuffer, menu: Menu, t: number): void {
  fb.clear();
  const k = 0.6 + 0.4 * Math.sin(t * 8);
  drawTextCentered(fb, 'CAUGHT!', 160, 40, C.RED, 6, k);
  drawTextCentered(fb, 'A GUARD FOLLOWED YOUR SOUNDS', 160, 78, C.SLATE);
  menu.draw(fb);
}
