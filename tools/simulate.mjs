// Headless playthrough report. Drives the real simulation with scripted
// players and prints, per scene and level: how often each player model clears
// it, how long a clear takes, and what kills them.
//
//   node tools/simulate.mjs                 levels 0-3, 12 seeds (cells run in parallel child processes)
//   node tools/simulate.mjs --levels 0,5,11 --seeds 20
//   node tools/simulate.mjs --scene 2 --trace     one attempt, step by step (--model careful, --seed 3)
//   node tools/simulate.mjs --windows             how many ticks each rope move stays open per swing
//   node tools/simulate.mjs --session --seeds 4   whole games on four lives: how far each model gets

import { createSceneWorld, stepWorld, drainEvents, cloneWorld } from '../src/sim/world.js';
import { GAME, SIM } from '../src/data/tuning.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { MODELS, playScene, IN } from './bots.mjs';
import { runCells } from './cells.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const levels = String(opt('levels', '0,1,2,3')).split(',').map(Number);
const seeds = Number(opt('seeds', 12));
const onlyScene = opt('scene', null);
const scenes = onlyScene ? [Number(onlyScene) - 1] : [0, 1, 2];

// Seeds are fixed per (scene, level, attempt) so every report and test sees the same worlds.
const seedFor = (scene, level, n) => n * 7919 + scene * 31 + level;

// ---------- one cell, for tools/cells.mjs ----------
// --cell scene,level,model,seeds,maxTicks  ->  JSON results on stdout
if (args.includes('--cell')) {
  const [scene, level, model, count, maxTicks] = opt('cell').split(',');
  const results = [];
  for (let n = 1; n <= Number(count); n++) {
    const bot = MODELS[model](n);
    results.push(playScene(createSceneWorld, Number(scene), Number(level), seedFor(Number(scene), Number(level), n), bot, Number(maxTicks) || undefined));
  }
  process.stdout.write(JSON.stringify(results));
  process.exit(0);
}

if (args.includes('--trace')) {
  const scene = scenes[0];
  const level = levels[0];
  const w = createSceneWorld(scene, level, Number(opt('seed', 1)));
  const bot = MODELS[opt('model', 'planner')](Number(opt('seed', 1)));
  let lastAt = '';
  while (w.status === 'playing' && w.tick < 60 * 150) {
    stepWorld(w, bot.act(w));
    drainEvents(w);
    const p = w.player;
    const at = p.state === 'ground' ? w.platforms[p.support].id : p.state === 'rope' ? `rope${p.rope}` : 'air';
    if (at !== lastAt && at !== 'air') {
      console.log(`${(w.tick * SIM.step).toFixed(2).padStart(6)}s  ${at.padEnd(8)} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} stage=${w.stage}`);
      lastAt = at;
    }
  }
  console.log(`=> ${w.status}${w.deathCause ? ` (${w.deathCause})` : ''} at ${(w.tick * SIM.step).toFixed(2)}s, x=${w.player.x.toFixed(1)} y=${w.player.y.toFixed(1)}`);
  process.exit(0);
}


// ---------- whole games ----------
// Plays complete games (four lives, scenes in order, levels rising) and
// reports where each ends. Stops a game that is still alive after level 5.
if (args.includes('--session')) {
  const names = String(opt('models', 'planner,careful,sloppy')).split(',');
  const idle = { left: false, right: false, up: false, down: false, jump: false, start: false };
  console.log(`Whole games on ${GAME.lives} lives (stopped after clearing level 5)\n`);
  console.log('player    seed  ended at         scenes cleared   score    game time');
  for (const name of names) {
    for (let seed = 1; seed <= seeds; seed++) {
      const g = createGame({ seed });
      const bot = MODELS[name](seed);
      let world = null;
      let cleared = 0;
      let lastMode = '';
      let ticks = 0;
      while (g.mode !== 'gameover' && g.level <= 5 && ticks < 60 * 60 * 40) {
        let input = idle;
        if (g.mode === 'play') {
          if (g.world !== world) { bot.reset(); world = g.world; }
          input = { ...idle, ...bot.act(g.world) };
        } else if (g.mode === 'title') {
          input = { ...idle, start: ticks % 2 === 0 };
        }
        stepGame(g, input);
        if (g.world) drainEvents(g.world);
        if (g.events.length) g.events = [];
        if (g.mode === 'clear' && lastMode !== 'clear') cleared++;
        lastMode = g.mode;
        ticks++;
      }
      const where = g.mode === 'gameover' ? `L${g.level} scene ${g.scene + 1}` : 'still alive';
      console.log(`${name.padEnd(9)} ${String(seed).padStart(3)}   ${where.padEnd(16)} ${String(cleared).padStart(6)}        ${String(g.score).padStart(7)}   ${(ticks * SIM.step / 60).toFixed(1)} min`);
    }
  }
  process.exit(0);
}

// ---------- timing windows ----------
// Puts Sammy on a rope (the planner gets him there), then holds on for two
// full swings and asks, tick by tick: if he let go right now, would it work?
if (args.includes('--windows')) {
  const supportOf = (w) => (w.player.state === 'ground' ? w.platforms[w.player.support].id : null);
  const letGo = (world, regrabAfter) => {
    const w = cloneWorld(world);
    for (let k = 0; k < 220 && w.status === 'playing'; k++) {
      stepWorld(w, regrabAfter >= 0 && k >= regrabAfter ? IN.jump : IN.idle);
      drainEvents(w);
      if (w.player.state !== 'air') break;
    }
    return w;
  };
  const moves = [
    { name: 'scene 1 low rope -> left tower', scene: 0, rope: 0, ok: (w) => ['towerL', 'tramp3'].includes(supportOf(letGo(w, -1))) },
    { name: 'scene 1 high rope -> pumpkin platform', scene: 0, rope: 1, ok: (w) => letGo(w, -1).status === 'clear' },
    { name: 'scene 3 rope 1 -> rope 2', scene: 2, rope: 0, ok: (w) => [1, 2, 4, 7, 10].some((gap) => { const r = letGo(w, gap); return r.player.state === 'rope' && r.player.rope === 1; }) },
    { name: 'scene 3 rope 2 -> pumpkin platform', scene: 2, rope: 1, ok: (w) => letGo(w, -1).status === 'clear' },
  ];
  console.log('Rope timing windows at each level (ticks at 60 Hz; "longest" is the widest unbroken window in two swings)\n');
  console.log('move                                    level  longest   open/swing   swing');
  for (const mv of moves) {
    for (const level of levels) {
      const w = createSceneWorld(mv.scene, level, 7919);
      const bot = MODELS.planner(1);
      while (w.status === 'playing' && w.tick < 9000 && !(w.player.state === 'rope' && w.player.rope === mv.rope)) {
        stepWorld(w, bot.act(w));
        drainEvents(w);
      }
      if (w.status !== 'playing') { console.log(`${mv.name.padEnd(40)} ${String(level).padStart(3)}   (planner did not reach the rope: ${w.status})`); continue; }
      const period = Math.round(w.ropes[mv.rope].period / SIM.step);
      let longest = 0;
      let run = 0;
      let open = 0;
      for (let k = 0; k < period * 2 && w.status === 'playing'; k++) {
        if (mv.ok(w)) { run++; open++; longest = Math.max(longest, run); } else run = 0;
        stepWorld(w, IN.jump);
        drainEvents(w);
      }
      console.log(`${mv.name.padEnd(40)} ${String(level).padStart(3)}   ${String(longest).padStart(4)} (${(longest * SIM.step).toFixed(2)}s)   ${String(Math.round(open / 2)).padStart(4)}       ${period}`);
    }
  }
  process.exit(0);
}

const models = String(opt('models', 'planner,careful,sloppy,masher')).split(',');

console.log(`Sammy Lightfoot headless report: ${seeds} attempts per cell\n`);
console.log('scene level player      clears  avg time  bonus left  deaths by cause');
const cells = [];
for (const scene of scenes) for (const level of levels) for (const model of models) cells.push({ scene, level, model, seeds });

function row(cell, results) {
  let clears = 0;
  let clearTicks = 0;
  const causes = {};
  for (const r of results) {
    if (r.status === 'clear') { clears++; clearTicks += r.ticks; }
    else {
      const key = r.status === 'timeout' ? 'timeout' : `${r.cause}`;
      causes[key] = (causes[key] || 0) + 1;
    }
  }
  const avg = clears ? (clearTicks / clears) * SIM.step : NaN;
  const bonus = clears ? Math.max(0, GAME.bonusStart - Math.round(avg / GAME.bonusInterval) * GAME.bonusStep) : 0;
  const deaths = Object.entries(causes).map(([k, v]) => `${k} x${v}`).join(', ') || '-';
  return `  ${cell.scene + 1}     ${String(cell.level).padStart(2)}   ${cell.model.padEnd(10)} ${String(clears).padStart(3)}/${results.length}  ${clears ? `${avg.toFixed(1).padStart(6)}s` : '      -'}  ${String(bonus).padStart(9)}   ${deaths}`;
}

// Cells run in parallel child processes; rows print in order as they complete.
const done = new Array(cells.length);
let printed = 0;
let retries = 0;
await runCells(cells, {
  onDone(i, value) {
    done[i] = value;
    retries += value.retries;
    while (printed < cells.length && done[printed]) {
      console.log(row(cells[printed], done[printed].results));
      printed++;
      if (printed < cells.length && cells[printed].scene !== cells[printed - 1].scene) console.log('');
    }
  },
});
if (retries) console.log(`\n(${retries} cell${retries > 1 ? 's were' : ' was'} re-run after the Node process crashed; results are deterministic, so the numbers are unaffected)`);
