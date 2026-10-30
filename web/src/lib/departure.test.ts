import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDepartureChoice, applyLateAddon, departureBrief, guestDepartureLine, hostDeparturePhrase, hostLaterLeavePhrase, quoteLeave } from './departure.ts';

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
  assert.match(hostLaterLeavePhrase(true), /Nothing is charged yet/);
  assert.equal(hostLaterLeavePhrase(true).includes('$'), false);
  assert.equal(hostLaterLeavePhrase(false), 'A 2:00 PM leave is not open for this checkout.');
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
  const brief = departureBrief(
    [
      { id: 'ranch-1', propertyId: 'ranch', checkOut: '2026-11-06', status: 'confirmed' },
      { id: 'river-1', propertyId: 'river', checkOut: '2026-11-13', status: 'confirmed' },
      { id: 'gone', propertyId: 'lindon', checkOut: '2026-11-02', status: 'cancelled' },
      { id: 'held', propertyId: 'lindon', checkOut: '2026-11-03', status: 'blocked' },
    ],
    { 'ranch-1': '11:00 AM', 'river-1': '801-555-0100' },
    '2026-10-30',
  );
  assert.match(brief, /1 checkout names a departure time: Ranch Nov 6, Leave at 11:00 AM/);
  assert.match(brief, /1 does not: River Nov 13/);
  assert.equal(brief.includes('801'), false);
  assert.equal(brief.includes('Ada'), false);
  assert.equal(brief.includes('$'), false);
  assert.equal(brief.includes('Guest'), false);
  assert.match(departureBrief([], {}, '2026-10-30'), /No checkouts in the next 90 days/);
  assert.match(departureBrief([{ id: 'late', propertyId: 'ranch', checkOut: '2026-11-06' }], { late: '2:00 PM' }, '2026-10-30'), /Nothing is charged yet/);
});
