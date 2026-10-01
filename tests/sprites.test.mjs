import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, PALETTE_KEYS } from '../src/render/spritedata.js';
import { PLAYER, PUMPKIN, BALL } from '../src/data/tuning.js';

test('every sprite is a rectangle of known palette characters', () => {
  for (const [name, rows] of Object.entries(SPRITES)) {
    assert.ok(rows.length > 0, `${name} has rows`);
    const w = rows[0].length;
    rows.forEach((row, i) => {
      assert.equal(row.length, w, `${name} row ${i} is ${row.length} wide, expected ${w}`);
      for (const ch of row) assert.ok(ch === '.' || PALETTE_KEYS.includes(ch), `${name} row ${i} uses unknown colour '${ch}'`);
    });
  }
});

test('sprite sizes match the sizes the simulation assumes', () => {
  for (const name of ['sammyStand', 'sammyWalk1', 'sammyWalk2', 'sammyJump', 'sammyHang', 'sammyBald']) {
    assert.equal(SPRITES[name].length, PLAYER.height, `${name} height`);
    assert.equal(SPRITES[name][0].length, 12, `${name} width`);
  }
  assert.equal(SPRITES.pumpkin[0].length, PUMPKIN.w);
  assert.equal(SPRITES.pumpkin.length, PUMPKIN.h);
  assert.equal(SPRITES.ball.length, BALL.radius * 2 + 1);
  assert.equal(SPRITES.ball[0].length, BALL.radius * 2 + 1);
});
