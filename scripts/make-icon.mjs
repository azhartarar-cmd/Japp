// Generates build/icon.png (1024x1024) procedurally: a pixel-art sonar ring on black.
// electron-builder converts it to .icns on the macOS runner. No binary assets are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 1024;
const CELLS = 32; // chunky pixels
const cell = N / CELLS;
const palette = ['#000000', '#1a1c2c', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4'].map((h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]);

const px = Buffer.alloc(N * N * 4);
for (let cy = 0; cy < CELLS; cy++) {
  for (let cx = 0; cx < CELLS; cx++) {
    const d = Math.hypot(cx + 0.5 - CELLS / 2, cy + 0.5 - CELLS / 2);
    let c = 1;
    if (d < 1.6) c = 6; // the thief
    else if (Math.abs(d - 6) < 0.9) c = 5;
    else if (Math.abs(d - 10) < 0.9) c = 4;
    else if (Math.abs(d - 14) < 0.9) c = 3;
    else if (d < 15.5) c = 2;
    // rounded-square mask
    const m = Math.max(Math.abs(cx + 0.5 - CELLS / 2), Math.abs(cy + 0.5 - CELLS / 2));
    const a = m < CELLS / 2 - 0.5 && !(m > CELLS / 2 - 3 && d > 21) ? 255 : 0;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const o = ((cy * cell + y) * N + cx * cell + x) * 4;
        px[o] = palette[c][0]; px[o + 1] = palette[c][1]; px[o + 2] = palette[c][2]; px[o + 3] = a;
      }
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log('wrote build/icon.png');
