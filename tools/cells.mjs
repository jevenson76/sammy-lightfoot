// Runs bot attempts in child processes, several at once.
//
// Why a child per cell: the look-ahead bots are a heavy, allocation-hungry
// workload, and on Node 22/24 the engine itself occasionally dies under it
// (a V8 fatal error or a segfault, roughly once per twenty minutes of CPU).
// The simulation is deterministic, so a cell that is re-run gives exactly the
// same answer; isolating each cell and retrying a crashed one makes the
// report and the regression gate immune to that, and parallel as a bonus.

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const SIMULATE = fileURLToPath(new URL('./simulate.mjs', import.meta.url));
const MAX_TRIES = 4;

// One cell = one (scene, level, model) played for seeds 1..seeds.
// Resolves to { results: [{ status, cause, ticks, at, stage }], retries }.
export function runCell({ scene, level, model, seeds, maxTicks = 0 }) {
  const args = [SIMULATE, '--cell', `${scene},${level},${model},${seeds},${maxTicks}`];
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      tries++;
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve({ results: JSON.parse(out), retries: tries - 1 });
            return;
          } catch { /* truncated output: treat as a crash */ }
        }
        if (tries < MAX_TRIES) attempt();
        else reject(new Error(`cell scene=${scene} level=${level} model=${model} failed ${tries} times (last exit ${code})`));
      });
    };
    attempt();
  });
}

// Runs many cells with a bounded pool. onDone(index, value) fires as each finishes.
export async function runCells(cells, { concurrency = Math.max(2, Math.floor(availableParallelism() / 2)), onDone } = {}) {
  const out = new Array(cells.length);
  let next = 0;
  async function worker() {
    while (next < cells.length) {
      const i = next++;
      out[i] = await runCell(cells[i]);
      if (onDone) onDone(i, out[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, worker));
  return out;
}
