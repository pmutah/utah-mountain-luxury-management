import assert from 'node:assert/strict';
import test from 'node:test';
import { longestStay } from './longest-stay.ts';
import { quoteStay } from './quote.ts';

test('a check-in runs until the next taken night, and stops at 28', () => {
  const open = longestStay('river', '2026-11-06', [], '2026-10-29', 'short');
  assert.equal(open?.nights, 28);
  assert.equal(open?.checkOut, '2026-12-04');
  assert.equal(open?.through, 'December 4, 2026');
  assert.equal(quoteStay('river', '2026-11-06', '2026-12-04', [], { asOf: '2026-10-29', pace: 'short' }).ok, true);

  const stopped = longestStay('river', '2026-11-06', ['2026-11-10'], '2026-10-29', 'short');
  assert.equal(stopped?.checkOut, '2026-11-10');
  assert.equal(stopped?.nights, 4);

  const bumped = longestStay('river', '2026-11-22', [], '2026-10-29', 'unknown');
  assert.equal(bumped?.nights, 28);
  assert.equal(bumped?.checkOut, '2026-12-20');

  const beforeHolidayBlock = longestStay('river', '2026-11-22', ['2026-11-28'], '2026-10-29', 'unknown');
  assert.equal(beforeHolidayBlock?.checkOut, '2026-11-28');
  assert.equal(beforeHolidayBlock?.nights, 6);

  assert.equal(longestStay('river', '2026-11-06', ['2026-11-06'], '2026-10-29', 'short'), null);
  assert.equal(longestStay('river', '2026-10-30', [], '2026-10-29', 'short'), null);
  assert.equal(longestStay('river', '2026-11-06', [], '2026-10-29', 'short', 26), null);
});
