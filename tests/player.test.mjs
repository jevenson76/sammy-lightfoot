import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { PLAYER, SIM } from '../src/data/tuning.js';
import { IDLE, inp, run, runUntil, flat, near } from './helpers.mjs';

const airborne = (w) => w.player.state === 'air';
const grounded = (w) => w.player.state === 'ground';

test('Sammy starts standing on the platform under the start point', () => {
  const w = createWorld(flat());
  assert.equal(w.player.state, 'ground');
  run(w, IDLE, 30);
  assert.equal(w.player.state, 'ground');
  assert.equal(w.player.y, 150);
  assert.equal(w.player.x, 126);
  assert.equal(w.status, 'playing');
});

test('holding a direction walks at PLAYER.walkSpeed', () => {
  const w = createWorld(flat());
  run(w, inp({ right: true }), 60);
  near(w.player.x, 126 + PLAYER.walkSpeed, 0.01, 'x after 1 s right');
  run(w, inp({ left: true }), 120);
  near(w.player.x, 126 - PLAYER.walkSpeed, 0.01, 'x after 2 s left');
});

test('a jump peaks at PLAYER.jumpHeight and lasts PLAYER.jumpTime', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ jump: true }));
  assert.equal(w.player.state, 'air');
  let peak = w.player.y;
  let ticks = 1;
  while (airborne(w)) {
    stepWorld(w, IDLE);
    peak = Math.min(peak, w.player.y);
    ticks++;
  }
  near(150 - peak, PLAYER.jumpHeight, 0.25, 'jump height');
  near(ticks * SIM.step, PLAYER.jumpTime, 2 * SIM.step, 'jump time');
  assert.equal(w.player.y, 150);
});

test('a standing jump is vertical', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ jump: true }));
  runUntil(w, IDLE, grounded);
  assert.equal(w.player.x, 126);
});

test('a running jump covers walkSpeed x jumpTime and cannot be steered in the air', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ right: true, jump: true }));
  // Push the other way for the whole flight: the arc must not change.
  runUntil(w, inp({ left: true }), grounded);
  near(w.player.x - 126, PLAYER.walkSpeed * PLAYER.jumpTime, 2.5, 'jump distance');
});

test('holding the button does not jump again on landing', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ jump: true }));
  runUntil(w, inp({ jump: true }), grounded);
  run(w, inp({ jump: true }), 10);
  assert.equal(w.player.state, 'ground');
});

test('a press just before landing is buffered into a jump', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ jump: true }));
  const flight = Math.round(PLAYER.jumpTime / SIM.step);
  run(w, IDLE, flight - 5);            // still in the air, 4 ticks from landing
  assert.equal(w.player.state, 'air');
  stepWorld(w, inp({ jump: true }));  // early press
  run(w, IDLE, 6);
  assert.equal(w.player.state, 'air', 'second jump should have fired on landing');
  assert.ok(w.player.vy < 0 || w.player.y < 150);
});

test('a press long before landing is not buffered', () => {
  const w = createWorld(flat());
  stepWorld(w, inp({ jump: true }));
  run(w, IDLE, 3);
  stepWorld(w, IDLE);
  stepWorld(w, inp({ jump: true }));  // ~0.4 s before landing: outside the buffer
  runUntil(w, IDLE, grounded);
  run(w, IDLE, 3);
  assert.equal(w.player.state, 'ground');
});

test('walking off a ledge drops straight down', () => {
  const w = createWorld({
    start: { x: 90, y: 100 },
    platforms: [
      { id: 'ledge', x: 0, y: 100, w: 100 },
      { id: 'floor', x: 0, y: 140, w: 252 },
    ],
  });
  runUntil(w, inp({ right: true }), airborne);
  const leftAt = w.player.x;
  runUntil(w, inp({ right: true }), grounded);
  assert.equal(w.player.y, 140);
  near(w.player.x, leftAt, 0.01, 'x while falling');
  assert.equal(w.status, 'playing');
});

test('coyote time: a press just after leaving a ledge still jumps', () => {
  const w = createWorld({
    start: { x: 90, y: 100 },
    platforms: [
      { id: 'ledge', x: 0, y: 100, w: 100 },
      { id: 'floor', x: 0, y: 140, w: 252 },
    ],
  });
  runUntil(w, inp({ right: true }), airborne);
  stepWorld(w, inp({ right: true }));
  stepWorld(w, inp({ right: true, jump: true }));
  assert.ok(w.player.vy < 0, 'should be rising after a coyote jump');
  assert.ok(w.player.vx > 0, 'coyote jump keeps the held direction');
});

test('platforms are one-way: jump up through, land on top', () => {
  const w = createWorld({
    start: { x: 126, y: 150 },
    platforms: [
      { id: 'floor', x: 0, y: 150, w: 252 },
      { id: 'shelf', x: 100, y: 150 - (PLAYER.jumpHeight - 4), w: 60 },
    ],
  });
  stepWorld(w, inp({ jump: true }));
  runUntil(w, IDLE, grounded);
  assert.equal(w.player.y, 150 - (PLAYER.jumpHeight - 4));
});

test('a fall longer than PLAYER.lethalFall kills; a shorter one does not', () => {
  const drop = (h) => {
    const w = createWorld({
      start: { x: 90, y: 60 },
      platforms: [
        { id: 'ledge', x: 0, y: 60, w: 100 },
        { id: 'floor', x: 0, y: 60 + h, w: 252 },
      ],
    });
    runUntil(w, inp({ right: true }), (x) => x.status !== 'playing' || (grounded(x) && x.player.y > 60));
    return w;
  };
  const safe = drop(PLAYER.lethalFall - 2);
  assert.equal(safe.status, 'playing');
  const fatal = drop(PLAYER.lethalFall + 2);
  assert.equal(fatal.status, 'dead');
  assert.equal(fatal.deathCause, 'fall');
});

test('fall distance is measured from the apex of a jump, not the takeoff', () => {
  // Ledge is lethalFall - 10 above the floor: stepping off is safe, jumping off is not.
  const h = PLAYER.lethalFall - 10;
  const w = createWorld({
    start: { x: 96, y: 60 },
    platforms: [
      { id: 'ledge', x: 0, y: 60, w: 100 },
      { id: 'floor', x: 0, y: 60 + h, w: 252 },
    ],
  });
  stepWorld(w, inp({ right: true, jump: true }));
  runUntil(w, IDLE, (x) => x.status !== 'playing' || grounded(x));
  assert.equal(w.status, 'dead');
});

test('falling out of the bottom of the scene kills', () => {
  const w = createWorld({
    start: { x: 96, y: 150 },
    platforms: [{ id: 'ledge', x: 0, y: 150, w: 100 }],
  });
  runUntil(w, inp({ right: true }), (x) => x.status !== 'playing');
  assert.equal(w.status, 'dead');
  assert.equal(w.deathCause, 'pit');
});

test('the playfield walls stop Sammy', () => {
  const w = createWorld(flat());
  run(w, inp({ left: true }), 400);
  assert.equal(w.player.x, SIM.left);
  run(w, inp({ right: true }), 600);
  assert.equal(w.player.x, SIM.right);
});

test('the same inputs give the same world, tick for tick', () => {
  const script = (i) => inp({ right: i % 90 < 50, left: i % 90 >= 70, jump: i % 37 < 4 });
  const a = createWorld(flat(), { seed: 5 });
  const b = createWorld(flat(), { seed: 5 });
  for (let i = 0; i < 600; i++) {
    stepWorld(a, script(i));
    stepWorld(b, script(i));
  }
  assert.deepEqual(a, b);
});

test('a tapped jump+direction on the very edge of a ledge jumps that way; it does not walk off first', () => {
  const w = createWorld({
    start: { x: 100 + PLAYER.footTol, y: 100 },
    platforms: [
      { id: 'ledge', x: 0, y: 100, w: 100 },
      { id: 'floor', x: 0, y: 140, w: 252 },
    ],
  });
  stepWorld(w, inp({ right: true, jump: true }));
  stepWorld(w, IDLE); // a one-tick tap
  assert.ok(w.player.vy < 0, 'rising');
  assert.equal(w.player.vx, PLAYER.walkSpeed, 'jumping the way he was pointed when he pressed');
});
