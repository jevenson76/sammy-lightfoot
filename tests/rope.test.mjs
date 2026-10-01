import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { ROPE, SIM } from '../src/data/tuning.js';
import { IDLE, inp, run, runUntil, near } from './helpers.mjs';

// Floor at 150; a rope hangs from (126, 100), 30 px long, so its end is
// level with a standing Sammy's head and well inside a jump.
function scene(rope = {}) {
  return {
    start: { x: 128, y: 150 },
    platforms: [{ id: 'floor', x: 0, y: 150, w: 252 }],
    ropes: [{ id: 'rope', x: 126, y: 100, len: 30, amp: 0.8, period: 2, phase: 0, active: true, ...rope }],
  };
}
const HOLD = inp({ jump: true });
const onRope = (w) => w.player.state === 'rope';

test('an active rope swings as amp * sin(2 pi t / period)', () => {
  const w = createWorld(scene());
  run(w, IDLE, 30); // 0.5 s = a quarter period: full amplitude
  near(w.ropes[0].theta, 0.8, 0.01, 'theta at quarter period');
  run(w, IDLE, 30);
  near(w.ropes[0].theta, 0, 0.01, 'theta at half period');
  assert.ok(w.ropes[0].omega < 0, 'swinging back left');
});

test('an inactive rope hangs still until activated', () => {
  const w = createWorld(scene({ active: false }));
  run(w, IDLE, 45);
  assert.equal(w.ropes[0].theta, 0);
  assert.equal(w.ropes[0].omega, 0);
});

test('jumping into a rope with the button held grabs it', () => {
  const w = createWorld(scene({ active: false }));
  stepWorld(w, HOLD);
  runUntil(w, HOLD, onRope, 40);
  assert.equal(w.player.rope, 0);
});

test('jumping through a rope without holding the button does not grab it', () => {
  const w = createWorld(scene({ active: false }));
  stepWorld(w, HOLD);
  runUntil(w, IDLE, (x) => x.player.state === 'ground', 60);
  assert.equal(w.player.state, 'ground');
});

test('a hanging Sammy follows the grip point', () => {
  const w = createWorld(scene());
  stepWorld(w, HOLD);
  runUntil(w, HOLD, onRope, 40);
  run(w, HOLD, 25);
  const r = w.ropes[0];
  const grip = r.len - ROPE.gripInset;
  near(w.player.x, r.x + grip * Math.sin(r.theta), 0.01, 'x on rope');
  near(w.player.y, r.y + grip * Math.cos(r.theta) + ROPE.hang, 0.01, 'y on rope');
});

test('releasing throws Sammy the way the rope is swinging', () => {
  const right = createWorld(scene());
  stepWorld(right, HOLD);
  runUntil(right, HOLD, onRope, 40);
  runUntil(right, HOLD, (x) => x.ropes[0].omega > 0.5 && x.ropes[0].theta > 0.1, 300);
  stepWorld(right, IDLE);
  assert.equal(right.player.state, 'air');
  assert.ok(right.player.vx >= ROPE.releaseVx, `vx ${right.player.vx} should be thrown right`);
  assert.ok(right.player.vy < 0, 'release hops upward');

  const left = createWorld(scene());
  stepWorld(left, HOLD);
  runUntil(left, HOLD, onRope, 40);
  runUntil(left, HOLD, (x) => x.ropes[0].omega < -0.5 && x.ropes[0].theta < -0.1, 300);
  stepWorld(left, IDLE);
  assert.ok(left.player.vx <= -ROPE.releaseVx, `vx ${left.player.vx} should be thrown left`);
});

test('the rope just released cannot be caught again straight away', () => {
  const w = createWorld(scene());
  stepWorld(w, HOLD);
  runUntil(w, HOLD, onRope, 40);
  run(w, HOLD, 5);
  stepWorld(w, IDLE);                 // let go
  assert.equal(w.player.state, 'air');
  run(w, HOLD, 3);                    // press again at once, still touching the rope
  assert.equal(w.player.state, 'air');
  assert.ok(3 * SIM.step < ROPE.regrab);
});

test('hanging on a rope is not a fall: dropping off low is survivable', () => {
  const w = createWorld(scene({ active: false }));
  stepWorld(w, HOLD);
  runUntil(w, HOLD, onRope, 40);
  run(w, HOLD, 120);
  stepWorld(w, IDLE);
  runUntil(w, IDLE, (x) => x.player.state === 'ground' || x.status !== 'playing');
  assert.equal(w.status, 'playing');
});

test('letting go of a rope that is not moving is a plain drop, with no hop', () => {
  const w = createWorld(scene({ active: false }));
  stepWorld(w, HOLD);
  runUntil(w, HOLD, onRope, 40);
  run(w, HOLD, 20);
  const y = w.player.y;
  stepWorld(w, IDLE);
  assert.equal(w.player.state, 'air');
  assert.equal(w.player.vx, 0);
  assert.equal(w.player.vy, 0);
  run(w, IDLE, 3);
  assert.ok(w.player.y > y, 'falling, never rising');
});
