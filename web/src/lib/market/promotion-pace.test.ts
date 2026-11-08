import assert from 'node:assert/strict';
import test from 'node:test';
import { promotionForNight } from './fill.ts';

/*
 * The push-plan route hardcoded year pace to `'unknown'`, and `promotionForNight` refuses to recommend a
 * promotion on an unknown pace. So **no promotion could ever reach the authoritative plan**, while the board
 * still labelled 23 River and 19 Lindon nights `promote`. A host saw "promote" beside a price that had not
 * moved, and a plan with zero promotions, with nothing explaining the gap.
 *
 * The route now computes the pace from the stays it already read. These tests pin the rule that made the bug
 * invisible: an unknown pace silently suppresses every promotion, and a known short pace allows one.
 */

const base = {
  date: '2026-11-20',
  asOf: '2026-11-08',
  holiday: false,
  ourGuest: 1000,
  floorGuest: 400,
  taken: new Set<string>(),
};

test('an unknown pace suppresses a promotion, which is what hid the bug', () => {
  const decision = promotionForNight({ ...base, pace: 'unknown' });
  assert.equal(decision.percent, 0);
  assert.match(decision.reason, /pace is not loaded/i);
});

test('a short year with an eligible night does recommend one', () => {
  // 12 days out, weekday, weekend not booked: inside the 21-day window, so it is due.
  const decision = promotionForNight({ ...base, pace: 'short' });
  assert.equal(decision.percent, 20, 'a short year should be able to discount an eligible night');
  assert.ok(decision.offerGuest < base.ourGuest, 'the offer should be below the base');
});

test('a met year never discounts', () => {
  const decision = promotionForNight({ ...base, pace: 'met' });
  assert.equal(decision.percent, 0);
  assert.match(decision.reason, /on the books/i);
});

test('the promotion never goes under the floor', () => {
  // A base close to the floor: 20% off would breach it, so the offer must clamp at the floor.
  const decision = promotionForNight({ ...base, ourGuest: 450, floorGuest: 400, pace: 'short' });
  assert.ok(decision.offerGuest >= 400, `an offer of ${decision.offerGuest} went under the floor of 400`);
});
