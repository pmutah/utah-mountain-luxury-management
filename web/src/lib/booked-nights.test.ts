import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarAheadLine } from './booked-nights.ts';

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
