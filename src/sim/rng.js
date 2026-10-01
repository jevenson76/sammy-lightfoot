// Seeded RNG (mulberry32). The state is a plain object held on the world, so a
// world can be deep-copied and replayed. Never use Math.random in src/sim.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

export function rnd(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rndRange(r, lo, hi) {
  return lo + rnd(r) * (hi - lo);
}

export function rndInt(r, lo, hi) {
  return lo + Math.floor(rnd(r) * (hi - lo + 1));
}
