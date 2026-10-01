// Scene layouts. Coordinates were read off Apple II screenshots of the
// original (280x192), then nudged where the route needed a pixel or two.
// Platform y is the walking surface; x/w is the walkable span.

import { BLOCK, CARPET, difficulty } from './tuning.js';

export const SCENE_COUNT = 3;

// Scene 2 elevator stops.
export const STOPS = { bottom: 172, mid: 121, top: 30 };

const CARPET_COLS = 4;                       // cells between the elevators
const CARPET_ROWS = 4;
const CARPET_LEFT = 30;                      // flush against the left elevator (x 1-29)

// Turns a direction string into waypoints. Each letter moves one cell; a move
// that would leave the grid is skipped; the path is then completed to the
// top-left cell. Consecutive moves in the same direction merge into one leg.
export function buildCarpetPath(seq) {
  let col = CARPET_COLS;
  let row = 0;
  const cells = [[col, row]];
  const step = { D: [0, 1], U: [0, -1], L: [-1, 0], R: [1, 0] };
  for (const ch of seq) {
    const [dc, dr] = step[ch];
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc > CARPET_COLS || nr < 0 || nr > CARPET_ROWS) continue;
    col = nc; row = nr;
    cells.push([col, row]);
  }
  while (col > 0) { col--; cells.push([col, row]); }
  while (row > 0) { row--; cells.push([col, row]); }

  const toPoint = ([c, r]) => ({ x: CARPET_LEFT + c * CARPET.cellX, y: STOPS.top + r * CARPET.cellY });
  const path = [toPoint(cells[0])];
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    const next = cells[i + 1];
    const sameDir = next && next[0] - cur[0] === cur[0] - prev[0] && next[1] - cur[1] === cur[1] - prev[1];
    if (!sameDir) path.push(toPoint(cur));
  }
  return path;
}

function scene1(level) {
  const d = difficulty(level);
  const spawners = [{ x: 7, y: 10, dir: 1 }];
  if (d.ballFromRight) spawners.push({ x: 245, y: 10, dir: -1 });
  return {
    scene: 0,
    logic: 'scene1',
    start: { x: 221, y: 178, facing: 1 },
    platforms: [
      { id: 'floor', kind: 'floor', x: 0, y: 178, w: 252, h: 2 },
      { id: 'towerL', kind: 'tower', x: 2, y: 121, w: 48 },
      { id: 'towerC', kind: 'tower', x: 98, y: 121, w: 50 },
      { id: 'pole', kind: 'pole', x: 205, y: 131, w: 47, extra: { chevronX: 225 } },
      { id: 'upperL', x: 0, y: 70, w: 84 },
      { id: 'upperR', x: 106, y: 70, w: 146, extra: { pad: true, padX: 209, padW: 20, padPressed: false } },
      { id: 'goal', kind: 'perch', x: 190, y: 40, w: 48, goal: true },
    ],
    trampolines: [
      { id: 'tramp1', x: 232, y: 178, w: 20 },
      { id: 'tramp2', x: 176, y: 178, w: 20 },
      { id: 'tramp3', x: 2, y: 121, w: 20 },
    ],
    ropes: [
      { id: 'ropeLow', x: 75, y: 78, len: 26, amp: 0.75, period: 2.0 },
      { id: 'ropeHigh', x: 141, y: 2, len: 38, amp: 1.0, period: 2.0, active: false },
    ],
    spawners,
    firstBall: 1.5,
    pumpkin: { platform: 'goal' },
  };
}

function scene2(level) {
  const d = difficulty(level);
  const range = BLOCK.bottom - BLOCK.top;
  const blocks = BLOCK.speeds.map((speed, i) => {
    const cyc = BLOCK.phases[i] * 2;
    const down = cyc < 1;
    return {
      id: `b${i + 1}`, kind: 'block', x: 42 + 28 * i, w: BLOCK.w, h: BLOCK.h,
      y: down ? BLOCK.top + cyc * range : BLOCK.bottom - (cyc - 1) * range,
      extra: { dir: down ? 1 : -1, speed: speed * d.blockSpeedScale, lethalBody: true },
    };
  });
  return {
    scene: 1,
    logic: 'scene2',
    start: { x: 232, y: STOPS.bottom, facing: -1 },
    platforms: [
      { id: 'p1', kind: 'vanish', x: 42, y: STOPS.bottom, w: 27, extra: { blink: false } },
      { id: 'p2', kind: 'vanish', x: 84, y: STOPS.bottom, w: 27, extra: { blink: false } },
      { id: 'p3', kind: 'vanish', x: 126, y: STOPS.bottom, w: 27, extra: { blink: false } },
      { id: 'p4', kind: 'vanish', x: 168, y: STOPS.bottom, w: 27, extra: { blink: false } },
      { id: 'elevL', kind: 'elevator', x: 1, y: STOPS.bottom, w: 28, armed: true, extra: { targetY: STOPS.bottom } },
      { id: 'elevR', kind: 'elevator', x: 211, y: STOPS.bottom, w: 42, extra: { targetY: STOPS.bottom } },
      ...blocks,
      { id: 'carpet', kind: 'carpet', x: CARPET_LEFT + CARPET_COLS * CARPET.cellX, y: STOPS.top, w: CARPET.w, h: 4, active: false },
    ],
    stops: { mid: STOPS.mid, top: STOPS.top },
    vanish: { ids: ['p1', 'p2', 'p3', 'p4'], order: d.vanishOrder, warn: d.vanishWarn, gap: d.vanishGap },
    carpet: { platform: 'carpet', path: buildCarpetPath(d.carpetPath), speed: d.carpetSpeed, pause: d.carpetPause },
  };
}

const S3 = { floor: 172, roof: 127, top: 58, ceiling: 88 };
const PLUNGER_X = [44, 68, 92, 116, 140, 56, 32, 80, 128]; // in the order levels add them

function scene3(level) {
  const d = difficulty(level);
  const box = { floor: S3.floor, x0: 24, x1: 166, height: 30 };
  const boxBalls = [{ x: 120, dir: -1, speed: d.boxBallSpeed, phase: 0, ...box }];
  if (d.boxBalls >= 3) {
    // the documented synchronised pair
    boxBalls.push({ x: 60, dir: 1, speed: d.boxBallSpeed, phase: 0.5, ...box });
    boxBalls.push({ x: 84, dir: 1, speed: d.boxBallSpeed, phase: 0.5, ...box });
  }
  if (d.boxBalls >= 4) boxBalls.push({ x: 145, dir: -1, speed: d.boxBallSpeed * 0.8, phase: 0.25, ...box });
  if (d.corridorBall) {
    boxBalls.push({ x: 30, dir: 1, speed: d.boxBallSpeed * 0.7, phase: 0, floor: S3.roof, x0: 26, x1: 164, height: 0 });
  }
  const plungers = PLUNGER_X.slice(0, d.plungerCount).map((x, i) => ({
    x,
    period: (2.0 + 0.3 * (i % 3)) * d.plungerPeriodScale,
    phase: (i * 0.37) % 1,
  }));
  return {
    scene: 2,
    logic: 'scene3',
    start: { x: 10, y: S3.floor, facing: 1 },
    platforms: [
      { id: 'floor', kind: 'boxfloor', x: 0, y: S3.floor, w: 168 },
      { id: 'roof', kind: 'girder', x: 22, y: S3.roof, w: 146 },
      { id: 'elevR', kind: 'elevator', x: 183, y: S3.floor, w: 40, armed: true, extra: { targetY: S3.floor } },
      { id: 'elevL', kind: 'elevator', x: 0, y: S3.roof, w: 20, extra: { targetY: S3.roof } },
      { id: 'goal', kind: 'perch', x: 175, y: 55, w: 42, goal: true },
    ],
    ropes: [
      // "The left rope swings a little faster than the right." The periods are
      // 3:4 so the pair comes back into step every four swings of the left
      // rope. With this starting phase two swings in every four offer a
      // transfer window of 13 and 17 ticks; the wait is never more than two swings.
      { id: 'rope1', x: 61, y: 2, len: 40, amp: 0.6, period: 1.8 },
      { id: 'rope2', x: 137, y: 2, len: 42, amp: 0.9, period: 2.4, phase: 0.75 * Math.PI },
    ],
    stops: { mid: S3.roof, top: S3.top },
    fire: { x0: 22, x1: 168, y0: 64, y1: 80 },
    plungers: { top: S3.ceiling, list: plungers },
    boxBalls,
    pumpkin: { platform: 'goal' },
  };
}

export function buildScene(index, level) {
  if (index === 0) return scene1(level);
  if (index === 1) return scene2(level);
  return scene3(level);
}
