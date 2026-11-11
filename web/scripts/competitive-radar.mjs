/**
 * Prints the fixture competitive radar. It does not scrape.
 * The same diff is covered by src/lib/platform/platform.test.ts.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(dir, 'print-radar.ts')],
  { stdio: 'inherit', cwd: join(dir, '..') },
);
process.exit(result.status ?? 1);
