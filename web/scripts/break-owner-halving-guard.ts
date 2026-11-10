// Proves the both-surfaces halving guard FAILS when either page regresses.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATEMENT = 'src/components/OwnerStatement.tsx';
const PORTAL = 'src/components/OwnerPortal.tsx';
const PORTAL_LIB = 'src/lib/owner-portal.ts';
const files = [STATEMENT, PORTAL, PORTAL_LIB];

const originals = new Map<string, string>();
for (const f of files) {
  originals.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/owner-statement-halving-said-plainly.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the owner page claims a plain halving again',
    file: PORTAL,
    from: `                          {halfIsExact(house.leftover, house.todd)
                            ? \`Half is \${money(house.todd)}.\`
                            : \`Todd's half is \${money(house.todd)}, rounded to the cent in each month.\`}`,
    to: 'Half is {money(house.todd)}.',
    expect: 'does not check whether the share is an exact half',
  },
  {
    name: 'the host page claims a plain halving again',
    file: STATEMENT,
    from: `{formatCurrency(house.leftover)} left after the {formatCurrency(house.fee)} fee and costs.{' '}
              {halfIsExact(house.leftover, house.todd)
                ? \`Half is \${formatCurrency(house.todd)}.\`
                : \`Todd's half is \${formatCurrency(house.todd)}, rounded to the cent in each month.\`}`,
    to: '{formatCurrency(house.leftover)} left after the {formatCurrency(house.fee)} fee and costs. Half is {formatCurrency(house.todd)}.',
    expect: 'still states an unconditional halving',
  },
  {
    name: 'the shared helper is duplicated in the host page',
    file: STATEMENT,
    from: "import { halfIsExact } from '../lib/owner-portal';",
    to: "function halfIsExact(a: number, b: number) { return Math.abs(a / 2 - b) <= 0.005; }",
    expect: 'declares its own copy',
  },
  {
    name: 'the shared helper stops existing',
    file: PORTAL_LIB,
    from: 'export function halfIsExact(leftover: number, todd: number): boolean {',
    to: 'function halfIsExact(leftover: number, todd: number): boolean {',
    expect: 'shared halfIsExact is gone',
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
  console.log('BASELINE ALREADY FAILING');
  console.log(baseline.output.slice(-1200));
  for (const f of files) unlinkSync(`${f}.bak`);
  process.exit(1);
}

let broken = 0;
for (const m of mutations) {
  const original = originals.get(m.file)!;
  if (!original.includes(m.from)) {
    console.log(`MISS  ${m.name} — text not found in ${m.file}`);
    broken++;
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(m.expect);
  console.log(`${failed ? 'OK  ' : 'MISS'}  ${m.name} -> ${result.pass} pass, ${result.fail} fail${failed && !named ? ' (wrong reason)' : ''}`);
  if (!failed) broken++;
  writeFileSync(m.file, original);
}

for (const f of files) {
  copyFileSync(`${f}.bak`, f);
  unlinkSync(`${f}.bak`);
}

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);
if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
