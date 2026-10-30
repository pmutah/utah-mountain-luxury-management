import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalNote, isArrivalSlot } from './arrival.ts';

test('an arrival time is named and an early add-on replaces it', () => {
  assert.equal(arrivalNote('6:00 PM', false), 'Arrival around 6:00 PM.');
  assert.equal(arrivalNote('After 9:00 PM', false), 'Arrival after 9:00 PM. Quiet hours still apply.');
  assert.equal(arrivalNote('6:00 PM', true), '');
  assert.equal(arrivalNote('noon', false), '');
  assert.equal(arrivalNote(null, false), '');
  assert.equal(isArrivalSlot('4:00 PM'), true);
  assert.equal(arrivalNote('6:00 PM', false).includes('door code'), false);
});
