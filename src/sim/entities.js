// Everything in a scene that is not Sammy: moving platforms, hazards, and the
// per-scene stage logic. Movers run before the player each tick (so he rides
// them), hazards after (so a hit is judged on where he ended up).

import {
  SIM, GRAVITY, BALL, PUMPKIN, PLUNGER, BOXBALL, ELEVATOR, BLOCK, VANISH,
} from '../data/tuning.js';
import { rnd, rndRange } from './rng.js';
import { hurtbox, killPlayer } from './player.js';

const DT = SIM.step;
const BALL_BOUNCE_V = Math.sqrt(2 * GRAVITY * BALL.bounceHeight);

// ---------- construction ----------

export function makeVanish(def, platforms) {
  return {
    plats: def.ids.map((id) => platforms.findIndex((p) => p.id === id)),
    order: def.order,
    i: 0,
    phase: 'gap',          // gap -> warn (blinking) -> off (gone) -> gap, next platform
    timer: def.gap,
    warn: def.warn,
    gap: def.gap,
    off: def.off ?? VANISH.offTime,
  };
}

export function makeCarpet(def, platforms) {
  return {
    plat: platforms.findIndex((p) => p.id === def.platform),
    path: def.path,
    seg: 0,
    state: 'hidden',       // hidden -> idle (waiting for the button) -> pause <-> move -> done
    timer: 0,
    speed: def.speed,
    pause: def.pause,
  };
}

export function makePumpkin(def, platforms, speed) {
  const pl = platforms.find((p) => p.id === def.platform);
  const half = PUMPKIN.w / 2;
  return { x: pl.x + pl.w - half, y: pl.y, dir: -1, minX: pl.x + half, maxX: pl.x + pl.w - half, speed };
}

export function makePlunger(def, top) {
  return { x: def.x, top, len: PLUNGER.minLen, period: def.period, phase: def.phase, t: 0, warn: false };
}

export function makeBoxBall(def) {
  return {
    x: def.x, y: def.floor - BOXBALL.radius, vx: def.dir * def.speed,
    phase: def.phase, floor: def.floor, x0: def.x0, x1: def.x1,
    height: def.height, period: BOXBALL.period,
  };
}

// ---------- movers (before the player) ----------

function stepVanish(world) {
  const v = world.vanish;
  v.timer -= DT;
  if (v.timer > 0) return;
  const pl = world.platforms[v.plats[v.order[v.i] - 1]];
  if (v.phase === 'gap') {
    v.phase = 'warn';
    v.timer = v.warn;
    pl.blink = true;
    world.events.push('warn');
  } else if (v.phase === 'warn') {
    v.phase = 'off';
    v.timer = v.off;
    pl.blink = false;
    pl.active = false;
    world.events.push('vanish');
  } else {
    v.phase = 'gap';
    v.timer = v.gap;
    pl.active = true;
    v.i = (v.i + 1) % v.order.length;
    world.events.push('appear');
  }
}

function stepCarpet(world) {
  const c = world.carpet;
  if (c.state === 'pause') {
    c.timer -= DT;
    if (c.timer <= 0) c.state = 'move';
    return;
  }
  if (c.state !== 'move') return;
  const pl = world.platforms[c.plat];
  const target = c.path[c.seg + 1];
  const stepLen = c.speed * DT;
  const dx = target.x - pl.x;
  const dy = target.y - pl.y;
  if (Math.abs(dx) <= stepLen && Math.abs(dy) <= stepLen) {
    pl.x = target.x;
    pl.y = target.y;
    c.seg++;
    if (c.seg >= c.path.length - 1) {
      c.state = 'done';
      world.events.push('carpetDone');
    } else {
      c.state = 'pause';
      c.timer = c.pause;
    }
  } else {
    pl.x += Math.sign(dx) * Math.min(Math.abs(dx), stepLen);
    pl.y += Math.sign(dy) * Math.min(Math.abs(dy), stepLen);
  }
}

export function stepMovers(world) {
  const platforms = world.platforms;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    if (pl.kind === 'elevator') {
      if (pl.y !== pl.targetY) {
        const d = pl.targetY - pl.y;
        const stepLen = ELEVATOR.speed * DT;
        if (Math.abs(d) <= stepLen) { pl.y = pl.targetY; world.events.push('arrive'); }
        else pl.y += Math.sign(d) * stepLen;
      }
    } else if (pl.kind === 'block' && pl.active) {
      pl.y += pl.dir * pl.speed * DT;
      if (pl.y >= BLOCK.bottom) { pl.y = BLOCK.bottom; pl.dir = -1; }
      else if (pl.y <= BLOCK.top) { pl.y = BLOCK.top; pl.dir = 1; }
    }
  }
  if (world.vanish) stepVanish(world);
  if (world.carpet) stepCarpet(world);
}

// ---------- scene stage logic (after the player, consumes world.triggers) ----------

function triggered(world, id) {
  return world.triggers.includes(id);
}
function platById(world, id) {
  const platforms = world.platforms;
  for (let i = 0; i < platforms.length; i++) if (platforms[i].id === id) return platforms[i];
  return null;
}

function logicScene1(world) {
  if (triggered(world, 'upperR')) {
    const rope = world.ropes[1];
    if (!rope.active) { rope.active = true; rope.t = 0; world.events.push('ropeStart'); }
  }
}

// Stages: 0 bottom (left elevator armed) -> 1 rising to mid -> 2 mid (right armed)
//      -> 3 rising to top (carpet shown) -> 4 top (carpet armed, blocks gone) -> 5 carpet flying
function logicScene2(world, stops) {
  const elevL = platById(world, 'elevL');
  const elevR = platById(world, 'elevR');
  const carpet = world.platforms[world.carpet.plat];
  if (world.stage === 0 && triggered(world, 'elevL')) {
    world.stage = 1;
    elevL.armed = false;
    elevL.targetY = elevR.targetY = stops.mid;
    world.events.push('elevator');
  } else if (world.stage === 1 && elevL.y === stops.mid) {
    world.stage = 2;
    elevR.armed = true;
  } else if (world.stage === 2 && triggered(world, 'elevR')) {
    world.stage = 3;
    elevR.armed = false;
    elevL.targetY = elevR.targetY = stops.top;
    carpet.active = true;
    world.carpet.state = 'idle';
    world.events.push('elevator');
  } else if (world.stage === 3 && elevR.y === stops.top) {
    world.stage = 4;
    for (const pl of world.platforms) if (pl.kind === 'block') pl.active = false;
    carpet.armed = true;
    elevL.goal = true;
    world.events.push('blocksGone');
  } else if (world.stage === 4 && triggered(world, 'carpet')) {
    world.stage = 5;
    carpet.armed = false;
    world.carpet.state = 'pause';
    world.carpet.timer = world.carpet.pause;
    world.events.push('carpet');
  }
}

// Stages: 0 (right elevator armed at the bottom) -> 1 rising -> 2 (left armed at mid) -> 3 rising/top
function logicScene3(world, stops) {
  const elevL = platById(world, 'elevL');
  const elevR = platById(world, 'elevR');
  if (world.stage === 0 && triggered(world, 'elevR')) {
    world.stage = 1;
    elevR.armed = false;
    elevR.targetY = stops.mid;
    world.events.push('elevator');
  } else if (world.stage === 1 && elevR.y === stops.mid) {
    world.stage = 2;
    elevL.armed = true;
  } else if (world.stage === 2 && triggered(world, 'elevL')) {
    world.stage = 3;
    elevL.armed = false;
    elevL.targetY = stops.top;
    world.events.push('elevator');
  }
}

export function stepLogic(world) {
  if (world.logic === 'scene1') logicScene1(world);
  else if (world.logic === 'scene2') logicScene2(world, world.stops);
  else if (world.logic === 'scene3') logicScene3(world, world.stops);
}

// ---------- hazards (after the player) ----------

function spawnBall(world) {
  const d = world.d;
  const sp = world.spawners[world.spawners.length > 1 && rnd(world.rng) < 0.4 ? 1 : 0];
  let kind = sp.kind;
  if (!kind) {
    const r = rnd(world.rng);
    kind = r < d.ballEitherChance ? 'either'
      : r < d.ballEitherChance + d.ballBounceChance ? 'bounce' : 'roll';
  }
  world.balls.push({
    x: sp.x, y: sp.y, vx: 0, vy: 0, dir: sp.dir, speed: d.ballSpeed,
    kind,                  // roll | bounce | either (re-decides on every landing)
    mode: 'hold',          // hold (blinking at the corner) -> fall <-> roll
    holdT: BALL.spawnHold,
    plat: -1,
  });
  world.events.push('ballSpawn');
}

function stepBall(world, b) {
  if (b.mode === 'hold') {
    b.holdT -= DT;
    if (b.holdT <= 0) b.mode = 'fall';   // straight down: it starts travelling when it lands
    return true;
  }
  const platforms = world.platforms;
  if (b.mode === 'roll') {
    b.x += b.vx * DT;
    const pl = platforms[b.plat];
    if (b.x < pl.x || b.x > pl.x + pl.w) { b.mode = 'fall'; b.vy = 0; }
  } else {
    const prevBottom = b.y + BALL.radius;
    b.y += b.vy * DT + 0.5 * GRAVITY * DT * DT;
    b.vy += GRAVITY * DT;
    b.x += b.vx * DT;
    const bottom = b.y + BALL.radius;
    if (b.vy > 0) {
      for (let i = 0; i < platforms.length; i++) {
        const pl = platforms[i];
        if (!pl.active || pl.kind === 'trampoline') continue;
        if (b.x < pl.x || b.x > pl.x + pl.w) continue;
        if (prevBottom <= pl.y + 0.001 && bottom >= pl.y) {
          b.y = pl.y - BALL.radius;
          b.vx = b.dir * b.speed;
          const bounce = b.kind === 'bounce' || (b.kind === 'either' && rnd(world.rng) < 0.5);
          if (bounce) { b.vy = -BALL_BOUNCE_V; world.events.push('ballBounce'); }
          else { b.mode = 'roll'; b.plat = i; b.vy = 0; }
          break;
        }
      }
    }
  }
  return !(b.y - BALL.radius > SIM.killY || b.x < -10 || b.x > 262);
}

// Circle vs the hurtbox rectangle.
function circleHits(cx, cy, r, box) {
  const nx = Math.max(box.x0, Math.min(cx, box.x1));
  const ny = Math.max(box.y0, Math.min(cy, box.y1));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}
function rectHits(x0, y0, x1, y1, box) {
  return x0 < box.x1 && x1 > box.x0 && y0 < box.y1 && y1 > box.y0;
}

function plungerProfile(u) {
  if (u < 0.45) return 0;
  if (u < 0.6) return (u - 0.45) / 0.15;
  if (u < 0.85) return 1;
  return 1 - (u - 0.85) / 0.15;
}

const box = { x0: 0, x1: 0, y0: 0, y1: 0 };

export function stepHazards(world) {
  const p = world.player;
  hurtbox(p, box);

  // Balls (scene 1)
  if (world.spawners.length) {
    world.ballTimer -= DT;
    if (world.ballTimer <= 0) {
      spawnBall(world);
      world.ballTimer = world.d.ballInterval * rndRange(world.rng, 0.8, 1.2);
    }
  }
  const balls = world.balls;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (!stepBall(world, b)) { balls[i] = balls[balls.length - 1]; balls.pop(); continue; }
    if (b.mode !== 'hold' && circleHits(b.x, b.y, BALL.hurtRadius, box)) killPlayer(world, 'ball');
  }

  // Pumpkin
  const pk = world.pumpkin;
  if (pk) {
    pk.x += pk.dir * pk.speed * DT;
    if (pk.x <= pk.minX) { pk.x = pk.minX; pk.dir = 1; }
    else if (pk.x >= pk.maxX) { pk.x = pk.maxX; pk.dir = -1; }
    // Only a Sammy who is up on the perch with it: a head poking up through
    // the one-way platform from below is out of its reach.
    if (p.y <= pk.y + 1 && rectHits(pk.x - PUMPKIN.hurtHalfW, pk.y - PUMPKIN.hurtH, pk.x + PUMPKIN.hurtHalfW, pk.y, box)) {
      killPlayer(world, 'pumpkin');
    }
  }

  // Blocks (scene 2): lethal unless he is standing on that one
  const platforms = world.platforms;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    if (!pl.lethalBody || !pl.active) continue;
    if (p.state === 'ground' && p.support === i) continue;
    if (rectHits(pl.x, pl.y, pl.x + pl.w, pl.y + pl.h, box)) killPlayer(world, 'block');
  }

  // Plungers (scene 3)
  for (let i = 0; i < world.plungers.length; i++) {
    const pl = world.plungers[i];
    pl.t += DT;
    const u = (pl.t / pl.period + pl.phase) % 1;
    pl.warn = u >= 0.3 && u < 0.45;
    pl.len = PLUNGER.minLen + (PLUNGER.maxLen - PLUNGER.minLen) * plungerProfile(u);
    if (rectHits(pl.x, pl.top, pl.x + PLUNGER.w, pl.top + pl.len, box)) killPlayer(world, 'plunger');
  }

  // Fire (scene 3): only a Sammy who drops into it
  const f = world.fire;
  if (f && p.state === 'air' && p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1 + 10) {
    killPlayer(world, 'fire');
  }

  // Box balls (scene 3)
  for (let i = 0; i < world.boxBalls.length; i++) {
    const b = world.boxBalls[i];
    b.x += b.vx * DT;
    if (b.x < b.x0) { b.x = b.x0 + (b.x0 - b.x); b.vx = -b.vx; }
    else if (b.x > b.x1) { b.x = b.x1 - (b.x - b.x1); b.vx = -b.vx; }
    b.phase = (b.phase + DT / b.period) % 1;
    b.y = b.floor - BOXBALL.radius - b.height * 4 * b.phase * (1 - b.phase);
    if (circleHits(b.x, b.y, BOXBALL.hurtRadius, box)) killPlayer(world, 'ball');
  }
}
