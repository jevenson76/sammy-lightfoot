// Scripted players that drive the real simulation headlessly.
//
//   planner: plays the documented route. Before it commits to a jump, a rope
//            release or a step, it tries it on a deep copy of the world and
//            only goes ahead if the copy survives.
//              margin: ticks of slack it demands. A commitment must work if
//                      started now AND if started `margin` ticks late.
//              jitter: it then really is late, by a random 0..jitter ticks.
//            margin 0 / jitter 0 is a frame-perfect player: proof a scene can
//            be cleared. margin 6 / jitter 6 is a careful human who wants a
//            tenth of a second in hand and uses it.
//   masher:  ignores every telegraph. Heads roughly the right way and hits
//            the button at random.
//
// The bots read world state freely. They are a measuring tool, not an AI.

import { stepWorld, cloneWorld, drainEvents } from '../src/sim/world.js';
import { createRng, rnd, rndInt } from '../src/sim/rng.js';

export const IN = {
  idle: { left: false, right: false, jump: false },
  left: { left: true, right: false, jump: false },
  right: { left: false, right: true, jump: false },
  jump: { left: false, right: false, jump: true },
  leftJump: { left: true, right: false, jump: true },
  rightJump: { left: false, right: true, jump: true },
};
const dirIn = (dir, jump = false) => (dir < 0 ? (jump ? IN.leftJump : IN.left) : dir > 0 ? (jump ? IN.rightJump : IN.right) : jump ? IN.jump : IN.idle);

// ---------- macros: (world, k) -> input, or null when finished ----------
// Factories return a fresh macro each call, so one copy can be tried on a
// cloned world and another committed on the real one.

// A timed macro is a commitment (a jump, a release): margin and jitter apply to those.
const timed = (factory) => { factory.timed = true; return factory; };
// `last` is the input a macro leaves the stick in (what a late player keeps doing).
const leaves = (factory, last) => { factory.last = last; return factory; };

const named = (factory, label) => { factory.label = label; return factory; };
const walk = (dir, n) => named(leaves(() => (w, k) => (k < n ? dirIn(dir) : null), dirIn(dir)), `walk${dir > 0 ? '+' : '-'}${n}`);
const idle = (n) => named(() => (w, k) => (k < n ? IN.idle : null), `idle${n}`);
// A committed jump: press on tick 0, then hands off until he lands.
const hop = (dir) => named(timed(() => (w, k) => {
  if (k === 0) return dirIn(dir, true);
  return w.player.state === 'air' ? IN.idle : null;
}), `hop${dir > 0 ? '+' : dir < 0 ? '-' : '0'}`);
// One clean button press (for elevators and the carpet).
const tap = () => () => (w, k) => (k === 0 ? IN.jump : k === 1 ? IN.idle : null);
// Hold an input until pred(world) or a tick limit.
const holdUntil = (input, pred, max = 600) => () => (w, k) => (pred(w) || k >= max ? null : input);
const never = () => false;
const seq = (...factories) => timed(() => {
  const parts = factories.map((f) => f());
  let i = 0;
  let k0 = 0;
  return (w, k) => {
    while (i < parts.length) {
      const out = parts[i](w, k - k0);
      if (out) return out;
      i++;
      k0 = k;
    }
    return null;
  };
});
const keepHolding = leaves(holdUntil(IN.jump, never, 1), IN.jump);
// The same macro started `d` ticks late, with the stick left where it was.
const delayed = (d, last, factory) => (d ? seq(holdUntil(last, never, d), factory) : factory);

// ---------- look-ahead ----------

const supportId = (w) => (w.player.state === 'ground' ? w.platforms[w.player.support].id : null);
const alive = (w) => w.status !== 'dead';

function runMacro(w, factory, max = 900) {
  const m = factory();
  for (let k = 0; k < max; k++) {
    const input = m(w, k);
    if (!input) break;
    stepWorld(w, input);
    drainEvents(w);
    if (w.status !== 'playing') break;
  }
  return w;
}

// Would this macro reach `success` without dying, started now and started late?
function works(ctx, world, factory, success, max = 900) {
  for (const d of ctx.delays) {
    const w = runMacro(cloneWorld(world), delayed(d, ctx.last, factory), max);
    if (!alive(w) || !success(w)) return false;
  }
  return true;
}

function survivesIdle(w, ticks) {
  for (let i = 0; i < ticks && w.status === 'playing'; i++) { stepWorld(w, IN.idle); drainEvents(w); }
  return alive(w);
}

const NOW = [0];

// Depth-limited search over short macros. score(world) is higher-is-better.
// Every step must end with Sammy alive and grounded (the route only re-plans
// from the ground); a plan may stop after any step, provided he is then on an
// allowed platform and still alive after standing there for `rest` ticks. Timed steps are judged at their worst
// over the demanded margin.
function search(ctx, world, factories, score, { depth = 2, rest = 24, stay = null } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const f of factories) {
    let worst = Infinity;
    for (const d of f.timed ? ctx.delays : NOW) {
      const w = runMacro(cloneWorld(world), delayed(d, ctx.last, f), 120);
      let s = -Infinity;
      if (w.status === 'clear') s = 1e9;
      else if (alive(w) && w.player.state === 'ground') {
        // Stopping here counts as a plan too, so a plan found one step ago is still found now.
        const id = supportId(w);
        if ((!stay || stay.includes(id)) && survivesIdle(cloneWorld(w), rest)) s = score(w);
        if (depth > 1) {
          const deeper = search({ delays: ctx.delays, last: f.last || IN.idle }, w, factories, score, { depth: depth - 1, rest, stay }).score;
          if (deeper > s) s = deeper;
        }
      }
      worst = Math.min(worst, s);
      if (worst === -Infinity) break;
    }
    if (worst > bestScore) { bestScore = worst; best = f; }
  }
  return { factory: best, score: bestScore };
}

const stepsFor = (dir, n = 3) => [walk(dir, n), hop(dir), idle(n), hop(0), walk(-dir, n), hop(-dir)];

// Head for targetX without dying. Returns a macro factory.
function moveToward(ctx, w, targetX, stay, opts = {}) {
  const dir = targetX > w.player.x ? 1 : -1;
  const found = search(ctx, w, stepsFor(dir, opts.grain ?? 3), (x) => -Math.abs(x.player.x - targetX), { depth: opts.depth ?? 2, rest: opts.rest ?? 24, stay });
  return found.factory || idle(1);
}

// Stand still if that is safe; otherwise take whatever keeps him alive.
function waitSafely(ctx, w, stay) {
  if (survivesIdle(cloneWorld(w), 45)) return idle(1);
  const found = search(ctx, w, [hop(0), walk(-1, 4), walk(1, 4), hop(-1), hop(1), idle(4)], () => 0, { depth: 2, rest: 30, stay });
  return found.factory || idle(1);
}

const on = (id) => (w) => supportId(w) === id;
const onAny = (...ids) => (w) => ids.includes(supportId(w));
const grounded = (w) => w.player.state === 'ground';
const onRope = (i) => (w) => w.player.state === 'rope' && w.player.rope === i;
const cleared = (w) => w.status === 'clear';
const notAir = (w) => w.player.state !== 'air';
const press = (input) => () => (w, k) => (k === 0 ? input : null);

// Jump (in `dir`) holding the button until the rope is caught.
const grab = (dir, rope) => seq(press(dirIn(dir, true)), holdUntil(IN.jump, (w) => onRope(rope)(w) || grounded(w), 60));
// Let go now, keep hands off until he lands.
const release = () => seq(idle(1), holdUntil(IN.idle, notAir, 200));
// Let go now, wait `gap` ticks, then hold to catch the next rope.
const transfer = (gap, rope) => seq(idle(gap), holdUntil(IN.jump, (w) => onRope(rope)(w) || grounded(w), 90));
// From a mat or the ground beneath it: jump, then keep the button (and a direction) held until `target`.
const pumpTo = (dirHeld, target) => seq(press(IN.jump), holdUntil(dirIn(dirHeld, true), on(target), 500), idle(1));

// ---------- routes: (ctx, world) -> macro factory ----------

function scene1(ctx, w) {
  const p = w.player;
  const id = supportId(w);
  if (p.state === 'rope') {
    const landing = p.rope === 0 ? onAny('towerL', 'tramp3') : cleared;
    return works(ctx, w, release(), landing) ? release() : keepHolding;
  }
  if (p.state === 'air') return idle(1);
  switch (id) {
    case 'floor': {
      // Jump right onto the first trampoline and pump up to the pole platform.
      const toPole = seq(press(IN.rightJump), holdUntil(IN.jump, grounded, 500), idle(1));
      if (p.x >= 214 && p.x <= 228 && works(ctx, w, toPole, on('pole'))) return toPole;
      if (Math.abs(p.x - 221) > 3) return moveToward(ctx, w, 221, ['floor', 'tramp1', 'tramp2']);
      return waitSafely(ctx, w, ['floor']);
    }
    case 'tramp1':
      return works(ctx, w, pumpTo(0, 'pole'), on('pole')) ? pumpTo(0, 'pole') : waitSafely(ctx, w);
    case 'tramp2':
      return moveToward(ctx, w, 221, ['floor', 'tramp1', 'tramp2']);
    case 'pole': {
      // Running jump left from the chevron onto trampoline 2, thrown across to the centre tower.
      const leap = seq(press(IN.leftJump), holdUntil(IN.leftJump, grounded, 500), idle(1));
      if (works(ctx, w, leap, on('towerC'))) return leap;
      const chevron = w.platforms[p.support].chevronX;
      if (Math.abs(p.x - chevron) > 1.5) return moveToward(ctx, w, chevron, ['pole'], { grain: 1 });
      return waitSafely(ctx, w, ['pole']);
    }
    case 'towerC':
      if (works(ctx, w, grab(-1, 0), onRope(0), 80)) return grab(-1, 0);
      if (p.x > 101) return moveToward(ctx, w, 99, ['towerC'], { grain: 2 });
      return waitSafely(ctx, w, ['towerC']);
    case 'towerL': {
      const bounce = pumpTo(-1, 'upperL');
      if (p.x <= 20 && works(ctx, w, bounce, on('upperL'))) return bounce;
      if (p.x > 16) return moveToward(ctx, w, 14, ['towerL', 'tramp3']);
      return waitSafely(ctx, w, ['towerL', 'tramp3']);
    }
    case 'tramp3': {
      const bounce = pumpTo(-1, 'upperL');
      return works(ctx, w, bounce, on('upperL')) ? bounce : waitSafely(ctx, w);
    }
    case 'upperL': {
      const leap = hop(1);
      if (p.x >= 72 && works(ctx, w, leap, on('upperR'))) return leap;
      return p.x < 80 ? moveToward(ctx, w, 82, ['upperL']) : waitSafely(ctx, w, ['upperL']);
    }
    case 'upperR': {
      const pl = w.platforms[p.support];
      if (!pl.padPressed) return moveToward(ctx, w, pl.padX + 6, ['upperR']);
      if (works(ctx, w, grab(0, 1), onRope(1), 80)) return grab(0, 1);
      if (Math.abs(p.x - 152) > 4) return moveToward(ctx, w, 152, ['upperR']);
      return waitSafely(ctx, w, ['upperR']);
    }
    default:
      return idle(1);
  }
}

const S2_BOTTOM = ['p1', 'p2', 'p3', 'p4', 'elevL', 'elevR'];
const S2_MID = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'elevL', 'elevR'];

function scene2(ctx, w) {
  const p = w.player;
  const id = supportId(w);
  if (p.state !== 'ground') return idle(1);
  const pl = w.platforms[p.support];
  if (pl.armed) return tap();
  switch (w.stage) {
    case 0:
      return moveToward(ctx, w, 15, S2_BOTTOM, { depth: 3, rest: 150 });
    case 1:
    case 3:
      return idle(1); // riding an elevator
    case 2:
      return moveToward(ctx, w, 232, S2_MID, { depth: 2, rest: 12, grain: 2 });
    case 4: {
      const carpet = w.platforms[w.carpet.plat];
      return moveToward(ctx, w, carpet.x + carpet.w / 2, ['elevR', 'carpet'], { grain: 2 });
    }
    default: {
      // Walk with the carpet; when it stops, walk off onto the left elevator.
      const carpet = w.platforms[w.carpet.plat];
      if (w.carpet.state === 'done' || id === 'elevL') return walk(-1, 1);
      const mid = carpet.x + carpet.w / 2;
      if (p.x > mid + 2) return walk(-1, 1);
      if (p.x < mid - 2) return walk(1, 1);
      return idle(1);
    }
  }
}

const S3_LOW = ['floor', 'elevR'];
const S3_MID = ['roof', 'elevL', 'elevR'];

function scene3(ctx, w) {
  const p = w.player;
  const id = supportId(w);
  if (p.state === 'rope') {
    if (p.rope === 0) {
      for (const gap of [1, 2, 4, 7, 10]) {
        if (works(ctx, w, transfer(gap, 1), onRope(1), 120)) return transfer(gap, 1);
      }
      return keepHolding;
    }
    return works(ctx, w, release(), cleared) ? release() : keepHolding;
  }
  if (p.state !== 'ground') return idle(1);
  const pl = w.platforms[p.support];
  if (pl.armed) return tap();
  if (id === 'floor') {
    const leap = hop(1);
    if (p.x >= 150 && works(ctx, w, leap, on('elevR'))) return leap;
    return moveToward(ctx, w, 162, S3_LOW, { depth: 3, rest: 30 });
  }
  if (id === 'elevR') {
    if (w.stage < 2) return idle(1);
    const leap = hop(-1);
    if (works(ctx, w, seq(leap, idle(30)), on('roof'))) return leap;
    return moveToward(ctx, w, 185, ['elevR'], { grain: 1 });
  }
  if (id === 'roof') return moveToward(ctx, w, 10, S3_MID, { depth: 3, rest: 30, grain: 2 });
  if (id === 'elevL') {
    if (w.stage < 3 || pl.y !== pl.targetY) return idle(1);
    if (works(ctx, w, grab(1, 0), onRope(0), 80)) return grab(1, 0);
    if (p.x < 19) return walk(1, 1);
    return idle(1);
  }
  return idle(1);
}

const ROUTES = [scene1, scene2, scene3];

// ---------- bots ----------

export function createPlanner({ margin = 0, jitter = 0, seed = 1, name, onDecide } = {}) {
  const rng = createRng(seed);
  const ctx = { delays: margin ? [0, margin] : NOW, last: IN.idle };
  let macro = null;
  let k = 0;
  let delay = 0;
  return {
    name: name || 'planner',
    reset() { macro = null; k = 0; delay = 0; ctx.last = IN.idle; },
    act(world) {
      for (let guard = 0; guard < 4; guard++) {
        if (!macro) {
          const factory = ROUTES[world.scene](ctx, world);
          macro = factory();
          k = 0;
          delay = jitter && factory.timed ? rndInt(rng, 0, jitter) : 0;
          if (onDecide) onDecide(world, factory.label || 'macro', delay);
        }
        if (delay > 0) { delay--; return ctx.last; }
        const input = macro(world, k++);
        if (input) { ctx.last = input; return input; }
        macro = null;
      }
      return IN.idle;
    },
  };
}

// Heads toward the goal side most of the time and presses the button at random.
const MASH_DIR = [
  (w) => (w.player.y > 100 ? (w.player.x > 60 ? -1 : 1) : 1),
  (w) => (w.stage < 2 ? -1 : w.stage < 4 ? 1 : -1),
  (w) => (w.stage < 2 ? 1 : w.stage < 3 ? -1 : 1),
];
export function createMasher({ seed = 1 } = {}) {
  const rng = createRng(seed);
  let hold = 0;
  let cur = IN.idle;
  return {
    name: 'masher',
    reset() { hold = 0; cur = IN.idle; },
    act(world) {
      if (hold-- > 0) return cur;
      hold = rndInt(rng, 4, 22);
      const want = MASH_DIR[world.scene](world);
      const r = rnd(rng);
      const dir = r < 0.7 ? want : r < 0.85 ? -want : 0;
      cur = dirIn(dir, rnd(rng) < 0.45);
      return cur;
    },
  };
}

// The player models the report and the regression test use.
export const MODELS = {
  planner: (seed) => createPlanner({ seed, name: 'planner' }),                       // frame-perfect
  careful: (seed) => createPlanner({ margin: 6, jitter: 6, seed, name: 'careful' }), // wants 0.1 s slack, is up to 0.1 s late
  sloppy: (seed) => createPlanner({ margin: 2, jitter: 8, seed, name: 'sloppy' }),   // later than the slack it left itself
  masher: (seed) => createMasher({ seed }),
};

// Plays one attempt at a scene to the end. Returns what happened.
export function playScene(createSceneWorld, scene, level, seed, bot, maxTicks = 60 * 150) {
  const w = createSceneWorld(scene, level, seed);
  bot.reset();
  while (w.status === 'playing' && w.tick < maxTicks) {
    stepWorld(w, bot.act(w));
    drainEvents(w);
  }
  return {
    status: w.status === 'playing' ? 'timeout' : w.status,
    cause: w.status === 'dead' ? w.deathCause : null,
    ticks: w.tick,
    at: supportId(w) || `${w.player.state}@${Math.round(w.player.x)},${Math.round(w.player.y)}`,
    stage: w.stage,
  };
}
