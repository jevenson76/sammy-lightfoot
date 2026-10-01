import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderIcon, encodePng, buildIco, ICON_SIZES } from '../tools/make-icon.mjs';

const px = (img, x, y) => Array.from(img.rgba.subarray((y * img.size + x) * 4, (y * img.size + x) * 4 + 4));
const ORANGE = [255, 106, 60, 255];
const WHITE = [255, 255, 255, 255];

function count(img, rgba) {
  let n = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i] === rgba[0] && img.rgba[i + 1] === rgba[1] && img.rgba[i + 2] === rgba[2] && img.rgba[i + 3] === rgba[3]) n++;
  }
  return n;
}

test('every icon size is a dark rounded tile with Sammy on it: transparent corners, orange hair, white face', () => {
  for (const size of ICON_SIZES) {
    const img = renderIcon(size);
    assert.equal(img.size, size);
    assert.equal(img.rgba.length, size * size * 4);
    assert.equal(px(img, 0, 0)[3], 0, `${size}: top-left corner is transparent`);
    assert.equal(px(img, size - 1, size - 1)[3], 0, `${size}: bottom-right corner is transparent`);
    assert.equal(px(img, size >> 1, 1)[3], 255, `${size}: the tile itself is opaque`);
    assert.ok(count(img, ORANGE) >= size, `${size}: has orange (hair)`);
    assert.ok(count(img, WHITE) >= size / 2, `${size}: has white (face)`);
  }
});

test('big sizes show the whole figure (blue legs); small ones show just the head so it stays readable', () => {
  const BLUE = [20, 207, 253, 255];
  const legRows = (img) => {
    // rows in the lower third that contain blue next to nothing but tile: his legs
    let n = 0;
    for (let y = Math.floor(img.size * 0.55); y < img.size; y++) {
      for (let x = Math.floor(img.size * 0.3); x < img.size * 0.7; x++) {
        const p = px(img, x, y);
        if (p[0] === BLUE[0] && p[1] === BLUE[1] && p[2] === BLUE[2]) { n++; break; }
      }
    }
    return n;
  };
  assert.ok(legRows(renderIcon(256)) > 20);
  // at 16 px the sprite is drawn at 1x, head only: orange in the top half, no room for a body
  const small = renderIcon(16);
  let orangeTop = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) if (px(small, x, y)[0] === 255 && px(small, x, y)[1] === 106) orangeTop++;
  assert.ok(orangeTop >= 10);
});

test('encodePng writes a valid 8-bit RGBA PNG that decodes back to the same pixels', () => {
  const img = renderIcon(32);
  const png = encodePng(img.size, img.size, img.rgba);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('latin1', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  assert.equal(png[24], 8);  // bit depth
  assert.equal(png[25], 6);  // colour type RGBA
  // walk the chunks, checking each CRC, and gather IDAT
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  let off = 8;
  const idat = [];
  let sawEnd = false;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const body = png.subarray(off + 8, off + 8 + len);
    assert.equal(png.readUInt32BE(off + 8 + len), crc(png.subarray(off + 4, off + 8 + len)), `${type} CRC`);
    if (type === 'IDAT') idat.push(body);
    if (type === 'IEND') sawEnd = true;
    off += 12 + len;
  }
  assert.ok(sawEnd);
  const raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, 32 * (32 * 4 + 1));
  for (let y = 0; y < 32; y++) {
    assert.equal(raw[y * 129], 0, 'filter type none');
    assert.deepEqual(Array.from(raw.subarray(y * 129 + 1, y * 129 + 129)), Array.from(img.rgba.subarray(y * 128, y * 128 + 128)));
  }
});

test('buildIco: classic 32-bit bitmaps for the small sizes, PNG only for 256 (what every Windows icon reader accepts)', () => {
  const ico = buildIco();
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1, 'type 1 = icon');
  assert.equal(ico.readUInt16LE(4), ICON_SIZES.length);
  assert.ok(ICON_SIZES.includes(16) && ICON_SIZES.includes(32) && ICON_SIZES.includes(48) && ICON_SIZES.includes(256));
  ICON_SIZES.forEach((size, i) => {
    const e = 6 + i * 16;
    assert.equal(ico[e], size === 256 ? 0 : size, 'width byte (0 means 256)');
    assert.equal(ico[e + 1], size === 256 ? 0 : size);
    assert.equal(ico.readUInt16LE(e + 4), 1, 'planes');
    assert.equal(ico.readUInt16LE(e + 6), 32, 'bits per pixel');
    const len = ico.readUInt32LE(e + 8);
    const at = ico.readUInt32LE(e + 12);
    assert.ok(at + len <= ico.length);
    if (size === 256) {
      assert.deepEqual(Array.from(ico.subarray(at, at + 4)), [137, 80, 78, 71], 'the 256 entry is a PNG');
      assert.equal(ico.readUInt32BE(at + 16), 256);
      return;
    }
    // BITMAPINFOHEADER, then BGRA rows bottom-up, then a 1-bit transparency mask
    assert.equal(ico.readUInt32LE(at), 40, `entry ${size}: DIB header size`);
    assert.equal(ico.readInt32LE(at + 4), size, `entry ${size}: width`);
    assert.equal(ico.readInt32LE(at + 8), size * 2, `entry ${size}: height is doubled (image + mask)`);
    assert.equal(ico.readUInt16LE(at + 12), 1, 'planes');
    assert.equal(ico.readUInt16LE(at + 14), 32, 'bit count');
    assert.equal(ico.readUInt32LE(at + 16), 0, 'uncompressed');
    const maskRow = Math.ceil(size / 32) * 4;
    assert.equal(len, 40 + size * size * 4 + maskRow * size, `entry ${size}: exact length`);
    const img = renderIcon(size);
    const pixel = (x, y) => { const o = at + 40 + ((size - 1 - y) * size + x) * 4; return [ico[o + 2], ico[o + 1], ico[o], ico[o + 3]]; };
    for (const [x, y] of [[0, 0], [size >> 1, size >> 1], [size >> 1, 2], [size - 1, size - 1], [size >> 2, size >> 1]]) {
      assert.deepEqual(pixel(x, y), px(img, x, y), `entry ${size}: pixel ${x},${y}`);
    }
    // mask bit set exactly where the image is transparent (corner yes, centre no)
    const maskBit = (x, y) => (ico[at + 40 + size * size * 4 + (size - 1 - y) * maskRow + (x >> 3)] >> (7 - (x & 7))) & 1;
    assert.equal(maskBit(0, 0), 1);
    assert.equal(maskBit(size >> 1, size >> 1), 0);
  });
});
