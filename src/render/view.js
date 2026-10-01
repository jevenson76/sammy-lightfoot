// Draws a game to the 280x192 back buffer. Reads simulation state, never
// writes it. Particles, shake and frame counters here are presentation only.

import { SCREEN_W, SCREEN_H, COLORS as C } from './screen.js';
import { drawText, drawTextCentered } from './font.js';
import { bakeSprites, drawSprite } from './sprites.js';
import { GAME, BOXBALL, PLUNGER } from '../data/tuning.js';

const HUD_Y = 184;
const MID_X = SCREEN_W / 2;

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// Bresenham line of single pixels. `gap` > 0 draws a dotted line.
function line(ctx, color, x0, y0, x1, y1, gap = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let n = 0;
  ctx.fillStyle = color;
  for (;;) {
    if (!gap || n % (gap + 1) === 0) ctx.fillRect(x0, y0, 1, 1);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// A box girder: outline with a zigzag truss inside.
function girder(ctx, x, y, w, h, outline, truss) {
  rect(ctx, outline, x, y, w, 1);
  rect(ctx, outline, x, y + h - 1, w, 1);
  rect(ctx, outline, x, y, 1, h);
  rect(ctx, outline, x + w - 1, y, 1, h);
  ctx.fillStyle = truss;
  const span = Math.max(1, h - 5);
  for (let i = 2; i < w - 2; i++) {
    const tri = Math.abs((i % 8) - 4);
    ctx.fillRect(Math.round(x) + i, Math.round(y) + 2 + Math.round((tri * span) / 4), 1, 1);
  }
}

// An outlined pad with a dashed centre line (elevators, vanishing platforms).
function dashedPad(ctx, x, y, w, h, outline, dash) {
  rect(ctx, outline, x, y, w, 1);
  rect(ctx, outline, x, y + h - 1, w, 1);
  rect(ctx, outline, x, y, 2, h);
  rect(ctx, outline, x + w - 2, y, 2, h);
  ctx.fillStyle = dash;
  for (let i = 4; i < w - 5; i += 4) ctx.fillRect(Math.round(x) + i, Math.round(y) + 3, 2, 2);
}

const pad = (n, len) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

export function createView(ctx) {
  const S = bakeSprites();
  const backdrop = document.createElement('canvas');
  backdrop.width = SCREEN_W;
  backdrop.height = SCREEN_H;
  const bctx = backdrop.getContext('2d');
  let backdropFor = null;

  const particles = [];
  let frame = 0;
  let shake = 0;

  // ---------- static scenery, drawn once per world ----------

  function buildBackdrop(world) {
    bctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    const floor = world.platforms.find((p) => p.kind === 'floor');
    const groundY = floor ? floor.y : SCREEN_H;
    for (const pl of world.platforms) {
      switch (pl.kind) {
        case 'floor':
          rect(bctx, C.blue, pl.x, pl.y, pl.w, 2);
          break;
        case 'tower': {
          const l = pl.x + 2;
          const r = pl.x + pl.w - 4;
          rect(bctx, C.white, l, pl.y + pl.h, 2, groundY - pl.y - pl.h);
          rect(bctx, C.white, r, pl.y + pl.h, 2, groundY - pl.y - pl.h);
          const top = pl.y + pl.h + 2;
          const mid = Math.round((top + groundY) / 2);
          for (const [a, b] of [[top, mid], [mid, groundY - 2]]) {
            line(bctx, C.orange, l + 2, a, r - 1, b, 1);
            line(bctx, C.orange, r - 1, a, l + 2, b, 1);
          }
          girder(bctx, pl.x, pl.y, pl.w, pl.h, C.blue, C.orange);
          break;
        }
        case 'pole':
          rect(bctx, C.white, pl.x + 2, pl.y + pl.h, 2, groundY - pl.y - pl.h);
          girder(bctx, pl.x, pl.y, pl.w, pl.h, C.blue, C.orange);
          // the chevron: where to jump from
          for (let i = -3; i <= 3; i++) rect(bctx, C.white, pl.chevronX + i, pl.y + 1 + (3 - Math.abs(i)), 1, 1);
          break;
        case 'girder':
          girder(bctx, pl.x, pl.y, pl.w, pl.h, C.blue, C.orange);
          break;
        case 'perch':
          girder(bctx, pl.x, pl.y, pl.w, pl.h, C.orange, C.blue);
          if (world.scene === 2) {
            // wall bracket under the scene 3 perch
            rect(bctx, C.white, pl.x + 14, pl.y + pl.h + 1, pl.w - 14, 1);
            rect(bctx, C.white, pl.x + pl.w - 2, pl.y + pl.h + 1, 2, 28);
            line(bctx, C.white, pl.x + 22, pl.y + pl.h + 2, pl.x + pl.w - 3, pl.y + pl.h + 20);
          }
          break;
        case 'boxfloor':
          girder(bctx, pl.x, pl.y, 21, pl.h, C.blue, C.orange);
          girder(bctx, pl.x + 22, pl.y, pl.w - 22, pl.h, C.violet, C.green);
          break;
        default:
          break;
      }
    }
    if (world.scene === 0) {
      const high = world.ropes[1];
      rect(bctx, C.blue, high.x - 17, 0, 34, 2);
    } else if (world.scene === 2) {
      const roof = world.platforms.find((p) => p.id === 'roof');
      const base = world.platforms.find((p) => p.kind === 'boxfloor');
      // box walls: they hold the balls in, Sammy walks through
      rect(bctx, C.violet, roof.x - 1, roof.y, 1, base.y + base.h - roof.y);
      rect(bctx, C.violet, roof.x + roof.w, roof.y, 1, base.y + base.h - roof.y);
      // plunger ceiling with the fire trough on top
      const f = world.fire;
      const top = world.plungers.length ? world.plungers[0].top : 88;
      rect(bctx, C.orange, f.x0, top - 10, f.x1 - f.x0, 2);
      rect(bctx, C.blue, f.x0 + 4, top - 2, f.x1 - f.x0 - 8, 2);
      rect(bctx, C.orange, f.x0, top - 10, 3, 12);
      rect(bctx, C.orange, f.x1 - 3, top - 10, 3, 12);
      for (const r of world.ropes) rect(bctx, C.orange, r.x - 20, 0, 40, 2);
    }
    backdropFor = world;
  }

  // ---------- moving things ----------

  function drawPlatforms(world) {
    for (const pl of world.platforms) {
      if (!pl.active) continue;
      switch (pl.kind) {
        case 'trampoline': {
          const x = Math.round(pl.x);
          const y = Math.round(pl.y);
          const dip = Math.round((pl.squash / 0.25) * 4);
          line(ctx, C.white, x, y, x + 3, y + pl.h - 1);
          line(ctx, C.white, x + pl.w - 1, y, x + pl.w - 4, y + pl.h - 1);
          rect(ctx, C.white, x + 1, y + pl.h - 1, 5, 1);
          rect(ctx, C.white, x + pl.w - 6, y + pl.h - 1, 5, 1);
          rect(ctx, C.blue, x + 3, y + 6, pl.w - 6, 1);
          if (dip > 0) {
            line(ctx, C.orange, x + 1, y, x + pl.w / 2, y + dip);
            line(ctx, C.orange, x + pl.w / 2, y + dip, x + pl.w - 2, y);
          } else {
            rect(ctx, C.orange, x + 1, y, pl.w - 2, 2);
          }
          break;
        }
        case 'elevator':
          dashedPad(ctx, pl.x, pl.y, pl.w, pl.h, C.orange, C.blue);
          break;
        case 'vanish':
          if (pl.blink && (frame >> 2) & 1) break;
          dashedPad(ctx, pl.x, pl.y, pl.w, pl.h, C.violet, C.green);
          break;
        case 'block': {
          const x = Math.round(pl.x);
          const y = Math.round(pl.y);
          rect(ctx, C.blue, x, y, pl.w, 1);
          rect(ctx, C.blue, x, y + pl.h - 1, pl.w, 1);
          rect(ctx, C.blue, x, y, 1, pl.h);
          rect(ctx, C.blue, x + pl.w - 1, y, 1, pl.h);
          ctx.fillStyle = C.blue;
          for (let j = 2; j < pl.h - 2; j++) {
            for (let i = 2 + (j & 1); i < pl.w - 2; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
          }
          break;
        }
        case 'carpet': {
          const x = Math.round(pl.x);
          const y = Math.round(pl.y);
          rect(ctx, C.white, x, y, pl.w, 1);
          ctx.fillStyle = C.white;
          for (let i = frame >> 3 & 1; i < pl.w; i += 2) ctx.fillRect(x + i, y + 1, 1, 1);
          for (let i = 1; i < pl.w; i += 3) ctx.fillRect(x + i, y + 2, 1, 2);
          break;
        }
        default:
          break;
      }
      if (pl.pad) {
        if (pl.padPressed) rect(ctx, C.blue, pl.padX, pl.y, pl.padW, 1);
        else rect(ctx, C.white, pl.padX, pl.y - 1, pl.padW, 2);
      }
      // readiness: the button does something here
      if (pl.armed && frame % 40 < 28) {
        const bob = frame % 40 < 14 ? 2 : 0;
        // above Sammy's head where there is room; under the platform when it is at the top of the screen
        const ay = pl.y - 32 >= 2 ? pl.y - 32 - bob : pl.y + pl.h + 4 + bob;
        drawSprite(ctx, S.arrowUp, pl.x + pl.w / 2 - 3, ay);
      }
    }
  }

  function drawFire(world) {
    const f = world.fire;
    const top = (world.plungers.length ? world.plungers[0].top : 88) - 10;
    const t = frame >> 2;
    ctx.fillStyle = C.orange;
    for (let x = f.x0 + 1; x < f.x1 - 1; x += 2) {
      const n = Math.imul((x * 73856093) ^ (t * 19349663), 0x9e3779b1) >>> 28; // 0-15, well mixed on every frame
      const h = 2 + (n % 7);
      ctx.fillRect(x, top - h, 1, h);
      if (n & 8) ctx.fillRect(x + 1, top - h + 2, 1, Math.max(1, h - 3));
    }
  }

  function drawPlungers(world) {
    for (let i = 0; i < world.plungers.length; i++) {
      const pl = world.plungers[i];
      const color = pl.warn && (frame >> 1) & 1 ? C.white : i % 2 ? C.blue : C.orange;
      rect(ctx, color, pl.x, pl.top, PLUNGER.w, Math.round(pl.len));
    }
  }

  function drawRopes(world) {
    for (const r of world.ropes) {
      line(ctx, C.white, r.x, r.y, r.x + r.len * Math.sin(r.theta), r.y + r.len * Math.cos(r.theta));
    }
  }

  function drawHazards(world) {
    const pk = world.pumpkin;
    if (pk) drawSprite(ctx, S.pumpkin, pk.x - S.pumpkin.w / 2, pk.y - S.pumpkin.h, pk.dir < 0);
    for (const b of world.balls) {
      if (b.mode === 'hold' && (frame >> 2) & 1) continue;
      const spr = b.kind === 'bounce' ? S.ballSmiley : b.kind === 'either' ? S.ballDotted : S.ball;
      // roll: mirror the sprite every few pixels of travel
      drawSprite(ctx, spr, b.x - 5, b.y - 5, (Math.floor(b.x / 8) & 1) === 1);
    }
    for (const b of world.boxBalls) {
      rect(ctx, C.white, b.x - BOXBALL.radius, b.y - BOXBALL.radius, 3, 3);
    }
  }

  // ---------- Sammy ----------

  function sammySprite(p) {
    if (p.state === 'rope') return S.sammyHang;
    if (p.state === 'air') return S.sammyJump;
    if (p.landT > 0) return S.sammyWalk2;
    if (p.walkT > 0) {
      const step = Math.floor(p.walkT / 0.09) % 4;
      return step === 0 ? S.sammyWalk1 : step === 2 ? S.sammyWalk2 : S.sammyStand;
    }
    return S.sammyStand;
  }

  function drawSammy(g) {
    const w = g.world;
    const p = w.player;
    const x = Math.round(p.x) - 6;
    let y = Math.round(p.y) - 20;
    const flip = p.facing < 0;

    if (g.mode === 'gameover') return;
    if (g.mode === 'dying') {
      const cause = w.deathCause;
      if (cause === 'pit') return;
      const t = g.modeT;
      if (t < GAME.hitStop) {
        // impact: one bright frame, frozen
        drawSprite(ctx, sammySprite(p).white, x, y, flip);
        return;
      }
      const dt = t - GAME.hitStop;
      if (cause === 'fire') y += Math.min(14, dt * 20);
      if (dt < 1.5 || (frame >> 2) & 1) drawSprite(ctx, S.sammyBald, x, y, flip);
      // the hair spins off his head
      const a = dt * 16;
      const r = Math.min(11, dt * 34);
      const hx = x + Math.cos(a) * r;
      const hy = y - Math.abs(Math.sin(a)) * r * 0.7 - Math.min(10, dt * 9);
      drawSprite(ctx, S.hair, hx, hy, Math.cos(a) < 0);
      return;
    }

    if (g.mode === 'clear' || g.mode === 'tally') {
      // victory dance: arms up, hop, turn
      const beat = Math.floor(g.modeT / 0.14);
      const up = g.mode === 'clear' && beat % 2 === 0;
      drawSprite(ctx, up ? S.sammyJump : S.sammyStand, x, y - (up ? 2 : 0), g.mode === 'clear' ? (beat >> 1) % 2 === 1 : flip);
      return;
    }

    if (p.landT > 0) y += 1; // squash on landing
    drawSprite(ctx, sammySprite(p), x, y, flip);
    if (p.state === 'rope') {
      // arms up the rope
      rect(ctx, C.white, x + 2, y - 2, 1, 8);
      rect(ctx, C.white, x + 9, y - 2, 1, 8);
    }
  }

  // ---------- particles ----------

  function burst(x, y, n, color, speed, up) {
    for (let i = 0; i < n && particles.length < 60; i++) {
      const a = (i / n) * Math.PI + 0.3 * Math.sin(frame + i * 7);
      particles.push({
        x, y,
        vx: Math.cos(a) * speed * (0.5 + ((i * 37) % 10) / 10),
        vy: -Math.abs(Math.sin(a)) * up - 6,
        life: 12 + (i % 3) * 4,
        color,
      });
    }
  }

  function stepParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.x += q.vx / 60;
      q.y += q.vy / 60;
      q.vy += 3;
      if (--q.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
    }
  }

  // ---------- HUD and screens ----------

  function drawHud(g) {
    rect(ctx, C.black, 0, HUD_Y - 2, SCREEN_W, SCREEN_H - HUD_Y + 2);
    drawText(ctx, `1-${pad(g.score, 6)}`, 0, HUD_Y, C.white);
    for (let i = 0; i < g.lives - 1; i++) drawSprite(ctx, S.life, 56 + i * 8, HUD_Y + 1);
    const low = g.mode === 'play' && g.bonus <= 1000 && g.bonus > 0 && (frame >> 3) & 1;
    drawText(ctx, 'BONUS', 96, HUD_Y, C.white);
    if (!low) drawText(ctx, pad(g.bonus, 4), 132, HUD_Y, g.bonus <= 1000 ? C.orange : C.white);
    drawText(ctx, `L${g.level}`, 260, HUD_Y, C.violet);
  }

  function panel(x, y, w, h, border = C.white) {
    rect(ctx, C.black, x, y, w, h);
    rect(ctx, border, x, y, w, 1);
    rect(ctx, border, x, y + h - 1, w, 1);
    rect(ctx, border, x, y, 1, h);
    rect(ctx, border, x + w - 1, y, 1, h);
  }

  function drawCard(g) {
    for (let x = 0; x < SCREEN_W; x += 8) {
      rect(ctx, (x >> 3) & 1 ? C.violet : C.blue, x, 0, 3, HUD_Y - 4);
    }
    panel(70, 56, 140, 70);
    drawTextCentered(ctx, `SCENE ${g.scene + 1}`, MID_X, 68, C.orange, 2);
    drawTextCentered(ctx, `LEVEL ${g.level}`, MID_X, 90, C.green, 2);
    if (g.retry) drawTextCentered(ctx, 'TRY AGAIN', MID_X, 112, C.white);
    else drawTextCentered(ctx, ['TRAMPOLINES AND ROPES', 'ELEVATORS AND A CARPET', 'PLUNGERS AND FIRE'][g.scene], MID_X, 112, C.white);
    drawHud(g);
  }

  function drawScores(g, y, rows) {
    drawTextCentered(ctx, 'TOP SCORES', MID_X, y, C.orange);
    g.hiScores.slice(0, rows).forEach((h, i) => {
      const color = i === g.lastRank ? C.white : C.green;
      drawText(ctx, `${String(i + 1).padStart(2, ' ')}  ${h.name}  ${pad(h.score, 6)}  L${h.level}`, 80, y + 11 + i * 9, color);
    });
  }

  function drawTitle(g) {
    // SAMMY / LIGHTFOOT, orange on a blue drop shadow
    drawTextCentered(ctx, 'SAMMY', MID_X + 2, 14 + 2, C.blue, 4);
    drawTextCentered(ctx, 'SAMMY', MID_X, 14, C.orange, 4);
    drawTextCentered(ctx, 'LIGHTFOOT', MID_X + 2, 48 + 2, C.blue, 3);
    drawTextCentered(ctx, 'LIGHTFOOT', MID_X, 48, C.orange, 3);
    rect(ctx, C.orange, 60, 73, 160, 1);
    rect(ctx, C.white, 76, 76, 128, 1);
    const hop = Math.abs(Math.sin(frame / 14)) * 10;
    drawSprite(ctx, hop > 2 ? S.sammyJump : S.sammyStand, 30, 34 - hop);
    drawSprite(ctx, S.pumpkin, 236, 44);

    drawTextCentered(ctx, 'A FAN REMAKE OF THE 1983 SIERRA GAME', MID_X, 84, C.violet);
    drawTextCentered(ctx, 'ORIGINAL DESIGN BY WARREN SCHWADER', MID_X, 94, C.violet);

    const showScores = g.hiScores.length > 0 && Math.floor(g.modeT / 6) % 2 === 1;
    if (showScores) {
      drawScores(g, 108, 5);
    } else {
      drawTextCentered(ctx, 'ARROWS OR A/D: MOVE', MID_X, 110, C.green);
      drawTextCentered(ctx, 'SPACE: JUMP, HOLD ON TO ROPES,', MID_X, 121, C.green);
      drawTextCentered(ctx, 'START ELEVATORS AND THE CARPET', MID_X, 131, C.green);
      drawTextCentered(ctx, 'P: PAUSE   M: SOUND', MID_X, 143, C.blue);
    }
    if ((frame >> 5) & 1) drawTextCentered(ctx, 'PRESS SPACE TO BEGIN', MID_X, 168, C.white);
  }

  function drawEntry(g) {
    drawTextCentered(ctx, 'A SCORE FOR THE BOARD!', MID_X, 30, C.orange, 2);
    drawTextCentered(ctx, pad(g.score, 6), MID_X, 60, C.white, 2);
    drawTextCentered(ctx, 'ENTER YOUR INITIALS', MID_X, 88, C.green);
    const e = g.entry;
    for (let i = 0; i < 3; i++) {
      const cx = MID_X - 36 + i * 30;
      drawText(ctx, String.fromCharCode(65 + e.letters[i]), cx, 104, i < e.pos ? C.green : C.white, 3);
      if (i === e.pos && (frame >> 3) & 1) rect(ctx, C.orange, cx - 1, 128, 17, 2);
    }
    drawTextCentered(ctx, 'UP/DOWN: LETTER   SPACE: NEXT', MID_X, 150, C.blue);
  }

  function drawWorld(g) {
    const w = g.world;
    if (backdropFor !== w) buildBackdrop(w);
    ctx.drawImage(backdrop, 0, 0);
    if (w.fire) drawFire(w);
    drawPlungers(w);
    drawRopes(w);
    drawPlatforms(w);
    drawHazards(w);
    drawSammy(g);
    if (w.scene === 2) {
      // Scene 3: a jumping Sammy's hair goes behind the ceiling beam and the
      // box roof instead of through them (his jump is not shortened).
      const roof = w.platforms.find((p) => p.id === 'roof');
      const f = w.fire;
      const top = (w.plungers.length ? w.plungers[0].top : 88) - 10;
      rect(ctx, C.black, f.x0, top + 2, f.x1 - f.x0, 6);
      ctx.drawImage(backdrop, f.x0, top, f.x1 - f.x0, 10, f.x0, top, f.x1 - f.x0, 10);
      ctx.drawImage(backdrop, roof.x, roof.y, roof.w, roof.h, roof.x, roof.y, roof.w, roof.h);
    }
    for (const q of particles) rect(ctx, q.color, q.x, q.y, 1, 1);
    drawHud(g);
  }

  return {
    // World events worth a visual.
    onEvent(name, world) {
      const p = world.player;
      if (name === 'land') burst(p.x, p.y - 1, 4, C.white, 26, 14);
      else if (name === 'bounce') burst(p.x, p.y - 1, 6, C.orange, 34, 30);
      else if (name === 'die') { shake = 5; burst(p.x, p.y - 10, 10, C.orange, 60, 70); }
      else if (name === 'clear') burst(p.x, p.y - 18, 12, C.green, 50, 80);
      else if (name === 'grab') burst(p.x, p.y - 18, 3, C.white, 20, 10);
    },

    // Once per simulation tick.
    tick() {
      frame++;
      stepParticles();
      shake = shake > 0.4 ? shake * 0.86 : 0;
    },

    draw(g, paused) {
      rect(ctx, C.black, 0, 0, SCREEN_W, SCREEN_H);
      if (g.mode === 'title') drawTitle(g);
      else if (g.mode === 'card') drawCard(g);
      else if (g.mode === 'entry') drawEntry(g);
      else if (g.world) {
        drawWorld(g);
        if (g.mode === 'tally' || (g.mode === 'clear' && g.modeT > 0.5)) {
          panel(86, 84, 108, 17, C.green);
          drawTextCentered(ctx, `SCENE ${g.scene + 1} CLEAR`, MID_X, 89, C.white);
        }
        if (g.mode === 'gameover') {
          panel(80, 74, 120, 34, C.orange);
          drawTextCentered(ctx, 'GAME OVER', MID_X, 81, C.white, 2);
          drawTextCentered(ctx, `LEVEL ${g.level}  SCENE ${g.scene + 1}`, MID_X, 98, C.orange);
        }
      } else if (g.mode === 'gameover') {
        drawTextCentered(ctx, 'GAME OVER', MID_X, 81, C.white, 2);
      }
      if (paused) {
        panel(100, 82, 80, 21);
        drawTextCentered(ctx, 'PAUSED', MID_X, 89, C.white);
      }
    },

    get shakeX() { return Math.round(Math.sin(frame * 1.7) * shake); },
    get shakeY() { return Math.round(Math.cos(frame * 2.3) * shake * 0.6); },
  };
}
