/** 3x5 bitmap font, defined inline. Each glyph is five 3-bit rows. */
import { Framebuffer } from './framebuffer';

const RAW: Record<string, string> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  '.': '000000000000010',
  ',': '000000000010100',
  ':': '000010000010000',
  '!': '010010010000010',
  '?': '110001010000010',
  '-': '000000111000000',
  '+': '000010111010000',
  '/': '001001010100100',
  '(': '001010010010001',
  ')': '100010010010100',
  '>': '100010001010100',
  '<': '001010100010001',
  "'": '010010000000000',
  '%': '101001010100101',
  '=': '000111000111000',
  '_': '000000000000111',
  '*': '000101010101000',
  '[': '110100100100110',
  ']': '011001001001011',
  ' ': '000000000000000',
};

const GLYPHS = new Map<string, Uint8Array>();
for (const [ch, bits] of Object.entries(RAW)) GLYPHS.set(ch, Uint8Array.from(bits, (b) => (b === '1' ? 1 : 0)));

/** Constant brightness, or a per-pixel function (used for sonar-revealed text). */
export type Brightness = number | ((x: number, y: number) => number);

export const GLYPH_W = 3;
export const GLYPH_H = 5;

export function textWidth(s: string, scale = 1): number {
  return s.length ? (s.length * 4 - 1) * scale : 0;
}

export function drawText(
  fb: Framebuffer,
  s: string,
  x: number,
  y: number,
  color: number,
  scale = 1,
  k: Brightness = 1,
): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS.get(ch) ?? GLYPHS.get('?')!;
    for (let j = 0; j < GLYPH_H; j++) {
      for (let i = 0; i < GLYPH_W; i++) {
        if (!g[j * GLYPH_W + i]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + i * scale + sx;
            const py = y + j * scale + sy;
            fb.setShaded(px, py, color, typeof k === 'number' ? k : k(px, py));
          }
        }
      }
    }
    cx += 4 * scale;
  }
}

export function drawTextCentered(
  fb: Framebuffer,
  s: string,
  cx: number,
  y: number,
  color: number,
  scale = 1,
  k: Brightness = 1,
): void {
  drawText(fb, s, Math.round(cx - textWidth(s, scale) / 2), y, color, scale, k);
}
