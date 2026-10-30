import assert from 'node:assert/strict';
import test from 'node:test';
import { guestOffers, houseMenu, toggleUpsell } from './upsells.ts';

test('Ranch before an open calendar offers early, late, and the hot tub', () => {
  const ids = guestOffers({
    house: 'ranch',
    phase: 'before',
    nightBeforeFree: true,
    checkoutNightFree: true,
  }).map((offer) => offer.id);
  assert.deepEqual(ids, ['early', 'late', 'tub']);
});

test('a booked night before arrival hides early check-in', () => {
  const ids = guestOffers({
    house: 'ranch',
    phase: 'before',
    nightBeforeFree: false,
    checkoutNightFree: true,
  }).map((offer) => offer.id);
  assert.equal(ids.includes('early'), false);
  assert.equal(ids.includes('tub'), true);
});

test('an unknown calendar does not invent early or late', () => {
  const ids = guestOffers({
    house: 'river',
    phase: 'before',
    nightBeforeFree: null,
    checkoutNightFree: null,
  }).map((offer) => offer.id);
  assert.deepEqual(ids, ['groceries']);
});

test('River during the stay can still ask for a late checkout', () => {
  const ids = guestOffers({
    house: 'river',
    phase: 'during',
    nightBeforeFree: true,
    checkoutNightFree: true,
  }).map((offer) => offer.id);
  assert.deepEqual(ids, ['late']);
});

test('a same-day arrival blocks late checkout', () => {
  const ids = guestOffers({
    house: 'lindon',
    phase: 'during',
    nightBeforeFree: false,
    checkoutNightFree: false,
  }).map((offer) => offer.id);
  assert.deepEqual(ids, []);
});

test('after checkout the menu is empty', () => {
  assert.equal(
    guestOffers({ house: 'ranch', phase: 'after', nightBeforeFree: true, checkoutNightFree: true }).length,
    0,
  );
});

test('the host menu keeps every offer for that house', () => {
  assert.deepEqual(
    houseMenu('lindon').map((offer) => offer.id),
    ['early', 'late'],
  );
  assert.equal(houseMenu('river').some((offer) => offer.id === 'groceries'), true);
  assert.equal(houseMenu('ranch').some((offer) => offer.id === 'tub'), true);
});

test('a request toggles on and off', () => {
  const once = toggleUpsell([], 'tub');
  assert.deepEqual(once, ['tub']);
  assert.deepEqual(toggleUpsell(once, 'tub'), []);
});
