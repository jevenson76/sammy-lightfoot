// Bakes the text sprites into small canvases once, with a mirrored copy and a
// solid-white copy (for the hit flash) of each.

import { SPRITES } from './spritedata.js';
import { COLORS } from './screen.js';

const PAL = {
  o: COLORS.orange, w: COLORS.white, b: COLORS.blue,
  g: COLORS.green, v: COLORS.violet, k: COLORS.black,
};

function bake(rows, solid) {
  const h = rows.length;
  const w = rows[0].length;
  const make = (mirror) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        g.fillStyle = solid || PAL[ch];
        g.fillRect(mirror ? w - 1 - x : x, y, 1, 1);
      }
    }
    return c;
  };
  return { w, h, img: make(false), flip: make(true) };
}

export function bakeSprites() {
  const out = {};
  for (const [name, rows] of Object.entries(SPRITES)) {
    out[name] = bake(rows, null);
    out[name].white = bake(rows, COLORS.white);
  }
  return out;
}

export function drawSprite(ctx, spr, x, y, flip = false) {
  ctx.drawImage(flip ? spr.flip : spr.img, Math.round(x), Math.round(y));
}
