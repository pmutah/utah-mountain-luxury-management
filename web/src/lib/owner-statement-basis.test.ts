import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOwnerStatement } from './owner-statement.ts';
import type { Expense, Reservation } from './api';

/*
 * Todd's statement must reconcile **from the numbers it prints**. Reading the live page, the headline
 * was -$3,236 beside a "$11,469 management fee" and a "$70,068 host payout" — and 20% of $70,068 is
 * $14,014, so the fee reads $2,545 light. It is not: the fee is charged on rent **after cleaning**,
 * while the printed `costs` figure **includes** cleaning, and the two cancel exactly.
 *
 * I got that wrong myself before working it through, which is exactly the position Todd is in: the page
 * stated "after the 20% management fee" and never said what the 20% was taken from. These assertions
 * pin the published numbers to the headline so the statement can be checked without trusting the prose.
 */

const RES: Reservation[] = [
  {
    id: 't-res-1',
    guestName: 'Test Guest',
    propertyId: 'ranch',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    payout: 8000 + 1200,
    source: 'Airbnb',
    status: 'confirmed',
  },
];

const EXP: Expense[] = [
  { id: 't-exp-cleaning', propertyId: 'ranch', date: '2026-06-05', amount: 1200, category: 'Cleaning', note: 't' },
  { id: 't-exp-mortgage', propertyId: 'ranch', date: '2026-06-01', amount: 3000, category: 'Mortgage', note: 't' },
  { id: 't-exp-util', propertyId: 'ranch', date: '2026-06-10', amount: 500, category: 'Utilities', note: 't' },
];

test('the printed fee, costs and leftover rebuild the headline share', () => {
  const statement = buildOwnerStatement('2026-06', 'year', RES, EXP);
  const ranch = statement.houses.find((house) => house.id === 'ranch');
  assert.ok(ranch, 'the Ranch line is missing');

  // Whatever the headline says, the printed working has to produce it.
  assert.equal(
    Math.round(ranch.leftover / 2),
    Math.round(ranch.todd),
    'the leftover halved must equal the share printed beside it',
  );

  // And the headline for the whole statement is the sum of the house lines.
  const summed = statement.houses.reduce((total, house) => total + house.todd, 0);
  assert.ok(
    Math.abs(summed - statement.todd) < 0.05,
    `the houses sum to ${summed.toFixed(2)} but the headline says ${statement.todd.toFixed(2)}`,
  );
});

test('the fee is 20% of rent after cleaning, and the page says so', () => {
  const statement = buildOwnerStatement('2026-06', 'year', RES, EXP);
  const ranch = statement.houses.find((house) => house.id === 'ranch')!;

  // The basis is the house's own cleaning figure, which is what the report subtracts — not necessarily
  // the cleaning row in the expense list. Pin the identity, not an assumption about which number it is.
  assert.ok(
    Math.abs(ranch.fee - (ranch.revenue - ranch.cleaning) * 0.2) < 0.05,
    `fee ${ranch.fee} is not 20% of rent after cleaning (${ranch.revenue - ranch.cleaning})`,
  );
  assert.ok(ranch.cleaning > 0, 'this fixture would not test the basis if cleaning were zero');

  // The fee is NOT 20% of the revenue line, and this is the misreading the page has to prevent:
  // 20% of revenue is a larger number, so the printed fee looks short unless the basis is stated.
  assert.ok(ranch.fee < ranch.revenue * 0.2, 'the fee is not charged on the gross payout');
});

test('cleaning is deducted once, not twice', () => {
  // `costs` includes cleaning and the fee basis excludes it. If both applied to the same subtraction the
  // share would be short by half the cleaning bill — for a real month, thousands of dollars.
  const statement = buildOwnerStatement('2026-06', 'year', RES, EXP);
  const ranch = statement.houses.find((house) => house.id === 'ranch')!;

  const once = ranch.revenue - ranch.cleaning - ranch.fee - (ranch.costs - ranch.cleaning);
  const twice = ranch.revenue - ranch.cleaning - ranch.fee - ranch.costs;
  assert.ok(Math.abs(ranch.leftover - once) < 0.05, 'cleaning was applied more than once in the leftover');
  assert.ok(
    Math.abs(ranch.leftover - twice) > 100,
    'the two bases are indistinguishable here, so this test would not catch a double deduction',
  );
});

test('a month with no rent charges no fee rather than a negative one', () => {
  const statement = buildOwnerStatement('2026-06', 'year', [], EXP);
  for (const house of statement.houses) {
    assert.ok(house.fee >= 0, `${house.id} charged a negative fee on no rent`);
  }
});
