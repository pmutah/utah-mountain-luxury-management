import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePartnerContributions } from '../paid-by.ts';

/*
 * **The construction ledger showed $1,096,812.40 beside "2 receipts" and nothing else.**
 *
 * Measured on production: 53 construction rows, **$1,135,044.82**, of which **2 rows carry a receipt** totalling
 * $5,493.85 — **0.5% documented**. Todd's side alone is $1,096,812.40.
 *
 * A receipt *count* beside a large figure is not coverage. A partner reading that card sees a settled number and a
 * small count, and nothing tells them that almost none of the money has a document behind it. This is the same
 * label-with-nothing-behind-it class as the rest of this work, except the number is money two people are squaring up.
 *
 * The summary now reports the undocumented amount per payer, so the card can say it.
 */

const row = (over: Record<string, unknown>) => ({
  id: 'exp-1',
  category: 'Materials',
  amount: 1000,
  propertyId: 'construction',
  paidBy: 'todd',
  ...over,
});

test('a row with no receipt counts as undocumented', () => {
  const s = summarizePartnerContributions([row({ amount: 2500 })], 'construction');
  assert.equal(s.todd, 2500);
  assert.equal(s.toddUndocumented, 2500, 'an undocumented row was treated as documented');
  assert.equal(s.undocumentedCount, 1);
});

test('a row with a storage path is documented', () => {
  const s = summarizePartnerContributions([row({ receiptStoragePath: 'receipts/x/y.pdf' })], 'construction');
  assert.equal(s.toddUndocumented, 0);
  assert.equal(s.undocumentedCount, 0);
});

test('a row with only a KV url is documented too', () => {
  // The store writes either a storage path (Firebase) or a URL (the KV fallback). Either is evidence.
  const s = summarizePartnerContributions([row({ receiptUrl: '/api/receipt/x' })], 'construction');
  assert.equal(s.toddUndocumented, 0, 'the KV fallback receipt was not counted as documentation');
});

test('a null field is not documentation', () => {
  // The real type is `string | null`, and a null must not read as present.
  const s = summarizePartnerContributions([row({ receiptStoragePath: null, receiptUrl: null })], 'construction');
  assert.equal(s.toddUndocumented, 1000);
});

test('the undocumented split follows the payer, not the total', () => {
  /*
   * The production shape: almost everything is Todd's side. A single combined figure would overstate Brandon's exposure
   * and understate Todd's, so each is reported separately.
   */
  const s = summarizePartnerContributions(
    [
      row({ id: 'exp-a', amount: 900_000, paidBy: 'todd' }),
      row({ id: 'exp-b', amount: 100_000, paidBy: 'brandon', receiptStoragePath: 'p.pdf' }),
      row({ id: 'exp-c', amount: 40_000, paidBy: 'brandon' }),
    ],
    'construction',
  );
  assert.equal(s.todd, 900_000);
  assert.equal(s.toddUndocumented, 900_000, "Todd's undocumented amount is wrong");
  assert.equal(s.brandon, 140_000);
  assert.equal(s.brandonUndocumented, 40_000, "Brandon's undocumented amount counted his documented row");
  assert.equal(s.undocumentedCount, 2, 'the documented row was counted as undocumented');
});

test('an unassigned row is not attributed to either partner', () => {
  // An unassigned row is a separate problem, and charging it to a partner would invent a debt.
  const s = summarizePartnerContributions([row({ paidBy: undefined })], 'construction');
  assert.equal(s.toddUndocumented, 0);
  assert.equal(s.brandonUndocumented, 0);
  assert.equal(s.unassigned, 1000);
});

test('another property is never mixed into the construction ledger', () => {
  const s = summarizePartnerContributions(
    [row({ amount: 500, propertyId: 'ranch', receiptStoragePath: null }), row({ id: 'exp-k', amount: 700 })],
    'construction',
  );
  assert.equal(s.todd, 700, 'a rental expense leaked into the construction ledger');
  assert.equal(s.toddUndocumented, 700);
});


