import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { buildTodayDesk, buildTurnovers } from './today.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut'>): Reservation {
  return {
    guestName: 'Guest',
    payout: 0,
    source: 'Airbnb',
    ...partial,
  };
}

test('the desk lists arrivals and departures inside the week and skips cancelled stays', () => {
  const desk = buildTodayDesk(
    [
      stay({ id: 'a', propertyId: 'ranch', guestName: 'Ada', checkIn: '2026-11-02', checkOut: '2026-11-12' }),
      stay({ id: 'b', propertyId: 'lindon', guestName: 'Bea', checkIn: '2026-10-28', checkOut: '2026-11-01' }),
      stay({ id: 'c', propertyId: 'river', guestName: 'Cy', checkIn: '2026-11-20', checkOut: '2026-11-24', status: 'cancelled' }),
    ],
    '2026-11-01',
  );
  assert.deepEqual(desk.arrivals.map((move) => move.guest), ['Ada']);
  assert.deepEqual(desk.departures.map((move) => move.guest), ['Bea']);
  assert.equal(desk.arrivals[0]?.nights, 10);
});

test('a same-day turnover is a zero-night gap', () => {
  const turns = buildTurnovers(
    [
      stay({ id: 'out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04' }),
      stay({
        id: 'in',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-07',
        note: 'Ada Lovelace · 9 guests · 801-555-0100',
      }),
      stay({ id: 'later', propertyId: 'lindon', checkIn: '2026-11-20', checkOut: '2026-11-22' }),
    ],
    '2026-11-01',
  );
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.gapNights, 0);
  assert.equal(turns[0]?.house, 'ranch');
  assert.equal(turns[0]?.nextGuests, 9);
  assert.equal(turns[0]?.nextStayId, 'in');
  assert.equal(turns[0]?.checkoutStayId, 'out');
  assert.equal(turns[0]?.checkoutGuests, null);
  assert.equal(JSON.stringify(turns).includes('Ada'), false);
  assert.equal(JSON.stringify(turns).includes('801'), false);
  assert.equal(turns[1]?.checkout, '2026-11-07');
  assert.equal(turns[1]?.gapNights, null);
});

test('open nights skip nights that are already booked', () => {
  const desk = buildTodayDesk(
    [stay({ id: 'a', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-04' })],
    '2026-11-01',
  );
  assert.equal(desk.openNext30.lindon, 27);
  assert.equal(desk.openNext30.ranch, 30);
});
