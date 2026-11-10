// Proves every editable-part-code guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const EDITOR = 'src/components/GuestAppEditor.tsx';
const CLIENT = 'src/lib/api.ts';
const RULES = 'src/lib/part-door-codes.ts';
const GUEST = 'functions/api/stay-guide/[token]/index.ts';

const files = [EDITOR, CLIENT, RULES, GUEST];
const backups = new Map<string, string>();
for (const f of files) {
  backups.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/part-door-codes-editable.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the per-part section is removed',
    file: EDITOR,
    from: 'data-bot="part-door-codes"',
    to: 'data-bot="gone"',
    expect: 'no per-part code section',
  },
  {
    name: 'a part field is dropped',
    file: EDITOR,
    from: "{ id: 'garage-suite', name: 'Garage Suite' },",
    to: '',
    expect: 'does not offer a field for garage-suite',
  },
  {
    name: 'an emptied field stores an empty string',
    file: EDITOR,
    from: 'else delete next[id];',
    to: 'else next[id] = value;',
    expect: 'stored as an empty string',
  },
  {
    name: 'the client type loses the field',
    file: CLIENT,
    from: '  partDoorCodes?: Partial<Record<',
    to: '  partDoorCodesGone?: Partial<Record<',
    expect: 'has no partDoorCodes',
  },
  {
    name: 'the section shows on every house',
    file: EDITOR,
    from: "{house === 'river' && (",
    to: '{true && (',
    expect: 'not scoped to the River House',
  },
  {
    name: 'the summary line is removed',
    file: EDITOR,
    from: 'data-bot="part-door-summary"',
    to: 'data-bot="gone"',
    expect: 'not drawn',
  },
  {
    name: 'a part guest could fall back to the house code',
    file: RULES,
    from: "if (code) codes.push({ label: name, code });\n    else missingNames.push(name);",
    to: "codes.push({ label: name, code: code || houseCode });",
    expect: 'was given a code',
  },
  {
    name: 'the guest route stops passing the part codes',
    file: GUEST,
    from: 'partCodes: guide.partDoorCodes,',
    to: 'partCodes: undefined,',
    expect: 'stopped passing the part codes',
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
  const original = backups.get(m.file)!;
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
