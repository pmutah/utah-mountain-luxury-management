/**
 * A stay that crosses the new year is still a stay.
 *
 * `occupiedNights(spans, house, from, until)` treats `until` as **exclusive**. Two routes passed `${year}-12-31` as that
 * end, so Dec 31 itself and every night of the following January fell outside the range and were reported as open.
 *
 * On production that was three sold nights — Dec 31, Jan 1, Jan 2 at the Ranch — reported as `hold` with a comps reason,
 * on the busiest week of the year. The board covers up to 180 days, so crossing the boundary is normal, not an edge case.
 *
 * This pins the range semantics rather than the two call sites, because the mistake was understanding the helper, not
 * typing it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { occupiedNights } from '../availability.ts';

const STAY = {
  propertyId: 'ranch',
  checkIn: '2026-12-30',
  checkOut: '2027-01-03',
  status: 'confirmed',
};

test('a range that stops at year end misses the new year', () => {
  // The exact expression both routes used. This is the bug, kept as a test so the reasoning is visible.
  const wrong = occupiedNights([STAY as never], 'ranch', '2026-11-10', '2026-12-31');
  assert.equal(wrong.includes('2026-12-31'), false, 'the helper is no longer exclusive at the end');
  assert.equal(wrong.includes('2027-01-01'), false, 'the helper now looks past `until`');

  // What was actually sold.
  assert.deepEqual(wrong, ['2026-12-30'], 'the year-end range reported something other than the two December nights');
});

test('a range that covers the board window sees the whole stay', () => {
  // What the routes do now: end at the night after the last board night.
  const right = occupiedNights([STAY as never], 'ranch', '2026-11-10', '2027-02-09');
  assert.deepEqual(right, ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'], 'the stay was not fully reported');
});

test('neither route still stops its calendar range at year end', () => {
  /*
   * The two call sites: the market board and the authoritative push plan. Both used `${today.slice(0, 4)}-12-31`, which is
   * both wrong (exclusive) and too short (a 180-day window crosses the boundary).
   */
  const BOARD = fs.readFileSync('functions/api/market/overview.ts', 'utf8');
  assert.doesNotMatch(BOARD, /occupiedNights\([^)]*-12-31/, 'the market board range still stops at year end');
  assert.match(BOARD, /addDays\(lastNight, 1\)/, 'the board does not end its range at the night after the last board night');

  const PLAN = fs.readFileSync('functions/api/pricing/push-plan.ts', 'utf8');
  assert.doesNotMatch(PLAN, /occupiedNights\([^)]*-12-31/, 'the push plan range still stops at year end');
  assert.match(PLAN, /windowEnd/, 'the push plan does not compute a window end');
});

test('a board window that crosses the boundary is the normal case', () => {
  /*
   * Not a rare edge: from any date in the second half of the year, a 90-day window runs into January. Stating it here so a
   * future range change is measured against this rather than assumed safe.
   */
  const from = '2026-11-10';
  const last = new Date(`${from}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 89);
  assert.ok(last.toISOString().slice(0, 4) === '2027', 'a 90-day window from November no longer crosses into the next year');
});
