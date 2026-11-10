// Proves every measured-median guard FAILS when the code it protects is broken.
// Run with: npx tsx scripts/break-comp-median-guard.ts
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const BOARD = join('src', 'lib', 'market', 'board.ts');
const BOARD_BAK = join('src', 'lib', 'market', '.board.backup');
const PANEL = join('src', 'components', 'MarketBoard.tsx');
const PANEL_BAK = join('src', 'components', '.MarketBoard.backup');
const TEST = 'src/lib/market/comp-median-is-measured.test.ts';

const boardOriginal = readFileSync(BOARD, 'utf8');
const panelOriginal = readFileSync(PANEL, 'utf8');
copyFileSync(BOARD, BOARD_BAK);
copyFileSync(PANEL, PANEL_BAK);

const mutations: Array<{ name: string; file: 'board' | 'panel'; from: string; to: string; expect: string; firstOnly?: boolean }> = [
  {
    name: 'the measured median falls back to the blended one',
    file: 'board',
    from: '  const liveMedianAsk = liveMedians.length > 0 ? Math.round(median(liveMedians)) : null;',
    to: '  const liveMedianAsk = liveMedians.length > 0 ? Math.round(median(liveMedians)) : Math.round(median(first30.map((n) => n.median)));',
    expect: 'reported a measured median',
  },
  {
    name: 'the measured median stops being computed from measured nights',
    file: 'board',
    from: '.filter((night) => night.source !== \'sample\' && Number.isFinite(night.median) && night.median > 0)',
    to: '.filter((night) => Number.isFinite(night.median) && night.median > 0)',
    expect: 'a sample-only window reported a measured median',
  },
  {
    name: 'the surface goes back to printing the blended median',
    file: 'panel',
    from: 'formatWhole(board.summary.liveMedianAsk)',
    to: 'formatWhole(board.summary.medianAsk)',
    expect: 'still prints the blended median',
  },
  {
    name: 'the surface stops requiring measured nights',
    file: 'panel',
    // Occurrence-specific: the phrase appears twice (value and hint) with different indentation, so replace the first only.
    from: 'board.summary.measuredNights >= 5',
    to: 'true',
    expect: 'does not require a minimum number of measured nights',
    firstOnly: true,
  },
  {
    name: 'the refusal loses its next step',
    file: 'panel',
    from: ' Record asks under Saved comps.',
    to: '',
    expect: 'does not say how to fix it',
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
  console.log(baseline.output.slice(-1500));
  unlinkSync(BOARD_BAK);
  unlinkSync(PANEL_BAK);
  process.exit(1);
}

let broken = 0;
for (const m of mutations) {
  const original = m.file === 'board' ? boardOriginal : panelOriginal;
  const target = m.file === 'board' ? BOARD : PANEL;
  if (!original.includes(m.from)) {
    console.log(`MISS  ${m.name} — text to break not found`);
    broken++;
    continue;
  }
  const mutated = m.firstOnly
    ? original.replace(m.from, m.to)
    : original.split(m.from).join(m.to);
  writeFileSync(target, mutated);
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(m.expect);
  console.log(
    `${failed ? 'OK  ' : 'MISS'}  ${m.name} -> ${result.pass} pass, ${result.fail} fail${failed && !named ? ' (wrong reason)' : ''}`,
  );
  if (!failed) {
    broken++;
    console.log(result.output.slice(-1200));
  }
  // Restore before the next mutation so they do not compound.
  writeFileSync(BOARD, boardOriginal);
  writeFileSync(PANEL, panelOriginal);
}

copyFileSync(BOARD_BAK, BOARD);
copyFileSync(PANEL_BAK, PANEL);
unlinkSync(BOARD_BAK);
unlinkSync(PANEL_BAK);

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);
if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
