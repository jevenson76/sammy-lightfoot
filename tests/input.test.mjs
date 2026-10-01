import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/engine/input.js';

// A stand-in for window: an EventTarget plus hand-made key events.
function rig() {
  const target = new EventTarget();
  const input = createInput(target);
  const key = (type, code, extra = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, repeat: false, ...extra });
    target.dispatchEvent(e);
  };
  return { target, input, down: (code, extra) => key('keydown', code, extra), up: (code) => key('keyup', code) };
}

test('a held key reads as held on every sample', () => {
  const { input, down, up } = rig();
  down('ArrowLeft');
  assert.equal(input.sample().left, true);
  assert.equal(input.sample().left, true);
  up('ArrowLeft');
  assert.equal(input.sample().left, false);
});

test('two keys bound to one action: the action stays down until both are released', () => {
  const { input, down, up } = rig();
  down('KeyZ');
  down('Space');
  up('KeyZ');
  assert.equal(input.sample().jump, true, 'Space is still down');
  up('Space');
  assert.equal(input.sample().jump, false);

  down('KeyA');
  down('ArrowLeft');
  up('KeyA');
  assert.equal(input.sample().left, true);
  up('ArrowLeft');
  assert.equal(input.sample().left, false);
});

test('a tap that starts and ends between two samples still counts for one sample', () => {
  const { input, down, up } = rig();
  for (const [code, action] of [['Space', 'jump'], ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right']]) {
    down(code);
    up(code);
    assert.equal(input.sample()[action], true, `${action} tap delivered`);
    assert.equal(input.sample()[action], false, `${action} tap delivered once`);
  }
});

test('start, pause and mute are delivered exactly once per press, and key repeat is not a press', () => {
  const { input, down, up } = rig();
  down('Enter');
  down('Enter', { repeat: true });
  assert.equal(input.sample().start, true);
  assert.equal(input.sample().start, false);
  up('Enter');
  down('KeyP');
  up('KeyP');
  assert.equal(input.sample().pause, true);
  assert.equal(input.sample().pause, false);
});

test('losing focus releases everything', () => {
  const { target, input, down } = rig();
  down('ArrowRight');
  down('Space');
  target.dispatchEvent(new Event('blur'));
  const s = input.sample();
  assert.equal(s.right, false);
  assert.equal(s.jump, false);
});

test('every press runs the gesture hook (so audio can resume), not just the first', () => {
  const { input, down, up } = rig();
  let calls = 0;
  input.onGesture(() => { calls++; });
  down('Space'); up('Space');
  down('ArrowLeft'); up('ArrowLeft');
  assert.equal(calls, 2);
});
