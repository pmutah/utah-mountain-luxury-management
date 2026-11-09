import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicUnit } from './booked-nights.ts';
import { unitOfferLine, unitStayOffers, unitsTogetherSleeps, unitsTogetherTotal } from './river-unit-offers.ts';

/*
 * The guest-facing half of the Riverhouse split. The question a guest actually asks is "the house is taken for my
 * dates — is any part of it free?", and the two ways to get this wrong are:
 *
 *   1. showing a price the host never set, and
 *   2. telling a guest a part is open when the booking gate would refuse it.
 *
 * So every assertion here is about what the page may claim.
 */

const unit = (over: Partial<PublicUnit> & { id: string; name: string }): PublicUnit => ({
  sleeps: 4,
  bedrooms: 1,
  beds: 2,
  baths: 1,
  nightly: 320,
  cleaning: 150,
  minNights: 2,
  rateState: 'ready',
  nights: ['2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13'],
  ...over,
});

const FREE_HOUSE = { houseFree: true, hasDates: true };
const TAKEN_HOUSE = { houseFree: false, hasDates: true };

test('a priced part with free nights is available and priced for the stay', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite' })], '2026-12-10', '2026-12-12');
  assert.equal(offers.length, 1);
  const offer = offers[0]!;
  assert.equal(offer.available, true);
  assert.equal(offer.reason, null);
  // Two nights at $320 plus $150 cleaning.
  assert.equal(offer.lodging, 640);
  assert.equal(offer.cleaning, 150);
  assert.equal(offer.total, 790);
});

test('an unpriced part is never given a number, and says why', () => {
  const offers = unitStayOffers(
    [unit({ id: 'main-lodge', name: 'River Main Lodge', nightly: null, rateState: 'unset' })],
    '2026-12-10',
    '2026-12-12',
  );
  const offer = offers[0]!;
  assert.equal(offer.available, false);
  assert.equal(offer.lodging, null, 'an unpriced part got a lodging figure');
  assert.equal(offer.total, null, 'an unpriced part got a total');
  assert.match(offer.reason ?? '', /no price yet/i);
});

test('a half-priced part says it is not fully priced', () => {
  const offers = unitStayOffers(
    [unit({ id: 'main-lodge', name: 'River Main Lodge', cleaning: null, rateState: 'partial' })],
    '2026-12-10',
    '2026-12-12',
  );
  assert.match(offers[0]!.reason ?? '', /not fully priced/i);
});

test('a part booked on one of the nights is not offered and names the night', () => {
  const offers = unitStayOffers(
    [unit({ id: 'garage-suite', name: 'River Garage Suite', nights: ['2026-12-10', '2026-12-12'] })],
    '2026-12-10',
    '2026-12-13',
  );
  const offer = offers[0]!;
  assert.equal(offer.available, false);
  assert.deepEqual(offer.blocked, ['2026-12-11']);
  assert.match(offer.reason ?? '', /booked on 2026-12-11/);
});

test('a part booked for every night says so, rather than naming one', () => {
  const offers = unitStayOffers(
    [unit({ id: 'garage-suite', name: 'River Garage Suite', nights: [] })],
    '2026-12-10',
    '2026-12-13',
  );
  assert.match(offers[0]!.reason ?? '', /all of those nights/i);
});

test('a minimum stay longer than the request is refused with the real number', () => {
  const offers = unitStayOffers(
    [unit({ id: 'garage-suite', name: 'River Garage Suite', minNights: 3 })],
    '2026-12-10',
    '2026-12-12',
  );
  assert.equal(offers[0]!.available, false);
  assert.match(offers[0]!.reason ?? '', /3-night minimum/);
});

test('with no dates nothing is claimed available and no figure is invented', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite' })], '', '');
  const offer = offers[0]!;
  assert.equal(offer.available, false);
  assert.equal(offer.total, null);
  assert.equal(offer.reason, null);
});

test('no unit list at all produces no offers, not a free house', () => {
  assert.deepEqual(unitStayOffers(null, '2026-12-10', '2026-12-12'), []);
});

test('the line tells a guest the house is taken but a part is free', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite' })], '2026-12-10', '2026-12-12');
  const line = unitOfferLine(offers, 'river', false, true);
  assert.match(line ?? '', /full house is not open/i);
  assert.match(line ?? '', /Garage Suite/);
  assert.match(line ?? '', /\bis\b/, 'one part was described as plural');
});

test('two free parts are described in the plural', () => {
  const offers = unitStayOffers(
    [
      unit({ id: 'garage-suite', name: 'River Garage Suite' }),
      unit({ id: 'main-lodge', name: 'River Main Lodge', sleeps: 13 }),
    ],
    '2026-12-10',
    '2026-12-12',
  );
  const line = unitOfferLine(offers, 'river', false, true);
  assert.match(line ?? '', /are\.$/);
});

test('the line never says the house is not open when it is', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite' })], '2026-12-10', '2026-12-12');
  const line = unitOfferLine(offers, 'river', true, true);
  assert.equal(/not open/i.test(line ?? ''), false, 'a free house was described as not open');
  assert.match(line ?? '', /also book just part/i);
});

test('the line says so when no part is open, instead of an empty promise', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite', nights: [] })], '2026-12-10', '2026-12-12');
  const line = unitOfferLine(offers, 'river', false, true);
  assert.match(line ?? '', /No part of the River House is open/);
});

test('the line admits when no part has a price yet', () => {
  const offers = unitStayOffers(
    [unit({ id: 'garage-suite', name: 'River Garage Suite', nightly: null, rateState: 'unset' })],
    '2026-12-10',
    '2026-12-12',
  );
  const line = unitOfferLine(offers, 'river', false, true);
  assert.match(line ?? '', /none of them has a price yet/);
});

test('other houses say nothing about parts', () => {
  const offers = unitStayOffers([unit({ id: 'garage-suite', name: 'River Garage Suite' })], '2026-12-10', '2026-12-12');
  assert.equal(unitOfferLine(offers, 'ranch', true, true), null);
  assert.equal(unitOfferLine(offers, 'lindon', true, true), null);
});

test('two parts together add up to one figure and one capacity', () => {
  const offers = unitStayOffers(
    [
      unit({ id: 'garage-suite', name: 'River Garage Suite', sleeps: 4 }),
      unit({ id: 'main-lodge', name: 'River Main Lodge', sleeps: 13 }),
    ],
    '2026-12-10',
    '2026-12-12',
  );
  assert.equal(unitsTogetherTotal(offers), 790 + 790);
  assert.equal(unitsTogetherSleeps(offers), 17);
});

test('a total with an unpriced part is null, never a partial sum', () => {
  const offers = unitStayOffers(
    [
      unit({ id: 'garage-suite', name: 'River Garage Suite' }),
      unit({ id: 'main-lodge', name: 'River Main Lodge', nightly: null, rateState: 'unset' }),
    ],
    '2026-12-10',
    '2026-12-12',
  );
  assert.equal(unitsTogetherTotal(offers), null, 'a partial sum was shown as the total');
});
