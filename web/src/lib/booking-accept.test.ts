import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptHold, acceptedLine, nightsBetween } from './booking-accept.ts';

const request = {
  id: 'book-1',
  propertyId: 'river',
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  guests: 8,
};

test('an accepted request becomes a stay with the party in the note', () => {
  const result = acceptHold({ request, alreadyAccepted: false, plan: { payout: 4200.126 }, asOf: '2026-11-07' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.propertyId, 'river');
  assert.equal(result.plan.nights, 3);
  assert.equal(result.plan.payout, 4200.13);
  assert.equal(result.plan.source, 'Direct');
  assert.match(result.plan.note, /8 guests/);
  assert.match(result.plan.note, /book-1/);
  assert.equal(result.plan.note.includes('Ada'), false);
});

test('a two-house request keeps both houses', () => {
  const result = acceptHold({
    request: { ...request, alsoPropertyId: 'ranch', guests: 30, children: 4 },
    alreadyAccepted: false,
    plan: { payout: 9000 },
    asOf: '2026-11-07',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.alsoPropertyId, 'ranch');
  assert.match(result.plan.note, /30 guests including 4 children/);
});

test('accepting the same request twice is refused', () => {
  const result = acceptHold({ request, alreadyAccepted: true, plan: { payout: 100 }, asOf: '2026-11-07' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /already a booking/);
});

test('a night now on the calendar is refused rather than double-booked', () => {
  const result = acceptHold({
    request,
    alreadyAccepted: false,
    plan: { payout: 100, takenOnHouse: ['2026-12-02'] },
    asOf: '2026-11-07',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /double-book/);
});

test('a past check-in, a bad party, and a bad payout are each refused', () => {
  const past = acceptHold({ request: { ...request, checkIn: '2026-10-01', checkOut: '2026-10-04' }, alreadyAccepted: false, plan: { payout: 1 }, asOf: '2026-11-07' });
  assert.equal(past.ok, false);
  if (!past.ok) assert.match(past.reason, /already passed/);

  const kids = acceptHold({ request: { ...request, guests: 4, children: 4 }, alreadyAccepted: false, plan: { payout: 1 }, asOf: '2026-11-07' });
  assert.equal(kids.ok, false);
  if (!kids.ok) assert.match(kids.reason, /needs an adult/);

  const money = acceptHold({ request, alreadyAccepted: false, plan: { payout: -5 }, asOf: '2026-11-07' });
  assert.equal(money.ok, false);
  if (!money.ok) assert.match(money.reason, /zero or more/);

  const notANumber = acceptHold({ request, alreadyAccepted: false, plan: { payout: Number.NaN }, asOf: '2026-11-07' });
  assert.equal(notANumber.ok, false);
});

test('a house we do not rent and a backwards stay are refused', () => {
  const denver = acceptHold({ request: { ...request, propertyId: 'denver' }, alreadyAccepted: false, plan: { payout: 1 }, asOf: '2026-11-07' });
  assert.equal(denver.ok, false);
  if (!denver.ok) assert.match(denver.reason, /house we rent/);

  const same = acceptHold({ request: { ...request, alsoPropertyId: 'river' }, alreadyAccepted: false, plan: { payout: 1 }, asOf: '2026-11-07' });
  assert.equal(same.ok, false);

  const backwards = acceptHold({ request: { ...request, checkIn: '2026-12-04', checkOut: '2026-12-01' }, alreadyAccepted: false, plan: { payout: 1 }, asOf: '2026-11-07' });
  assert.equal(backwards.ok, false);
  if (!backwards.ok) assert.match(backwards.reason, /stay we can save/);
});

test('nights count check-out morning as free', () => {
  assert.equal(nightsBetween('2026-12-01', '2026-12-04'), 3);
  assert.equal(nightsBetween('2026-12-01', '2026-12-02'), 1);
  assert.equal(nightsBetween('2026-12-01', '2026-12-01'), 0);
  assert.equal(nightsBetween('bad', '2026-12-04'), 0);
});

test('the accepted line has no price and does not say a guest name', () => {
  const result = acceptHold({ request, alreadyAccepted: false, plan: { payout: 4200 }, asOf: '2026-11-07' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const line = acceptedLine(result.plan);
  assert.match(line, /3 nights/);
  assert.equal(line.includes('$'), false);
  assert.equal(line.includes('4200'), false);
  assert.equal(/door\s*code/i.test(line), false);
});
