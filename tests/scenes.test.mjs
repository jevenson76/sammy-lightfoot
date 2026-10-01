import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneWorld, stepWorld } from '../src/sim/world.js';
import { buildScene, buildCarpetPath, SCENE_COUNT, STOPS } from '../src/data/scenes.js';
import { PLAYER, CARPET, BLOCK, difficulty, VANISH_ORDER, CARPET_PATHS } from '../src/data/tuning.js';
import { IDLE, inp, run, runUntil, near } from './helpers.mjs';

const plat = (w, id) => w.platforms.find((p) => p.id === id);
const platIndex = (w, id) => w.platforms.findIndex((p) => p.id === id);
const HOLD = inp({ jump: true });

// Test-only teleport: stand Sammy on a platform.
function place(w, id, x) {
  const i = platIndex(w, id);
  const p = w.player;
  p.x = x ?? w.platforms[i].x + w.platforms[i].w / 2;
  p.y = w.platforms[i].y;
  p.state = 'ground';
  p.support = i;
  p.vx = 0; p.vy = 0;
  p.jumpBuf = 0;
  p.apexY = p.y;
}
const press = (w) => { stepWorld(w, HOLD); stepWorld(w, IDLE); };

test('there are three scenes', () => {
  assert.equal(SCENE_COUNT, 3);
  for (let s = 0; s < 3; s++) {
    const w = createSceneWorld(s, 0, 1);
    assert.equal(w.player.state, 'ground', `scene ${s + 1} starts on solid ground`);
    assert.ok(w.platforms.some((p) => p.goal) || s === 1, 'has a goal platform');
  }
});

// ---------- Scene 1 ----------

test('scene 1: the first trampoline takes exactly three held bounces to reach the pole platform', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = []; // no balls: this test is about geometry
  stepWorld(w, inp({ right: true, jump: true }));
  let bounces = 0;
  for (let i = 0; i < 600 && w.player.state !== 'ground'; i++) {
    stepWorld(w, HOLD);
    if (w.events.includes('bounce')) bounces++;
    w.events = [];
  }
  assert.equal(w.platforms[w.player.support].id, 'pole');
  assert.equal(bounces, 3);
});

test('scene 1: pumping the second trampoline from the floor cannot reach the centre tower', () => {
  for (const dir of [{}, { left: true }]) {
    const w = createSceneWorld(0, 0, 1);
    w.spawners = [];
    place(w, 'tramp2');
    stepWorld(w, HOLD);
    stepWorld(w, IDLE);
    for (let i = 0; i < 60 * 15 && w.status === 'playing'; i++) {
      stepWorld(w, inp({ jump: true, ...dir }));
      if (w.player.state === 'ground') {
        const id = w.platforms[w.player.support].id;
        assert.ok(id === 'tramp2' || id === 'floor', `reached ${id} by pumping from the floor`);
      }
    }
  }
});

test('scene 1: drifting off a floor trampoline at full pump is a survivable fall', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  place(w, 'tramp2');
  stepWorld(w, HOLD);
  stepWorld(w, IDLE);
  run(w, HOLD, 60 * 8); // pump straight up until the chain tops out
  runUntil(w, inp({ jump: true, left: true }), (x) => x.status !== 'playing' || (x.player.state === 'ground' && x.platforms[x.player.support].id !== 'tramp2'));
  assert.equal(w.status, 'playing');
  assert.equal(w.platforms[w.player.support].id, 'floor');
});

test('scene 1: a running jump from the chevron lands on the second trampoline and is thrown onto the centre tower', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  const pole = plat(w, 'pole');
  place(w, 'pole', pole.chevronX);
  stepWorld(w, inp({ left: true, jump: true }));
  runUntil(w, inp({ left: true, jump: true }), (x) => x.player.state === 'ground' || x.status !== 'playing');
  assert.equal(w.status, 'playing');
  assert.equal(w.platforms[w.player.support].id, 'towerC');
});

test('scene 1: walking off the pole platform, or jumping from its very edge, misses the trampoline', () => {
  const walk = createSceneWorld(0, 0, 1);
  walk.spawners = [];
  place(walk, 'pole', plat(walk, 'pole').x + 4);
  runUntil(walk, inp({ left: true }), (x) => x.player.state === 'ground' && x.player.y > 140);
  assert.equal(walk.platforms[walk.player.support].id, 'floor');

  const edge = createSceneWorld(0, 0, 1);
  edge.spawners = [];
  place(edge, 'pole', plat(edge, 'pole').x);
  stepWorld(edge, inp({ left: true, jump: true }));
  runUntil(edge, inp({ left: true }), (x) => x.player.state === 'ground' || x.status !== 'playing');
  assert.ok(edge.status === 'dead' || edge.platforms[edge.player.support].id === 'floor');
});

test('scene 1: the tower trampoline reaches the upper-left girder', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  place(w, 'tramp3');
  stepWorld(w, HOLD);
  stepWorld(w, IDLE);
  runUntil(w, HOLD, (x) => x.player.state === 'ground' && x.platforms[x.player.support].id === 'upperL', 600);
});

test('scene 1: the gap in the upper girder can be jumped', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  place(w, 'upperL', 60);
  runUntil(w, inp({ right: true }), (x) => x.player.x >= 80);
  stepWorld(w, inp({ right: true, jump: true }));
  runUntil(w, inp({ right: true }), (x) => x.player.state === 'ground');
  assert.equal(w.platforms[w.player.support].id, 'upperR');
});

test('scene 1: the upper rope hangs still until Sammy steps on the white pad', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  const rope = w.ropes.find((r) => r.id === 'ropeHigh');
  place(w, 'upperR', 190);
  run(w, IDLE, 30);
  assert.equal(rope.active, false);
  runUntil(w, inp({ right: true }), (x) => x.player.x >= plat(x, 'upperR').padX + 2);
  assert.equal(rope.active, true);
  run(w, IDLE, 20);
  assert.notEqual(rope.theta, 0);
});

test('scene 1: landing on the pumpkin platform clears the scene', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  const goal = plat(w, 'goal');
  const p = w.player;
  p.state = 'air'; p.support = -1; p.x = goal.x + 4; p.y = goal.y - 10; p.vx = 0; p.vy = 0; p.apexY = p.y;
  w.pumpkin.x = goal.x + goal.w - 8;
  w.pumpkin.dir = 1;
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.status, 'clear');
});

test('scene 1: balls come from the left only at level 0 and from both sides from level 1', () => {
  assert.equal(buildScene(0, 0).spawners.length, 1);
  assert.equal(buildScene(0, 0).spawners[0].dir, 1);
  assert.equal(buildScene(0, 1).spawners.length, 2);
});

test('scene 1: balls from the right land on the upper girder, not on the pumpkin\'s perch', () => {
  const w = createSceneWorld(0, 1, 1);
  w.spawners = [w.spawners[1]];
  w.ballTimer = 0;
  runUntil(w, IDLE, (x) => x.balls.length > 0 && x.balls[0].mode === 'roll');
  assert.equal(w.platforms[w.balls[0].plat].id, 'upperR');
  assert.ok(w.balls[0].x > plat(w, 'upperR').padX + 20, 'lands right of the pad, so the pad is in its path');
});

test('scene 1: the pumpkin cannot hurt a Sammy who jumps underneath its perch', () => {
  const w = createSceneWorld(0, 0, 1);
  w.spawners = [];
  place(w, 'upperR', 214);
  for (let i = 0; i < 60 * 12 && w.status === 'playing'; i++) {
    stepWorld(w, inp({ jump: i % 40 < 3 }));
  }
  assert.equal(w.status, 'playing');
});

// ---------- Scene 2 ----------

test('scene 2: platforms vanish in the documented order for each level', () => {
  for (const level of [0, 1, 2, 3]) {
    const w = createSceneWorld(1, level, 1);
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const seen = [];
    const was = ids.map(() => true);
    for (let i = 0; i < 60 * 40 && seen.length < 4; i++) {
      stepWorld(w, IDLE);
      ids.forEach((id, k) => {
        const on = plat(w, id).active;
        if (was[k] && !on) seen.push(k + 1);
        was[k] = on;
      });
    }
    assert.deepEqual(seen, VANISH_ORDER[level], `level ${level}`);
  }
});

test('scene 2: a platform blinks for the warning time before it vanishes, then comes back', () => {
  const w = createSceneWorld(1, 0, 1);
  const d = difficulty(0);
  const first = plat(w, `p${d.vanishOrder[0]}`);
  const blinkStart = runUntil(w, IDLE, () => first.blink);
  const gone = runUntil(w, IDLE, () => !first.active);
  near(gone * (1 / 60), d.vanishWarn, 0.05, 'warning time');
  assert.ok(blinkStart > 30, 'Sammy gets time before the first warning');
  runUntil(w, IDLE, () => first.active);
});

test('scene 2: Sammy falls when the platform under him vanishes', () => {
  const w = createSceneWorld(1, 0, 1);
  for (const pl of w.platforms) if (pl.kind === 'block') pl.active = false;
  place(w, `p${difficulty(0).vanishOrder[0]}`);
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.deathCause, 'pit');
});

test('scene 2: the button on the left elevator raises both elevators to mid height instead of jumping', () => {
  const w = createSceneWorld(1, 0, 1);
  place(w, 'elevL');
  press(w);
  assert.equal(w.player.state, 'ground', 'the press starts the elevator, it does not jump');
  runUntil(w, IDLE, (x) => plat(x, 'elevL').y === STOPS.mid);
  assert.equal(plat(w, 'elevR').y, STOPS.mid);
  assert.equal(w.player.y, STOPS.mid);
  assert.equal(w.player.state, 'ground');
});

test('scene 2: the button on the right elevator does nothing special at the bottom (it jumps)', () => {
  const w = createSceneWorld(1, 0, 1);
  stepWorld(w, HOLD);
  assert.equal(w.player.state, 'air');
});

test('scene 2: blocks move between BLOCK.top and BLOCK.bottom and carry a Sammy standing on them', () => {
  const w = createSceneWorld(1, 0, 1);
  place(w, 'b3');
  const b = plat(w, 'b3');
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 60 * 10; i++) {
    stepWorld(w, IDLE);
    lo = Math.min(lo, b.y);
    hi = Math.max(hi, b.y);
    assert.equal(w.player.y, b.y);
  }
  assert.equal(w.status, 'playing');
  near(lo, BLOCK.top, 1, 'block top');
  near(hi, BLOCK.bottom, 1, 'block bottom');
});

test('scene 2: a block coming down on Sammy kills him', () => {
  const w = createSceneWorld(1, 0, 1);
  w.vanish.timer = 999;
  const b = plat(w, 'b1');
  place(w, 'p1', b.x + b.w / 2);
  runUntil(w, IDLE, (x) => x.status !== 'playing', 60 * 12);
  assert.equal(w.deathCause, 'block');
});

test('scene 2: standing between the block columns on the bottom row is safe from blocks', () => {
  const w = createSceneWorld(1, 0, 1);
  w.vanish.timer = 999;
  place(w, 'p1', 63); // between block 1 (42-56) and block 2 (70-84)
  run(w, IDLE, 60 * 15);
  assert.equal(w.status, 'playing');
});

function toMid(w) {
  place(w, 'elevL');
  press(w);
  runUntil(w, IDLE, (x) => plat(x, 'elevL').y === STOPS.mid);
}
function toTop(w) {
  toMid(w);
  place(w, 'elevR');
  press(w);
  runUntil(w, IDLE, (x) => plat(x, 'elevR').y === STOPS.top);
}

test('scene 2: at mid height the right elevator button raises both to the top, shows the carpet and removes the blocks', () => {
  const w = createSceneWorld(1, 0, 1);
  toMid(w);
  assert.equal(plat(w, 'carpet').active, false);
  place(w, 'elevR');
  press(w);
  assert.equal(w.player.state, 'ground');
  runUntil(w, IDLE, (x) => plat(x, 'elevR').y === STOPS.top);
  assert.equal(plat(w, 'elevL').y, STOPS.top);
  assert.equal(plat(w, 'carpet').active, true);
  assert.ok(w.platforms.filter((p) => p.kind === 'block').every((p) => !p.active));
  assert.equal(w.player.y, STOPS.top);
});

test('scene 2: Sammy can walk from the right elevator onto the waiting carpet', () => {
  const w = createSceneWorld(1, 0, 1);
  toTop(w);
  runUntil(w, inp({ left: true }), (x) => x.player.state !== 'ground' || x.platforms[x.player.support].id === 'carpet');
  assert.equal(w.platforms[w.player.support].id, 'carpet');
});

test('scene 2: the button starts the carpet; it carries Sammy down but not sideways', () => {
  const w = createSceneWorld(1, 0, 1);
  toTop(w);
  place(w, 'carpet');
  const c = plat(w, 'carpet');
  const x0 = w.player.x;
  press(w);
  assert.equal(w.player.state, 'ground');
  runUntil(w, IDLE, () => c.y > STOPS.top + 20);
  assert.equal(w.player.y, c.y, 'rides the carpet down');
  assert.equal(w.player.x, x0);
  // Now the horizontal leg: standing still, the carpet leaves from under him.
  runUntil(w, IDLE, (x) => x.status !== 'playing');
  assert.equal(w.status, 'dead');
});

test('scene 2: walking with the carpet reaches the top-left elevator and clears the scene', () => {
  const w = createSceneWorld(1, 0, 1);
  toTop(w);
  place(w, 'carpet');
  const c = plat(w, 'carpet');
  press(w);
  for (let i = 0; i < 60 * 40 && w.status === 'playing'; i++) {
    const mid = c.x + c.w / 2;
    const done = w.carpet.state === 'done';
    stepWorld(w, inp({ left: done || w.player.x > mid + 2, right: !done && w.player.x < mid - 2 }));
  }
  assert.equal(w.status, 'clear');
});

test('carpet paths: level 0 is down half the screen, left, up; every level stays in bounds and ends at the top-left', () => {
  const p0 = buildCarpetPath(CARPET_PATHS[0]);
  assert.equal(p0.length, 4);
  assert.deepEqual(
    p0.map((q) => [q.x - p0[0].x, q.y - p0[0].y]),
    [[0, 0], [0, 2 * CARPET.cellY], [-4 * CARPET.cellX, 2 * CARPET.cellY], [-4 * CARPET.cellX, 0]],
  );
  for (let level = 0; level < CARPET_PATHS.length; level++) {
    const path = buildCarpetPath(CARPET_PATHS[level]);
    const end = path[path.length - 1];
    assert.equal(end.x, p0[3].x, `level ${level} ends at the left elevator`);
    assert.equal(end.y, STOPS.top, `level ${level} ends at the top`);
    assert.ok(path.length >= 4);
    for (const q of path) {
      assert.ok(q.x >= end.x && q.x <= p0[0].x, `level ${level} x in bounds`);
      assert.ok(q.y >= STOPS.top && q.y <= STOPS.top + 4 * CARPET.cellY, `level ${level} y in bounds`);
    }
    for (let i = 1; i < path.length; i++) {
      const moved = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
      assert.ok(moved > 0, `level ${level} has no zero-length legs`);
      assert.ok(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y, 'legs are axis-aligned');
    }
  }
});

test('scene 2: the carpet is always slower than Sammy walks', () => {
  for (let level = 0; level <= 14; level++) {
    assert.ok(difficulty(level).carpetSpeed < PLAYER.walkSpeed);
  }
});

// ---------- Scene 3 ----------

test('scene 3: right elevator to mid, left elevator to top', () => {
  const w = createSceneWorld(2, 0, 1);
  w.boxBalls = [];
  w.plungers = [];
  place(w, 'elevR');
  press(w);
  assert.equal(w.player.state, 'ground');
  runUntil(w, IDLE, (x) => plat(x, 'elevR').y === plat(x, 'roof').y);
  assert.equal(w.player.y, plat(w, 'roof').y);
  place(w, 'elevL');
  press(w);
  assert.equal(w.player.state, 'ground');
  const top = runUntil(w, IDLE, (x) => plat(x, 'elevL').prevY === plat(x, 'elevL').y && plat(x, 'elevL').y < 100);
  assert.ok(top > 0);
  assert.equal(w.player.y, plat(w, 'elevL').y);
  assert.ok(plat(w, 'elevL').y < w.fire.y0, 'the top stop is above the fire');
});

test('scene 3: Sammy can walk from the corridor onto the left elevator', () => {
  const w = createSceneWorld(2, 0, 1);
  w.plungers = [];
  place(w, 'roof', 40);
  runUntil(w, inp({ left: true }), (x) => x.player.x <= 12);
  assert.equal(w.platforms[w.player.support].id, 'elevL');
});

test('scene 3: a jump in the corridor keeps its full height (hair may overlap the ceiling, as in the original)', () => {
  // Capping this jump at the ceiling left only a 0.13 s window over the corridor ball
  // and made a Sammy caught between two extended plungers undodgeable.
  const w = createSceneWorld(2, 0, 1);
  w.boxBalls = [];
  w.plungers = [];
  place(w, 'roof', 100);
  stepWorld(w, HOLD);
  let top = Infinity;
  for (let i = 0; i < 60 && (i < 2 || w.player.state === 'air'); i++) { stepWorld(w, IDLE); top = Math.min(top, w.player.y); }
  near(plat(w, 'roof').y - top, PLAYER.jumpHeight, 0.25, 'corridor jump height');
  assert.equal(w.status, 'playing', 'the fire above is not reached from below');
});

test('scene 3: hazard counts follow the level', () => {
  for (const level of [0, 1, 2, 5]) {
    const d = difficulty(level);
    const w = createSceneWorld(2, level, 1);
    assert.equal(w.plungers.length, d.plungerCount, `plungers at level ${level}`);
    const inBox = w.boxBalls.filter((b) => b.floor === 172).length;
    assert.equal(inBox, d.boxBalls, `box balls at level ${level}`);
    assert.equal(w.boxBalls.length - inBox, d.corridorBall ? 1 : 0, `corridor ball at level ${level}`);
  }
  assert.equal(difficulty(0).boxBalls, 1);
  assert.equal(difficulty(1).boxBalls, 3);
});

test('scene 3: plungers are spaced so Sammy can stand between any two', () => {
  const w = createSceneWorld(2, 11, 1);
  const xs = w.plungers.map((p) => p.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - (xs[i - 1] + 3);
    assert.ok(gap >= 2 * PLAYER.hurtHalfW + 2, `gap of ${gap} px between plungers at ${xs[i - 1]} and ${xs[i]}`);
  }
});

test('scene 3: Sammy is safe at the start point', () => {
  for (const level of [0, 1, 4, 9]) {
    const w = createSceneWorld(2, level, 3);
    run(w, IDLE, 60 * 20);
    assert.equal(w.status, 'playing', `level ${level}`);
  }
});

test('every scene: the same seed and inputs replay identically', () => {
  const script = (i) => inp({ left: i % 50 < 20, right: i % 50 >= 30, jump: i % 23 < 6 });
  for (let s = 0; s < 3; s++) {
    const a = createSceneWorld(s, 2, 77);
    const b = createSceneWorld(s, 2, 77);
    for (let i = 0; i < 900; i++) { stepWorld(a, script(i)); stepWorld(b, script(i)); }
    assert.deepEqual(a, b, `scene ${s + 1}`);
  }
});
