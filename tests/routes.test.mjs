// Regression gate: scripted players drive the real simulation through each
// scene (see tools/bots.mjs for the player models). If a tuning change makes
// a scene impossible, unfair, or trivially mashable, this fails.
//
// Attempts run in child processes via tools/cells.mjs: that is faster, and it
// keeps a rare Node engine crash under this workload from failing the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCells } from '../tools/cells.mjs';

const SCENES = [0, 1, 2];
const describe = (r) => `${r.status} ${r.cause || ''} at ${r.at}`.trim();

test('a frame-perfect player clears every scene at levels 0 to 3', async () => {
  const cells = [];
  for (const scene of SCENES) for (const level of [0, 1, 2, 3]) cells.push({ scene, level, model: 'planner', seeds: 1 });
  const out = await runCells(cells);
  out.forEach(({ results }, i) => {
    assert.equal(results[0].status, 'clear', `scene ${cells[i].scene + 1} level ${cells[i].level}: ${describe(results[0])}`);
  });
});

test('a careful player (wants 0.1 s of slack, is up to 0.1 s late) clears each scene most of the time at levels 0 to 3', async () => {
  const cells = [];
  for (const scene of SCENES) for (const level of [0, 1, 2, 3]) cells.push({ scene, level, model: 'careful', seeds: 6 });
  const out = await runCells(cells);
  out.forEach(({ results }, i) => {
    const { scene, level } = cells[i];
    const need = level === 0 ? 5 : 4; // level 0 is the on-ramp
    const clears = results.filter((r) => r.status === 'clear');
    const fails = results.filter((r) => r.status !== 'clear').map(describe);
    assert.ok(clears.length >= need, `scene ${scene + 1} level ${level}: only ${clears.length}/6 clears (${fails.join('; ')})`);
    // the 99.9 s bonus clock should always pay something, and no scene should be over in a blink
    for (const r of clears) {
      const seconds = r.ticks / 60;
      assert.ok(seconds >= 10 && seconds <= 75, `scene ${scene + 1} level ${level} cleared in ${seconds.toFixed(1)} s`);
    }
  });
});

test('a button-masher who ignores the telegraphs never clears a scene', async () => {
  const cells = SCENES.map((scene) => ({ scene, level: 1, model: 'masher', seeds: 8, maxTicks: 60 * 60 }));
  const out = await runCells(cells);
  out.forEach(({ results }, i) => {
    assert.equal(results.filter((r) => r.status === 'clear').length, 0, `scene ${i + 1} was cleared by mashing`);
  });
});
