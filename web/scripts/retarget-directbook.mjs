/**
 * Point one test file's `DirectBook.tsx` source read at `DirectReserveCard.tsx`.
 *
 * Run with Node's own fs rather than a shell round-trip: PowerShell's `Set-Content -Encoding UTF8` re-encoded the files
 * and turned every `→` and `—` into mojibake, silently breaking an assertion in `platform.test.ts` that compares a
 * rendered string. Reading and writing as UTF-8 here leaves every other byte alone.
 *
 *   node scripts/retarget-directbook.mjs src/lib/platform/platform.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: retarget-directbook.mjs <file...>');
  process.exit(1);
}

for (const path of paths) {
  const before = readFileSync(path, 'utf8');
  const after = before
    .replaceAll('components/DirectBook.tsx', 'components/DirectReserveCard.tsx')
    .replaceAll('components\\DirectBook.tsx', 'components\\DirectReserveCard.tsx')
    .replaceAll('DirectBook.tsx', 'DirectReserveCard.tsx');
  if (after === before) {
    console.log(`${path}: no change`);
    continue;
  }
  writeFileSync(path, after, 'utf8');
  console.log(`${path}: retargeted`);
}
