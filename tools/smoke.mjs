/**
 * Headless browser smoke test (dev-only; needs playwright resolvable from an
 * ancestor node_modules). Serves the game on a throwaway local server, starts
 * a game, visits all three scenes, dies once, then lets the planner bot play
 * the real page through all three scenes, saving screenshots along the way.
 * Exits non-zero on any console/page error or failed expectation.
 *
 * Usage: node tools/smoke.mjs        (screenshots land in shots/, or SMOKE_OUT)
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.env.SMOKE_OUT || join(root, 'shots');
await mkdir(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  let p = (req.url || '/').split('?')[0];
  if (p === '/') p = '/index.html';
  try {
    const data = await readFile(join(root, normalize(p).replace(/^([/\\])+/, '')));
    res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const failures = [];
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 640 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const state = () => page.evaluate(() => {
  const g = window.__sammy.game;
  return {
    mode: g.mode, scene: g.scene, level: g.level, lives: g.lives, score: g.score, bonus: g.bonus,
    player: g.world ? { x: g.world.player.x, y: g.world.player.y, state: g.world.player.state } : null,
  };
});
const waitMode = (mode, timeout = 15000) => page.waitForFunction((m) => window.__sammy.game.mode === m, mode, { timeout });
const shot = (name) => page.locator('#screen').screenshot({ path: join(OUT, `${name}.png`) });

try {
  await page.goto(`http://127.0.0.1:${port}/?debug=1`);
  await page.waitForFunction(() => window.__sammy && window.__sammy.game);
  await page.waitForTimeout(400);
  expect((await state()).mode === 'title', 'boots to the title screen');
  await shot('0-title');

  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  expect((await state()).mode === 'card', 'Space starts the game and shows the scene card');
  await shot('1-card');

  await waitMode('play');
  let s = await state();
  expect(s.scene === 0 && s.level === 0 && s.lives === 4, 'play starts at scene 1, level 0, four lives');
  expect(s.bonus <= 9990 && s.bonus > 9000, `bonus clock is running (${s.bonus})`);

  // Walk and jump with real key events.
  const x0 = s.player.x;
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  s = await state();
  expect(s.player.x < x0 - 15, `holding Left walks Sammy left (${x0.toFixed(0)} -> ${s.player.x.toFixed(0)})`);
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  s = await state();
  expect(s.player.state === 'air', 'Space jumps');
  await page.keyboard.up('Space');
  await page.waitForTimeout(1600);
  await shot('2-scene1');

  // Debug skip through the scenes.
  await page.keyboard.press('KeyN');
  await waitMode('tally');
  await shot('3-scene1-clear');
  await waitMode('play');
  s = await state();
  expect(s.scene === 1 && s.score > 8000, `clearing banks the bonus and moves to scene 2 (score ${s.score})`);
  await page.waitForTimeout(1500);
  await shot('4-scene2');

  await page.keyboard.press('KeyN');
  await waitMode('card');
  await waitMode('play');
  s = await state();
  expect(s.scene === 2, 'then scene 3');
  await page.waitForTimeout(1500);
  await shot('5-scene3');

  await page.keyboard.press('KeyK');
  await waitMode('dying');
  await page.waitForTimeout(500);
  await shot('6-death');
  await waitMode('play');
  s = await state();
  expect(s.lives === 3 && s.scene === 2 && s.bonus > 9000, 'dying costs a life and restarts the scene with a full bonus');

  await page.keyboard.press('KeyN');
  await waitMode('card');
  await waitMode('play');
  s = await state();
  expect(s.scene === 0 && s.level === 1, 'after scene 3 comes scene 1 at level 1');
  await page.waitForTimeout(3500);
  await shot('7-scene1-level1');

  // Pause freezes the simulation.
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(100);
  const b1 = (await state()).bonus;
  await page.waitForTimeout(600);
  const b2 = (await state()).bonus;
  expect(b1 === b2, 'P pauses the bonus clock');
  await shot('8-paused');
  await page.keyboard.press('KeyP');

  // End to end: the planner bot plays the real page through all three scenes.
  await page.goto(`http://127.0.0.1:${port}/?debug=1&demo=planner&speed=4`);
  await page.waitForFunction(() => window.__sammy && window.__sammy.game);
  const seen = new Set();
  const wanted = [
    ['9-demo-rope', (g) => g.mode === 'play' && g.world.player.state === 'rope'],
    ['10-demo-blocks', (g) => g.mode === 'play' && g.scene === 1 && g.world.stage === 2 && g.world.player.x > 60],
    ['11-demo-carpet', (g) => g.mode === 'play' && g.scene === 1 && g.world.stage === 5 && g.world.carpet.seg >= 1],
    ['12-demo-plungers', (g) => g.mode === 'play' && g.scene === 2 && g.world.player.y < 130 && g.world.player.x < 150 && g.world.player.x > 40],
    ['13-demo-double-rope', (g) => g.mode === 'play' && g.scene === 2 && g.world.player.state === 'rope'],
  ];
  const deadline = Date.now() + 90000;
  let done = false;
  while (Date.now() < deadline && !done) {
    for (const [name, pred] of wanted) {
      if (seen.has(name)) continue;
      if (await page.evaluate(`(${pred.toString()})(window.__sammy.game)`)) { seen.add(name); await shot(name); }
    }
    done = await page.evaluate(() => window.__sammy.game.level >= 1);
    await page.waitForTimeout(40);
  }
  s = await state();
  expect(done, 'demo: the planner bot clears scenes 1, 2 and 3 in the real page');
  expect(s.lives === 4, `demo: without losing a life (lives ${s.lives})`);
  expect(s.score > 20000, `demo: and banks three bonuses (score ${s.score})`);
  expect(seen.size === wanted.length, `demo: saw every set piece (${[...seen].length}/${wanted.length})`);

  expect(errors.length === 0, `no console or page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  failures.push(`smoke run threw: ${e.message}`);
  console.log(`FAIL: ${e.message}`);
  if (errors.length) console.log(`console errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : `\nSmoke test passed. Screenshots: ${OUT}`);
process.exit(failures.length ? 1 : 0);
