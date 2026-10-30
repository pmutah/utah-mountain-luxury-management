import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalBrief, arrivalNote, arrivalSelectOptions, guestArrivalLine, hostArrivalPhrase, isArrivalSlot } from './arrival.ts';

test('an arrival time is named and an early add-on replaces it', () => {
  assert.equal(arrivalNote('6:00 PM', false), 'Arrival around 6:00 PM.');
  assert.equal(arrivalNote('After 9:00 PM', false), 'Arrival after 9:00 PM. Quiet hours still apply.');
  assert.equal(arrivalNote('6:00 PM', true), '');
  assert.equal(arrivalNote('noon', false), '');
  assert.equal(arrivalNote(null, false), '');
  assert.equal(isArrivalSlot('4:00 PM'), true);
  assert.equal(arrivalNote('6:00 PM', false).includes('door code'), false);
});

test('a preference window becomes an arrival line and a phone does not', () => {
  assert.equal(guestArrivalLine('6:00 PM'), 'Arrival around 6:00 PM.');
  assert.equal(guestArrivalLine('After 9:00 PM'), 'Arrival after 9:00 PM. Quiet hours still apply.');
  assert.equal(guestArrivalLine('4–6 PM'), 'Arrival between 4:00 PM and 6:00 PM.');
  assert.equal(guestArrivalLine('801-555-0100'), '');
  assert.equal(guestArrivalLine('Ada Lovelace'), '');
  assert.equal(hostArrivalPhrase('6:00 PM'), 'This stay names an arrival. Arrival around 6:00 PM.');
  assert.equal(hostArrivalPhrase('801-555-0100'), 'This stay does not name an arrival time.');
  assert.deepEqual(arrivalSelectOptions('4–6 PM').slice(-1), ['4–6 PM']);
  assert.equal(arrivalSelectOptions('6:00 PM').includes('6:00 PM'), true);
  assert.equal(arrivalSelectOptions('801-555-0100').includes('801-555-0100'), false);
  const brief = arrivalBrief(
    [
      { id: 'named', propertyId: 'ranch', checkIn: '2026-11-04', status: 'confirmed' },
      { id: 'open', propertyId: 'lindon', checkIn: '2026-11-01' },
      { id: 'phone', propertyId: 'river', checkIn: '2026-11-02', status: 'confirmed' },
      { id: 'gone', propertyId: 'river', checkIn: '2026-11-03', status: 'cancelled' },
    ],
    { named: '6:00 PM', phone: '801-555-0100' },
    '2026-11-01',
  );
  assert.match(brief, /1 stay names an arrival time: Ranch Nov 4, Arrival around 6:00 PM/);
  assert.match(brief, /2 do not: Lindon Nov 1, River Nov 2/);
  assert.equal(brief.includes('801'), false);
  assert.equal(brief.includes('Ada'), false);
  assert.equal(brief.includes('Guest'), false);
});
