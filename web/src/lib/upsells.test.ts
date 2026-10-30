import assert from 'node:assert/strict';
import test from 'node:test';
import { guestOffers, groceryListForSave, hostAddonPhrase, houseMenu, quoteOfferNote, quoteOffers, stayPrepPhrase, toggleUpsell } from './upsells.ts';

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

test('a grocery list stays short and a blank one is dropped', () => {
  assert.equal(groceryListForSave('   '), '');
  assert.equal(groceryListForSave('  milk, eggs  '), '  milk, eggs  ');
  assert.equal(groceryListForSave('a'.repeat(500)).length, 400);
});

test('a request toggles on and off', () => {
  const once = toggleUpsell([], 'tub');
  assert.deepEqual(once, ['tub']);
  assert.deepEqual(toggleUpsell(once, 'tub'), []);
});

test('the booking page offers add-ons only when the nights are open', () => {
  const open = quoteOffers({
    house: 'river',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    asOf: '2026-10-29',
    taken: [],
    calendarLive: true,
  }).map((offer) => offer.id);
  assert.deepEqual(open, ['early', 'late', 'groceries']);
  const held = quoteOffers({
    house: 'river',
    checkIn: '2026-12-13',
    checkOut: '2026-12-15',
    asOf: '2026-10-29',
    taken: ['2026-12-12'],
    calendarLive: true,
  }).map((offer) => offer.id);
  assert.equal(held.includes('early'), false);
  assert.equal(held.includes('late'), true);
  const quiet = quoteOffers({
    house: 'ranch',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    asOf: '2026-10-29',
    taken: [],
    calendarLive: false,
  }).map((offer) => offer.id);
  assert.deepEqual(quiet, ['tub']);
  const early = quoteOffers({
    house: 'river',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    asOf: '2026-10-29',
    taken: [],
    calendarLive: true,
  }).filter((offer) => offer.id === 'early');
  assert.equal(quoteOfferNote(early), 'Add-on request: Arrive at 1:00 PM. Nothing is charged yet.');
  assert.equal(quoteOfferNote([]), '');
});

test('the guest list names add-ons for a stay and leaves the price off', () => {
  assert.equal(
    hostAddonPhrase({
      house: 'river',
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
      asOf: '2026-10-29',
      taken: [],
    }),
    'Can request an early arrival, a later checkout, and a grocery drop. This page does not send that request.',
  );
  assert.equal(
    hostAddonPhrase({
      house: 'river',
      checkIn: '2026-12-13',
      checkOut: '2026-12-15',
      asOf: '2026-10-29',
      taken: ['2026-12-12'],
    }).includes('early'),
    false,
  );
  assert.equal(
    hostAddonPhrase({
      house: 'ranch',
      checkIn: '2026-11-04',
      checkOut: '2026-11-05',
      asOf: '2026-10-29',
      taken: null,
    }),
    'Checking the calendar for add-ons.',
  );
  assert.equal(
    hostAddonPhrase({
      house: 'lindon',
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      asOf: '2026-10-29',
      taken: [],
    }),
    'No add-on for this stay.',
  );
  assert.equal(
    hostAddonPhrase({
      house: 'river',
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
      asOf: '2026-10-29',
      taken: [],
    }).includes('$'),
    false,
  );
});

test('prep names the hot tub or a grocery drop and skips Lindon', () => {
  assert.equal(stayPrepPhrase('ranch', '2026-11-06', '2026-10-29', 'next'), 'The next stay can request the hot tub. Nothing is charged yet.');
  assert.equal(stayPrepPhrase('river', '2026-11-06', '2026-10-29'), 'This stay can request a grocery drop. Nothing is charged yet.');
  assert.equal(stayPrepPhrase('lindon', '2026-11-06', '2026-10-29'), '');
  assert.equal(stayPrepPhrase('ranch', '2026-11-06', '2026-11-06'), '');
  assert.equal(stayPrepPhrase('ranch', '2026-11-06', '2026-10-29').includes('$'), false);
  assert.equal(stayPrepPhrase('ranch', '2026-11-06', '2026-10-29').includes('Guest'), false);
});
