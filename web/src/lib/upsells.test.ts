import assert from 'node:assert/strict';
import test from 'node:test';
import { addonMenuLine, bothHouseFlex, bothHouseFlexLine, bothHouseFlexRhythm, guestAddonIntro, guestOffers, groceryListForSave, hostAddonPhrase, houseMenu, quoteAddonApart, quoteCardAddonLine, quoteGroceryLine, quoteOfferDetail, quoteOfferNote, quoteOffers, stayPrepPhrase, toggleUpsell } from './upsells.ts';

test('the booking page add-on leaves the door code off', () => {
  const early = houseMenu('ranch').find((offer) => offer.id === 'early');
  assert.ok(early);
  const detail = quoteOfferDetail(early);
  assert.match(detail, /Arrive at 1:00 PM is a request/);
  assert.match(detail, /Nothing is charged yet/);
  assert.equal(/door code/i.test(detail), false);
  assert.equal(detail.includes('$'), false);
  assert.match(early.detail, /door code/i);
  const late = quoteOfferDetail(houseMenu('ranch').find((offer) => offer.id === 'late')!);
  assert.equal(/door code/i.test(late), false);
  assert.equal(/\bis open\b/i.test(late), false);
});

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
  const closedOnly = quoteOffers({
    house: 'river',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    asOf: '2026-10-29',
    taken: [],
    closed: ['2026-11-05', '2026-11-08'],
    calendarLive: true,
  }).map((offer) => offer.id);
  assert.equal(closedOnly.includes('early'), false);
  assert.equal(closedOnly.includes('late'), false);
  assert.equal(closedOnly.includes('groceries'), true);
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
  assert.equal(quoteAddonApart(early), 'Arrive at 1:00 PM is not in that total. Nothing is charged yet.');
  assert.equal(quoteAddonApart([]), '');
  assert.equal(quoteAddonApart(early).includes('$'), false);
  const beforeOpen = quoteOffers({
    house: 'river',
    checkIn: '2026-10-31',
    checkOut: '2026-11-02',
    asOf: '2026-10-31',
    taken: [],
    calendarLive: true,
  });
  assert.deepEqual(beforeOpen, []);
  const booked = quoteOffers({
    house: 'ranch',
    checkIn: '2026-11-25',
    checkOut: '2026-11-27',
    asOf: '2026-10-31',
    taken: ['2026-11-25'],
    calendarLive: true,
  });
  assert.deepEqual(booked, []);
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

test('the unread quote names add-ons and leaves the price off', () => {
  const river = addonMenuLine('river');
  const ranch = addonMenuLine('ranch');
  const lindon = addonMenuLine('lindon');
  assert.match(river, /Canyon grocery drop/);
  assert.match(ranch, /Hot tub ready at arrival/);
  assert.match(river, /wait until the calendar can be read/);
  assert.match(lindon, /wait until the calendar can be read/);
  assert.equal(lindon.includes('Hot tub'), false);
  assert.equal(lindon.includes('grocery'), false);
  const text = `${river}\n${ranch}\n${lindon}`;
  assert.equal(text.includes('$'), false);
  assert.equal(text.toLowerCase().includes('is open'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
  const marked = quoteCardAddonLine(['Canyon grocery drop', 'Hot tub ready at arrival']);
  assert.match(marked, /Canyon grocery drop and Hot tub ready at arrival would be on the request/);
  assert.match(marked, /not booked/);
  assert.match(marked, /Nothing is charged yet/);
  assert.match(marked, /Nothing is sent/);
  assert.equal(marked.includes('$'), false);
  assert.equal(quoteCardAddonLine([]), '');
  const riverCard = quoteOffers({
    house: 'river',
    checkIn: '2026-11-13',
    checkOut: '2026-11-15',
    asOf: '2026-10-30',
    taken: [],
    calendarLive: false,
  }).map((offer) => offer.id);
  assert.deepEqual(riverCard, ['groceries']);
  const blank = quoteGroceryLine('   ', true);
  assert.match(blank, /can be written here/);
  assert.match(blank, /Nothing is ordered or charged/);
  assert.match(blank, /not booked/);
  const listed = quoteGroceryLine('milk, eggs', true);
  assert.match(listed, /Grocery list: milk, eggs/);
  assert.match(listed, /stays in this tab/);
  assert.equal(listed.includes('$'), false);
  const hidden = quoteGroceryLine('wine $20', true);
  assert.match(hidden, /stays off this paper/);
  assert.equal(hidden.includes('$'), false);
  assert.equal(hidden.includes('wine'), false);
  assert.equal(quoteGroceryLine('milk', false), '');
});

test('an unread guest list does not say a night is open', () => {
  const unread = guestAddonIntro(true);
  assert.match(unread, /could not be read/);
  assert.match(unread, /does not say a night is open/);
  assert.match(unread, /does not say which stay can request/);
  assert.equal(unread.includes('Each stay below'), false);
  assert.equal(unread.includes('$'), false);
  const live = guestAddonIntro(false);
  assert.match(live, /Each stay below says which of these that stay can request/);
  assert.equal(live.includes('$'), false);
});

test('both houses have to be clear for an early arrival and a later checkout', () => {
  const open = bothHouseFlex({
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    taken: {},
  });
  assert.equal(open.early, true);
  assert.equal(open.late, true);
  const ranchNight = bothHouseFlex({
    checkIn: '2026-11-29',
    checkOut: '2026-12-03',
    taken: { ranch: ['2026-11-28'] },
  });
  assert.equal(ranchNight.early, false);
  assert.equal(ranchNight.late, true);
  const ranchMorning = bothHouseFlex({
    checkIn: '2026-12-16',
    checkOut: '2026-12-18',
    taken: { ranch: ['2026-12-18'] },
  });
  assert.equal(ranchMorning.early, true);
  assert.equal(ranchMorning.late, false);
  const rhythm = bothHouseFlexRhythm(open);
  assert.match(rhythm, /both houses/);
  assert.match(rhythm, /Nothing is sent/);
  assert.equal(rhythm.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(rhythm), false);
  const closed = bothHouseFlexLine('early', false);
  assert.match(closed, /not open for both houses/);
  assert.equal(closed.includes('$'), false);
});
