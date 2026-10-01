// Draws the app icon from Sammy's own sprite and writes it as a Windows .ico
// plus preview PNGs. No dependencies.
//
//   node tools/make-icon.mjs        writes dist/sammy-lightfoot.ico and dist/icon-256.png

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { SPRITES } from '../src/render/spritedata.js';

export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

const RGB = {
  o: [255, 106, 60], w: [255, 255, 255], b: [20, 207, 253],
  g: [20, 245, 60], v: [255, 68, 253], k: [0, 0, 0],
};
const TILE = [0, 0, 0];

// One icon image: a black rounded tile with Sammy at the largest whole-number
// pixel scale that fits. 96 px and up: the whole figure on a girder inside a
// blue frame. 40-95 px: the whole figure, no frame. Smaller: just his head.
export function renderIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  const fill = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };

  // rounded tile
  const r = Math.max(2, Math.round(size * 0.16));
  const inTile = (x, y) => {
    const cx = x < r ? r : x >= size - r ? size - r - 1 : x;
    const cy = y < r ? r : y >= size - r ? size - r - 1 : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (inTile(x, y)) set(x, y, TILE);

  const framed = size >= 96;   // room for the frame and girder
  const full = size >= 40;     // room for the whole figure at 2x or more
  const rows = full ? SPRITES.sammyStand : SPRITES.sammyStand.slice(0, 10);
  const sw = rows[0].length;
  const sh = rows.length;
  const k = framed ? Math.floor((size * 0.74) / sh) : full ? Math.floor((size - 4) / sh) : Math.max(1, Math.floor(size / sw));
  const x0 = Math.round((size - sw * k) / 2);
  const line = Math.max(1, Math.round(size / 48));

  let y0;
  if (framed) {
    // frame, then a girder for him to stand on
    const m = Math.round(size * 0.07);
    for (let y = m; y < size - m; y++) {
      for (let x = m; x < size - m; x++) {
        const edge = x < m + line || x >= size - m - line || y < m + line || y >= size - m - line;
        if (edge && inTile(x, y)) set(x, y, RGB.b);
      }
    }
    const floorY = size - m - line - Math.round(size * 0.07);
    y0 = floorY - sh * k;
    fill(m + line * 2, floorY, size - 2 * (m + line * 2), line, RGB.o);
  } else {
    y0 = Math.round((size - sh * k) / 2);
  }

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === 'k') continue;
      fill(x0 + x * k, y0 + y * k, k, k, RGB[ch]);
    }
  }
  return { size, rgba };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A classic icon image: BITMAPINFOHEADER, 32-bit BGRA rows bottom-up, then a
// 1-bit transparency mask. Older Windows icon code reads only this for sizes
// under 256 (System.Drawing fails on small PNG entries).
export function encodeDib(size, rgba) {
  const maskRow = Math.ceil(size / 32) * 4;
  const out = Buffer.alloc(40 + size * size * 4 + maskRow * size);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(size, 4);
  out.writeInt32LE(size * 2, 8);   // image + mask
  out.writeUInt16LE(1, 12);
  out.writeUInt16LE(32, 14);
  out.writeUInt32LE(0, 16);        // BI_RGB
  out.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const maskAt = 40 + size * size * 4;
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y;      // bottom-up
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = 40 + (row * size + x) * 4;
      out[o] = rgba[i + 2];
      out[o + 1] = rgba[i + 1];
      out[o + 2] = rgba[i];
      out[o + 3] = rgba[i + 3];
      if (rgba[i + 3] === 0) out[maskAt + row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

// Small sizes as bitmaps, 256 as PNG: the layout every Windows reader accepts.
export function buildIco(sizes = ICON_SIZES) {
  const pngs = sizes.map((s) => { const img = renderIcon(s); return s >= 256 ? encodePng(s, s, img.rgba) : encodeDib(s, img.rgba); });
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header[e] = s === 256 ? 0 : s;
    header[e + 1] = s === 256 ? 0 : s;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([header, ...pngs]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'sammy-lightfoot.ico'), buildIco());
  const big = renderIcon(256);
  writeFileSync(join(dist, 'icon-256.png'), encodePng(256, 256, big.rgba));
  // a contact sheet of the small sizes, for eyeballing
  for (const s of [16, 32, 48, 64]) { const img = renderIcon(s); writeFileSync(join(dist, `icon-${s}.png`), encodePng(s, s, img.rgba)); }
  console.log(`wrote ${join(dist, 'sammy-lightfoot.ico')} (${ICON_SIZES.join(', ')} px)`);
}
