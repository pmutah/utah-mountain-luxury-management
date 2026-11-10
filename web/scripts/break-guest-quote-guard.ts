// Proves every guest-quote guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const STATUS = 'src/lib/request-status.ts';
const PAGE = 'src/components/RequestStatus.tsx';
const ROUTE = 'functions/api/book/request/[token].ts';
const files = [STATUS, PAGE, ROUTE];

const originals = new Map<string, string>();
for (const f of files) {
  originals.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/guest-sees-quoted-total.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the total never reaches the guest view',
    file: STATUS,
    from: '...(quotedTotal !== undefined ? { quotedTotal } : {}),',
    to: '',
    expect: 'does not reach the guest view',
  },
  {
    name: 'a missing total becomes zero',
    file: STATUS,
    from: '? Math.round(request.quotedTotal)\n      : undefined;',
    to: '? Math.round(request.quotedTotal)\n      : 0;',
    expect: 'was accepted as a guest total',
  },
  {
    name: 'a zero total is accepted',
    file: STATUS,
    from: 'Number.isFinite(request.quotedTotal) && request.quotedTotal > 0',
    to: 'Number.isFinite(request.quotedTotal) && request.quotedTotal >= 0',
    expect: 'was accepted as a guest total',
  },
  {
    name: 'the line stops saying nothing was charged',
    file: STATUS,
    from: 'Nothing has been charged, and no card was collected on this site. The total is confirmed in our reply.',
    to: 'The total is confirmed in our reply.',
    expect: 'does not say whether anything was charged',
  },
  {
    name: 'a deposit percentage is invented',
    file: STATUS,
    from: '`You were quoted ${total} for these nights.',
    to: '`You were quoted ${total} for these nights. A 50% deposit is due on booking.',
    expect: 'deposit percentage was invented',
  },
  {
    name: 'a declined stay draws a money line',
    file: STATUS,
    from: "if (view.status === 'cancelled' || view.status === 'declined') return null;",
    to: "if (view.status === 'cancelled') return null;",
    expect: 'declined drew a money line',
  },
  {
    name: 'the page stops drawing the line',
    file: PAGE,
    from: 'data-bot="request-money"',
    to: 'data-bot="gone"',
    expect: 'money line is not drawn',
  },
  {
    name: 'the page claims it carries no price again',
    file: PAGE,
    from: 'This page shows the house, the dates, the party, and the total you were quoted. It does not carry a door code',
    to: 'This page does not carry a price. It does not carry a door code',
    expect: 'still says it carries no price',
  },
  {
    name: 'the route stops forwarding the total',
    file: ROUTE,
    from: '...(view.quotedTotal !== undefined ? { quotedTotal: view.quotedTotal } : {}),',
    to: '',
    expect: 'does not forward the quoted total',
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
