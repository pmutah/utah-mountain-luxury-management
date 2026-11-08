import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTurnovers } from './today.ts';
import type { Reservation } from './api';

/*
 * A cleaner's page said "No turnover in the next two weeks" while the most urgent job of that fortnight
 * was hidden. The Lindon House checks out 2026-11-22 and the next guest arrives the same afternoon — a
 * same-day clean, the one a cleaner must not miss.
 *
 * `buildTurnovers` filtered with `checkOut < until`. With `asOf` 2026-11-08 and a 14-day horizon, `until`
 * is 2026-11-22, so a checkout landing exactly on the horizon was dropped. The horizon is inclusive: a
 * clean due on day 14 is due.
 */

function stay(over: Partial<Reservation> & { id: string; checkIn: string; checkOut: string }): Reservation {
  return {
    guestName: 'Guest',
    propertyId: 'lindon',
    payout: 1000,
    source: 'Airbnb',
    status: 'confirmed',
    ...over,
  } as Reservation;
}

const LINDOON_PAIR = [
  stay({ id: 't-out', checkIn: '2026-11-19', checkOut: '2026-11-22' }),
  stay({ id: 't-in', checkIn: '2026-11-22', checkOut: '2026-11-29' }),
];

test('a checkout on the last day of the horizon is still a turnover', () => {
  // 2026-11-08 + 14 days is 2026-11-22, the checkout date itself.
  const turns = buildTurnovers(LINDOON_PAIR, '2026-11-08', 14);
  assert.equal(turns.length, 1, 'the checkout on the horizon boundary was dropped');
  assert.equal(turns[0]!.checkout, '2026-11-22');
  assert.equal(turns[0]!.gapNights, 0, 'this is a same-day clean and must read as zero gap');
  assert.equal(turns[0]!.nextCheckIn, '2026-11-22');
});

test('the day after the horizon is still excluded', () => {
  const later = [stay({ id: 't-later', checkIn: '2026-11-19', checkOut: '2026-11-23' })];
  assert.equal(buildTurnovers(later, '2026-11-08', 14).length, 0, 'a checkout past the horizon leaked in');
});

test('a checkout before the window is not a turnover either', () => {
  const past = [stay({ id: 't-past', checkIn: '2026-11-01', checkOut: '2026-11-05' })];
  assert.equal(buildTurnovers(past, '2026-11-08', 14).length, 0);
});

test('a cancelled stay is never a clean', () => {
  const cancelled = [stay({ id: 't-x', checkIn: '2026-11-19', checkOut: '2026-11-22', status: 'cancelled' })];
  assert.equal(buildTurnovers(cancelled, '2026-11-08', 14).length, 0);
});

test('a same-day turn reports zero gap while a gap night reports one', () => {
  const sameDay = buildTurnovers(LINDOON_PAIR, '2026-11-08', 14)[0]!;
  assert.equal(sameDay.gapNights, 0);

  const nextDay = buildTurnovers(
    [stay({ id: 't-o2', checkIn: '2026-11-19', checkOut: '2026-11-22' }), stay({ id: 't-i2', checkIn: '2026-11-23', checkOut: '2026-11-26' })],
    '2026-11-08',
    14,
  )[0]!;
  assert.equal(nextDay.gapNights, 1, 'one empty night should read as one, not zero');
});
