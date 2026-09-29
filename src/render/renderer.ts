/** Draws a World into the framebuffer: tiles, sonar rings, objects, HUD. */
import { H, PLAY_H, TILE, W } from '../config';
import { Tile } from '../game/grid';
import { Pulse, World } from '../game/world';
import { C } from '../palette';
import { drawText, textWidth } from './font';
import { Framebuffer } from './framebuffer';
import {
  ARTIFACT,
  BELL,
  EXIT_LOCKED,
  EXIT_OPEN,
  GLYPH_BANG,
  GLYPH_QUESTION,
  GUARD,
  PEBBLE_ICON,
  PLAYER,
  Sprite,
  tilePixels,
} from './sprites';

const RING_RAMP: Record<string, number[]> = {
  player: [C.WHITE, C.CYAN, C.SKY, C.BLUE],
  pebble: [C.WHITE, C.SILVER, C.SLATE, C.SLATE],
  bell: [C.WHITE, C.YELLOW, C.ORANGE, C.RED],
  guard: [C.SLATE, C.SLATE, C.INK, C.INK],
};

/** Ring thickness in tiles. */
const RING_WIDTH = 0.5;

function drawSprite(fb: Framebuffer, s: Sprite, cx: number, cy: number, k: number): void {
  fb.sprite(s.data, s.w, s.h, Math.round(cx - s.w / 2), Math.round(cy - s.h / 2), k);
}

function drawRing(fb: Framebuffer, world: World, p: Pulse): void {
  const { grid, ox, oy } = world;
  const inner = p.front - RING_WIDTH;
  if (p.front <= 0 || inner > p.radius) return;
  const ramp = RING_RAMP[p.kind] ?? RING_RAMP.player;
  const age = Math.min(0.999, p.front / Math.max(p.radius, 1));
  const color = ramp[Math.floor(age * ramp.length)];
  const k = 1 - 0.45 * age;
  for (let n = Math.max(0, p.cursor - 80); n < p.order.length; n++) {
    const i = p.order[n];
    const d = p.dist[i];
    if (d > p.front + 1.2) break;
    if (d < inner - 1.2) continue;
    const tx = i % grid.w;
    const ty = (i / grid.w) | 0;
    if (grid.isWall(tx, ty)) continue;
    // Detour: how much longer the sound path is than the straight line.
    const cx = (tx + 0.5) * TILE;
    const cy = (ty + 0.5) * TILE;
    const detour = Math.max(0, d - Math.hypot(cx - p.x, cy - p.y) / TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const wx = tx * TILE + x + 0.5;
        const wy = ty * TILE + y + 0.5;
        const pd = Math.hypot(wx - p.x, wy - p.y) / TILE + detour;
        if (pd <= p.front && pd >= inner && pd <= p.radius + 0.4) fb.setShaded(ox + tx * TILE + x, oy + ty * TILE + y, color, k);
      }
    }
  }
}

export interface DrawOptions {
  /** Screen-space mouse position for the pebble cursor, or null. */
  mouse: { x: number; y: number } | null;
}

export function drawWorld(fb: Framebuffer, world: World, opts: DrawOptions): void {
  fb.clear();
  const { grid, ox, oy } = world;

  // Tiles, lit by whatever sonar has reached them recently.
  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      const k = world.lightAt(tx, ty);
      if (k <= 0.01) continue;
      const px = tilePixels(grid.tileAt(tx, ty) as Tile, tx, ty);
      const bx = ox + tx * TILE;
      const by = oy + ty * TILE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) fb.setShaded(bx + x, by + y, px[y * TILE + x], k);
      }
    }
  }

  for (const p of world.pulses) drawRing(fb, world, p);

  // Artifact and exit (visible only while their tile is lit).
  const { artifact, exit } = world.level;
  const ek = world.lightAt(exit.tx, exit.ty);
  if (ek > 0.01) drawSprite(fb, world.hasArtifact ? EXIT_OPEN : EXIT_LOCKED, ox + (exit.tx + 0.5) * TILE, oy + (exit.ty + 0.5) * TILE, ek);
  const ak = world.lightAt(artifact.tx, artifact.ty);
  if (!world.hasArtifact && ak > 0.01) drawSprite(fb, ARTIFACT, ox + (artifact.tx + 0.5) * TILE, oy + (artifact.ty + 0.5) * TILE, ak);

  // Guards.
  for (const g of world.guards) {
    const k = world.guardLight(g);
    if (k > 0.01) drawSprite(fb, GUARD, ox + g.x, oy + g.y, k);
    if (world.time < g.flashUntil) {
      const fk = Math.min(1, (g.flashUntil - world.time) / 0.5);
      drawSprite(fb, g.flashKind === 'hunting' ? GLYPH_BANG : GLYPH_QUESTION, ox + g.x, oy + g.y - 8, fk);
    }
  }

  // Player: only seen when their own noise (or a guard's) lights their tile.
  const pk = world.lightAt(world.tileX, world.tileY);
  if (pk > 0.01) drawSprite(fb, PLAYER, ox + world.player.x, oy + world.player.y, Math.min(1, pk + 0.15));

  // Pebbles in flight.
  for (const b of world.pebbles) {
    fb.set(Math.round(ox + b.x), Math.round(oy + b.y), C.WHITE);
    fb.set(Math.round(ox + b.x - b.vx * 0.02), Math.round(oy + b.y - b.vy * 0.02), C.SILVER);
  }

  if (opts.mouse && world.pebblesLeft > 0 && world.status === 'playing') drawCrosshair(fb, opts.mouse.x, opts.mouse.y);

  drawHud(fb, world);
}

function drawCrosshair(fb: Framebuffer, x: number, y: number): void {
  const mx = Math.round(x);
  const my = Math.round(y);
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) fb.set(mx + dx, my + dy, C.SLATE);
}

function drawHud(fb: Framebuffer, world: World): void {
  fb.rect(0, PLAY_H, W, H - PLAY_H, C.BLACK);
  const y1 = PLAY_H + 1;
  let x = 3;
  fb.sprite(PEBBLE_ICON.data, PEBBLE_ICON.w, PEBBLE_ICON.h, x, y1, 1);
  x += 6;
  const pt = `x${world.pebblesLeft}`;
  drawText(fb, pt, x, y1, C.SILVER);
  x += textWidth(pt) + 8;
  fb.sprite(BELL.data, BELL.w, BELL.h, x, y1, world.bellLeft > 0 ? 1 : 0.4);
  x += 7;
  drawText(fb, world.bellLeft > 0 ? 'READY' : 'USED', x, y1, world.bellLeft > 0 ? C.YELLOW : C.SLATE);
  x += 26;
  drawText(fb, world.hasArtifact ? 'ARTIFACT: GOT IT - FIND THE EXIT' : 'GOAL: STEAL THE ARTIFACT', x, y1, world.hasArtifact ? C.LIME : C.SLATE);
  const right = `${world.level.name}  ${world.stats.sounds} SND`;
  drawText(fb, right, W - 3 - textWidth(right), y1, C.SLATE);

  // Message line: toast first, otherwise level hints in sequence.
  let msg: string | null = null;
  let col: number = C.YELLOW;
  if (world.toast && world.time < world.toast.until) msg = world.toast.text;
  else {
    const hints = world.level.hint;
    const slot = Math.floor(world.time / 7);
    if (slot < hints.length) {
      msg = hints[slot];
      col = C.SILVER;
    }
  }
  if (msg) {
    drawText(fb, msg, Math.round((W - textWidth(msg)) / 2), PLAY_H + 7, col);
  }
}

