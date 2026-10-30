import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDepartureChoice, applyLateAddon, guestDepartureLine, hostDeparturePhrase, quoteLeave } from './departure.ts';

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
  assert.equal(quoteLeave('2:00 PM', false), '');
  assert.match(quoteLeave('2:00 PM', true), /Nothing is charged yet/);
  assert.equal(quoteLeave('11:00 AM', false), 'Leave at 11:00 AM.');
  const later = applyDepartureChoice('2:00 PM', ['early'], true);
  assert.equal(later.leave, '2:00 PM');
  assert.deepEqual(later.addons, ['early', 'late']);
  assert.deepEqual(applyDepartureChoice('11:00 AM', later.addons, true).addons, ['early']);
  assert.equal(applyDepartureChoice('2:00 PM', [], false).leave, null);
  assert.equal(applyLateAddon(true, '11:00 AM'), '2:00 PM');
  assert.equal(applyLateAddon(false, '2:00 PM'), null);
  assert.equal(applyLateAddon(false, '11:00 AM'), '11:00 AM');
});
