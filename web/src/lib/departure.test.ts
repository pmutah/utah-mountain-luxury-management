import assert from 'node:assert/strict';
import test from 'node:test';
import { guestDepartureLine, hostDeparturePhrase } from './departure.ts';

test('a leave time is one of the published choices and a phone is not', () => {
  assert.equal(guestDepartureLine('11:00 AM'), 'Leave at 11:00 AM.');
  assert.match(guestDepartureLine('2:00 PM'), /Nothing is charged yet/);
  assert.match(guestDepartureLine('2:00 PM'), /4:00 PM/);
  assert.equal(guestDepartureLine('12:00 PM'), '');
  assert.equal(guestDepartureLine('801-555-0100'), '');
  assert.equal(guestDepartureLine('Ada Lovelace'), '');
  assert.equal(hostDeparturePhrase('11:00 AM'), 'This checkout names a departure. Leave at 11:00 AM.');
  assert.equal(hostDeparturePhrase('noon'), 'This checkout does not name a departure time.');
  assert.equal(hostDeparturePhrase('801-555-0100').includes('801'), false);
  assert.equal(hostDeparturePhrase('11:00 AM').includes('$'), false);
});
