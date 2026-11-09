import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * Auditing a real owner statement by hand produced a 1-cent difference on the Ranch: the statement showed a fee of
 * $15,082.39 and 20% of the annual basis is $15,082.40.
 *
 * The statement is right and the audit was wrong. Each **month** is rounded to cents and the year sums those monthly
 * figures, which is what an owner adding up twelve lines gets. Taking 20% of the annual total is a different sum, and it
 * would be the wrong number to publish.
 *
 * These tests pin that choice, because a future "cleanup" that computed the fee once on the annual total would look
 * tidier and would disagree with every monthly line above it.
 */

const REPORT = readFileSync(new URL('./report.ts', import.meta.url), 'utf8');

test('the management fee is rounded per month, then summed', () => {
  // The monthly function rounds the fee...
  assert.match(REPORT, /mgtFee: cents\(mgtFee\)/, 'the monthly fee is no longer rounded to cents');
  // ...and the annual total adds those rounded figures rather than recomputing on the year.
  assert.match(REPORT, /mgtFee: acc\.mgtFee \+ d\.mgtFee/, 'the annual fee no longer sums the monthly fees');
});

test('the annual fee never recomputes 20% of the year total', () => {
  /*
   * This is the tidy-looking change that would break footing. If the annual fee ever becomes `basis * 0.2` on the year,
   * it will disagree with the twelve monthly lines an owner can add up, by a cent or two.
   */
  const annual = REPORT.slice(REPORT.indexOf('const parts = rows.map'), REPORT.indexOf('const parts = rows.map') + 900);
  assert.equal(/mgtFee: cents\([^)]*\*\s*0\.2/.test(annual), false, 'the annual fee recomputes 20% of the year');
});

test('the statement still halves the leftover for Todd', () => {
  assert.match(REPORT, /const share = leftover \/ 2/, 'the leftover is no longer halved');
  assert.match(REPORT, /todd: cents\(share\)/, 'Todds share is not the half');
});

test('the fee basis is revenue after cleaning, which is what makes 20% of it look like 18% of revenue', () => {
  assert.match(REPORT, /const basis = revenue - cleaning/, 'the fee basis is not revenue after cleaning');
  assert.match(REPORT, /basis > 0 \? basis \* 0\.2 : 0/, 'a negative basis is charged a fee');
});
