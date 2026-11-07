import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blocksIfRead,
  bothHouseCalendarAheadLine,
  calendarAheadLine,
  quoteCalendarFromAvailability,
  reservationsIfRead,
} from './booked-nights.ts';

test('a calendar block is not counted as a booked night ahead', () => {
  assert.equal(
    calendarAheadLine(['2026-11-04', '2026-11-06'], ['2026-11-06']),
    '1 night ahead is already booked. 1 calendar block stays closed. A block is not a booked night.',
  );
  assert.equal(
    calendarAheadLine(['2026-11-04'], []),
    '1 night ahead is already booked. 0 calendar blocks stay closed. A block is not a booked night.',
  );
  assert.equal(calendarAheadLine([], []).includes('$'), false);
});

test('a two-house quote counts a night booked at either house ahead', () => {
  const ranchThanks = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
  const line = bothHouseCalendarAheadLine({ ranch: ranchThanks, river: [], lindon: ranchThanks }, { lindon: ['2026-11-13'] });
  assert.match(line, /4 nights ahead are already booked at the River House or the Ranch House/);
  assert.match(line, /A block is not a booked night/);
  assert.equal(line.includes('$'), false);
  const riverOnly = bothHouseCalendarAheadLine({ river: ['2026-12-10'], ranch: [], lindon: ['2026-12-10'] });
  assert.match(riverOnly, /1 night ahead is already booked at the River House or the Ranch House/);
});

test('a paused read is not an empty calendar', () => {
  assert.equal(quoteCalendarFromAvailability({ storageReads: 'paused', nights: { ranch: [], lindon: [], river: [] }, closed: { ranch: [], lindon: [], river: [] } }), null);
  assert.equal(reservationsIfRead({ storageReads: 'paused', reservations: [] }), null);
  const live = quoteCalendarFromAvailability({
    nights: { ranch: ['2026-11-04'], lindon: [], river: [] },
    closed: { ranch: [], lindon: [], river: [] },
  });
  assert.deepEqual(live?.nights.ranch, ['2026-11-04']);
  assert.equal(live?.pace.ranch, 'unknown');
  // No hold list in the payload means no holds, not a broken calendar.
  assert.deepEqual(live?.held, { ranch: [], lindon: [], river: [] });
  const withHolds = quoteCalendarFromAvailability({
    nights: { ranch: [], lindon: [], river: [] },
    closed: { ranch: [], lindon: [], river: [] },
    held: { ranch: [], lindon: [], river: ['2026-12-02'] },
  });
  assert.deepEqual(withHolds?.held.river, ['2026-12-02']);
  // A hold list that is present but malformed is not a calendar.
  assert.equal(
    quoteCalendarFromAvailability({
      nights: { ranch: [], lindon: [], river: [] },
      closed: { ranch: [], lindon: [], river: [] },
      held: { ranch: 'nope' },
    }),
    null,
  );
  assert.equal(Array.isArray(reservationsIfRead({ reservations: [] })), true);
  assert.equal(
    quoteCalendarFromAvailability({ nights: { ranch: [], lindon: [], river: [] } }),
    null,
  );
  assert.equal(blocksIfRead({ storageReads: 'paused', blocks: [] }), null);
  assert.equal(blocksIfRead({ blocks: null }), null);
  assert.deepEqual(blocksIfRead({ blocks: [] }), []);
  assert.deepEqual(blocksIfRead({ blocks: [{ propertyId: 'river', start: '2026-11-02', end: '2026-11-04', note: 'owner' }] }), [
    { propertyId: 'river', start: '2026-11-02', end: '2026-11-04' },
  ]);
});

test('an approved price reaches the guest page, and a broken sheet is not an empty one', () => {
  const base = { nights: { ranch: [], lindon: [], river: [] }, closed: { ranch: [], lindon: [], river: [] } };
  // No approved field at all reads as no approvals, so the published card stands.
  const none = quoteCalendarFromAvailability(base);
  assert.deepEqual(none?.approved, { ranch: [], lindon: [], river: [] });

  const withSheet = quoteCalendarFromAvailability({
    ...base,
    approved: {
      ranch: [
        { date: '2026-12-01', guest: 667 },
        { date: '2026-13-01', guest: 700 },
        { date: '2026-12-02', guest: 0 },
      ],
      lindon: [],
      river: [{ date: '2026-12-05', guest: 2100 }],
    },
  });
  assert.deepEqual(withSheet?.approved?.ranch, [{ date: '2026-12-01', guest: 667 }], 'a bad approved row survived');
  assert.deepEqual(withSheet?.approved?.river, [{ date: '2026-12-05', guest: 2100 }]);

  // A sheet the server could not read is null on the wire, and that is not "no approvals".
  const unread = quoteCalendarFromAvailability({ ...base, approved: null });
  assert.equal(unread?.approved, null);
  // A malformed sheet must not take the whole calendar down: the nights still read, and the sheet
  // reads as unread so every night falls back to the published card.
  const broken = quoteCalendarFromAvailability({ ...base, approved: { ranch: 'nope' } });
  assert.deepEqual(broken?.nights, { ranch: [], lindon: [], river: [] });
  assert.equal(broken?.approved, null, 'a malformed sheet was read as an approval list');
});
