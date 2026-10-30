import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { aheadChannelsLine, aheadLine, ownerAhead } from './owner-ahead.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut'>): Reservation {
  return { id: 's', guestName: 'Secret Guest', source: 'Airbnb', payout: 99999, ...partial };
}

test('ahead counts Ranch and River nights still left and leaves names off', () => {
  const ahead = ownerAhead(
    [
      stay({ propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-10-31' }),
      stay({ propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', source: 'VRBO' }),
      stay({ propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', source: 'Direct' }),
      stay({ propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-08' }),
      stay({ propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' }),
      stay({ propertyId: 'ranch', checkIn: '2026-11-20', checkOut: '2026-11-22', status: 'blocked' }),
      stay({ propertyId: 'ranch', checkIn: '2026-10-20', checkOut: '2026-10-29' }),
    ],
    '2026-10-29',
  );
  const ranch = ahead.houses[0];
  const river = ahead.houses[1];
  assert.equal(ranch?.inHouse, 1);
  assert.equal(ranch?.coming, 1);
  assert.equal(ranch?.nights, 4);
  assert.equal(ranch?.nextArrival, 'November 4, 2026');
  assert.equal(river?.inHouse, 0);
  assert.equal(river?.coming, 1);
  assert.equal(river?.nights, 2);
  assert.equal(aheadLine(ranch!), 'Ranch: 1 stay in the house, 1 still to come, 4 nights left. Next arrival November 4, 2026.');
  assert.equal(aheadLine(river!), 'River: 0 stays in the house, 1 still to come, 2 nights left. Next arrival November 10, 2026.');
  assert.equal(aheadChannelsLine(ahead), 'Where they booked: 1 Airbnb, 1 VRBO, 1 other.');
  const text = JSON.stringify(ahead);
  assert.equal(text.includes('Secret Guest'), false);
  assert.equal(text.includes('99999'), false);
  assert.equal(text.includes('lindon'), false);
});
