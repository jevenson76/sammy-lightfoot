// The session around the scenes: title, scene card, play, death, clear,
// bonus tally, game over, initials. Like the worlds it owns, a game is plain
// data advanced one fixed tick at a time.
//
//   title --start/jump--> card --> play --dead--> dying --> card (retry) | gameover
//                                   play --clear--> clear --> tally --> card (next scene)
//   gameover --> entry (if the score makes the table) --> title

import { SIM, GAME } from '../data/tuning.js';
import { SCENE_COUNT } from '../data/scenes.js';
import { createSceneWorld, stepWorld } from './world.js';

const DT = SIM.step;
const A = 65;

export function nextLevel(level) {
  return level < GAME.maxLevel ? level + 1 : GAME.loopLevel;
}

export function createGame({ seed = 1, hiScores = [] } = {}) {
  return {
    mode: 'title',
    timer: 0,             // counts down in timed modes
    modeT: 0,             // time spent in the current mode (for animation)
    seed,
    attempt: 0,           // worlds built so far: feeds each world's seed
    score: 0,
    lives: GAME.lives,
    level: 0,
    scene: 0,
    bonus: GAME.bonusStart,
    bonusT: 0,
    world: null,
    retry: false,         // the card is a restart after a death
    hiScores: hiScores.map((h) => ({ ...h })),
    scoresDirty: false,   // the shell saves the table when this is set, then clears it
    entry: null,          // { letters: [0..25 x3], pos }
    lastRank: -1,         // where the last game landed in the table
    events: [],
    prev: { jump: false, start: false, up: false, down: false, left: false, right: false },
  };
}

function setMode(g, mode, timer = 0) {
  g.mode = mode;
  g.timer = timer;
  g.modeT = 0;
}

function showCard(g, retry) {
  g.retry = retry;
  g.world = null;
  g.bonus = GAME.bonusStart;   // the card shows the bonus the scene will start with
  setMode(g, 'card', retry ? GAME.retryTime : GAME.cardTime);
  g.events.push(retry ? 'retry' : 'card');
}

function beginScene(g, input) {
  g.attempt++;
  g.world = createSceneWorld(g.scene, g.level, (g.seed * 7919 + g.attempt * 104729) >>> 0);
  // A button that is already down (it skipped the card, or was never let go)
  // is not a fresh press: Sammy must not jump on the first tick.
  g.world.player.jumpHeld = !!input.jump;
  g.bonus = GAME.bonusStart;
  g.bonusT = 0;
  setMode(g, 'play');
}

function qualifies(g) {
  if (g.score <= 0) return false;
  if (g.hiScores.length < GAME.scoreSlots) return true;
  return g.score > g.hiScores[g.hiScores.length - 1].score;
}

function saveScore(g) {
  const name = g.entry.letters.map((c) => String.fromCharCode(A + c)).join('');
  const row = { name, score: g.score, level: g.level };
  let i = 0;
  while (i < g.hiScores.length && g.hiScores[i].score >= g.score) i++;
  g.hiScores.splice(i, 0, row);
  if (g.hiScores.length > GAME.scoreSlots) g.hiScores.pop();
  g.lastRank = i;
  g.scoresDirty = true;
  g.entry = null;
}

export function stepGame(g, input) {
  const prev = g.prev;
  const pressJump = input.jump && !prev.jump;
  const pressStart = !!input.start && !prev.start;
  const pressUp = !!input.up && !prev.up;
  const pressDown = !!input.down && !prev.down;
  const pressLeft = input.left && !prev.left;
  const pressRight = input.right && !prev.right;
  prev.jump = input.jump; prev.start = !!input.start;
  prev.up = !!input.up; prev.down = !!input.down;
  prev.left = input.left; prev.right = input.right;
  const go = pressJump || pressStart;
  g.modeT += DT;

  switch (g.mode) {
    case 'title':
      if (go) {
        g.score = 0;
        g.lives = GAME.lives;
        g.level = 0;
        g.scene = 0;
        g.lastRank = -1;
        g.events.push('start');
        showCard(g, false);
      }
      break;

    case 'card':
      g.timer -= DT;
      if (g.timer <= 0 || (go && g.modeT >= GAME.cardSkip)) beginScene(g, input);
      break;

    case 'play': {
      const w = g.world;
      stepWorld(w, input);
      if (w.status === 'dead') {
        setMode(g, 'dying', GAME.deathTime);
      } else if (w.status === 'clear') {
        setMode(g, 'clear', GAME.clearTime);
      } else if (g.bonus > 0) {
        g.bonusT += DT;
        while (g.bonusT >= GAME.bonusInterval && g.bonus > 0) {
          g.bonusT -= GAME.bonusInterval;
          g.bonus = Math.max(0, g.bonus - GAME.bonusStep);
          if (g.bonus === 1000) g.events.push('timeLow');
        }
      }
      break;
    }

    case 'dying':
      g.timer -= DT;
      if (g.timer <= 0) {
        g.lives--;
        if (g.lives <= 0) {
          g.events.push('gameover');
          setMode(g, 'gameover', GAME.gameOverTime);
        } else {
          showCard(g, true);
        }
      }
      break;

    case 'clear':
      g.timer -= DT;
      if (g.timer <= 0) setMode(g, 'tally', GAME.tallyHold);
      break;

    case 'tally':
      if (g.bonus > 0) {
        const chunk = Math.min(g.bonus, Math.max(GAME.bonusStep, Math.round((GAME.tallyRate * DT) / GAME.bonusStep) * GAME.bonusStep));
        g.bonus -= chunk;
        g.score += chunk;
        g.events.push('tally');
      } else {
        g.timer -= DT;
        if (g.timer <= 0) {
          g.scene++;
          if (g.scene >= SCENE_COUNT) {
            g.scene = 0;
            g.level = nextLevel(g.level);
          }
          showCard(g, false);
        }
      }
      break;

    case 'gameover':
      g.timer -= DT;
      if (g.timer <= 0 || (go && g.modeT >= 1)) {
        g.world = null;
        if (qualifies(g)) {
          g.entry = { letters: [0, 0, 0], pos: 0 };
          setMode(g, 'entry');
        } else {
          setMode(g, 'title');
        }
      }
      break;

    case 'entry': {
      const e = g.entry;
      if (pressUp || pressRight) e.letters[e.pos] = (e.letters[e.pos] + 1) % 26;
      if (pressDown || pressLeft) e.letters[e.pos] = (e.letters[e.pos] + 25) % 26;
      if (go) {
        e.pos++;
        g.events.push('pickup');
        if (e.pos >= 3) {
          saveScore(g);
          setMode(g, 'title');
        }
      }
      break;
    }

    default:
      break;
  }
}
