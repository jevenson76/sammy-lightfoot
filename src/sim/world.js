// A world is one attempt at one scene: plain data in, plain data out.
// stepWorld advances it by exactly SIM.step and never reads the clock.

import { SIM, TRAMPOLINE, difficulty } from '../data/tuning.js';
import { buildScene } from '../data/scenes.js';
import { createRng } from './rng.js';
import { createPlayer, stepPlayer } from './player.js';
import {
  makeVanish, makeCarpet, makePumpkin, makePlunger, makeBoxBall,
  stepMovers, stepLogic, stepHazards,
} from './entities.js';

const DT = SIM.step;

function makePlatform(def) {
  return {
    id: def.id || '',
    kind: def.kind || 'girder',
    x: def.x, y: def.y, w: def.w,
    h: def.h || 8,
    prevX: def.x, prevY: def.y,
    active: def.active !== false,
    bouncy: !!def.bouncy,
    armed: !!def.armed,       // the button activates it instead of jumping
    goal: !!def.goal,         // standing here clears the scene
    carryX: !!def.carryX,
    squash: 0,
    ...(def.extra || {}),
  };
}

function makeRope(def) {
  return {
    id: def.id || '',
    x: def.x, y: def.y, len: def.len,
    amp: def.amp, period: def.period, phase: def.phase || 0,
    active: def.active !== false,
    t: 0, theta: 0, omega: 0,
  };
}

export function createWorld(def, { level = 0, seed = 1 } = {}) {
  const platforms = (def.platforms || []).map(makePlatform);
  for (const t of def.trampolines || []) {
    platforms.push(makePlatform({
      ...t, kind: 'trampoline', y: t.y - TRAMPOLINE.height, h: TRAMPOLINE.height, bouncy: true,
    }));
  }
  const d = difficulty(level);
  const world = {
    scene: def.scene ?? -1,
    level,
    d,                      // this level's difficulty numbers
    rng: createRng(seed),
    t: 0,
    tick: 0,
    status: 'playing',      // 'playing' | 'dead' | 'clear'
    deathCause: null,
    logic: def.logic || null,
    stage: 0,
    stops: def.stops || null,
    platforms,
    ropes: (def.ropes || []).map(makeRope),
    spawners: (def.spawners || []).map((s) => ({ ...s })),
    ballTimer: def.firstBall ?? 1.5,
    balls: [],
    pumpkin: def.pumpkin ? makePumpkin(def.pumpkin, platforms, d.pumpkinSpeed) : null,
    vanish: def.vanish ? makeVanish(def.vanish, platforms) : null,
    carpet: def.carpet ? makeCarpet(def.carpet, platforms) : null,
    plungers: def.plungers ? def.plungers.list.map((pl) => makePlunger(pl, def.plungers.top)) : [],
    fire: def.fire ? { ...def.fire } : null,
    boxBalls: (def.boxBalls || []).map(makeBoxBall),
    events: [],             // names for the presentation layer; the consumer drains it
    triggers: [],           // platform ids activated this tick (button on an armed platform, pad)
    player: null,
  };
  for (const r of world.ropes) updateRope(r, 0);
  world.player = createPlayer(def.start, platforms);
  return world;
}

// Deep copy of a world (or any plain data). Used by look-ahead bots and
// replay tests; a world holds only objects, arrays and primitives.
export function cloneWorld(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = cloneWorld(v[i]);
    return out;
  }
  const out = {};
  for (const k in v) out[k] = cloneWorld(v[k]);
  return out;
}

// Hands the pending event names to the caller and leaves the world with an empty list.
export function drainEvents(world) {
  const out = world.events;
  if (out.length) world.events = [];
  return out;
}

export function createSceneWorld(scene, level, seed) {
  return createWorld(buildScene(scene, level), { level, seed });
}

function updateRope(r, dt) {
  if (!r.active) { r.theta = 0; r.omega = 0; return; }
  r.t += dt;
  const w = (2 * Math.PI) / r.period;
  r.theta = r.amp * Math.sin(w * r.t + r.phase);
  r.omega = r.amp * w * Math.cos(w * r.t + r.phase);
}

export function stepWorld(world, input) {
  if (world.status !== 'playing') return;
  world.t += DT;
  world.tick++;

  const platforms = world.platforms;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    pl.prevX = pl.x;
    pl.prevY = pl.y;
    if (pl.squash > 0) pl.squash = Math.max(0, pl.squash - DT);
  }
  stepMovers(world);
  for (let i = 0; i < world.ropes.length; i++) updateRope(world.ropes[i], DT);

  stepPlayer(world, input);
  stepLogic(world);
  // Never truncate with `.length = 0`: under look-ahead load that pattern crashes
  // Node 22/24 ("Fatal JavaScript invalid array length"). Swap in a new array instead.
  if (world.triggers.length) world.triggers = [];
  stepHazards(world);

  if (world.status === 'playing') {
    const p = world.player;
    if (p.state === 'ground' && platforms[p.support].goal) {
      world.status = 'clear';
      world.events.push('clear');
    }
  }
}
