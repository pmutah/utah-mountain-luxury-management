// Proves every pet-fee guard FAILS when the code it protects is broken.
import { copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RULES = 'src/lib/house-rules.ts';
const QUOTE = 'src/lib/quote.ts';
const PAGE = 'src/components/DirectBook.tsx';
const ROUTE = 'functions/api/book/index.ts';
const files = [RULES, QUOTE, PAGE, ROUTE];

const originals = new Map<string, string>();
for (const f of files) {
  originals.set(f, readFileSync(f, 'utf8'));
  copyFileSync(f, `${f}.bak`);
}

const TEST = 'src/lib/pet-fee-is-charged.test.ts';

const mutations: Array<{ name: string; file: string; from: string; to: string; expect: string }> = [
  {
    name: 'the fee is charged per dog instead of per stay',
    file: RULES,
    from: 'return PET_FEE;',
    to: 'return PET_FEE * (Number.isInteger(dogs) ? dogs : 1);',
    expect: 'the second dog doubled the fee',
  },
  {
    name: 'the fee is charged per night',
    file: QUOTE,
    from: 'stayTotal: lodging + cleaning + petFee,',
    to: 'stayTotal: lodging + cleaning + petFee * Math.max(1, nights.length),',
    expect: 'the total did not move by the fee',
  },
  {
    name: 'everyone is charged a pet fee',
    file: RULES,
    from: "if (typeof dogs !== 'number' || !Number.isFinite(dogs) || !Number.isInteger(dogs) || dogs <= 0) return 0;",
    to: "if (typeof dogs !== 'number') return 0;",
    expect: 'produced a pet fee',
  },
  {
    name: 'the fee is not in the total at all',
    file: QUOTE,
    from: 'stayTotal: lodging + cleaning + petFee,',
    to: 'stayTotal: lodging + cleaning,',
    expect: 'the total did not move by the fee',
  },
  {
    name: 'the fee is folded into cleaning',
    file: QUOTE,
    // The real fold: the cleaning line absorbs the fee and `petFee` reports zero, which is what hiding it would look like.
    from: '  const cleaning = CLEANING[house];',
    to: '  const cleaning = CLEANING[house] + petFee;',
    expect: 'the total did not move by the fee',
  },
  {
    name: 'a junk dog count is accepted',
    file: RULES,
    from: 'if (typeof value !== \'number\' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;',
    to: 'if (typeof value !== \'number\') return null;',
    expect: 'was accepted as a dog count',
  },
  {
    name: 'the guest has no dog field',
    file: PAGE,
    from: 'data-bot="stay-dogs"',
    to: 'data-bot="gone"',
    expect: 'no dog field',
  },
  {
    name: 'the page stops naming the fee',
    file: PAGE,
    from: 'data-bot="stay-pet-fee"',
    to: 'data-bot="gone"',
    expect: 'does not name the fee',
  },
  {
    name: 'the dog input accepts any one digit again',
    file: PAGE,
    from: 'String(Math.min(Number(digits), MAX_DOGS))',
    to: 'digits',
    expect: 'does not clamp to the owner limit',
  },
  {
    name: 'hitting the limit is not explained',
    file: PAGE,
    from: 'data-bot="stay-dogs-limit"',
    to: 'data-bot="gone"',
    expect: 'not explained',
  },
  {
    name: 'the route stops storing the dogs',
    file: ROUTE,
    from: '...(declaredDogs(body.dogs) !== null ? { dogs: declaredDogs(body.dogs)! } : {}),',
    to: '',
    expect: 'does not read a declared dog count',
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
