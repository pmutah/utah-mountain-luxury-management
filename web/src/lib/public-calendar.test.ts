import assert from 'node:assert/strict';
import test from 'node:test';
import { publicCalendarFromLists } from './public-calendar.ts';

test('the public calendar keeps names, notes, and payout amounts off the response', () => {
  const calendar = publicCalendarFromLists(
    [
      {
        id: 'res-1',
        guestName: 'Hidden Guest',
        guestPhone: '801-555-0199',
        note: 'secret note',
        payout: 424242,
        propertyId: 'ranch',
        checkIn: '2026-11-13',
        checkOut: '2026-11-15',
        status: 'confirmed',
      },
      {
        guestName: 'Turn Guest',
        propertyId: 'lindon',
        checkIn: '2026-11-06',
        checkOut: '2026-11-08',
        status: 'confirmed',
      },
      {
        guestName: 'Cancelled Turn',
        propertyId: 'lindon',
        checkIn: '2026-11-08',
        checkOut: '2026-11-10',
        status: 'cancelled',
      },
      {
        guestName: 'Cancelled Guest',
        payout: 111111,
        propertyId: 'ranch',
        checkIn: '2026-11-20',
        checkOut: '2026-11-22',
        status: 'cancelled',
      },
    ],
    [{ propertyId: 'river', start: '2026-12-01', end: '2026-12-03', note: 'owner week' }],
    '2026-10-30',
  );
  const text = JSON.stringify(calendar);
  assert.equal(text.includes('Hidden Guest'), false);
  assert.equal(text.includes('Turn Guest'), false);
  assert.equal(text.includes('Cancelled Turn'), false);
  assert.deepEqual(calendar.turns, [{ house: 'lindon', checkOut: '2026-11-08' }]);
  assert.equal(text.includes('Cancelled Guest'), false);
  assert.equal(text.includes('801'), false);
  assert.equal(text.includes('secret note'), false);
  assert.equal(text.includes('owner week'), false);
  assert.equal(text.includes('424242'), false);
  assert.equal(text.includes('111111'), false);
  assert.equal(text.includes('$'), false);
  assert.equal(calendar.storageReads, 'ok');
  assert.deepEqual(calendar.nights?.ranch.filter((night) => night.startsWith('2026-11-1')), ['2026-11-13', '2026-11-14']);
  assert.equal(calendar.nights?.ranch.includes('2026-11-20'), false);
  assert.deepEqual(calendar.closed?.river.filter((night) => night.startsWith('2026-12-0')), ['2026-12-01', '2026-12-02']);
  assert.equal(calendar.nights?.river.includes('2026-12-01'), true);
  assert.equal(calendar.pace.ranch === 'short' || calendar.pace.ranch === 'met', true);
});

test('an approved price travels on the public calendar with no private field beside it', () => {
  const approvedAt = '2026-11-07T18:00:00.000Z';
  const calendar = publicCalendarFromLists(
    [],
    [],
    '2026-10-30',
    [],
    [
      { house: 'ranch', date: '2026-12-01', guest: 667, approvedAt },
      // A bad house, a bad day, and a bad price are dropped rather than published.
      { house: 'garage', date: '2026-12-02', guest: 700, approvedAt },
      { house: 'ranch', date: '2026-02-30', guest: 700, approvedAt },
      { house: 'ranch', date: '2026-12-03', guest: -5, approvedAt },
    ],
  );
  assert.deepEqual(calendar.approved?.ranch, [{ date: '2026-12-01', guest: 667 }]);
  assert.deepEqual(calendar.approved?.river, []);
  // Only the night and the price go out. The approval time and the house key stay off.
  const text = JSON.stringify(calendar);
  assert.equal(text.includes(approvedAt), false);
  assert.equal(text.includes('garage'), false);
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false);
});

test('a sheet that could not be read is null, never an empty approval list', () => {
  const unread = publicCalendarFromLists([], [], '2026-10-30', [], null);
  assert.equal(unread.approved, null, 'an unread sheet was published as no approvals');
  const read = publicCalendarFromLists([], [], '2026-10-30', [], []);
  assert.deepEqual(read.approved, { ranch: [], lindon: [], river: [] });
  // A paused calendar carries no approval list at all.
  const paused = publicCalendarFromLists([], [], 'not-a-day', [], []);
  assert.equal(paused.storageReads, 'paused');
  assert.equal(paused.approved, null);
});
