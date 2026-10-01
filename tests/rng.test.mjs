import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, rnd, rndRange, rndInt } from '../src/sim/rng.js';

test('the same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(rnd(a), rnd(b));
});

test('different seeds give different sequences', () => {
  const a = createRng(1);
  const b = createRng(2);
  const as = Array.from({ length: 5 }, () => rnd(a));
  const bs = Array.from({ length: 5 }, () => rnd(b));
  assert.notDeepEqual(as, bs);
});

test('rng state is plain data: a deep copy continues the same sequence', () => {
  const a = createRng(7);
  rnd(a); rnd(a);
  const copy = structuredClone(a);
  for (let i = 0; i < 10; i++) assert.equal(rnd(a), rnd(copy));
});

test('values stay in range', () => {
  const r = createRng(99);
  for (let i = 0; i < 500; i++) {
    const v = rnd(r);
    assert.ok(v >= 0 && v < 1);
    const x = rndRange(r, 3, 5);
    assert.ok(x >= 3 && x < 5);
    const n = rndInt(r, 1, 4);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 4);
  }
});
