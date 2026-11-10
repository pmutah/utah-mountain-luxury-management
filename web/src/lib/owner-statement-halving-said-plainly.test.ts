import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOwnerStatement } from './owner-statement.ts';
import { OWNER_PORTAL_NOTES, halfIsExact } from './owner-portal.ts';

/*
 * The owner statement told its reader to halve a number and get the wrong answer.
 *
 * It read: "$6,472.33 left after the $11,468.96 fee and costs. Half is $3,236.18."
 *
 * Half of $6,472.33 is $3,236.165, not $3,236.18. Measured on production 2026-11-10, every owner link showed that pair. The
 * three cents are not an error in the money — the fee and the share are each rounded to cents **per month** and then summed, so
 * the yearly figure agrees with the monthly column an owner can add up. `owner-fee-footing.test.ts` pins that choice.
 *
 * The defect is in the sentence. It was written to let an owner check the arithmetic without a spreadsheet, and it was the one
 * line on the page that did not check out. A reader who multiplies Todd's share by two and gets a different leftover concludes
 * the statement is wrong — and they would be right about that sentence.
 *
 * So the page now says what is true: the share that is paid, and that it is rounded monthly when it is not an exact half. And
 * the notes say so before the owner finds it.
 */

const PAGE = readFileSync(join(process.cwd(), 'src', 'components', 'OwnerStatement.tsx'), 'utf8');

/** The exact shape production showed: a leftover whose half is not the published share. */
function statementWithRounding() {
  /* A single $1,000 rental with a $100 cleaning fee, a 20% fee on $900, and no other costs.
   * The fee is $180, so the leftover is $720 and Todd's half is exactly $360 — an exact halving.
   * To produce a non-exact one the cents have to land on a half-cent, which the per-month rounding does. */
  const base = {
    id: 'r1',
    propertyId: 'ranch' as const,
    checkIn: '2026-02-02',
    checkOut: '2026-02-05',
    nights: 3,
    payout: 1000,
    status: 'confirmed',
    note: '',
  };
  return buildOwnerStatement('2026-11', 'ytd', [base as never], []);
}

test('the page never claims a halving that does not hold', () => {
  /*
   * The assertion is on the code: the old sentence interpolated `house.todd` behind the literal words "Half is". That phrasing
   * is only correct when the halves line up, so the component must choose between an exact claim and a rounded one.
   *
   * Checked on **both** surfaces. The host's `OwnerStatement` was fixed first; the owner's own `OwnerPortal` kept the
   * unconditional claim for a turn, which is the drift a second copy of a sentence always produces.
   */
  for (const path of ['src/components/OwnerStatement.tsx', 'src/components/OwnerPortal.tsx']) {
    const page = readFileSync(join(process.cwd(), path), 'utf8');
    assert.equal(
      /costs\. Half is \{/.test(page),
      false,
      `${path} still states an unconditional halving`,
    );
    assert.match(page, /halfIsExact\(/, `${path} does not check whether the share is an exact half`);
    assert.match(page, /rounded to the cent in each month/, `${path} does not explain the rounded case to the owner`);
  }
  // One definition, so the two surfaces cannot disagree again.
  const portal = readFileSync(join(process.cwd(), 'src', 'lib', 'owner-portal.ts'), 'utf8');
  assert.match(portal, /export function halfIsExact/, 'the shared halfIsExact is gone from owner-portal');
  assert.equal(
    /function halfIsExact/.test(PAGE.replace(/import[^\n]*halfIsExact[^\n]*\n/g, '')),
    false,
    'OwnerStatement declares its own copy of halfIsExact instead of importing the shared one',
  );
});

test('halfIsExact tolerates a cent of monthly rounding but catches a real error', () => {
  /*
   * The tolerance is the point. A cent or two of accumulated monthly rounding is expected and must not trigger the caveat; a
   * share that is genuinely wrong must.
   *
   * The production pair is a **1.5c** gap, not 0.5c: `-6472.33 / 2 = -3236.165`, and the published share is `-3236.18`. My
   * first version of this test asserted that pair was within half a cent and failed - correctly. The pair is the case the caveat
   * exists for, so it belongs on the "not exact" side. The function is exercised through its real module now that both
   * surfaces share it.
   */
  // The production pair, a 1.5c gap from monthly rounding: this is the rounded case, so it is NOT exact.
  assert.equal(halfIsExact(-6472.33, -3236.18), false, 'the production 1.5c gap was treated as an exact half');
  // A true halving.
  assert.equal(halfIsExact(720, 360), true, 'an exact halving was treated as rounded');
  // Sub-half-cent noise is float, not rounding, and must read as exact.
  assert.equal(halfIsExact(1000.01, 500.005), true, 'a sub-half-cent float gap was treated as rounding');
  // A share that is actually wrong by a dollar.
  assert.equal(halfIsExact(720, 359), false, 'a one-dollar error was accepted as rounding');
});

test('the monthly column is the figure that adds up, and the page says so', () => {
  /*
   * The reassuring fact must be true before it is published: the months sum to the headline exactly, on the real statement.
   */
  const statement = statementWithRounding();
  const monthSum = Math.round(statement.months.reduce((sum, month) => sum + month.todd, 0) * 100) / 100;
  assert.equal(
    monthSum,
    Math.round(statement.todd * 100) / 100,
    'the monthly column does not sum to the headline, so the note would be false',
  );
});

test('the owner is told about the rounding before they find it', () => {
  /*
   * The note has to be in the list the page renders, not in a comment. `ownerPortalView` supplies `notes` from this constant.
   */
  const joined = OWNER_PORTAL_NOTES.join(' ');
  assert.match(joined, /rounded to the cent before the months are added/, 'the rounding is not explained to the owner');
  assert.match(joined, /differ from a straight halving/, 'the note does not name the discrepancy an owner would find');
  assert.match(joined, /monthly column is the figure that adds up/, 'the note does not say which figure to trust');
});

test('the notes still state the fee basis and the split', () => {
  // The pre-existing facts must survive the edit; they are what make 20% look like 18% of revenue.
  const joined = OWNER_PORTAL_NOTES.join(' ');
  assert.match(joined, /20% is charged on rent after cleaning/, 'the fee basis note is gone');
  assert.match(joined, /splits in half/, 'the split note is gone');
  assert.match(joined, /A loss after the fee splits the same way/, 'the loss note is gone');
  // And nothing on this page may imply it edits the books.
  assert.match(joined, /does not change a booking or a saved expense/, 'the read-only promise is gone');
});
