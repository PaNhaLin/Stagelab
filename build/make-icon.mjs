// Draws the Keystage icon (three keys on a dark rounded tile) as a 512x512 PNG.
// No dependencies: rasterises with 4x4 supersampling and writes the PNG by hand.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const S = 512;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// shapes drawn back to front: [x0, y0, x1, y1, radius, color]
const shapes = [
  [16, 16, 496, 496, 112, hex('#16181f')],
  [100, 116, 182, 396, 20, hex('#ff8a3d')],
  [215, 116, 297, 396, 20, hex('#ece7df')],
  [330, 116, 412, 396, 20, hex('#ece7df')],
];

function inRoundRect(x, y, [x0, y0, x1, y1, r]) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const px = Buffer.alloc(S * S * 4);
const SUB = 4;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const fx = x + (sx + 0.5) / SUB;
        const fy = y + (sy + 0.5) / SUB;
        let col = null;
        for (const s of shapes) if (inRoundRect(fx, fy, s)) col = s[5];
        if (col) {
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
    }
    const n = SUB * SUB;
    const cov = a / 255;
    const i = (y * S + x) * 4;
    px[i] = cov ? r / cov : 0;
    px[i + 1] = cov ? g / cov : 0;
    px[i + 2] = cov ? b / cov : 0;
    px[i + 3] = a / n;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = fileURLToPath(new URL('./icon.png', import.meta.url));
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
