import assert from 'node:assert/strict';
import test from 'node:test';
import { nearbyGroups } from './house-stay.ts';
import { tripSheet } from './stay-sheet.ts';

test('a trip sheet names the arrival and leaves the door code off the paper', () => {
  const sheet = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    arrival: 'The house sits at Vivian Park.',
    parking: 'Park in the drive.',
    rules: 'No parties.',
    houseId: 'river',
    notes: [
      { title: 'Septic', body: 'Only toilet paper goes in the toilets.' },
      { title: 'Door code', body: '1234' },
      { title: 'Wi-Fi', body: 'network secret' },
    ],
    emergency: 'For a fire, medical emergency, or anyone in danger, call 911 first, then call us.',
    checkout: ['Strip the beds', ' ', 'Door code 9999'],
    nearby: [
      { name: 'Sundance Mountain Resort', note: 'Your home mountain.', area: 'About 10 minutes up the canyon', url: 'https://www.sundanceresort.com', kind: 'ski' },
      { name: 'Wi-Fi', note: 'password hidden' },
    ],
  });
  assert.equal(sheet.house, 'River House');
  assert.equal(sheet.when, 'Check-in 4:00 PM on November 6, 2026. Checkout 11:00 AM on November 8, 2026.');
  assert.equal(sheet.address, 'Vivian Park, Provo Canyon, Utah 84604');
  assert.match(sheet.privateNote, /not on this paper/);
  assert.equal(sheet.arrival, 'The house sits at Vivian Park.');
  assert.equal(sheet.parking, 'Park in the drive.');
  assert.equal(sheet.rules, 'No parties.');
  assert.match(sheet.agreement, /the river/);
  assert.match(sheet.agreement, /This paper does not sign it/);
  const secret = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    arrival: 'Door code is 1234',
    parking: 'Wi-Fi password is hidden',
    rules: 'Quiet hours. Door code 4321',
  });
  assert.equal(secret.arrival, '');
  assert.equal(secret.parking, '');
  assert.equal(secret.rules, '');
  assert.deepEqual(sheet.notes, [{ title: 'Septic', body: 'Only toilet paper goes in the toilets.' }]);
  assert.equal(sheet.nearby[0]?.kind, 'ski');
  assert.equal(nearbyGroups(sheet.nearby)[0]?.label, 'Ski');
  assert.equal(sheet.nearby[0]?.site, 'sundanceresort.com');
  assert.match(sheet.nearby[0]?.href ?? '', /^https:\/\/www\.sundanceresort\.com/);
  assert.equal(/password/i.test(JSON.stringify(sheet.nearby)), false);
  assert.match(sheet.emergency, /call 911 first/);
  assert.equal(
    tripSheet({
      house: 'River House',
      checkIn: '2026-11-06',
      checkOut: '2026-11-08',
      checkInTime: '4:00 PM',
      checkOutTime: '11:00 AM',
      emergency: 'Door code 9999',
    }).emergency,
    '',
  );
  assert.deepEqual(sheet.checkout, ['Strip the beds']);
  assert.equal(Object.hasOwn(sheet, 'doorCode'), false);
  assert.equal(Object.hasOwn(sheet, 'wifiPassword'), false);
  assert.equal(JSON.stringify(sheet).includes('1234'), false);
  assert.equal(JSON.stringify(sheet).toLowerCase().includes('network secret'), false);
  assert.equal(sheet.guestArrival, '');
  const named = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestArrival: '6:00 PM',
  });
  assert.equal(named.guestArrival, 'Arrival around 6:00 PM.');
  const junk = tripSheet({
    house: 'River House',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    guestArrival: '801-555-0100',
  });
  assert.equal(junk.guestArrival, '');
});
