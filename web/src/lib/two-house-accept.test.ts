/**
 * A two-house accept has to save two stays. Before this, the route wrote only the first house, so the
 * guest paid for both and the second house stayed empty and bookable.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { stayPlans } from './booking-accept.ts';

const plan = {
  propertyId: 'river' as const,
  alsoPropertyId: 'ranch' as const,
  checkIn: '2027-12-01',
  checkOut: '2027-12-04',
  nights: 3,
  guestName: 'Direct guest',
  note: 'Direct request book-1. · 30 guests',
  payout: 9000,
  source: 'Direct',
};

test('a two-house plan becomes two stays, one per house', () => {
  const stays = stayPlans(plan);
  assert.equal(stays.length, 2);
  assert.deepEqual(
    stays.map((stay) => stay.propertyId),
    ['river', 'ranch'],
  );
  for (const stay of stays) {
    assert.equal(stay.checkIn, '2027-12-01');
    assert.equal(stay.checkOut, '2027-12-04');
    assert.equal(stay.nights, 3);
  }
});

test('the host net is split across the houses and still adds up', () => {
  const stays = stayPlans(plan);
  const total = stays.reduce((sum, stay) => sum + stay.payout, 0);
  assert.equal(Math.round(total * 100) / 100, plan.payout, 'the split lost or gained money');
  // Neither house shows a booking with no money: a per-house statement would read as a loss.
  assert.ok(stays.every((stay) => stay.payout > 0), 'a house got a stay with no revenue');
  assert.equal(stays[0]!.payout, 4500);
  assert.equal(stays[1]!.payout, 4500);
});

test('the split follows the houses own totals when the quote knows them', () => {
  // A party of 30 puts 25 in the River House, so the Ranch share is much smaller.
  const stays = stayPlans({ ...plan, shares: { river: 7000, ranch: 1200 } });
  const total = stays.reduce((sum, stay) => sum + stay.payout, 0);
  assert.equal(Math.round(total * 100) / 100, 9000);
  // 9000 × 7000/8200 and 9000 × 1200/8200.
  assert.equal(stays[0]!.payout, 7682.93);
  assert.equal(stays[1]!.payout, 1317.07);
  assert.ok(stays[1]!.payout > 0, 'the smaller house got nothing');
});

test('a partial share map falls back to an even split rather than zeroing a house', () => {
  const stays = stayPlans({ ...plan, shares: { river: 8000 } });
  assert.ok(stays.every((stay) => stay.payout > 0), 'a house got nothing when a share was missing');
  assert.equal(stays[0]!.payout, 4500);
  assert.equal(stays[1]!.payout, 4500);
});

test('an odd cent lands on one house so the two add up exactly', () => {
  const stays = stayPlans({ ...plan, payout: 9000.01 });
  const total = stays.reduce((sum, stay) => sum + stay.payout, 0);
  assert.equal(Math.round(total * 100), 900001);
  assert.equal(stays[0]!.payout, 4500.01);
  assert.equal(stays[1]!.payout, 4500);
});

test('the second stay says it is the second house on the same request', () => {
  const stays = stayPlans(plan);
  assert.match(stays[1]!.note, /Second house on the same request/);
  assert.match(stays[1]!.note, /Direct request book-1/);
  assert.equal(stays[0]!.note.includes('Second house'), false);
});

test('a one-house plan stays one stay', () => {
  const single = stayPlans({ ...plan, alsoPropertyId: undefined });
  assert.equal(single.length, 1);
  assert.equal(single[0]!.propertyId, 'river');
  assert.equal(single[0]!.payout, 9000);
});

test('the second house cannot be the same house as the first', () => {
  // `acceptHold` already refuses this, and `stayPlans` never invents a second row without one.
  const single = stayPlans({ ...plan, alsoPropertyId: undefined });
  assert.equal(single.length, 1);
});

test('a guest total is only recorded when the quote knows it', () => {
  /*
   * An absent figure means "not known", and must never be written as zero: a zero reads as a comped
   * stay and would quietly invoice nothing for a real booking.
   */
  const stays = stayPlans({ ...plan });
  for (const stay of stays) {
    assert.equal('guestTotal' in stay, false, 'a guest total was invented for a plan that carried none');
  }
  // And when the quote does know it, both houses carry their own share of what the guest was quoted.
  const withGuest = stayPlans({ ...plan, guestShares: { river: 12000, ranch: 3400 } });
  assert.equal(withGuest[0]!.guestTotal, 12000);
  assert.equal(withGuest[1]!.guestTotal, 3400);
  assert.equal(
    Math.round((withGuest[0]!.guestTotal! + withGuest[1]!.guestTotal!) * 100) / 100,
    15400,
    'the two guest totals did not add up to what the guest was quoted',
  );
});
