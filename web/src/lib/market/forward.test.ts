import assert from 'node:assert/strict';
import test from 'node:test';
import { forwardWindow, sampleBookedShare } from './forward.ts';

test('River nights before the first stay are left out of the 30-day pace', () => {
  const window = forwardWindow(
    'river',
    [
      { propertyId: 'river', checkIn: '2026-11-06', checkOut: '2026-11-08', status: 'confirmed', payout: 3000 },
      { propertyId: 'river', checkIn: '2026-10-30', checkOut: '2026-11-02', status: 'confirmed', payout: 1000 },
      { propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'cancelled', payout: 9000 },
      { propertyId: 'ranch', checkIn: '2026-11-06', checkOut: '2026-11-08', status: 'confirmed', payout: 500 },
    ],
    '2026-10-29',
    30,
  );
  assert.equal(window.sellable, 27);
  assert.equal(window.booked, 3);
  assert.equal(window.bookedShare, 11);
  assert.equal(window.startingStays, 1);
});

test('a block occupies the night and does not count as a starting stay', () => {
  const window = forwardWindow(
    'ranch',
    [{ propertyId: 'ranch', checkIn: '2026-11-06', checkOut: '2026-11-08', status: 'blocked', payout: 0 }],
    '2026-11-01',
    30,
  );
  assert.equal(window.sellable, 30);
  assert.equal(window.booked, 2);
  assert.equal(window.startingStays, 0);
});

test('checkout morning is free', () => {
  const window = forwardWindow(
    'lindon',
    [{ propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-02', status: 'confirmed', payout: 200 }],
    '2026-11-01',
    30,
  );
  assert.equal(window.booked, 1);
  assert.equal(window.startingStays, 1);
});

test('sample booked share uses the first window only', () => {
  assert.equal(sampleBookedShare([10, 30, 50, 90], 3), 30);
  assert.equal(sampleBookedShare([], 30), 0);
});
