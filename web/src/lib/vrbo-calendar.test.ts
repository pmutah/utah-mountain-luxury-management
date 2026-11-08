import assert from 'node:assert/strict';
import test from 'node:test';
import { readVrboCalendarPrices } from './vrbo-calendar.ts';

/*
 * Reading one night per calendar load made a real band unreachable: the engine needs three overlapping
 * observations per night, so a dozen nights meant three dozen page loads. VRBO's date picker renders two
 * months of prices at once, so one read yields twenty-odd observations.
 *
 * The fixture below is the real picker text from Sun Ridge (Nov–Dec 2026), trimmed: day number, then its
 * price in the next cell, with a blank where the night is unavailable.
 */
const PICKER = `
November 2026
Sun | Sunday | Mon | Monday | Tue | Tuesday
8 | $1,545 | 9 | $1,545 | 10 | $1,545 | 11 | $1,545 | 12 |   | 13 |   | 14 |
15 | $1,545 | 16 | $1,541 | 17 | $1,507 | 18 | $1,541 | 19 | $1,541 | 20 |   | 21 |
28 |   | 29 | $2,076 | 30 | $1,742
December 2026
1 | $1,545 | 2 | $1,545 | 3 | $1,545 | 4 | $1,545 | 5 | $1,545
`;

test('a whole picker is read in one pass, with prices tied to their dates', () => {
  const nights = readVrboCalendarPrices(PICKER, 2026);

  assert.equal(nights['2026-11-08'], 1545, 'the first priced night is wrong');
  assert.equal(nights['2026-11-17'], 1507, 'a mid-month rate is wrong');
  assert.equal(nights['2026-11-29'], 2076, 'the Thanksgiving-week rate is wrong');
  assert.equal(nights['2026-12-01'], 1545, 'the December rate was not carried across the month heading');
});

test('a blank night is skipped, not priced at zero', () => {
  const nights = readVrboCalendarPrices(PICKER, 2026);
  for (const date of ['2026-11-12', '2026-11-13', '2026-11-20', '2026-11-28']) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(nights, date),
      false,
      `${date} is unavailable and must not appear at all — a zero would read as a free night`,
    );
  }
});

test('the December heading does not restart at November', () => {
  const nights = readVrboCalendarPrices(PICKER, 2026);
  assert.equal(nights['2026-12-05'], 1545);
  assert.equal(nights['2026-11-05'], undefined, 'a December rate leaked into November');
});

test('a picker that runs into January rolls the year forward', () => {
  const nights = readVrboCalendarPrices(
    `December 2026\n30 | $2,900 | 31 | $3,400\nJanuary 2027\n1 | $3,400 | 2 | $3,400`,
    2026,
  );
  assert.equal(nights['2026-12-31'], 3400);
  assert.equal(nights['2027-01-01'], 3400, 'the picker rolled into January but the year did not roll with it');
});

test('text with no month heading yields nothing rather than guessing', () => {
  assert.deepEqual(readVrboCalendarPrices('8 | $1,545 | 9 | $1,545', 2026), {});
});

test('a repeated day number takes its own month\'s price, not the first one found', () => {
  // A two-month picker repeats every day number. Walking the tokens by value meant `indexOf` found
  // November's "8" again while reading December, so December's nights inherited November's prices.
  const nights = readVrboCalendarPrices(
    `November 2026\n8 | $200\n9 | $210\nDecember 2026\n8 | $400\n9 | $410`,
    2026,
  );

  assert.equal(nights['2026-11-09'], 210, 'the November night is wrong');
  assert.equal(nights['2026-12-08'], 400, 'December 8 took November 8\'s price');
  assert.equal(nights['2026-12-09'], 410, 'December 9 took November 9\'s price');
});
