// Proves every goal-gap guard FAILS when the code it protects is broken, then prints the real branch decisions using the
// production figures from /api/pricing/yield-plan on 2026-11-10.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { goalGapIsBeyondMarket } from '../src/lib/revenue-goals.ts';

const PANEL = join('src', 'components', 'RevenueGoals.tsx');
const BACKUP = join('src', 'components', '.RevenueGoals.backup');
const TEST = 'src/lib/goal-gap-not-a-price.test.ts';

const original = readFileSync(PANEL, 'utf8');
copyFileSync(PANEL, BACKUP);

const mutations: Array<{ name: string; from: string; to: string; expect: string }> = [
  {
    name: 'the card stops checking the gap against the market',
    from: 'const beyondMarket = goalGapIsBeyondMarket(ask, marketHostNightly);',
    to: 'const beyondMarket = false;',
    expect: 'never checks the gap against the market',
  },
  {
    name: 'the refusal stops naming the market figure',
    from: '` The gap works out to ${formatWhole(ask ?? 0)} a night, which is far above the ${formatWhole(marketHostNightly ?? 0)} comparable houses here charge.` +',
    to: '` The gap works out to ${formatWhole(ask ?? 0)} a night.` +',
    expect: 'does not name the market',
  },
  {
    name: 'the market figure stops reaching the card',
    from: 'const marketHostNightly = market[id] ?? null;',
    to: 'const marketHostNightly = null;',
    expect: 'not taken from the loaded medians',
  },
  {
    name: 'the branch is no longer recorded',
    from: ` data-bot="revenue-goal-line" data-beyond-market={beyondMarket ? 'yes' : 'no'}`,
    to: ` data-bot="revenue-goal-line"`,
    expect: 'does not record which branch',
  },
];

function runTests(): { pass: number; fail: number; output: string } {
  let output = '';
  try {
    output = execFileSync('npx', ['tsx', '--test', TEST], { encoding: 'utf8', shell: true });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
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
  console.log(baseline.output.slice(-1500));
  unlinkSync(BACKUP);
  process.exit(1);
}

let broken = 0;
for (const mutation of mutations) {
  if (!original.includes(mutation.from)) {
    console.log(`MISS  ${mutation.name} — text to break not found`);
    broken++;
    continue;
  }
  writeFileSync(PANEL, original.replace(mutation.from, mutation.to));
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(mutation.expect);
  console.log(`${failed ? 'OK  ' : 'MISS'}  ${mutation.name} -> ${result.pass} pass, ${result.fail} fail${failed && !named ? ` (wrong reason)` : ''}`);
  if (!failed) broken++;
}

copyFileSync(BACKUP, PANEL);
unlinkSync(BACKUP);

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);

console.log('\n=== real production figures, which branch each house takes ===');
// From /api/pricing/yield-plan on 2026-11-10: the ask the card computes, and the comp median it compares against.
const rows: Array<[string, number, number]> = [
  ['ranch', 1920, 417],
  ['lindon', 456, 356],
  ['river', 1300, 1166],
];
for (const [house, ask, median] of rows) {
  const beyond = goalGapIsBeyondMarket(ask, median);
  console.log(
    `  ${house.padEnd(7)} ask=$${ask} median=$${median} ratio=${(ask / median).toFixed(2)}x -> ${beyond ? 'says the gap is beyond pricing' : 'shows the ask'}`,
  );
}

if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
