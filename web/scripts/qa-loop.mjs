/**
 * The milestone check: types, function types, route guards, and the test suite.
 * Playwright is a separate harness (e2e/shell.spec.mjs) because it needs a running site.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  ['npx', ['tsc', '-b', '--pretty', 'false']],
  ['npm', ['run', 'check:functions']],
  ['npm', ['run', 'check:guards']],
  ['npm', ['test']],
];

for (const [cmd, args] of steps) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
