// Proves each publish-switch guard FAILS when the code it protects is broken.
// Run with: npx tsx scripts/break-publish-guard.ts
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PANEL = join('src', 'components', 'PushPlanPanel.tsx');
const BACKUP = join('src', 'components', '.PushPlanPanel.backup');
const TEST = 'src/lib/market/publish-switch-surface.test.ts';

const original = readFileSync(PANEL, 'utf8');
copyFileSync(PANEL, BACKUP);

const mutations: Array<{ name: string; from: string; to: string; expect: string }> = [
  {
    name: 'the switch is never read',
    from: '    loadSwitch();\n',
    to: '',
    expect: 'not re-read',
  },
  {
    name: 'the panel never calls the sender',
    from: 'const result = await api.publishRates();',
    to: 'const result = { ok: true, sent: [], refused: [], line: "ok", switch: "on" as const };',
    expect: 'never calls the sender',
  },
  {
    name: 'the first click already sends',
    from: 'onClick={() => setConfirming(true)}',
    to: 'onClick={() => { setConfirming(true); void publish(); }}',
    expect: 'first click already sends',
  },
  {
    name: 'a refusal is drawn without its reason',
    from: '{row.date ? ` · ${row.date}` : \'\'}: {row.why}',
    to: "{row.date ? ` · ${row.date}` : ''}: did not send",
    expect: "without the route's reason",
  },
  {
    name: 'an unread switch has no line',
    from: '        {pubUnread && (\n          <p className="mt-2 text-sm" data-bot="publish-unread">',
    to: '        {false && (\n          <p className="mt-2 text-sm" data-bot="publish-unread">',
    expect: 'not gated on the failed read',
  },
  {
    name: 'the send renders with the switch off',
    from: "            {pub.switch === 'off' ? (",
    to: '            {false ? (',
    expect: 'not gated on the switch',
  },
  {
    name: 'the state line is hardcoded instead of the route',
    from: '              {pub.line}',
    to: '              Publishing is ON. Approved prices will be written to the Hospitable calendar.',
    expect: 'hardcodes the on line',
  },
];

function runTests(): { pass: number; fail: number; output: string } {
  try {
    const output = execFileSync('npx', ['tsx', '--test', TEST], { encoding: 'utf8', shell: true });
    const pass = Number(/ℹ pass (\d+)/.exec(output)?.[1] ?? -1);
    const fail = Number(/ℹ fail (\d+)/.exec(output)?.[1] ?? -1);
    return { pass, fail, output };
  } catch (err) {
    const anyErr = err as { stdout?: string; stderr?: string };
    const output = `${anyErr.stdout ?? ''}${anyErr.stderr ?? ''}`;
    const pass = Number(/ℹ pass (\d+)/.exec(output)?.[1] ?? -1);
    const fail = Number(/ℹ fail (\d+)/.exec(output)?.[1] ?? -1);
    return { pass, fail, output };
  }
}

const baseline = runTests();
console.log(`baseline: ${baseline.pass} pass, ${baseline.fail} fail`);
if (baseline.fail !== 0) {
  console.log('BASELINE IS ALREADY FAILING — restore and fix before trusting any result.');
  console.log(baseline.output.slice(-2000));
  unlinkSync(BACKUP);
  process.exit(1);
}

let broken = 0;
for (const mutation of mutations) {
  if (!original.includes(mutation.from)) {
    console.log(`MISS  ${mutation.name} — the text to break was not found, so this mutation proves nothing`);
    broken++;
    continue;
  }
  writeFileSync(PANEL, original.replace(mutation.from, mutation.to));
  const result = runTests();
  const failed = result.fail > 0;
  const named = result.output.includes(mutation.expect);
  console.log(
    `${failed ? 'OK  ' : 'MISS'}  ${mutation.name} -> ${result.pass} pass, ${result.fail} fail` +
      `${failed && !named ? ` (failed, but not with "${mutation.expect}")` : ''}`,
  );
  if (!failed) {
    broken++;
    console.log(result.output.slice(-1500));
  }
}

copyFileSync(BACKUP, PANEL);
unlinkSync(BACKUP);

const restored = runTests();
console.log(`restored: ${restored.pass} pass, ${restored.fail} fail`);
if (restored.fail !== 0 || restored.pass !== baseline.pass) {
  console.log('RESTORE FAILED — the panel is not back to its original state.');
  process.exit(1);
}
process.exit(broken === 0 ? 0 : 1);
