// Proves every gmail-address guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STORE = 'functions/_lib/gmail-store.ts';
const GUESTS = 'src/components/GuestsPanel.tsx';
const DOCS = 'src/components/DocumentsVault.tsx';
const SURVEY = 'functions/_lib/survey-copy.ts';
const files = [STORE, GUESTS, DOCS, SURVEY];

const originals = new Map<string, string>();
for (const f of files) {
  originals.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/gmail-address-is-not-guessed.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the not-connected message names the old mailbox again',
    file: STORE,
    from: 'Gmail is not connected. Open the dashboard and connect the guest mailbox there, so guest confirmations and host alerts can send.',
    to: 'Gmail is not connected. Connect utahmountainluxury@gmail.com in the dashboard.',
    expect: 'names a mailbox the deployment may not use',
  },
  {
    name: 'the not-connected message loses its next step',
    file: STORE,
    from: 'Open the dashboard and connect the guest mailbox there',
    to: 'Try again later',
    expect: 'gives no next step',
  },
  {
    name: 'the guests panel names the old mailbox',
    file: GUESTS,
    from: "'not connected — connect the guest mailbox'",
    to: "'not connected — sign in as utahmountainluxury@gmail.com'",
    expect: 'names a hardcoded mailbox',
  },
  {
    name: 'the documents vault names the old mailbox',
    file: DOCS,
    from: "'not connected — connect the guest mailbox'",
    to: "'not connected — sign in as utahmountainluxury@gmail.com'",
    expect: 'names a hardcoded mailbox',
  },
  {
    name: 'the From address stops coming from the tokens',
    file: STORE,
    from: 'From: Utah Mountain Luxury <${tokens.email}>',
    to: 'From: Utah Mountain Luxury <utahmountainluxury@gmail.com>',
    expect: 'no longer comes from the tokens',
  },
  {
    name: 'the survey body stops using its reply constant',
    file: SURVEY,
    from: '`${SURVEY_REPLY_EMAIL} · ${SURVEY_PHONE}`',
    to: '`utahmountainluxury@gmail.com · ${SURVEY_PHONE}`',
    expect: 'does not interpolate the reply constant',
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
