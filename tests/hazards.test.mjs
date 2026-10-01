import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { PLAYER, BALL, BOXBALL, PLUNGER, SIM, difficulty } from '../src/data/tuning.js';
import { IDLE, inp, run, runUntil, near } from './helpers.mjs';

const floor = { id: 'floor', x: 0, y: 150, w: 252 };

// One spawner just above the floor at the left, Sammy standing at x.
function ballScene(x = 200, spawner = {}) {
  return {
    start: { x, y: 150 },
    platforms: [floor],
    spawners: [{ x: 20, y: 150 - BALL.radius - 6, dir: 1, ...spawner }],
    firstBall: 0,
  };
}

test('a spawned ball hangs for BALL.spawnHold before it moves', () => {
  const w = createWorld(ballScene());
  run(w, IDLE, 2);
  assert.equal(w.balls.length, 1);
  assert.equal(w.balls[0].mode, 'hold');
  const x0 = w.balls[0].x;
  run(w, IDLE, Math.floor(BALL.spawnHold / SIM.step) - 4);
  assert.equal(w.balls[0].mode, 'hold');
  assert.equal(w.balls[0].x, x0);
});

test('a ball drops straight down and only moves sideways once it has landed', () => {
  const w = createWorld({
    start: { x: 200, y: 150 },
    platforms: [floor],
    spawners: [{ x: 20, y: 60, dir: 1 }],
    firstBall: 0,
  });
  runUntil(w, IDLE, (x) => x.balls.length > 0 && x.balls[0].mode === 'fall');
  runUntil(w, IDLE, (x) => x.balls[0].mode === 'roll');
  assert.equal(w.balls[0].x, 20, 'still under the spawn point when it lands');
  run(w, IDLE, 30);
  assert.ok(w.balls[0].x > 20);
});

test('a ball rolls along a platform at the level ball speed', () => {
  for (const level of [0, 3]) {
    const w = createWorld(ballScene(), { level });
    runUntil(w, IDLE, (x) => x.balls.length > 0 && x.balls[0].mode === 'roll');
    const x0 = w.balls[0].x;
    run(w, IDLE, 60);
    near(w.balls[0].x - x0, difficulty(level).ballSpeed, 0.5, `ball speed at level ${level}`);
  }
});

test('balls fall off platform ends and are removed when they leave the playfield', () => {
  const w = createWorld({
    start: { x: 20, y: 60 },
    platforms: [{ id: 'safe', x: 0, y: 60, w: 40 }, { id: 'shelf', x: 60, y: 120, w: 80 }],
    spawners: [{ x: 70, y: 100, dir: 1 }],
    firstBall: 0,
  });
  let maxBalls = 0;
  for (let i = 0; i < 60 * 40; i++) {
    stepWorld(w, IDLE);
    maxBalls = Math.max(maxBalls, w.balls.length);
    for (const b of w.balls) assert.ok(b.y < 215 && b.x > -15 && b.x < 267, 'ball left the world without being removed');
  }
  assert.equal(w.status, 'playing');
  assert.ok(maxBalls <= 2, `balls piled up: ${maxBalls}`);
});

test('a rolling ball kills a Sammy who stands in its path', () => {
  const w = createWorld(ballScene());
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.status, 'dead');
  assert.equal(w.deathCause, 'ball');
});

test('a standing jump clears a rolling ball, with at least 6 ticks of timing slack at level 0', () => {
  const base = createWorld(ballScene());
  runUntil(base, IDLE, (x) => x.balls.length > 0 && x.balls[0].mode === 'roll' && x.balls[0].x > 140);
  let best = 0;
  let streak = 0;
  for (let delay = 0; delay < 80; delay++) {
    const w = structuredClone(base);
    run(w, IDLE, delay);
    stepWorld(w, inp({ jump: true }));
    run(w, IDLE, 90);
    if (w.status === 'playing') { streak++; best = Math.max(best, streak); } else streak = 0;
  }
  assert.ok(best >= 6, `only ${best} consecutive ticks of jump timing clear the ball`);
});

test('a bouncing ball arcs high enough for Sammy to walk under', () => {
  // Lowest hurting point of the ball at the top of its bounce vs the top of Sammy's hurtbox.
  const ballUnderside = BALL.bounceHeight + BALL.radius - BALL.hurtRadius;
  assert.ok(ballUnderside > PLAYER.hurtTop + 8, 'bounce apex leaves at least 8 px over his head');
  const w = createWorld(ballScene(200, { kind: 'bounce' }));
  runUntil(w, IDLE, (x) => x.balls.length > 0 && x.balls[0].mode === 'fall' && x.balls[0].x > 60);
  let top = Infinity;
  for (let i = 0; i < 120; i++) { stepWorld(w, IDLE); top = Math.min(top, w.balls[0].y); }
  near(150 - BALL.radius - top, BALL.bounceHeight, 1, 'bounce height');
});

test('the pumpkin patrols the whole of its platform and turns at the ends', () => {
  const w = createWorld({
    start: { x: 20, y: 150 },
    platforms: [floor, { id: 'perch', x: 100, y: 100, w: 48 }],
    pumpkin: { platform: 'perch' },
  });
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 60 * 12; i++) {
    stepWorld(w, IDLE);
    lo = Math.min(lo, w.pumpkin.x);
    hi = Math.max(hi, w.pumpkin.x);
    assert.equal(w.pumpkin.y, 100);
  }
  near(lo, 100 + 7, 1, 'left turn point');
  near(hi, 148 - 7, 1, 'right turn point');
});

test('touching the pumpkin kills', () => {
  const w = createWorld({
    start: { x: 110, y: 100 },
    platforms: [floor, { id: 'perch', x: 100, y: 100, w: 48 }],
    pumpkin: { platform: 'perch' },
  });
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.deathCause, 'pumpkin');
});

// Corridor floor at 127, plunger ceiling at 88 (scene 3 dimensions).
function plungerScene(x) {
  return {
    start: { x, y: 127 },
    platforms: [{ id: 'roof', x: 0, y: 127, w: 252 }],
    plungers: { top: 88, list: [{ x: 60, period: 2, phase: 0 }, { x: 84, period: 2.3, phase: 0.4 }] },
  };
}

test('plungers travel between PLUNGER.minLen and PLUNGER.maxLen', () => {
  const w = createWorld(plungerScene(200));
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 60 * 6; i++) {
    stepWorld(w, IDLE);
    lo = Math.min(lo, w.plungers[0].len);
    hi = Math.max(hi, w.plungers[0].len);
  }
  near(lo, PLUNGER.minLen, 0.01, 'retracted length');
  near(hi, PLUNGER.maxLen, 0.01, 'extended length');
});

test('an extended plunger kills a Sammy standing under it; a retracted one does not reach him', () => {
  assert.ok(88 + PLUNGER.minLen < 127 - PLAYER.height, 'retracted plunger clears even his hair');
  assert.ok(88 + PLUNGER.maxLen > 127 - PLAYER.hurtTop + 5, 'extended plunger is well inside the hurtbox');
  const w = createWorld(plungerScene(61));
  runUntil(w, IDLE, (x) => x.status !== 'playing', 60 * 5);
  assert.equal(w.deathCause, 'plunger');
});

test('standing between two plungers is always safe', () => {
  const w = createWorld(plungerScene(73));
  run(w, IDLE, 60 * 20);
  assert.equal(w.status, 'playing');
});

test('a plunger warns before it comes down', () => {
  const w = createWorld(plungerScene(200));
  let warnTicks = 0;
  let sawWarnBeforeExtend = false;
  for (let i = 0; i < 60 * 3; i++) {
    stepWorld(w, IDLE);
    const pl = w.plungers[0];
    if (pl.warn) { warnTicks++; assert.equal(pl.len, PLUNGER.minLen, 'warning happens while still retracted'); }
    if (pl.len > PLUNGER.minLen && warnTicks > 0) sawWarnBeforeExtend = true;
  }
  assert.ok(sawWarnBeforeExtend);
  assert.ok(warnTicks * SIM.step >= 0.25, 'warning lasts at least a human reaction time');
});

test('dropping into the fire kills', () => {
  const w = createWorld({
    start: { x: 96, y: 40 },
    platforms: [{ id: 'ledge', x: 0, y: 40, w: 100 }, { id: 'far', x: 0, y: 150, w: 252 }],
    fire: { x0: 102, x1: 200, y0: 64, y1: 80 },
  });
  runUntil(w, inp({ right: true }), (x) => x.status !== 'playing');
  assert.equal(w.deathCause, 'fire');
});

test('box balls bounce BOXBALL.bounceHeight high and stay inside the box', () => {
  const w = createWorld({
    start: { x: 10, y: 172 },
    platforms: [{ id: 'floor', x: 0, y: 172, w: 168 }],
    boxBalls: [{ x: 100, dir: 1, speed: 50, phase: 0, floor: 172, x0: 24, x1: 166, height: BOXBALL.bounceHeight }],
  });
  let top = Infinity;
  for (let i = 0; i < 60 * 15; i++) {
    stepWorld(w, IDLE);
    const b = w.boxBalls[0];
    top = Math.min(top, b.y);
    assert.ok(b.x >= 24 && b.x <= 166, `ball escaped the box at x=${b.x}`);
    assert.ok(b.y <= 172 - BOXBALL.radius + 0.001);
  }
  near(172 - BOXBALL.radius - top, BOXBALL.bounceHeight, 0.5, 'box ball bounce height');
  assert.equal(w.status, 'playing', 'Sammy outside the box is never hit');
});

test('a box ball kills on contact', () => {
  const w = createWorld({
    start: { x: 100, y: 172 },
    platforms: [{ id: 'floor', x: 0, y: 172, w: 168 }],
    boxBalls: [{ x: 60, dir: 1, speed: 50, phase: 0, floor: 172, x0: 24, x1: 166, height: 0 }],
  });
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.deathCause, 'ball');
});
