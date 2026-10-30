import assert from 'node:assert/strict';
import test from 'node:test';
import { houseStay, partyFits, partyNote, accessLine, earlyLine, hostAccessPhrase, codesOpenTomorrow, nearbyGroups } from './house-stay.ts';

test('the booking page uses the published house and refuses a party that does not fit', () => {
  const river = houseStay('river');
  assert.equal(river.sleeps, 25);
  assert.equal(river.checkIn, '4:00 PM');
  assert.match(river.bedrooms ?? '', /Seven king suites/);
  assert.match(river.emergency, /call 911 first/);
  assert.equal(river.checkout[0], 'Start the dishwasher.');
  assert.equal(river.checkout.length, 5);
  assert.equal(/password/i.test(river.emergency), false);
  assert.deepEqual(
    river.notes.map((note) => note.title),
    ['Septic', 'The river'],
  );
  const ranch = houseStay('ranch');
  assert.equal(ranch.bedrooms, null);
  assert.match(ranch.parking, /driveway/);
  assert.equal(ranch.notes[0]?.title, 'Hot tub');
  const lindon = houseStay('lindon');
  assert.equal(river.nearby.length, 18);
  assert.deepEqual(
    nearbyGroups(river.nearby).map((group) => group.kind),
    ['ski', 'food', 'outdoors', 'family', 'essentials'],
  );
  assert.equal(river.nearby[0]?.url, 'https://www.sundanceresort.com');
  assert.equal(ranch.nearby.length, 19);
  assert.equal(lindon.nearby.length, 19);
  assert.equal(lindon.nearby.some((place) => place.name === 'BYU campus'), true);
  assert.equal(lindon.notes.length, 0);
  const published = JSON.stringify({ river, ranch, lindon });
  const withoutAccess = published.replaceAll(accessLine('2026-11-06') ?? '', '');
  assert.equal(/door code|wi-fi|password/i.test(withoutAccess), false);
  assert.equal(accessLine('2026-11-06'), 'The door code and Wi-Fi open on the guest phone on November 5, 2026, the day before check-in, after the house rules are read.');
  assert.equal(hostAccessPhrase('2026-11-06', '2026-11-08', '2026-10-29'), accessLine('2026-11-06'));
  assert.equal(hostAccessPhrase('2026-11-06', '2026-11-08', '2026-11-05'), 'The door code can be on the guest phone now. It stays off this list.');
  assert.equal(hostAccessPhrase('2026-11-06', '2026-11-08', '2026-11-08'), 'This stay has checked out. The door code stays off this list.');
  assert.equal(hostAccessPhrase('bad', '2026-11-08', '2026-10-29'), null);
  assert.equal(/password/i.test(hostAccessPhrase('2026-11-06', '2026-11-08', '2026-10-29') ?? ''), false);
  const opening = codesOpenTomorrow(
    [
      { propertyId: 'lindon', checkIn: '2026-10-31', checkOut: '2026-11-02' },
      { propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-03' },
      { propertyId: 'river', checkIn: '2026-10-31', checkOut: '2026-11-02', status: 'cancelled' },
    ],
    '2026-10-29',
    'brief',
  );
  assert.equal(opening, 'Door codes that open tomorrow on the guest phone: Lindon 1. Codes stay off this brief.');
  assert.equal(opening.includes('Guest'), false);
  assert.equal(codesOpenTomorrow([], '2026-10-29', 'list'), 'No door code opens on the guest phone tomorrow. Codes stay off this list.');
  assert.equal(accessLine('bad'), null);
  assert.match(earlyLine('2026-11-06', [], '2026-10-29') ?? '', /Arriving early is a request/);
  assert.equal(earlyLine('2026-11-06', ['2026-11-05'], '2026-10-29'), null);
  assert.equal(earlyLine('2026-11-06', [], '2026-11-06'), null);

  assert.equal(partyFits('river', 25).ok, true);
  assert.equal(partyFits('river', 26).ok, false);
  assert.match(partyFits('river', 26).reason ?? '', /sleeps 25/);
  assert.equal(partyFits('lindon', 0).ok, false);
  assert.equal(partyFits('ranch', 1.5).ok, false);
  assert.equal(partyFits('ranch', 4, 1).ok, true);
  assert.equal(partyFits('ranch', 4, 4).ok, false);
  assert.match(partyFits('ranch', 4, 4).reason ?? '', /adult/);
  assert.match(partyFits('ranch', 4, 5).reason ?? '', /part of the overnight/);
  assert.equal(partyNote('4', '1'), 'Overnight guests 4, including 1 child.');
  assert.equal(partyNote('4', ''), 'Overnight guests 4.');
  assert.equal(partyNote('4', '4').includes('door code'), false);
});
