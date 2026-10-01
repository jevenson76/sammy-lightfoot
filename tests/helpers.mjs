// Shared test utilities. Test-only: nothing in src/ imports this.
import { stepWorld, drainEvents } from '../src/sim/world.js';

export const IDLE = Object.freeze({ left: false, right: false, jump: false });
export const inp = (o = {}) => ({ ...IDLE, ...o });

export function run(world, input, ticks) {
  for (let i = 0; i < ticks; i++) {
    stepWorld(world, input);
  }
  return world;
}

// Steps until pred(world) is true; returns the number of ticks taken.
export function runUntil(world, input, pred, max = 1200) {
  for (let i = 0; i < max; i++) {
    if (pred(world)) return i;
    stepWorld(world, input);
  }
  if (pred(world)) return max;
  throw new Error(`condition not reached within ${max} ticks (player ${JSON.stringify(world.player)})`);
}

// A wide flat floor at y=150 with Sammy standing in the middle.
export function flat(extra = {}) {
  return {
    start: { x: 126, y: 150 },
    platforms: [{ id: 'floor', x: 0, y: 150, w: 252 }],
    ...extra,
  };
}

export function near(actual, expected, tol, label = 'value') {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ${expected} +/- ${tol}, got ${actual}`);
  }
}

// Drains world.events and reports whether `name` was among them.
export function sawEvent(world, name) {
  return drainEvents(world).includes(name);
}
