# Sammy Lightfoot clone: design

Date: 2026-10-01. Status: built (see README.md for measured results). Written by Claude from a one-line request ("create a clone of
sammy lightfoot"); not reviewed by Jason before the build started. Assumptions are listed in
their own section so they can be corrected afterwards.

## Intended outcome

A playable browser remake of Sammy Lightfoot (Sierra On-Line, 1983, Warren Schwader), faithful
to the Apple II original's three scenes, controls, rules and look. Personal pet project, run
locally. All art and audio are drawn/synthesized in code; no original assets are copied.

Success means: all three scenes are playable start to finish with the documented routes, the
difficulty rises by level the way the original's did, and a headless simulator proves each
scene can be cleared.

## What the original is (sources: Sierra Chest walkthrough, GameFAQs guide by ASchultz, C64 and ColecoVision manuals, Apple II screenshots)

- One stick (left/right) and one button. The button jumps, holds ropes, and starts elevators
  and the carpet. No climbing. A standing jump is vertical; a sideways jump needs a direction.
- Three single-screen scenes, each cleared by reaching the last platform. After scene 3 the
  level number rises and the scenes repeat harder. Apple II: levels 0-11, then loops to 6.
- Score comes only from a bonus timer: 9990 at each scene start, about 100 per second, the
  remainder is banked on clearing. Bonus at 0 does not kill.
- Four lives, no extra lives. Dying restarts the scene. Top-10 score table with initials.

### Scene 1: trampolines, balls, ropes, pumpkin
Route: jump onto the right floor trampoline, three held bounces up to the pole platform;
running jump left from the chevron mark onto the second trampoline, which throws Sammy across
to the centre tower; grab the lower rope, release onto the left tower; bounce on the tower
trampoline to the upper-left girder; run right over the gap, step on the white pad (starts
the upper rope); grab the upper rope and release onto the pumpkin platform.
Hazards: rolling balls (jump them), bouncing balls (walk under), the patrolling pumpkin.
Level 0 balls come from the upper left only; level 1 adds the upper right; level 2 adds
bouncing balls; later levels are faster and denser.

### Scene 2: vanishing platforms, blocks, elevators, carpet
Route: from the right elevator jump left across four platforms that vanish in a per-level
order, under six vertically moving blocks that kill on contact; button on the left elevator
raises both elevators to mid height; cross back right using the blocks as stepping stones;
button on the right elevator raises both to the top, the blocks vanish and the carpet
appears; step on, press the button, and walk with the carpet along its path to the top-left
elevator.

### Scene 3: ball box, plungers, fire, double rope
Route: run right through the box of bouncing balls; jump to the right elevator, button, ride
to mid level; run left under the plungers to the left elevator, button, ride to the top;
jump to the first rope, release and re-grab the second, release onto the pumpkin platform.
Dropping into the fire kills.

## Architecture

Vanilla ES modules and Canvas 2D, no build step, no dependencies. Same conventions as
Stick Fort.

- `src/data/tuning.js`: every tunable, one table per system, plus `difficulty(level)`.
- `src/data/scenes.js`: scene geometry (from the screenshots, 280x192 space).
- `src/sim/`: pure simulation, no DOM, no clock, no `Math.random`. The world is plain data
  (including RNG state), so it can be deep-copied for look-ahead bots and replay tests.
  - `rng.js`, `world.js` (build + step a scene), `player.js` (state machine),
    `entities.js` (ropes, balls, platforms, plungers, carpet, elevators), `game.js`
    (title, scene card, play, death, clear, tally, game over, initials entry).
- `src/engine/`: fixed-step loop (60 Hz), input (edge events, blur clearing, gamepad, touch),
  audio (synthesized blips).
- `src/render/`: 280x192 back buffer scaled by whole numbers, six-colour Apple II palette,
  bitmap font, code-defined sprites, HUD.
- `tests/`: `node --test` logic tests. `tools/simulate.mjs`: headless bots.
  `tools/smoke.mjs`: Playwright load + screenshots.

### Player state machine
`ground` (walk, jump, press-to-activate on an armed elevator/carpet) -> `air` (committed
arc, no air control) -> `ground` | bounce (trampoline) | `rope` (button held on contact) |
dead. `rope` -> `air` on button release, launched along the swing direction.
Jump press is buffered 0.1 s; coyote time 0.08 s.

### Feel layer
Jump: stretch frame + blip. Land: squash frame + dust + thud. Trampoline: mat deflects, boing
pitched by height. Rope: grab/release blips, hanging pose. Death: 80 ms hit-stop, flash,
shake, hair-spin animation, falling melody. Armed elevator/carpet: blinking arrow.
Vanishing platform: blink + warning beep before it goes. Scene clear: dance, jingle, tally.

## Assumptions (not in any source; change these first if they feel wrong)

1. **Lethal falls.** A drop of more than 56 px from the top of the arc onto a hard surface
   kills (a jump off a tier does, a full pump off a floor trampoline does not); a trampoline
   landing never does. One source says stepping off a platform is "instant
   demise" but no source gives a height. `PLAYER.lethalFall` controls it.
2. **Platforms are one-way** (pass up through, land on top). The right trampoline sits
   directly under the pole platform, so this must be true of at least that one.
3. **Walking off a ledge drops straight down.** Matches "walking off ... misses" in the
   walkthrough.
4. **Rope physics.** Ropes swing on a fixed sinusoid; release launches Sammy with the
   rope's tangential velocity plus a hop in the swing direction. Amplitudes and periods are
   mine, chosen so the documented routes work. The scene 3 pair swings 3:4 (1.8 s and 2.4 s)
   so a transfer window opens on two of every four swings.
5. **Trampoline numbers.** Held bounces multiply speed until a chain cap; a drop from above
   gets a larger launch. Tuned so the first trampoline takes three bounces (documented) and
   the second cannot reach the centre tower without the drop from the pole platform.
6. **Carpet leg lengths.** The direction sequences per level are documented; leg lengths are
   not. Legs move one grid cell, are skipped when they would leave the play area, and the
   path is completed to the top-left elevator.
7. **Scene 2 elevators start at the bottom**; scene 3 box walls stop balls, not Sammy.
8. **Keyboard controls** (arrows/A-D, Space) since the original needed a joystick. Gamepad
   and touch are also mapped.
9. **Name and title screen** credit the original and say "fan remake". Not for distribution.

## Testing

- Unit tests derive expectations from the tuning tables (jump height, bounce counts, bonus
  rate, lethal fall, rope release, vanish order, level loop, determinism/replay).
- Simulator: a planning bot (look-ahead on a copy of the world) must clear every scene at
  levels 0-3 across seeds; the same bot with input jitter measures how tight the timing is;
  a masher bot must mostly die. Committed as a regression gate under `npm test`.
- Smoke: page loads with no console errors; screenshots of title and each scene.

Not verifiable by me: how it feels in the hand, and exact fidelity of timings to the 1983
original (nobody documented them).
