/** The one and only palette: 16 colours. Nothing is ever drawn outside it. */

export const C = {
  BLACK: 0,
  INK: 1,
  PLUM: 2,
  RED: 3,
  ORANGE: 4,
  YELLOW: 5,
  LIME: 6,
  GREEN: 7,
  TEAL: 8,
  NAVY: 9,
  BLUE: 10,
  SKY: 11,
  CYAN: 12,
  WHITE: 13,
  SILVER: 14,
  SLATE: 15,
} as const;

export const PALETTE_HEX: readonly string[] = [
  '#000000', // BLACK
  '#1a1c2c', // INK
  '#5d275d', // PLUM
  '#b13e53', // RED
  '#ef7d57', // ORANGE
  '#ffcd75', // YELLOW
  '#a7f070', // LIME
  '#38b764', // GREEN
  '#257179', // TEAL
  '#29366f', // NAVY
  '#3b5dc9', // BLUE
  '#41a6f6', // SKY
  '#73eff7', // CYAN
  '#f4f4f4', // WHITE
  '#94b0c2', // SILVER
  '#566c86', // SLATE
];

/** Next darker palette entry for each colour; drives the fade-to-black ramp. */
export const DIM: readonly number[] = [
  C.BLACK, // BLACK
  C.BLACK, // INK
  C.INK, // PLUM
  C.PLUM, // RED
  C.RED, // ORANGE
  C.ORANGE, // YELLOW
  C.GREEN, // LIME
  C.TEAL, // GREEN
  C.NAVY, // TEAL
  C.INK, // NAVY
  C.NAVY, // BLUE
  C.BLUE, // SKY
  C.SKY, // CYAN
  C.SILVER, // WHITE
  C.SLATE, // SILVER
  C.INK, // SLATE
];

/** Little-endian ABGR words for writing into an ImageData's Uint32Array view. */
export const PALETTE_U32: Uint32Array = Uint32Array.from(PALETTE_HEX, (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
});
