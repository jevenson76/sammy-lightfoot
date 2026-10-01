// Browser shell: wires input, the fixed-step loop, the simulation, the view
// and sound together. Everything that touches the clock, the DOM or storage
// lives here, outside src/sim.

import { startLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createScreen } from './render/screen.js';
import { createView } from './render/view.js';
import { createGame, stepGame } from './sim/game.js';
import { drainEvents } from './sim/world.js';
import { SCENE_COUNT } from './data/scenes.js';

const SCORES_KEY = 'sammy-lightfoot-scores-v1';

function loadScores() {
  try {
    const rows = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.score)) : [];
  } catch {
    return [];
  }
}
function saveScores(rows) {
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(rows)); } catch { /* private mode: scores last for the session */ }
}

// World event -> sound name (anything missing is silent).
const WORLD_SFX = {
  jump: 'jump', land: 'land', bounce: 'bounce', grab: 'grab', release: 'release',
  die: 'hit', clear: 'goal', warn: 'warn', vanish: 'release', appear: 'pickup',
  elevator: 'pickup', arrive: 'land', pad: 'pickup', ropeStart: 'grab',
  ballSpawn: 'warn', ballBounce: 'land', carpet: 'pickup', carpetDone: 'land', blocksGone: 'release',
};
const GAME_SFX = {
  card: 'start', retry: 'pickup', tally: 'tally',
  gameover: 'gameover', timeLow: 'timeLow', pickup: 'pickup',
};

const params = new URLSearchParams(location.search);
const debug = params.has('debug');

const canvas = document.getElementById('screen');
const screen = createScreen(canvas);
const view = createView(screen.ctx);
const input = createInput(window);
const audio = createAudio();
input.onGesture(() => audio.unlock());   // every press: creates the audio context, or resumes a suspended one

const game = createGame({ seed: (Date.now() & 0xffffff) || 1, hiScores: loadScores() });
let paused = false;
let stepClock = 0;
let deathSung = false;

// ?scene=2&level=3 starts there (for practice and for the smoke test).
const startScene = Math.min(SCENE_COUNT, Math.max(1, Number(params.get('scene')) || 1)) - 1;
const startLevel = Math.max(0, Number(params.get('level')) || 0);

for (const el of document.querySelectorAll('[data-action]')) input.bindButton(el, el.dataset.action);

// ?demo=planner (or careful, sloppy, masher): a scripted player from the test
// harness plays the real game. ?speed=4 runs the simulation four ticks a frame.
let demoBot = null;
let demoWorld = null;
if (params.has('demo')) {
  const { MODELS } = await import('../tools/bots.mjs');
  demoBot = (MODELS[params.get('demo')] || MODELS.planner)(1);
}
const speed = Math.min(16, Math.max(1, Number(params.get('speed')) || 1));
const demoInput = { left: false, right: false, up: false, down: false, jump: false, start: false, pause: false, mute: false };

function demoStep(inp) {
  demoInput.left = demoInput.right = demoInput.jump = demoInput.start = false;
  demoInput.pause = inp.pause;
  demoInput.mute = inp.mute;
  if (game.mode === 'play') {
    if (game.world !== demoWorld) { demoBot.reset(); demoWorld = game.world; }
    const b = demoBot.act(game.world);
    demoInput.left = b.left; demoInput.right = b.right; demoInput.jump = b.jump;
  } else if (game.mode === 'title' || game.mode === 'entry') {
    demoInput.start = Math.floor(game.modeT * 4) % 2 === 1; // tap start
  }
  return demoInput;
}

function update() {
  for (let i = 0; i < speed; i++) tick();
}

function tick() {
  let inp = input.sample();
  if (inp.mute) audio.toggleMute();
  if (inp.pause && game.mode === 'play') paused = !paused;
  if (paused) return;
  if (demoBot) inp = demoStep(inp);

  const wasTitle = game.mode === 'title';
  stepGame(game, inp);
  if (wasTitle && game.mode === 'card') {
    game.scene = startScene;
    game.level = startLevel;
  }

  for (const name of game.events) audio.play(GAME_SFX[name]);
  if (game.events.length) game.events = [];

  const w = game.world;
  if (w) {
    for (const name of drainEvents(w)) {
      audio.play(WORLD_SFX[name]);
      view.onEvent(name, w);
    }
    // footsteps: the "squip" of the original, one per stride
    const p = w.player;
    if (game.mode === 'play' && p.state === 'ground' && p.walkT > 0) {
      stepClock += 1;
      if (stepClock % 9 === 0) audio.play('step');
    } else {
      stepClock = 0;
    }
  }
  // the falling melody starts once the hit-stop is over
  if (game.mode === 'dying') {
    if (!deathSung && game.modeT > 0.1) { audio.play('die'); deathSung = true; }
  } else {
    deathSung = false;
  }

  if (game.scoresDirty) {
    saveScores(game.hiScores);
    game.scoresDirty = false;
  }
  view.tick();
}

function render() {
  view.draw(game, paused);
  screen.present(view.shakeX, view.shakeY);
}

startLoop(update, render);

if (debug) {
  // ?debug=1: N skips the scene, K kills Sammy; state is on window.__sammy.
  window.__sammy = { game, view };
  window.addEventListener('keydown', (e) => {
    if (!game.world || game.mode !== 'play') return;
    if (e.code === 'KeyN') game.world.status = 'clear';
    if (e.code === 'KeyK') { game.world.status = 'dead'; game.world.deathCause = 'ball'; }
  });
}
