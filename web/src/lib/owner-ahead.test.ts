import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { aheadChannelsLine, aheadLine, gapBrief, gapLine, ownerAhead } from './owner-ahead.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut'>): Reservation {
  return { id: 's', guestName: 'Secret Guest', source: 'Airbnb', payout: 99999, ...partial };
}

test('ahead counts Ranch and River nights still left and leaves names off', () => {
  const stays = [
    stay({ propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-10-31' }),
    stay({ propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', source: 'VRBO' }),
    stay({ propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', source: 'Direct' }),
    stay({ propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-08' }),
    stay({ propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' }),
    stay({ propertyId: 'ranch', checkIn: '2026-11-20', checkOut: '2026-11-22', status: 'blocked' }),
    stay({ propertyId: 'ranch', checkIn: '2026-10-20', checkOut: '2026-10-29' }),
  ];
  const ahead = ownerAhead(stays, '2026-10-29');
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
  assert.equal(aheadChannelsLine(ahead), 'Where they booked: 1 Airbnb, 1 VRBO, 1 Direct.');
  assert.equal(ranch?.gaps[0]?.start, '2026-10-31');
  assert.equal(ranch?.gaps[0]?.nights, 4);
  assert.equal(ranch?.gaps[0]?.until, '2026-11-04');
  assert.equal(ranch?.gaps[1]?.start, '2026-11-06');
  assert.equal(ranch?.gaps[1]?.nights, 14);
  assert.equal(ranch?.gaps[1]?.until, '2026-11-20');
  assert.equal(river?.gaps[0]?.start, '2026-11-01');
  assert.equal(river?.gaps[0]?.nights, 9);
  assert.equal(river?.gaps[0]?.until, '2026-11-10');
  assert.match(gapLine('Ranch', ranch!.gaps[0]!), /October 31, 2026 for 4 nights, until November 4, 2026/);
  assert.match(gapBrief(ahead), /Open stretch on the calendar: Ranch Oct 31 for 4 nights\. River Nov 1 for 9 nights/);
  const held = ownerAhead(stays, '2026-10-29', [
    { propertyId: 'river', start: '2026-11-01', end: '2026-11-04', note: 'owner hold' } as {
      propertyId: string;
      start: string;
      end: string;
      note: string;
    },
  ]);
  assert.equal(held.houses[1]?.gaps[0]?.start, '2026-11-04');
  assert.equal(held.houses[1]?.gaps[0]?.nights, 6);
  assert.equal(held.houses[1]?.gaps[0]?.until, '2026-11-10');
  assert.equal(held.houses[0]?.inHouse, 1);
  assert.equal(held.houses[0]?.coming, 1);
  assert.equal(JSON.stringify(held).includes('owner hold'), false);
  const text = JSON.stringify(ahead);
  assert.equal(text.includes('Secret Guest'), false);
  assert.equal(text.includes('99999'), false);
  assert.equal(text.includes('lindon'), false);
  const named = ownerAhead(
    [
      stay({ propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-06', source: 'HomeAway' }),
      stay({ propertyId: 'ranch', checkIn: '2026-12-01', checkOut: '2026-12-03', source: '   ' }),
      stay({ propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-12', source: 'Direct' }),
      stay({ propertyId: 'river', checkIn: '2026-12-10', checkOut: '2026-12-12', source: 'Direct' }),
      stay({
        propertyId: 'river',
        checkIn: '2026-12-20',
        checkOut: '2026-12-22',
        source: 'This source name is far too long to show on the page',
      }),
    ],
    '2026-10-29',
  );
  assert.equal(aheadChannelsLine(named), 'Where they booked: 1 VRBO, 2 Direct, 2 Unlisted.');
  assert.equal(JSON.stringify(named).includes('far too long'), false);
});
