// Proves every malformed-plan guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PANEL = 'src/components/PushPlanPanel.tsx';
const BAK = 'src/components/.pp.malformed.bak';
const TEST = 'src/lib/market/malformed-plan-does-not-crash.test.ts';

const original = readFileSync(PANEL, 'utf8');
copyFileSync(PANEL, BAK);

const mutations: Array<{ name: string; from: string; to: string; expect: string }> = [
  {
    name: 'gate loses its optional check again',
    from: '{data.gate?.send?.line ??',
    to: '{data.gate.send?.line ??',
    expect: '`gate` is dereferenced without an optional check',
  },
  {
    name: 'send loses its optional check',
    from: '{data.gate?.send?.line ??',
    to: '{data.gate?.send.line ??',
    expect: '`send` is dereferenced without an optional check',
  },
  {
    name: 'shadowDays loses its optional check',
    from: '{data.shadowDays?.ready',
    to: '{data.shadowDays.ready',
    expect: 'the shadow-day condition is dereferenced',
  },
  {
    name: 'a shadow-day count loses its fallback',
    from: '${data.shadowDays.days ?? 0} of ${data.shadowDays.required ?? 7}',
    to: '${data.shadowDays.days} of ${data.shadowDays.required ?? 7}',
    expect: 'has no fallback and would print',
  },
  {
    name: 'the load path accepts any JSON again',
    from: 'if (!shapeOk) {',
    to: 'if (false) {',
    expect: 'a bad shape does not put the card in its error state',
  },
  {
    name: 'the shape check stops requiring gate',
    from: "'gate' in result &&",
    to: '',
    expect: 'the shape check does not require `gate`',
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
  unlinkSync(BAK);
  process.exit(1);
}

let broken = 0;
for (const m of mutations) {
  if (!original.includes(m.from)) {
    console.log(`MISS  ${m.name} — text not found`);
    broken++;
    continue;
  }
  writeFileSync(PANEL, original.replace(m.from, m.to));
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(m.expect);
  console.log(`${failed ? 'OK  ' : 'MISS'}  ${m.name} -> ${result.pass} pass, ${result.fail} fail${failed && !named ? ' (wrong reason)' : ''}`);
  if (!failed) broken++;
  writeFileSync(PANEL, original);
}

copyFileSync(BAK, PANEL);
unlinkSync(BAK);

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);
if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
