import assert from 'node:assert/strict';
import test from 'node:test';
import { bookableNights } from './bookable.ts';

test('a one-night hole at the River House cannot be booked', () => {
  const open = bookableNights('river', ['2026-11-03'], ['2026-11-02', '2026-11-04'], '2026-11-01', 'short');
  assert.equal(open.has('2026-11-03'), false);
  const pair = bookableNights(
    'river',
    ['2026-11-03', '2026-11-04'],
    ['2026-11-02', '2026-11-05'],
    '2026-11-01',
    'short',
  );
  assert.equal(pair.has('2026-11-03'), true);
  assert.equal(pair.has('2026-11-04'), true);
});

test('a lone Friday with both side nights taken cannot be booked until the last week', () => {
  const early = bookableNights('ranch', ['2026-11-13'], ['2026-11-12', '2026-11-14'], '2026-10-30', 'short');
  assert.equal(early.has('2026-11-13'), false);
  const late = bookableNights('ranch', ['2026-11-06'], ['2026-11-05', '2026-11-07'], '2026-11-06', 'short');
  assert.equal(late.has('2026-11-06'), true);
});
