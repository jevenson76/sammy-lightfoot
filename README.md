# Sammy Lightfoot (fan remake)

A browser remake of *Sammy Lightfoot*, the 1983 Sierra On-Line circus platformer designed by
Warren Schwader for the Apple II. Three single-screen scenes, one button, and a bonus clock.

Personal fan project. All code, art and sound here are original (sprites are drawn in code,
sound is synthesized), but the name and game design belong to the original. Not for
distribution.

## Play

```
npx serve .
```

then open the address it prints (ES modules will not load from `file://`).

| Key | Does |
|---|---|
| Arrows or A / D | Walk |
| Space (or Z, X) | Jump. Hold it to hang on to a rope. On an elevator or the carpet with an arrow over it, starts it. |
| P or Esc | Pause |
| M | Sound on/off |

A gamepad (stick or d-pad, any face button) and on-screen touch buttons work too.

Rules, as in the original: a jump is committed at takeoff (a standing jump goes straight up;
hold a direction to jump sideways). Score comes only from the bonus clock, which starts at 9990
each scene and loses about 100 a second. Four lives, no extras. After scene 3 the level rises
and the scenes repeat harder; levels run 0 to 11 and then loop from 6.

### The routes

1. **Trampolines and ropes.** Jump onto the right-hand trampoline and hold the button for
   three bounces to reach the platform above. Take a running jump left from the chevron mark,
   still holding the button, onto the second trampoline: it throws you to the centre tower.
   Jump into the swinging rope holding the button and let go on the leftward swing. Bounce on
   the tower trampoline to the upper girder, run right over the gap, step on the white pad
   (it starts the top rope), ride that rope and drop onto the pumpkin's platform while the
   pumpkin is at the far end. Jump the rolling balls; walk under the bouncing ones.
2. **Elevators and a carpet.** Cross left over the four platforms (one at a time blinks, then
   vanishes) without being under a block when it comes down. Press the button on the left
   elevator. Cross back right using the blocks as stepping stones: jump when the next one is
   level or below. Press the button on the right elevator, step onto the carpet, press the
   button, and walk with the carpet (it does not carry you sideways) to the top-left elevator.
3. **Plungers and fire.** Run right through the box of bouncing balls and jump to the
   elevator; button. Run left under the plungers, between their strokes; button on the left
   elevator. Jump to the first rope, let go on the rightward swing and press and hold again at
   once to catch the second, then drop onto the pumpkin's platform. Two swings in every four
   line up for the transfer.

### Extras

- `?scene=2&level=3` starts at that scene and level.
- `?demo=planner` lets the test harness's bot play (also `careful`, `sloppy`, `masher`);
  add `&speed=4` to run fast. Useful for seeing a route.
- `?debug=1` adds N (skip the scene) and K (kill Sammy) and exposes `window.__sammy`.

## Code map

| Path | What |
|---|---|
| `src/data/tuning.js` | Every tunable, one table per system, each with the number it was tuned against. `difficulty(level)` holds everything that scales. |
| `src/data/scenes.js` | Scene layouts, read off Apple II screenshots (280x192). |
| `src/sim/` | The simulation. Plain data, fixed 1/60 s tick, seeded RNG held on the world; no DOM, no clock. `world.js` builds and steps one attempt at a scene, `player.js` is Sammy's state machine, `entities.js` the hazards and moving platforms, `game.js` the session (title, card, lives, bonus, scores). |
| `src/engine/` | Fixed-step loop, input (keyboard, gamepad, touch), synthesized sound. |
| `src/render/` | 280x192 back buffer scaled by whole numbers, six-colour Apple II palette, bitmap font, sprites as text. |
| `tests/` | `node --test`. Logic tests derive their expectations from the tuning tables. `routes.test.mjs` is the bot regression gate. |
| `tools/bots.mjs` | Scripted players: a look-ahead planner (with a "slack demanded" and "lateness" setting) and a button-masher. |
| `tools/simulate.mjs` | Headless reports: per-scene clear rates (`--levels`, `--seeds`, `--models`), rope timing windows (`--windows`), whole games (`--session`), one attempt step by step (`--trace`). |
| `tools/smoke.mjs` | Playwright: loads the page, plays with real key events, lets the bot clear all three scenes, saves screenshots to `shots/`. |

## How it was checked

```
node --test              # 114 tests, about 25 s
node tools/simulate.mjs  # player-model report, about 40 s
node tools/smoke.mjs     # real browser, screenshots in shots/
```

Nobody has played this by hand yet. What stands in for a playtest is a set of scripted players
driving the real simulation (`tools/bots.mjs`):

- **planner**: frame-perfect. Proves a scene can be cleared.
- **careful**: only commits to a jump or a rope release that would still work a tenth of a
  second late, and is then up to a tenth of a second late.
- **sloppy**: leaves itself 0.03 s of slack and is up to 0.13 s late.
- **masher**: heads roughly the right way and presses the button at random.

Clears out of 8 attempts per scene, measured on the code as it stands (2026-10-01):

| Scene | Level | planner | careful | sloppy | masher | careful clear time |
|---|---|---|---|---|---|---|
| 1 | 0 | 8 | 8 | 5 | 0 | 17 s |
| 1 | 1 | 7 | 8 | 4 | 0 | 17 s |
| 1 | 2 | 8 | 6 | 6 | 0 | 17 s |
| 1 | 3 | 8 | 7 | 5 | 0 | 19 s |
| 2 | 0 | 8 | 7 | 2 | 0 | 31 s |
| 2 | 1 | 8 | 8 | 0 | 0 | 35 s |
| 2 | 2 | 8 | 8 | 0 | 0 | 34 s |
| 2 | 3 | 8 | 8 | 2 | 0 | 43 s |
| 3 | 0 | 8 | 8 | 2 | 0 | 14 s |
| 3 | 1 | 8 | 8 | 2 | 0 | 18 s |
| 3 | 2 | 8 | 8 | 0 | 0 | 21 s |
| 3 | 3 | 8 | 8 | 0 | 0 | 18 s |

Totals over levels 0 to 3: planner 95/96, careful 92/96, sloppy 28/96, masher 0/96. At levels
6 and 11 (6 attempts each) the careful player clears 32 of 36. On four lives, three of four
careful games were still alive after clearing level 5 (18 scenes, about 135,000 points); the
sloppy player dies in scene 2 of level 0 every time. So: every scene is clearable, each
commitment has at least a tenth of a second of window, and ignoring the timing gets you killed.

Rope windows at level 0 (`--windows`): the low rope in scene 1 can be released for 0.75 s of
each 2 s swing; the final drops onto the pumpkin's platform are open 0.2 s at a time and depend
on where the pumpkin is; the rope-to-rope transfer in scene 3 is open 0.22 to 0.28 s on two
swings in every four.

What this does not tell you: how it feels in the hand, and how close the timings are to 1983.
First things to watch when you play: whether the carpet in scene 2 is fiddly to stay on
(`difficulty().carpetSpeed`), whether falls feel fair (`PLAYER.lethalFall`), and whether rope
releases throw Sammy as far as you expect (`ROPE.releaseVx`, `ROPE.releaseVy`).

Known rough edges:

- A few dead ends need a death to get out of: an elevator or the carpet leaving without Sammy.
- `tools/simulate.mjs` and `tests/routes.test.mjs` run their bots in child processes
  (`tools/cells.mjs`) because Node 22/24 itself occasionally crashes under the bots' look-ahead
  workload (a V8 fatal error or segfault; Node 20 did not). A crashed cell is re-run and, the
  simulation being deterministic, gives the same answer. Emptying arrays with `.length = 0` in
  the hot loop made that crash far more frequent, so the sim replaces arrays instead.

## What is from the original and what is mine

Documented in sources (the Sierra Chest walkthrough, ASchultz's GameFAQs guide, the C64 and
ColecoVision manuals, Apple II screenshots): the controls, the three scenes and their routes,
the hazards, the level progression including the vanish order and carpet direction sequences
per level, the scoring, the lives, the look.

Not documented anywhere I could find, so chosen by me and worth changing first if something
feels wrong (all in `src/data/tuning.js` unless noted):

- **Lethal falls** (`PLAYER.lethalFall`, 56 px from the top of the arc). One source says
  stepping off a platform is "instant demise"; none gives a height.
- **One-way platforms.** The right trampoline sits directly under the platform it launches
  you to, so at least that one must be.
- **Walking off a ledge drops straight down**, and there is a little coyote time and jump
  buffering (`PLAYER.coyote`, `PLAYER.buffer`).
- **Rope physics** (`ROPE`, and the rope entries in `scenes.js`): fixed sinusoidal swings; a
  release throws Sammy along the swing with a hop.
- **Trampoline numbers** (`TRAMPOLINE`): tuned so the first one takes the documented three
  bounces and the second cannot reach the centre tower without the drop from above.
- **Carpet leg lengths.** The direction sequences are documented; the lengths are not.
- **Speeds and timings generally.** Nobody recorded them.
- A small `L0` level indicator at the right of the status line, which the original did not have.
