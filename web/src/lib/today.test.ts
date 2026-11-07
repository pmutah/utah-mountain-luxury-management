import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { buildTodayDesk, buildTurnovers } from './today.ts';
import { turnHours } from './turn-clock.ts';

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
  assert.equal(turns[0]?.nextChildren, null);
  assert.equal(turns[0]?.checkoutChildren, null);
  assert.equal(turns[0]?.nextStayId, 'in');
  assert.equal(turns[0]?.checkoutStayId, 'out');
  assert.equal(turns[0]?.checkoutGuests, null);
  assert.equal(turns[0]?.leaveAt2, false);
  assert.equal(turns[0]?.arriveAt1, false);
  assert.equal(JSON.stringify(turns).includes('Ada'), false);
  assert.equal(JSON.stringify(turns).includes('801'), false);
  assert.equal(turns[1]?.checkout, '2026-11-07');
  assert.equal(turns[1]?.gapNights, null);
});

test('a 1:00 PM arrival and a 2:00 PM leave shorten the turn without keeping the note', () => {
  const turns = buildTurnovers(
    [
      stay({
        id: 'out',
        propertyId: 'ranch',
        checkIn: '2026-11-01',
        checkOut: '2026-11-04',
        note: 'Leave at 2:00 PM. Nothing is charged yet. Pat Example',
      }),
      stay({
        id: 'in',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-06',
        note: 'Add-on request: Arrive at 1:00 PM. Nothing is charged yet.',
      }),
    ],
    '2026-11-01',
  );
  assert.equal(turns[0]?.leaveAt2, true);
  assert.equal(turns[0]?.arriveAt1, true);
  const saved = JSON.stringify(turns);
  assert.equal(saved.includes('Pat'), false);
  assert.equal(saved.includes('1:00'), false);
  assert.equal(turnHours({ sameDay: true, leaveAt2: turns[0]!.leaveAt2, arriveAt1: turns[0]!.arriveAt1 }).text, '2 hours, from 11:00 AM to 1:00 PM.');
});

test('open nights skip nights that are already booked', () => {
  const desk = buildTodayDesk(
    [stay({ id: 'a', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-04' })],
    '2026-11-01',
  );
  assert.equal(desk.openNext30.lindon, 27);
  assert.equal(desk.openNext30.ranch, 30);
});
