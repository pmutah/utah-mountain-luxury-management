/**
 * Repair the `json-body` import depth written by the first codemod run.
 *
 * That run measured depth from `functions/api/` instead of `functions/`, so every file got an import
 * one level too shallow and TypeScript could not resolve the module. This recomputes the correct
 * relative specifier for each file that imports the helper and rewrites only that import line.
 *
 * Usage: node scripts/fix-json-body-imports.mjs [--write]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

let fixed = 0;
for (const file of walk(join(ROOT, 'functions'))) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/import \{ readJsonBody \} from '([^']+)';/);
  if (!match) continue;

  const fromFunctions = relative(join(ROOT, 'functions'), file).split(sep).join('/');
  const depth = fromFunctions.split('/').length - 1;
  const want = `${'../'.repeat(depth)}_lib/json-body`;
  if (match[1] === want) continue;

  const next = text.replace(match[0], `import { readJsonBody } from '${want}';`);
  if (WRITE) writeFileSync(file, next, 'utf8');
  fixed += 1;
  console.log(`  ${fromFunctions}: ${match[1]} -> ${want}`);
}

console.log('');
console.log(`${fixed} import(s) ${WRITE ? 'fixed' : 'to fix'}`);
