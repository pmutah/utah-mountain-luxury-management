/**
 * Rewrite `const body = (await request.json()) as <Type>;` to a guarded read.
 *
 * `await request.json()` throws on malformed input. Unguarded, that throw reaches the runtime and the
 * caller gets a Cloudflare 500 "Worker threw exception" page — found on the public booking form, where
 * a guest with a truncated body saw a crash page.
 *
 * This walks each file, finds the exact expression, tracks brace depth to find the end of the type,
 * and rewrites it to use `readJsonBody`. It is deliberately narrow: it only touches the
 * `const body = (await request.json()) as ...;` shape and leaves anything else alone, so a file it does
 * not understand is skipped rather than mangled.
 *
 * Usage: node scripts/guard-json-bodies.mjs [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

/** Import path from a file under functions/ to functions/_lib/json-body. */
function importPath(file) {
  /*
   * `depth` is how many directories the file sits below `functions/`. `blocks.ts` lives at
   * `functions/api/calendar/blocks.ts`, which is two levels down, so it needs `../../_lib`. The first
   * version measured from `api/` instead of `functions/`, wrote `../_lib`, and TypeScript could not
   * resolve the module in any of the 19 files.
   */
  const fromFunctions = relative(join(ROOT, 'functions'), file).split(sep).join('/');
  const depth = fromFunctions.split('/').length - 1;
  return `${'../'.repeat(depth)}_lib/json-body`;
}

/**
 * Find `const body = (await request.json()) as <Type>;` in `text`.
 *
 * Returns offsets covering the whole statement so the caller can replace it exactly.
 */
function findStatement(text) {
  const marker = 'const body = (await request.json()) as ';
  const start = text.indexOf(marker);
  if (start < 0) return null;

  let i = start + marker.length;
  let depth = 0;
  // Walk the type expression until a `;` at depth 0.
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{' || ch === '[' || ch === '(' || ch === '<') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')' || ch === '>') depth -= 1;
    else if (ch === ';' && depth === 0) return { start, end: i + 1, typeStart: start + marker.length, typeEnd: i };
    i += 1;
  }
  return null;
}

const files = walk(join(ROOT, 'functions', 'api'));
let changed = 0;
const skipped = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('await request.json()')) continue;
  if (text.includes('readJsonBody')) continue;
  // Already guarded by hand, or already defaulted: leave it alone.
  if (/try\s*\{[\s\S]{0,300}?await request\.json\(\)/.test(text)) continue;
  if (text.includes('request.json().catch(() => ({}))')) continue;

  const found = findStatement(text);
  if (!found) {
    skipped.push(relative(ROOT, file).split(sep).join('/'));
    continue;
  }

  const type = text.slice(found.typeStart, found.typeEnd).trim();
  const statement =
    `const parsed = await readJsonBody<${type}>(request);\n` +
    `  if (!parsed.ok) return parsed.response;\n` +
    `  const body = parsed.body;`;

  let next = text.slice(0, found.start) + statement + text.slice(found.end);

  // Add the import after the first import line, so it lands with the other imports.
  if (!next.includes('_lib/json-body')) {
    const spec = importPath(file);
    const firstImport = next.indexOf('\nimport ');
    if (firstImport < 0) {
      skipped.push(`${relative(ROOT, file).split(sep).join('/')} (no import to anchor)`);
      continue;
    }
    const lineEnd = next.indexOf('\n', firstImport + 1);
    next = `${next.slice(0, lineEnd)}\nimport { readJsonBody } from '${spec}';${next.slice(lineEnd)}`;
  }

  if (WRITE) writeFileSync(file, next, 'utf8');
  changed += 1;
  console.log(`${WRITE ? 'rewrote' : 'would rewrite'} ${relative(ROOT, file).split(sep).join('/')}`);
}

console.log('');
console.log(`${changed} file(s) ${WRITE ? 'rewritten' : 'to rewrite'}`);
if (skipped.length > 0) {
  console.log(`skipped ${skipped.length}:`);
  for (const row of skipped) console.log(`  ${row}`);
}
