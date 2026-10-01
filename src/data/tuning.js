// Every tunable in the game lives here, one table per system. Coordinates are
// in the 280x192 back buffer; speeds are px/s; times are seconds.
// Intent for the whole game: Sammy is an acrobat, not a fighter. Every hazard
// is a timing problem the player can read before committing to a jump.

export const SIM = {
  step: 1 / 60,      // fixed tick; the sim never sees any other dt
  left: 5,           // playfield walls for Sammy's centre (original used x 0-252)
  right: 247,
  killY: 196,        // feet below this = fell out of the scene
};

// Intent: a jump is a commitment. Direction is chosen at takeoff and cannot
// be changed in the air, exactly like the original.
export const PLAYER = {
  height: 20,        // sprite height; the scale every other number is judged against
  walkSpeed: 60,     // crosses the 252 px playfield in 4.2 s
  jumpHeight: 24,    // 1.2x his own height: clears an 11 px ball with 13 px to spare
  jumpTime: 0.5,     // level-ground airtime -> 30 px of travel, twice the 15 px scene-2 gaps
  lethalFall: 56,    // apex-to-landing drop that kills: a full pump off a floor mat (43+12) lives, a jump off a tier (24+47) dies
  buffer: 0.1,       // a press up to 6 ticks early still jumps on landing
  coyote: 0.08,      // a press up to 5 ticks after leaving a ledge still jumps
  footTol: 3,        // px his centre may overhang a platform edge
  // Hurtbox is lenient like the original: 6 px wide, hair (top 3 px) and soles are free.
  hurtHalfW: 3,
  hurtTop: 17,       // px above the feet
  hurtBottom: 1,
};
export const GRAVITY = (8 * PLAYER.jumpHeight) / (PLAYER.jumpTime * PLAYER.jumpTime); // 768
export const JUMP_V = (4 * PLAYER.jumpHeight) / PLAYER.jumpTime;                        // 192

// Intent: trampolines reward holding the button; a drop from above is a launch.
export const TRAMPOLINE = {
  height: 12,        // mat sits this far above its floor (half Sammy's jump)
  boost: 1.28,       // held: speed gain per bounce -> 3 bounces from a floor jump to clear 35 px
  chainMax: 257,     // held-chain ceiling (43 px): reaches a 39 px ledge, not the 45 px centre tower
  dropBoost: 1.2,    // held, arriving faster than chainMax (a drop from a platform)
  launchMax: 375,    // hard cap (91.5 px): apex stays below the upper girder, and the 47 px drop to the tower is safe
  damp: 0.75,        // not held: each bounce keeps 75% of its speed
  settle: 90,        // below this rebound speed he just stands on the mat
};

// Intent: ropes are a rhythm. Hold to grab, release on the forward swing.
export const ROPE = {
  grabRadius: 6,     // px from his chest to the rope line; about his half-width plus 1
  gripInset: 6,      // hands sit this far above the rope's end
  hang: 16,          // hands-to-feet when hanging (arms up shortens him from 20)
  releaseVx: 60,     // hop added in the swing direction: equals walkSpeed, so a release is "a jump off"
  releaseVy: 120,    // upward hop: 9 px, enough to clear a platform lip
  regrab: 0.5,       // s before the same rope can be caught again (shorter than any swing half-period)
};

// Intent: balls are the clock of scene 1. Rolling = jump it, bouncing = walk under it.
export const BALL = {
  radius: 5,         // 11 px tall: under half the jump height
  hurtRadius: 4,
  spawnHold: 0.7,    // s it hangs blinking at the corner before dropping (reaction 0.25 + plan)
  bounceHeight: 32,  // apex clearance: Sammy (hurt top 17) fits under the top 40% of the arc
};

export const PUMPKIN = {
  w: 14, h: 10,
  hurtHalfW: 5, hurtH: 8,
};

// Scene 2
export const VANISH = {
  offTime: 2.0,      // s a platform stays gone
};
export const BLOCK = {
  w: 14, h: 9,
  top: 80,           // highest position of a block's top edge
  bottom: 151,       // lowest: its underside (160) reaches 8 px into a standing Sammy on the bottom row
  speeds: [26, 34, 22, 30, 38, 24],     // px/s per block: none shares a period with a neighbour
  phases: [0.1, 0.55, 0.8, 0.3, 0.95, 0.45], // starting point in each block's cycle (0-1)
};
export const ELEVATOR = {
  speed: 34,         // px/s: bottom->mid in 1.5 s, mid->top in 2.7 s
};
export const CARPET = {
  w: 28,             // wider than the 6 px foot tolerance x2: room to drift before falling
  cellX: 38,         // 4 cells span the gap between the elevators
  cellY: 27,         // 2 cells = "down half the screen"
  cornerPause: 0.35, // s the carpet stops at each corner: the telegraph for the next leg
};

// Scene 3
export const BOXBALL = {
  radius: 1.5,       // the box balls are 3 px dots
  hurtRadius: 2,
  bounceHeight: 30,  // Sammy (hurt top 17) fits under the upper part of the arc
  period: 1.0,       // s per bounce
};
export const PLUNGER = {
  w: 3,
  minLen: 8,         // retracted: bottom edge 15 px above Sammy's hair
  maxLen: 34,        // extended: 11 px into his hurtbox
};

// Game rules (all from the original)
export const GAME = {
  lives: 4,
  bonusStart: 9990,
  bonusStep: 10,       // points removed per bonus tick
  bonusInterval: 0.1,  // s between ticks -> 100 points per second
  maxLevel: 11,        // Apple II: levels 0-11...
  loopLevel: 6,        // ...then back to 6
  cardTime: 2.0,       // "SCENE n / LEVEL n" card
  retryTime: 1.0,      // shorter card when restarting a scene after a death
  cardSkip: 0.4,       // s before a press can skip a card
  deathTime: 2.2,      // hair-spin
  hitStop: 0.08,       // freeze on the fatal frame
  clearTime: 1.8,      // victory dance before the tally
  tallyRate: 6000,     // bonus points banked per second during the tally
  tallyHold: 0.7,      // s the finished tally stays on screen
  gameOverTime: 3.0,
  scoreSlots: 10,
};

// Scene 2 vanish order per level, platforms numbered left to right (documented).
export const VANISH_ORDER = [
  [1, 2, 3, 4], [4, 3, 2, 1], [1, 4, 2, 3], [3, 2, 4, 1], [1, 3, 2, 4],
  [4, 2, 3, 1], [1, 2, 3, 4], [4, 3, 2, 1], [1, 2, 3, 4], [4, 3, 2, 1],
];

// Carpet direction sequences per level (documented). Level 0 is written out
// in cells: down half the screen, left across, up.
export const CARPET_PATHS = [
  'DDLLLLUU',
  'DLDLURUL',
  'DRDLULDLURULU',
  'LDRURDLDLURULDLURUL',
  'DLRDURLULDRLDRDLDLULDLURULURULUDLRDLDLURDLU',
  'DRDLURDLURDRULDRULDRULULDRUL',
  'DRDLDRLDLULRULULDLDLDLDRURULUDLURUDRURLUL',
  'LRDLDRULURLULDLDRULRU',
  'DRDLRLURURLDLDRLDRULULU',
  'DLULRDLUDRDULDLRUDRUDLURLDLULUDLURLURU',
];

// Everything that changes with the level number. Levels past the tables reuse
// the last entry; speeds stop growing at maxLevel.
export function difficulty(level) {
  const L = Math.min(level, GAME.maxLevel);
  const speedUp = 1 + 0.08 * L;
  return {
    // Scene 1
    ballSpeed: Math.min(44 + 4 * L, 76),              // L0 is slower than walking; never faster than 1.27x walk
    ballInterval: Math.max(2.2, 5.5 - 0.5 * L),       // s between spawns ("torrent" by level 6)
    ballFromRight: L >= 1,
    ballBounceChance: L >= 2 ? Math.min(0.25 + 0.08 * (L - 2), 0.6) : 0, // smiley balls arrive at level 2
    ballEitherChance: L >= 3 ? 0.25 : 0,              // dotted balls: re-roll roll/bounce on every landing
    pumpkinSpeed: Math.min(16 + 5 * L, 60),           // 34 px patrol: 2.1 s per sweep at L0
    // Scene 2
    vanishOrder: VANISH_ORDER[Math.min(level, VANISH_ORDER.length - 1)],
    vanishWarn: Math.max(0.7, 1.4 - 0.07 * L),        // blink time: reaction 0.25 + walk to edge 0.45 + jump 0.5 at L0
    vanishGap: Math.max(0.6, 2.0 - 0.15 * L),         // s between one reappearing and the next blinking
    blockSpeedScale: speedUp,
    carpetPath: CARPET_PATHS[Math.min(level, CARPET_PATHS.length - 1)],
    carpetSpeed: Math.min(38 + 2 * L, 54),            // always below walkSpeed so Sammy can keep up
    carpetPause: Math.max(0.15, CARPET.cornerPause - 0.02 * L),
    // Scene 3
    boxBalls: L === 0 ? 1 : L === 1 ? 3 : 4,
    boxBallSpeed: Math.min(42 + 4 * L, 70),
    corridorBall: L >= 1,
    plungerCount: Math.min(5 + L, 9),
    plungerPeriodScale: 1 / speedUp,
  };
}
