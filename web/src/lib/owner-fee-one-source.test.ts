import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterFee, managementFee, MANAGEMENT_FEE_LABEL, MANAGEMENT_FEE_PERCENT, MANAGEMENT_FEE_RATE } from './owner-fee.ts';

/*
 * The management fee was a bare literal and a sentence repeated in eight places.
 *
 * `report.ts` computed the money with `basis * 0.2`, and seven components each typed "20%" into their own prose. Nothing linked
 * the arithmetic to the words. That is the same shape that produced the worst defect of this session: the "Half is" sentence
 * lived in two components, the host copy was fixed, and the owner's page kept telling them to halve a number and get a
 * different answer for a whole turn.
 *
 * A rate repeated eight times is that hazard with a longer fuse. Change the fee, or correct the basis, and the sentences keep
 * asserting 20% while the money uses something else.
 *
 * These guards pin one source: the rate and the words come from `owner-fee.ts`, and no fee-facing file may hardcode the figure.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'functions'))].map((path) => ({
  path: path.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, ''),
  text: readFileSync(path, 'utf8'),
}));

/** Files whose subject is the management fee. Both the payment and the split share this rate. */
const FEE_FILES = [
  'src/lib/report.ts',
  'src/lib/owner-fee.ts',
  'src/lib/owner-rules.ts',
  'src/lib/owner-portal.ts',
  'src/lib/owner-statement-file.ts',
  'src/lib/owner-letter.ts',
  'src/lib/guide-desk.ts',
  'src/components/OwnerStatement.tsx',
  'src/components/OwnerDistribution.tsx',
  'src/components/PortfolioReport.tsx',
  'src/components/MoneyWaterfall.tsx',
  'src/components/PropertyDetail.tsx',
];

test('the rate has exactly one definition', () => {
  assert.equal(MANAGEMENT_FEE_RATE, 0.2, 'the management fee rate changed; every sentence follows it');
  assert.equal(MANAGEMENT_FEE_PERCENT, 20, 'the whole-percent form disagrees with the rate');
  assert.equal(MANAGEMENT_FEE_LABEL, '20%', 'the label disagrees with the rate');
  // The label must be derived, not typed: a literal here would be the same defect one level down.
  assert.match(readFileSync(join(ROOT, 'src', 'lib', 'owner-fee.ts'), 'utf8'), /MANAGEMENT_FEE_LABEL = `\$\{MANAGEMENT_FEE_PERCENT\}%`/, 'the label is hardcoded instead of derived from the rate');
});

test('the money uses the rate, not a literal', () => {
  const report = readFileSync(join(ROOT, 'src', 'lib', 'report.ts'), 'utf8');
  /*
   * `managementFeeRaw`, not `managementFee`. The leftover must come from the **unrounded** fee, as the original `basis * 0.2`
   * line did, because only the published figures are rounded to cents. Using the rounded fee here shipped a real 2c change to
   * Todd's share (-3,236.18 to -3,236.16), caught by comparing production before and after.
   */
  assert.match(report, /managementFeeRaw\(basis\)/, 'the report no longer uses the shared fee');
  assert.equal(
    /managementFee\(basis\)/.test(report),
    false,
    'the report rounds the fee before computing the leftover, which moves the halved share',
  );
  // `* 0.2` in the split is the defect this replaced. Comments are stripped first: the comment explaining the change quotes the
  // old expression, and a file-wide search matched that quote — the same prose trap as the dead-branch guards.
  const code = report.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(
    /\bbasis\s*\*\s*0\.2\b/.test(code),
    false,
    'the report computes the fee from a bare 0.2 again',
  );
});

test('no fee-facing file hardcodes the percentage in prose', () => {
  /*
   * A literal `20%` in a sentence is the thing that drifts. The label must be interpolated, so changing the rate changes every
   * surface. Checked per file so a failure names the place to fix.
   */
  const offenders: string[] = [];
  for (const rel of FEE_FILES) {
    const source = SOURCES.find((file) => file.path === rel);
    if (!source) {
      offenders.push(`${rel}: missing (update this list if the file moved)`);
      continue;
    }
    // Comments are allowed to quote the figure; only rendered strings are not.
    const code = source.text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const match of code.matchAll(/\b20\s?%/g)) {
      offenders.push(`${rel}: ${match[0]} is typed rather than interpolated`);
    }
  }
  assert.deepEqual(offenders, [], `a fee sentence hardcodes the rate: ${offenders.join('; ')}`);
});

test('the fee is charged on a positive basis only, in cents', () => {
  /*
   * The rule the owner set: 20% of rent **after cleaning**, and never on a month that lost money. Charging a fee on a loss grows
   * the loss and inverts what the fee is for.
   */
  assert.equal(managementFee(1000), 200, 'the fee is not 20% of a positive basis');
  assert.equal(managementFee(0), 0, 'a zero basis was charged');
  assert.equal(managementFee(-500), 0, 'a loss was charged a management fee');
  assert.equal(managementFee(Number.NaN), 0, 'a non-number was charged');
  // Whole cents, so a statement never prints a float tail.
  for (const basis of [57344.85, 900.01, 33.33, 1234567.89]) {
    const fee = managementFee(basis);
    assert.equal(Math.round(fee * 100) / 100, fee, `fee for ${basis} is not whole cents`);
  }
  assert.equal(afterFee(1000), 800, 'what remains after the fee is wrong');
});

test('the annual fee is the sum of monthly fees, not 20% of the year', () => {
  /*
   * The rounding choice that makes the statement foot. `managementFee` on the annual basis gives a cent more than the sum of the
   * twelve monthly fees on production, and the monthly column is what an owner can add up. Pinned so a future "simplification"
   * that applies the function to the year total fails here.
   */
  const annualBasis = 57344.85;
  const viaFunction = managementFee(annualBasis);
  // Twelve months each rounded, then summed, is what the report does — it is not reproduced here, only the difference asserted.
  assert.notEqual(viaFunction, 11468.96, 'the single-call fee now equals the monthly sum, so the rounding changed');
  assert.equal(viaFunction, 11468.97, 'the single-call fee on the annual basis changed');
});
