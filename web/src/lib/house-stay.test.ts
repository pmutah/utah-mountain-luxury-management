import assert from 'node:assert/strict';
import test from 'node:test';
import { houseStay, keptGuideLine, mergeHouseCheckout, partyFits, partyNote, accessLine, earlyLine, earlyStayOpen, hostAccessPhrase, hostEarlyPhrase, codesOpenTomorrow, nearbyGroups, stayAreaPlaces, stayHouseNotes, STAY_EMERGENCY } from './house-stay.ts';

test('the booking page uses the published house and refuses a party that does not fit', () => {
  const river = houseStay('river');
  assert.equal(river.sleeps, 24);
  assert.equal(river.checkIn, '4:00 PM');
  assert.match(river.bedrooms ?? '', /Seven king suites/);
  assert.match(river.emergency, /call 911 first/);
  assert.equal(river.checkout[0], 'Start the dishwasher.');
  assert.match(river.checkout.at(-1) ?? '', /Only toilet paper/);
  assert.equal(river.checkout.length, 6);
  assert.equal(/password/i.test(river.emergency), false);
  assert.deepEqual(
    river.notes.map((note) => note.title),
    ['Septic', 'The river'],
  );
  const ranch = houseStay('ranch');
  assert.equal(ranch.bedrooms, null);
  assert.match(ranch.parking, /driveway/);
  assert.match(ranch.notes[0]?.title ?? '', /Hot tub/);
  assert.match(ranch.checkout.at(-1) ?? '', /hot tub cover/);
  assert.equal(houseStay('lindon').checkout.length, 5);
  const saved = ['Start the dishwasher.', 'Lock the door behind you. The lock will reset for the next guests.'];
  const merged = mergeHouseCheckout('river', saved);
  assert.equal(merged[0], saved[0]);
  assert.match(merged.at(-1) ?? '', /Only toilet paper/);
  assert.equal(mergeHouseCheckout('river', merged).filter((step) => /toilet paper/i.test(step)).length, 1);
  assert.match(mergeHouseCheckout('ranch', saved).at(-1) ?? '', /hot tub cover/);
  assert.equal(mergeHouseCheckout('lindon', saved).length, saved.length);
  assert.equal(mergeHouseCheckout('attic', saved).length, saved.length);
  const ranchArrival = keptGuideLine('The house is in Lindon.', ranch.arrival);
  assert.match(ranchArrival, /45 minutes south of the Salt Lake airport/);
  assert.equal(ranchArrival.includes('The house is in Lindon. The house is in Lindon'), false);
  const ranchParking = keptGuideLine('Park in the driveway.', ranch.parking);
  assert.match(ranchParking, /do not block neighbors/);
  assert.match(keptGuideLine('Park in the drive.', river.parking), /canyon road clear/);
  assert.equal(keptGuideLine('Park in the drive.', river.parking).includes('Park in the drive. Park'), false);
  assert.match(keptGuideLine('Park in the driveway.', river.parking), /canyon road clear/);
  const emergency = keptGuideLine('Call 911 first.', STAY_EMERGENCY);
  assert.match(emergency, /then call us/);
  assert.equal(/door\s*code|\$/i.test(emergency), false);
  const added = keptGuideLine('Please use the side gate.', ranch.parking);
  assert.match(added, /side gate/);
  assert.match(added, /do not block neighbors/);
  assert.equal(keptGuideLine('Door code is 1234', ranch.arrival).includes('1234'), false);
  assert.match(keptGuideLine('Door code is 1234', ranch.arrival), /Salt Lake airport/);
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
  assert.equal(earlyLine('2026-11-06', [], '2026-10-29', ['2026-11-05']), null);
  assert.equal(earlyStayOpen('2026-11-06', [], '2026-10-29', ['2026-11-05']), false);
  assert.equal(earlyLine('2026-11-06', [], '2026-11-06'), null);
  assert.equal(earlyStayOpen('2026-11-06', [], '2026-10-29'), true);
  assert.equal(earlyStayOpen('2026-11-06', ['2026-11-05'], '2026-10-29'), false);
  assert.match(hostEarlyPhrase(true), /Nothing is charged yet/);
  assert.equal(hostEarlyPhrase(true).includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(hostEarlyPhrase(true)), false);
  assert.equal(hostEarlyPhrase(false), 'An early arrival is not open for this stay.');

  assert.equal(partyFits('river', 24).ok, true);
  assert.equal(partyFits('river', 25).ok, false, 'a party of 25 no longer fits the River House');
  assert.equal(partyFits('river', 26).ok, false);
  assert.match(partyFits('river', 26).reason ?? '', /sleeps 24/);
  assert.equal(partyFits('lindon', 0).ok, false);
  assert.equal(partyFits('ranch', 1.5).ok, false);
  assert.equal(partyFits('ranch', 4, 1).ok, true);
  assert.equal(partyFits('ranch', 4, 4).ok, false);
  assert.match(partyFits('ranch', 4, 4).reason ?? '', /adult/);
  assert.match(partyFits('ranch', 4, 5).reason ?? '', /part of the overnight/);
  assert.equal(partyNote('4', '1'), 'Overnight guests 4, including 1 child.');
  assert.equal(partyNote('4', ''), 'Overnight guests 4.');
  assert.equal(partyNote('4', '4'), '');
  assert.equal(partyNote('4', '5'), 'Overnight guests 4.');
});

test('an empty area list uses the published nearby places', () => {
  const published = stayAreaPlaces('ranch', []);
  assert.equal(published.some((place) => place.name === 'Sundance Mountain Resort'), true);
  assert.equal(published.some((place) => place.kind === 'ski'), true);
  assert.equal(JSON.stringify(published).includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(JSON.stringify(published)), false);

  const custom = stayAreaPlaces('ranch', [{ name: 'Custom grill', note: 'Reserve ahead.', kind: 'food', area: 'Provo' }]);
  assert.deepEqual(custom.map((place) => place.name), ['Custom grill']);

  const secret = stayAreaPlaces('lindon', [{ name: 'Gate', note: 'The door code is 1234.', kind: 'essentials' }]);
  assert.equal(secret.some((place) => place.name === 'Sundance Mountain Resort'), true);
  assert.equal(secret.some((place) => /1234/.test(place.note)), false);
});

test('an empty house-note list uses the published notes', () => {
  const ranch = stayHouseNotes('ranch', []);
  assert.deepEqual(ranch.map((note) => note.title), ['Hot tub']);
  assert.match(ranch[0]?.body ?? '', /cover/);
  assert.equal(JSON.stringify(ranch).includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(JSON.stringify(ranch)), false);

  const river = stayHouseNotes('river', []);
  assert.deepEqual(river.map((note) => note.title), ['Septic', 'The river']);
  assert.equal(stayHouseNotes('lindon', []).length, 0);

  const custom = stayHouseNotes('ranch', [{ title: 'Fireplace', body: 'The switch is by the hearth.' }]);
  assert.deepEqual(custom.map((note) => note.title), ['Fireplace']);

  const coded = stayHouseNotes('ranch', [{ title: 'Entry', body: 'The door code is 1234.' }]);
  assert.deepEqual(coded.map((note) => note.title), ['Hot tub']);
});
