import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, buildSingleFile } from '../tools/build-single.mjs';

// Bundles a virtual file set and runs the result, returning what it left on `out`.
function runBundle(files, entry = '/app/main.js') {
  const code = bundle(entry, (p) => files[p]);
  const out = {};
  new Function('out', code)(out);
  return { out, code };
}

test('named imports and exports are wired across modules', () => {
  const { out } = runBundle({
    '/app/main.js': "import { add, two as deux } from './lib/math.js';\nout.sum = add(deux, 3);\n",
    '/app/lib/math.js': 'export const two = 2;\nexport function add(a, b) { return a + b; }\nconst hidden = 99;\n',
  });
  assert.equal(out.sum, 5);
});

test('multi-line import lists and parent-directory paths resolve', () => {
  const { out } = runBundle({
    '/app/src/main.js': "import {\n  a,\n  b,\n} from '../shared/ab.js';\nout.v = a + b;\n",
    '/app/shared/ab.js': 'export const a = 1;\nexport const b = 10;\n',
  }, '/app/src/main.js');
  assert.equal(out.v, 11);
});

test('modules keep their own scope: the same private name in two files does not collide', () => {
  const { out } = runBundle({
    '/app/main.js': "import { x } from './x.js';\nimport { y } from './y.js';\nconst DT = 3;\nout.v = x() + y() + DT;\n",
    '/app/x.js': 'const DT = 100;\nexport function x() { return DT; }\n',
    '/app/y.js': 'const DT = 20;\nexport function y() { return DT; }\n',
  });
  assert.equal(out.v, 123);
});

test('a module shared by two importers runs once', () => {
  const { out } = runBundle({
    '/app/main.js': "import { a } from './a.js';\nimport { b } from './b.js';\nout.v = a + b;\n",
    '/app/a.js': "import { count } from './shared.js';\nexport const a = count();\n",
    '/app/b.js': "import { count } from './shared.js';\nexport const b = count();\n",
    '/app/shared.js': 'out.loads = (out.loads || 0) + 1;\nlet n = 0;\nexport function count() { n += 1; return n; }\n',
  });
  assert.equal(out.loads, 1);
  assert.equal(out.v, 3);
});

test("a dynamic `await import('...')` is bundled in and becomes a plain lookup", () => {
  const { out, code } = runBundle({
    '/app/main.js': "if (out.want) {\n  const { hi } = await import('./lazy.js');\n  out.said = hi();\n}\nout.done = true;\n",
    '/app/lazy.js': "export function hi() { return 'hi'; }\n",
  });
  assert.equal(out.done, true);
  assert.ok(!/\bawait\b/.test(code), 'no await left, so it runs as a classic script');
  assert.ok(!/\bimport\s*\(/.test(code));
});

test('syntax the bundler does not handle is refused, not silently mangled', () => {
  assert.throws(() => runBundle({ '/app/main.js': 'export default 1;\n' }), /unsupported/);
  assert.throws(() => runBundle({ '/app/main.js': "import * as m from './m.js';\n", '/app/m.js': '' }), /unsupported/);
  assert.throws(() => runBundle({ '/app/main.js': "import { a } from './a.js';\n", '/app/a.js': "import { m } from './main.js';\nexport const a = 1;\n" }), /circular/);
  assert.throws(() => runBundle({ '/app/main.js': "import { a } from './missing.js';\n" }), /cannot read/);
});

test('the real game builds into one HTML file with no module loading left in it', () => {
  const html = buildSingleFile();
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<canvas id="screen"'));
  assert.ok(!html.includes('src="src/main.js"'), 'the external module script is gone');
  assert.ok(!/<script[^>]*\bsrc=/.test(html), 'no external scripts at all');
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.ok(!/^\s*(import|export)\b/m.test(script), 'no import/export statements');
  assert.ok(script.includes('createGame') && script.includes('SAMMY'), 'the game code and title text are inside');
  assert.ok(!script.includes('</script'), 'nothing in the code can close the script tag early');
  // It must at least parse as a classic script.
  assert.doesNotThrow(() => new Function(script));
});
