import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, nextLevel } from '../src/sim/game.js';
import { GAME, SIM } from '../src/data/tuning.js';

const IDLE = Object.freeze({ left: false, right: false, up: false, down: false, jump: false, start: false });
const inp = (o = {}) => ({ ...IDLE, ...o });
const secs = (s) => Math.round(s / SIM.step);

function run(g, input, ticks) {
  for (let i = 0; i < ticks; i++) stepGame(g, input);
}
function runUntil(g, input, pred, max = 60 * 60) {
  for (let i = 0; i < max; i++) {
    if (pred(g)) return i;
    stepGame(g, input);
  }
  throw new Error(`game never reached the expected state (mode ${g.mode})`);
}
// A tap: one tick down, one tick up.
function tap(g, key = 'jump') {
  stepGame(g, inp({ [key]: true }));
  stepGame(g, IDLE);
}
function startPlaying(g) {
  tap(g, 'start');
  runUntil(g, IDLE, (x) => x.mode === 'play');
}
// Test-only pokes: end the current attempt without playing it.
const die = (g) => { g.world.status = 'dead'; g.world.deathCause = 'ball'; };
const clear = (g) => { g.world.status = 'clear'; };

test('a new game waits on the title screen', () => {
  const g = createGame();
  run(g, IDLE, 120);
  assert.equal(g.mode, 'title');
  assert.equal(g.world, null);
});

test('start shows the scene card, then play begins at scene 1, level 0, with four lives and a full bonus', () => {
  const g = createGame();
  tap(g, 'start');
  assert.equal(g.mode, 'card');
  runUntil(g, IDLE, (x) => x.mode === 'play');
  assert.equal(g.scene, 0);
  assert.equal(g.level, 0);
  assert.equal(g.lives, GAME.lives);
  assert.equal(g.lives, 4);
  assert.equal(g.bonus, GAME.bonusStart);
  assert.equal(g.score, 0);
  assert.equal(g.world.scene, 0);
});

test('the jump button also starts the game', () => {
  const g = createGame();
  tap(g, 'jump');
  assert.equal(g.mode, 'card');
});

test('the bonus falls about 100 points a second while playing', () => {
  const g = createGame();
  startPlaying(g);
  g.world.spawners = []; // keep Sammy alive while the clock runs
  run(g, IDLE, secs(5));
  const expected = GAME.bonusStart - (5 / GAME.bonusInterval) * GAME.bonusStep;
  assert.ok(Math.abs(g.bonus - expected) <= GAME.bonusStep, `bonus ${g.bonus}, expected about ${expected}`);
  assert.equal(GAME.bonusStep / GAME.bonusInterval, 100);
});

test('the bonus stops at zero and running out does not kill', () => {
  const g = createGame();
  startPlaying(g);
  g.world.spawners = [];
  g.bonus = 30;
  run(g, IDLE, secs(2));
  assert.equal(g.bonus, 0);
  assert.equal(g.mode, 'play');
  assert.equal(g.world.status, 'playing');
});

test('a button still held when play begins does not make Sammy jump', () => {
  // held from the title, straight through the card
  const a = createGame();
  stepGame(a, inp({ jump: true }));
  runUntil(a, inp({ jump: true }), (x) => x.mode === 'play');
  run(a, inp({ jump: true }), 5);
  assert.equal(a.world.player.state, 'ground');
  // the press that skips a retry card, with a direction held (scene 2: a jump here lands in the pit)
  const b = createGame();
  startPlaying(b);
  b.scene = 1;
  die(b);
  stepGame(b, IDLE);
  runUntil(b, IDLE, (x) => x.mode === 'card');
  run(b, IDLE, secs(0.5));
  runUntil(b, inp({ jump: true, left: true }), (x) => x.mode === 'play');
  run(b, inp({ jump: true, left: true }), 6);
  assert.equal(b.world.player.state, 'ground', 'the card-skipping press must not become a jump');
  // once released, the button works again
  stepGame(b, inp({ left: true }));
  stepGame(b, inp({ jump: true, left: true }));
  assert.equal(b.world.player.state, 'air');
});

test('the scene card never shows a stale bonus', () => {
  const g = createGame();
  startPlaying(g);
  run(g, IDLE, secs(4));
  die(g);
  stepGame(g, IDLE);
  runUntil(g, IDLE, (x) => x.mode === 'card');
  assert.equal(g.bonus, GAME.bonusStart);
});

test('dying costs a life and restarts the same scene with a full bonus', () => {
  const g = createGame();
  startPlaying(g);
  run(g, IDLE, secs(3));
  const firstWorld = g.world;
  die(g);
  stepGame(g, IDLE);
  assert.equal(g.mode, 'dying');
  runUntil(g, IDLE, (x) => x.mode === 'play');
  assert.equal(g.lives, GAME.lives - 1);
  assert.equal(g.scene, 0);
  assert.equal(g.level, 0);
  assert.equal(g.bonus, GAME.bonusStart);
  assert.notEqual(g.world, firstWorld);
  assert.equal(g.world.status, 'playing');
  assert.equal(g.score, 0, 'no points for dying');
});

test('losing the last life ends the game', () => {
  const g = createGame();
  startPlaying(g);
  for (let life = 0; life < GAME.lives; life++) {
    runUntil(g, IDLE, (x) => x.mode === 'play');
    die(g);
    stepGame(g, IDLE);
  }
  runUntil(g, IDLE, (x) => x.mode === 'gameover');
  assert.equal(g.lives, 0);
});

test('clearing a scene banks exactly the remaining bonus, and that is the only way to score', () => {
  const g = createGame();
  startPlaying(g);
  run(g, IDLE, secs(2));
  const bonusAtClear = g.bonus;
  clear(g);
  stepGame(g, IDLE);
  assert.equal(g.mode, 'clear');
  assert.equal(g.score, 0, 'nothing is banked until the tally');
  runUntil(g, IDLE, (x) => x.mode === 'card');
  assert.equal(g.score, bonusAtClear);
  assert.equal(g.bonus, GAME.bonusStart, 'the card shows the next scene\'s full bonus, not the drained one');
  assert.equal(g.scene, 1);
  assert.equal(g.level, 0);
  assert.equal(g.lives, GAME.lives, 'no extra lives, none lost');
});

test('after scene 3 the game returns to scene 1 one level higher', () => {
  const g = createGame();
  startPlaying(g);
  for (let s = 0; s < 3; s++) {
    runUntil(g, IDLE, (x) => x.mode === 'play');
    assert.equal(g.scene, s);
    assert.equal(g.world.scene, s);
    clear(g);
    stepGame(g, IDLE);
  }
  runUntil(g, IDLE, (x) => x.mode === 'play');
  assert.equal(g.scene, 0);
  assert.equal(g.level, 1);
  assert.equal(g.world.level, 1);
});

test('levels run 0 to 11 and then loop back to 6', () => {
  assert.equal(nextLevel(0), 1);
  assert.equal(nextLevel(10), 11);
  assert.equal(nextLevel(GAME.maxLevel), GAME.loopLevel);
  assert.equal(nextLevel(11), 6);
});

test('there are no extra lives however high the score', () => {
  const g = createGame();
  startPlaying(g);
  for (let i = 0; i < 12; i++) {
    runUntil(g, IDLE, (x) => x.mode === 'play');
    clear(g);
    stepGame(g, IDLE);
  }
  runUntil(g, IDLE, (x) => x.mode === 'play');
  assert.ok(g.score > 100000);
  assert.equal(g.lives, GAME.lives);
});

function playToGameOver(g, scenesCleared) {
  startPlaying(g);
  for (let i = 0; i < scenesCleared; i++) {
    runUntil(g, IDLE, (x) => x.mode === 'play');
    clear(g);
    stepGame(g, IDLE);
  }
  for (let life = 0; life < GAME.lives; life++) {
    runUntil(g, IDLE, (x) => x.mode === 'play');
    die(g);
    stepGame(g, IDLE);
  }
  runUntil(g, IDLE, (x) => x.mode === 'gameover');
}

test('a score that makes the table asks for three initials and is saved in order', () => {
  const g = createGame({ hiScores: [{ name: 'AAA', score: 50000, level: 2 }, { name: 'BBB', score: 100, level: 0 }] });
  playToGameOver(g, 1);
  const score = g.score;
  assert.ok(score > 100 && score < 50000);
  runUntil(g, IDLE, (x) => x.mode === 'entry');
  // First letter: up once from A gives B. Confirm. Second: leave A. Third: down once from A gives Z.
  tap(g, 'up'); tap(g, 'jump');
  tap(g, 'jump');
  tap(g, 'down'); tap(g, 'jump');
  assert.equal(g.mode, 'title');
  assert.deepEqual(g.hiScores.map((h) => h.name), ['AAA', 'BAZ', 'BBB']);
  assert.equal(g.hiScores[1].score, score);
  assert.equal(g.scoresDirty, true, 'the shell is told to save the table');
});

test('a zero score skips the initials and goes back to the title', () => {
  const g = createGame();
  playToGameOver(g, 0);
  runUntil(g, IDLE, (x) => x.mode === 'title');
  assert.equal(g.hiScores.length, 0);
});

test('the table keeps only the top GAME.scoreSlots scores', () => {
  const full = Array.from({ length: GAME.scoreSlots }, (_, i) => ({ name: 'CPU', score: 90000 - i * 1000, level: 1 }));
  const g = createGame({ hiScores: full });
  playToGameOver(g, 1); // one scene: under 10000, below every table entry
  runUntil(g, IDLE, (x) => x.mode === 'title');
  assert.equal(g.hiScores.length, GAME.scoreSlots);
  assert.ok(g.hiScores.every((h) => h.name === 'CPU'));
});

test('the same seed and inputs replay the same game', () => {
  const script = (i) => inp({ start: i === 5, right: i % 80 < 30, left: i % 80 > 60, jump: i % 31 < 5 });
  const a = createGame({ seed: 9 });
  const b = createGame({ seed: 9 });
  for (let i = 0; i < 60 * 40; i++) { stepGame(a, script(i)); stepGame(b, script(i)); }
  assert.deepEqual(a, b);
  assert.notEqual(a.mode, 'title');
});
