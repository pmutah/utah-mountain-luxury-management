import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOLD_MINUTES,
  activeHolds,
  holdConflict,
  holdConflictLine,
  holdExpired,
  holdExpiresAt,
  holdNights,
  holdNote,
  type BookingHold,
} from './booking-hold.ts';

const NOW = new Date('2026-11-07T15:00:00.000Z');

const hold = (over: Partial<BookingHold> = {}): BookingHold => ({
  id: 'hold-1',
  propertyId: 'river',
  checkIn: '2026-12-01',
  checkOut: '2026-12-04',
  expiresAt: holdExpiresAt(NOW),
  createdAt: NOW.toISOString(),
  requestId: 'book-1',
  ...over,
});

test('a hold expires after the window and not before', () => {
  const at = holdExpiresAt(NOW);
  assert.equal(holdExpired({ expiresAt: at }, NOW), false);
  assert.equal(holdExpired({ expiresAt: at }, new Date(NOW.getTime() + (HOLD_MINUTES - 1) * 60_000)), false);
  assert.equal(holdExpired({ expiresAt: at }, new Date(NOW.getTime() + HOLD_MINUTES * 60_000)), true);
  assert.equal(holdExpired({ expiresAt: 'not-a-date' }, NOW), true);
});

test('a released, expired, or broken hold stays out of the active list', () => {
  const live = hold({ id: 'live' });
  const released = { ...hold({ id: 'released' }), released: true };
  const expired = hold({ id: 'expired', expiresAt: new Date(NOW.getTime() - 1000).toISOString() });
  const backwards = hold({ id: 'backwards', checkIn: '2026-12-04', checkOut: '2026-12-01' });
  const ids = activeHolds([live, released, expired, backwards], NOW).map((row) => row.id);
  assert.deepEqual(ids, ['live']);
});

test('a live hold on either house blocks a two-house request', () => {
  const holds = [hold({ propertyId: 'ranch' })];
  const river = holdConflict(holds, [], 'river', 'ranch', '2026-12-02', '2026-12-05', NOW);
  assert.equal(river, 'ranch');
  const free = holdConflict(holds, [], 'river', 'ranch', '2026-12-10', '2026-12-13', NOW);
  assert.equal(free, null);
  const single = holdConflict(holds, [], 'river', '', '2026-12-02', '2026-12-05', NOW);
  assert.equal(single, null);
});

test('a saved stay blocks the same night even with no hold', () => {
  const stays = [{ propertyId: 'river', checkIn: '2026-12-02', checkOut: '2026-12-04', status: 'confirmed' }];
  assert.equal(holdConflict([], stays, 'river', '', '2026-12-01', '2026-12-03', NOW), 'river');
  assert.equal(holdConflict([], stays, 'river', '', '2026-12-04', '2026-12-06', NOW), null);
  const cancelled = [{ ...stays[0]!, status: 'cancelled' }];
  assert.equal(holdConflict([], cancelled, 'river', '', '2026-12-01', '2026-12-03', NOW), null);
});

test('an expired hold does not block a new request', () => {
  const expired = hold({ expiresAt: new Date(NOW.getTime() - 60_000).toISOString() });
  assert.equal(holdConflict([expired], [], 'river', '', '2026-12-01', '2026-12-04', NOW), null);
});

test('the blocked line names the house and does not say booked or quote a price', () => {
  const line = holdConflictLine('river') ?? '';
  assert.match(line, /The River House has those nights held/);
  assert.equal(line.includes('$'), false);
  assert.equal(/\bbooked\b(?!\.)/i.test(line.replace('Nothing is booked', '')), false);
  assert.equal(holdConflictLine(null), null);
});

test('held nights are listed for the window and the note counts them', () => {
  const holds = [hold({ checkIn: '2026-12-01', checkOut: '2026-12-04' })];
  const nights = holdNights(holds, 'river', '2026-12-01', '2026-12-31', NOW);
  assert.deepEqual(nights, ['2026-12-01', '2026-12-02', '2026-12-03']);
  assert.equal(holdNights(holds, 'ranch', '2026-12-01', '2026-12-31', NOW).length, 0);
  assert.equal(holdNights(holds, 'river', '2026-12-10', '2026-12-31', NOW).length, 0);
  assert.match(holdNote(nights), /3 nights are held/);
  assert.match(holdNote(['2026-12-01']), /1 night is held/);
  assert.equal(holdNote([]), '');
  assert.equal(holdNote(nights).includes('$'), false);
});
