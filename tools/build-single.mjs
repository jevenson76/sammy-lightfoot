// Packs the game into ONE html file that runs from a double-click (file://),
// where browsers refuse to load separate ES modules. No dependencies.
//
//   node tools/build-single.mjs        writes dist/sammy-lightfoot.html
//
// This is a small bundler for this codebase's style only: named imports
// (`import { a, b as c } from './x.js'`), declaration exports
// (`export const|let|function|class`), and `await import('./x.js')`.
// Anything else is refused with an error rather than guessed at.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT = /import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)'\s*;?/g;
const DYNAMIC = /await\s+import\(\s*'([^']+)'\s*\)/g;
const EXPORT = /^export\s+((?:async\s+)?function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const LEFTOVER = /^\s*(import|export)\b.*$/m;

// Returns one classic-script string. `read(path)` returns a file's text (or undefined).
export function bundle(entry, read) {
  const ids = new Map();      // file -> index
  const modules = [];         // transformed bodies, by index
  const visiting = new Set();

  function visit(file) {
    if (ids.has(file)) return ids.get(file);
    if (visiting.has(file)) throw new Error(`circular import involving ${file}`);
    visiting.add(file);
    let src = read(file);
    if (src == null) throw new Error(`cannot read ${file}`);

    const need = (spec) => visit(resolve(dirname(file), spec));
    src = src.replace(IMPORT, (m, list, spec) => {
      const names = list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${names.join(', ')} } = __req(${need(spec)});`;
    });
    src = src.replace(DYNAMIC, (m, spec) => `__req(${need(spec)})`);
    const exported = [];
    src = src.replace(EXPORT, (m, kind, name) => { exported.push(name); return `${kind} ${name}`; });
    const bad = src.match(LEFTOVER);
    if (bad) throw new Error(`unsupported import/export syntax in ${file}: ${bad[0].trim()}`);

    visiting.delete(file);
    const id = modules.length;
    ids.set(file, id);
    modules.push(`__defs[${id}] = () => {\n${src}\nreturn { ${exported.join(', ')} };\n};`);
    return id;
  }

  const entryId = visit(resolve(entry));
  return [
    '(() => {',
    "'use strict';",
    'const __defs = [];',
    'const __cache = [];',
    'const __req = (id) => (id in __cache ? __cache[id] : (__cache[id] = __defs[id]()));',
    ...modules,
    `__req(${entryId});`,
    '})();',
  ].join('\n');
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function buildSingleFile() {
  const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };
  const js = bundle(join(ROOT, 'src/main.js'), read).replace(/<\/script/gi, '<\\/script');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const tag = '<script type="module" src="src/main.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html no longer contains the module script tag this build replaces');
  return html.replace(tag, () => `<script>\n${js}\n</script>`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = join(ROOT, 'dist', 'sammy-lightfoot.html');
  mkdirSync(dirname(out), { recursive: true });
  const html = buildSingleFile();
  writeFileSync(out, html);
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}
