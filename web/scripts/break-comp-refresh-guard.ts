// Proves every comp-refresh guard FAILS when the code it protects is broken.
// Run with: npx tsx scripts/break-comp-refresh-guard.ts
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const STORE = join('functions', '_lib', 'pricing-store.ts');
const BACKUP = join('functions', '_lib', '.pricing-store.backup');
const TEST = 'src/lib/market/comp-refresh-honest.test.ts';

const original = readFileSync(STORE, 'utf8');
copyFileSync(STORE, BACKUP);

const mutations: Array<{ name: string; from: string; to: string; expect: string }> = [
  {
    name: 'the page body is truncated again',
    from: 'const html = await res.text();',
    to: 'const html = (await res.text()).slice(0, 12000);',
    expect: 'truncated again',
  },
  {
    name: 'nearby listings are no longer excluded',
    from: `                      '"nearby", "similar", "recommended", or another listing\\'s structured data - a neighbour\\'s rate is not this ' +`,
    to: `                      '"similar", "recommended", or another listing\\'s structured data - a neighbour\\'s rate is not this ' +`,
    expect: 'does not exclude nearby',
  },
  {
    name: 'a null result is explained away',
    from: '`${comp.label}: this site does not publish its nightly rate in the page itself, so there is nothing to read. Record the ask you see in a browser.`',
    to: '`${comp.label}: could not extract price — use manual snapshot`',
    expect: 'blames the host again',
  },
  {
    name: 'a 403 is not called out',
    from: "res.status === 403 ? 'That site blocks a server-side read, so record the ask by hand.' : 'Nothing was read.'",
    to: "'Nothing was read.'",
    expect: 'a 403 is not explained',
  },
  {
    name: 'a missing key is not checked first',
    from: 'if (!geminiKey) {',
    to: 'if (false) {',
    expect: 'not checked before the loop',
  },
  {
    name: 'recent comps are not counted',
    from: '      recent++;\n',
    to: '',
    expect: 'not counted',
  },
  {
    name: 'a zero-refresh run has no wording',
    from: '      refreshed === 0\n',
    to: '      false\n',
    expect: 'no wording of its own',
  },
];

function runTests(): { pass: number; fail: number; output: string } {
  const attempt = (): string => {
    try {
      return execFileSync('npx', ['tsx', '--test', TEST], { encoding: 'utf8', shell: true });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      return `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
  };
  const output = attempt();
  return {
    pass: Number(/ℹ pass (\d+)/.exec(output)?.[1] ?? -1),
    fail: Number(/ℹ fail (\d+)/.exec(output)?.[1] ?? -1),
    output,
  };
}

const baseline = runTests();
console.log(`baseline: ${baseline.pass} pass, ${baseline.fail} fail`);
if (baseline.fail !== 0) {
  console.log('BASELINE ALREADY FAILING — fix before trusting any result.');
  console.log(baseline.output.slice(-2000));
  unlinkSync(BACKUP);
  process.exit(1);
}

let broken = 0;
for (const mutation of mutations) {
  if (!original.includes(mutation.from)) {
    console.log(`MISS  ${mutation.name} — text to break not found, so this mutation proves nothing`);
    broken++;
    continue;
  }
  writeFileSync(STORE, original.replace(mutation.from, mutation.to));
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(mutation.expect);
  console.log(
    `${failed ? 'OK  ' : 'MISS'}  ${mutation.name} -> ${result.pass} pass, ${result.fail} fail` +
      `${failed && !named ? ` (failed, but not with "${mutation.expect}")` : ''}`,
  );
  if (!failed) {
    broken++;
    console.log(result.output.slice(-1200));
  }
}

copyFileSync(BACKUP, STORE);
unlinkSync(BACKUP);

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);
if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED — pricing-store is not back to its original state.');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
