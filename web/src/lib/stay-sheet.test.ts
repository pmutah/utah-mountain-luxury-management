import assert from 'node:assert/strict';
import test from 'node:test';
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
    notes: [
      { title: 'Septic', body: 'Only toilet paper goes in the toilets.' },
      { title: 'Door code', body: '1234' },
      { title: 'Wi-Fi', body: 'network secret' },
    ],
    emergency: 'For a fire, medical emergency, or anyone in danger, call 911 first, then call us.',
    checkout: ['Strip the beds', ' '],
  });
  assert.equal(sheet.house, 'River House');
  assert.equal(sheet.when, 'Check-in 4:00 PM on November 6, 2026. Checkout 11:00 AM on November 8, 2026.');
  assert.equal(sheet.address, 'Vivian Park, Provo Canyon, Utah 84604');
  assert.match(sheet.privateNote, /not on this paper/);
  assert.equal(sheet.arrival, 'The house sits at Vivian Park.');
  assert.deepEqual(sheet.notes, [{ title: 'Septic', body: 'Only toilet paper goes in the toilets.' }]);
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
});
