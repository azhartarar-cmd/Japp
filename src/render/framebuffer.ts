/**
 * 320x180 software framebuffer of palette indices.
 *
 * Fading never leaves the 16-colour palette: brightness `k` (0..1) walks each
 * colour down the DIM ramp and then dithers it to black with a 4x4 Bayer
 * matrix, which gives the stepped fade-to-black.
 */
import { H, W } from '../config';
import { C, DIM, PALETTE_U32 } from '../palette';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Palette index a pixel of colour `c` becomes at brightness `k`, or 0 (black). */
export function shade(c: number, k: number, x: number, y: number): number {
  if (c === 0 || k <= 0) return 0;
  if (k >= 1) return c;
  if (k * 16 <= BAYER[((y & 3) << 2) | (x & 3)]) return 0;
  if (k < 0.34) return DIM[DIM[c]];
  if (k < 0.67) return DIM[c];
  return c;
}

export class Framebuffer {
  readonly px = new Uint8Array(W * H);

  clear(): void {
    this.px.fill(0);
  }

  set(x: number, y: number, c: number): void {
    if (x >= 0 && y >= 0 && x < W && y < H) this.px[y * W + x] = c;
  }

  /** Set with brightness (dither/dim). */
  setShaded(x: number, y: number, c: number, k: number): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const s = shade(c, k, x, y);
    if (s !== 0) this.px[y * W + x] = s;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  frame(x: number, y: number, w: number, h: number, c: number): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  /**
   * Blit a sprite of palette indices (0 = transparent). `k` is brightness.
   */
  sprite(data: Uint8Array, w: number, h: number, x: number, y: number, k = 1, tint?: number): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = data[j * w + i];
        if (c === 0) continue;
        this.setShaded(x + i, y + j, tint ?? c, k);
      }
    }
  }

  /** Copy to an ImageData through the palette. */
  flush(img: ImageData): void {
    const out = new Uint32Array(img.data.buffer);
    const px = this.px;
    for (let i = 0; i < px.length; i++) out[i] = PALETTE_U32[px[i]];
  }
}

export { C };
