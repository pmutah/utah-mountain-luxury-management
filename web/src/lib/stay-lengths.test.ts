import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { stayLengths } from './stay-lengths.ts';

test('a check-in offers the lengths that quote, and skips a length that is too short', () => {
  const open = stayLengths('river', '2026-11-06', [], '2026-10-29', 'short');
  assert.deepEqual(
    open?.choices.map((choice) => choice.nights),
    [2, 3, 4, 7, 14, 28],
  );
  assert.equal(open?.through, 'December 4, 2026');
  assert.equal(open?.choices.find((choice) => choice.nights === 7)?.checkOut, '2026-11-13');
  const week = quoteStay('river', '2026-11-06', '2026-11-13', [], { asOf: '2026-10-29', pace: 'short' });
  assert.equal(week.ok, true);
  assert.equal(week.nights.length, open?.choices.find((choice) => choice.nights === 7)?.nights);

  const stopped = stayLengths('river', '2026-11-06', ['2026-11-10'], '2026-10-29', 'short');
  assert.deepEqual(
    stopped?.choices.map((choice) => choice.nights),
    [2, 3, 4],
  );
  assert.equal(stopped?.choices.at(-1)?.checkOut, '2026-11-10');

  const holiday = stayLengths('river', '2026-11-22', [], '2026-10-29', 'unknown');
  const holidayNights = holiday?.choices.map((choice) => choice.nights) ?? [];
  assert.equal(holidayNights.includes(2), true);
  assert.equal(holidayNights.includes(3), false);
  assert.equal(holidayNights.includes(4), true);
  assert.equal(holidayNights.includes(28), true);

  assert.equal(stayLengths('river', '2026-11-06', ['2026-11-06'], '2026-10-29', 'short'), null);
  assert.equal(stayLengths('river', '2026-10-30', [], '2026-10-29', 'short'), null);
  assert.equal(stayLengths('river', '2026-11-06', [], '2026-10-29', 'short', 26), null);
});
