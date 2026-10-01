// Sammy's state machine.
//
//   ground --jump--> air --land--> ground
//   ground --button on an armed platform--> (activates it, no jump)
//   air --hits a trampoline--> air (bounce) or ground (settle)
//   air --touches a rope with the button held--> rope
//   rope --button released--> air, thrown along the swing
//
// Priority: death beats everything; a rope grab beats landing in the same
// tick; an armed platform takes the button before a jump does.

import { SIM, PLAYER, TRAMPOLINE, ROPE, GRAVITY, JUMP_V } from '../data/tuning.js';

const DT = SIM.step;
const CHEST = 10; // px above the feet: the point that has to touch a rope

export function createPlayer(start, platforms) {
  const p = {
    x: start.x, y: start.y, vx: 0, vy: 0,
    state: 'air',
    facing: start.facing || 1,
    support: -1,        // index into world.platforms while grounded
    rope: -1,           // index into world.ropes while hanging
    lastRope: -1,       // the rope most recently let go of...
    regrab: 0,          // ...and the time before it can be caught again
    apexY: start.y,     // highest point since leaving the ground (for fall distance)
    jumpHeld: false,
    jumpBuf: 0,
    coyote: 0,
    // presentation timers, advanced by the sim so replays look identical
    walkT: 0,
    landT: 0,
    airT: 0,
  };
  const idx = findSupport(platforms, p.x, p.y);
  if (idx >= 0) { p.state = 'ground'; p.support = idx; }
  return p;
}

function within(plat, x) {
  return x >= plat.x - PLAYER.footTol && x <= plat.x + plat.w + PLAYER.footTol;
}

// A platform whose top is at (or within 1.5 px of) y under x.
function findSupport(platforms, x, y) {
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    if (pl.active && Math.abs(pl.y - y) <= 1.5 && within(pl, x)) return i;
  }
  return -1;
}

export function killPlayer(world, cause) {
  if (world.status !== 'playing') return;
  world.status = 'dead';
  world.deathCause = cause;
  world.events.push('die');
}

function startJump(world, p, dir) {
  p.state = 'air';
  p.support = -1;
  p.vy = -JUMP_V;
  p.vx = dir * PLAYER.walkSpeed;
  p.apexY = p.y;
  p.jumpBuf = 0;
  p.coyote = 0;
  p.airT = 0;
  if (dir !== 0) p.facing = dir;
  world.events.push('jump');
}

function leaveGround(p) {
  p.state = 'air';
  p.support = -1;
  p.vx = 0;           // walking off a ledge is a straight drop
  p.vy = 0;
  p.apexY = p.y;
  p.coyote = PLAYER.coyote;
  p.airT = 0;
}

function clampToWalls(p) {
  if (p.x < SIM.left) { p.x = SIM.left; p.vx = 0; }
  if (p.x > SIM.right) { p.x = SIM.right; p.vx = 0; }
}

function stepGround(world, p, input, dir) {
  const platforms = world.platforms;
  let plat = platforms[p.support];
  if (!plat.active) { leaveGround(p); return; }

  // Ride the platform. Only platforms flagged carryX move him sideways.
  p.y = plat.y;
  if (plat.carryX) p.x += plat.x - plat.prevX;

  // The button is judged before the walk: a press on the last pixel of a
  // ledge jumps from the ledge, it does not step off it first.
  if (p.jumpBuf > 0) {
    if (plat.armed) {
      p.jumpBuf = 0;
      world.triggers.push(plat.id);
    } else {
      startJump(world, p, dir);
      return;
    }
  }

  p.vx = dir * PLAYER.walkSpeed;
  if (dir !== 0) {
    p.facing = dir;
    p.x += p.vx * DT;
    p.walkT += DT;
  } else {
    p.walkT = 0;
  }
  clampToWalls(p);

  if (!within(plat, p.x)) {
    const next = findSupport(platforms, p.x, p.y);
    if (next < 0) { leaveGround(p); return; }
    p.support = next;
    plat = platforms[next];
    p.y = plat.y;
  }
  if (plat.pad && !plat.padPressed && p.x >= plat.padX && p.x <= plat.padX + plat.padW) {
    plat.padPressed = true;
    world.events.push('pad');
    world.triggers.push(plat.id);
  }
}

function tryGrab(world, p) {
  const cx = p.x;
  const cy = p.y - CHEST;
  for (let i = 0; i < world.ropes.length; i++) {
    if (i === p.lastRope && p.regrab > 0) continue;
    const r = world.ropes[i];
    const ex = r.x + r.len * Math.sin(r.theta);
    const ey = r.y + r.len * Math.cos(r.theta);
    // distance from the chest to the segment pivot->end
    const dx = ex - r.x;
    const dy = ey - r.y;
    let t = ((cx - r.x) * dx + (cy - r.y) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const qx = r.x + t * dx - cx;
    const qy = r.y + t * dy - cy;
    if (qx * qx + qy * qy <= ROPE.grabRadius * ROPE.grabRadius) {
      p.state = 'rope';
      p.rope = i;
      p.support = -1;
      p.vx = 0;
      p.vy = 0;
      world.events.push('grab');
      followRope(world, p);
      return true;
    }
  }
  return false;
}

function followRope(world, p) {
  const r = world.ropes[p.rope];
  const grip = r.len - ROPE.gripInset;
  p.x = r.x + grip * Math.sin(r.theta);
  p.y = r.y + grip * Math.cos(r.theta) + ROPE.hang;
  if (r.omega !== 0) p.facing = r.omega > 0 ? 1 : -1;
}

function stepRope(world, p, input) {
  if (input.jump) { followRope(world, p); return; }
  // Let go: the rope's tangential velocity plus a hop in the swing direction.
  const r = world.ropes[p.rope];
  const grip = r.len - ROPE.gripInset;
  const dir = r.omega > 0 ? 1 : r.omega < 0 ? -1 : p.facing;
  followRope(world, p);
  if (r.omega === 0) {
    // a rope that is not swinging gives nothing to push off: he just drops
    p.vx = 0;
    p.vy = 0;
  } else {
    p.vx = grip * r.omega * Math.cos(r.theta) + dir * ROPE.releaseVx;
    p.vy = -grip * r.omega * Math.sin(r.theta) - ROPE.releaseVy;
  }
  p.state = 'air';
  p.lastRope = p.rope;
  p.regrab = ROPE.regrab;
  p.rope = -1;
  p.apexY = p.y;
  p.airT = 0;
  p.facing = dir;
  world.events.push('release');
}

function landOn(world, p, idx, input, dir) {
  const plat = world.platforms[idx];
  const fall = Math.max(0, plat.y - p.apexY);
  p.y = plat.y;

  if (plat.bouncy) {
    // Incoming speed from the fall height, so it does not depend on tick sampling.
    const vIn = Math.sqrt(2 * GRAVITY * fall);
    let vOut;
    if (!input.jump) vOut = vIn * TRAMPOLINE.damp;
    else if (vIn <= TRAMPOLINE.chainMax * 1.02) vOut = Math.min(vIn * TRAMPOLINE.boost, TRAMPOLINE.chainMax);
    else vOut = Math.min(vIn * TRAMPOLINE.dropBoost, TRAMPOLINE.launchMax);
    if (input.jump || vOut >= TRAMPOLINE.settle) {
      p.vy = -vOut;
      p.vx = dir * PLAYER.walkSpeed;
      if (dir !== 0) p.facing = dir;
      p.apexY = p.y;
      p.airT = 0;
      plat.squash = 0.25;
      world.events.push('bounce');
      return;
    }
  } else if (fall > PLAYER.lethalFall) {
    p.vx = 0; p.vy = 0;
    p.state = 'ground';
    p.support = idx;
    killPlayer(world, 'fall');
    return;
  }

  p.state = 'ground';
  p.support = idx;
  p.vx = 0;
  p.vy = 0;
  p.landT = 0.12;
  world.events.push('land');
}

function stepAir(world, p, input, dir) {
  if (p.coyote > 0) {
    if (p.jumpBuf > 0) { startJump(world, p, dir); }
    else p.coyote = Math.max(0, p.coyote - DT);
  }

  const prevY = p.y;
  p.y += p.vy * DT + 0.5 * GRAVITY * DT * DT;
  p.vy += GRAVITY * DT;
  p.x += p.vx * DT;
  clampToWalls(p);
  p.airT += DT;
  if (p.y < p.apexY) p.apexY = p.y;

  if (input.jump && tryGrab(world, p)) return;

  if (p.y > prevY) {
    let best = -1;
    const platforms = world.platforms;
    for (let i = 0; i < platforms.length; i++) {
      const pl = platforms[i];
      if (!pl.active || !within(pl, p.x)) continue;
      if (prevY <= pl.prevY + 0.001 && p.y >= pl.y) {
        if (best < 0 || pl.y < platforms[best].y) best = i;
      }
    }
    if (best >= 0) { landOn(world, p, best, input, dir); return; }
  }

  if (p.y > SIM.killY) killPlayer(world, 'pit');
}

export function stepPlayer(world, input) {
  const p = world.player;
  const pressed = input.jump && !p.jumpHeld;
  p.jumpHeld = input.jump;
  if (pressed) p.jumpBuf = PLAYER.buffer;
  if (p.regrab > 0) p.regrab = Math.max(0, p.regrab - DT);
  if (p.landT > 0) p.landT = Math.max(0, p.landT - DT);
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (p.state === 'ground') stepGround(world, p, input, dir);
  else if (p.state === 'rope') stepRope(world, p, input);
  else stepAir(world, p, input, dir);

  // The buffer is spent after the state had its chance to use this tick's press.
  if (!pressed && p.jumpBuf > 0) p.jumpBuf = Math.max(0, p.jumpBuf - DT);
}

// Lenient hurtbox: 6 px wide, hair and soles excluded.
export function hurtbox(p, out) {
  out.x0 = p.x - PLAYER.hurtHalfW;
  out.x1 = p.x + PLAYER.hurtHalfW;
  out.y0 = p.y - PLAYER.hurtTop;
  out.y1 = p.y - PLAYER.hurtBottom;
  return out;
}
