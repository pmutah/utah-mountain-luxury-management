// Proves every single-source fee guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FEE = 'src/lib/owner-fee.ts';
const REPORT = 'src/lib/report.ts';
const WATERFALL = 'src/components/MoneyWaterfall.tsx';
const CSV = 'src/lib/owner-statement-file.ts';
const files = [FEE, REPORT, WATERFALL, CSV];

const originals = new Map<string, string>();
for (const f of files) {
  originals.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/owner-fee-one-source.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the label is typed instead of derived',
    file: FEE,
    from: 'export const MANAGEMENT_FEE_LABEL = `${MANAGEMENT_FEE_PERCENT}%`;',
    to: "export const MANAGEMENT_FEE_LABEL = '20%';",
    expect: 'the label is hardcoded instead of derived',
  },
  {
    name: 'the report computes the fee from a bare 0.2',
    file: REPORT,
    from: '  const mgtFee = managementFee(basis);',
    to: '  const mgtFee = basis > 0 ? basis * 0.2 : 0;',
    expect: 'no longer calls the shared fee function',
  },
  {
    name: 'a fee sentence types the percentage',
    file: WATERFALL,
    from: 'Ranch and River pay a {MANAGEMENT_FEE_LABEL} management fee to Brandon',
    to: 'Ranch and River pay a 20% management fee to Brandon',
    expect: 'is typed rather than interpolated',
  },
  {
    name: 'the CSV note types the percentage',
    file: CSV,
    from: '`Note,"After the ${MANAGEMENT_FEE_LABEL} management fee',
    to: '`Note,"After the 20% management fee',
    expect: 'is typed rather than interpolated',
  },
  {
    name: 'a loss is charged a fee',
    file: FEE,
    from: '  if (!Number.isFinite(rentAfterCleaning) || rentAfterCleaning <= 0) return 0;',
    to: '  if (!Number.isFinite(rentAfterCleaning)) return 0;',
    expect: 'a loss was charged a management fee',
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
