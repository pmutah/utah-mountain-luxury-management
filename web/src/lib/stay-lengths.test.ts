import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { liveLengthLine, liveSpanLine, publishedLengths, stayLengths } from './stay-lengths.ts';

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
  assert.equal(stayLengths('ranch', '2026-11-16', [], '2026-10-31', 'unknown', 4, [], 4), null);
  assert.equal(publishedLengths('ranch', '2026-11-16', '2026-10-31', 4, 4), null);
});

test('unread lengths come from the rate card and carry no price', () => {
  const river = publishedLengths('river', '2026-11-13', '2026-10-30');
  assert.equal(river?.choices.some((choice) => choice.nights === 2), true);
  assert.equal(river?.choices.some((choice) => choice.nights === 4), true);
  assert.equal(JSON.stringify(river).includes('$'), false);
  assert.equal(publishedLengths('river', '2026-10-30', '2026-10-30'), null);
  const text = JSON.stringify(river);
  assert.equal(/\bthe house is open\b/i.test(text), false);
});

test('a live length does not say the check-in is open', () => {
  const length = liveLengthLine('November 25, 2026');
  const span = liveSpanLine('November 25, 2026', 9);
  assert.match(length, /does not say the house is open/);
  assert.match(span, /does not say the house is open/);
  assert.match(span, /9 nights/);
  assert.equal(length.includes('is open through'), false);
  assert.equal(span.includes('is open through'), false);
  assert.equal(length.includes('$'), false);
  assert.equal(span.includes('$'), false);
});
