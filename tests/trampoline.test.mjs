import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { PLAYER, TRAMPOLINE, GRAVITY } from '../src/data/tuning.js';
import { IDLE, inp, run, runUntil, near, sawEvent } from './helpers.mjs';

const MAT = 150 - TRAMPOLINE.height;
const heightOf = (v) => (v * v) / (2 * GRAVITY);

// Floor at 150 with a trampoline at x 100-120; Sammy starts beside it.
function scene(extra = {}) {
  return {
    start: { x: 84, y: 150 },
    platforms: [{ id: 'floor', x: 0, y: 150, w: 252 }, ...(extra.platforms || [])],
    trampolines: [{ id: 'tramp', x: 100, y: 150, w: 20 }],
    ...(extra.start ? { start: extra.start } : {}),
  };
}

// Jumps onto the mat, then holds `hold` and records the apex of each bounce.
function bounceApexes(w, hold, bounces) {
  stepWorld(w, inp({ right: true, jump: true }));
  const apexes = [];
  let peak = Infinity;
  let count = 0;
  for (let i = 0; i < 2000 && count <= bounces; i++) {
    stepWorld(w, hold);
    peak = Math.min(peak, w.player.y);
    if (sawEvent(w, 'bounce')) {
      if (count > 0) apexes.push(MAT - peak);
      peak = Infinity;
      count++;
    }
    if (w.player.state === 'ground') break;
  }
  return apexes;
}

test('the mat sits TRAMPOLINE.height above its floor', () => {
  const w = createWorld(scene());
  const mat = w.platforms.find((p) => p.id === 'tramp');
  assert.equal(mat.y, MAT);
  assert.equal(mat.bouncy, true);
});

test('without the button, bounces die away and Sammy ends up standing on the mat', () => {
  const w = createWorld(scene());
  stepWorld(w, inp({ right: true, jump: true }));
  runUntil(w, IDLE, (x) => x.player.state === 'ground');
  assert.equal(w.player.y, MAT);
  assert.equal(w.platforms[w.player.support].id, 'tramp');
});

test('holding the button makes each bounce higher, up to the chain cap', () => {
  const w = createWorld(scene());
  const apexes = bounceApexes(w, inp({ jump: true }), 8);
  const vIn = Math.sqrt(2 * GRAVITY * (PLAYER.jumpHeight - TRAMPOLINE.height));
  near(apexes[0], heightOf(vIn * TRAMPOLINE.boost), 1, 'first held bounce');
  assert.ok(apexes[1] > apexes[0] + 3, 'second bounce is higher');
  const cap = heightOf(TRAMPOLINE.chainMax);
  near(apexes[apexes.length - 1], cap, 1, 'chain tops out at chainMax');
  for (const a of apexes) assert.ok(a <= cap + 1, `apex ${a} exceeds the chain cap ${cap}`);
});

test('a drop from above launches higher than any chain, capped at launchMax', () => {
  // A ledge 70 px above the mat; Sammy steps off its end straight onto the trampoline.
  const w = createWorld({
    start: { x: 96, y: MAT - 70 },
    platforms: [
      { id: 'floor', x: 0, y: 150, w: 252 },
      { id: 'ledge', x: 0, y: MAT - 70, w: 100 },
    ],
    trampolines: [{ id: 'tramp', x: 100, y: 150, w: 20 }],
  });
  runUntil(w, inp({ right: true }), (x) => x.player.state === 'air');
  w.events = [];
  runUntil(w, inp({ jump: true }), (x) => x.events.includes('bounce'));
  let peak = Infinity;
  run(w, inp({ jump: true }), 1);
  while (w.player.vy < 0) { peak = Math.min(peak, w.player.y); stepWorld(w, inp({ jump: true })); }
  peak = Math.min(peak, w.player.y);
  const vIn = Math.sqrt(2 * GRAVITY * 70);
  const expected = heightOf(Math.min(vIn * TRAMPOLINE.dropBoost, TRAMPOLINE.launchMax));
  near(MAT - peak, expected, 1.5, 'launch height');
  assert.ok(MAT - peak > heightOf(TRAMPOLINE.chainMax) + 10);
});

test('landing on a trampoline never kills, whatever the drop', () => {
  const w = createWorld({
    start: { x: 96, y: 20 },
    platforms: [
      { id: 'floor', x: 0, y: 150, w: 252 },
      { id: 'ledge', x: 0, y: 20, w: 100 },
    ],
    trampolines: [{ id: 'tramp', x: 100, y: 150, w: 20 }],
  });
  assert.ok(MAT - 20 > PLAYER.lethalFall * 2);
  runUntil(w, inp({ right: true }), (x) => x.player.state === 'air');
  runUntil(w, IDLE, (x) => x.player.state === 'ground' || x.status !== 'playing');
  assert.equal(w.status, 'playing');
  assert.equal(w.player.y, MAT);
});

test('the direction held at the moment of the bounce sets the next arc', () => {
  const w = createWorld(scene());
  stepWorld(w, inp({ right: true, jump: true }));
  runUntil(w, inp({ jump: true, left: true }), (x) => x.events.includes('bounce'));
  assert.equal(w.player.vx, -PLAYER.walkSpeed);
  const w2 = createWorld(scene());
  stepWorld(w2, inp({ right: true, jump: true }));
  runUntil(w2, inp({ jump: true }), (x) => x.events.includes('bounce'));
  assert.equal(w2.player.vx, 0);
});
