import assert from 'node:assert/strict';
import test from 'node:test';
import { readVrboCalendarPrices } from './vrbo-calendar.ts';

/*
 * The real picker text read off BOULDER RIDGE (vrbo.com/3463559ha) on 2026-11-08, normalised to
 * `day:price` pairs while keeping the month headings and blank nights. Boulder Ridge is a saved River
 * comp, and its saved URL was an aggregator page (utah.com) with no calendar; this is the first read of
 * its actual nightly asks.
 *
 * Two things this fixture pins that a synthetic one would not: the December run steps 690 → 753 → 817 →
 * 1,001 → 1,267 across the holidays, and 18–20 Dec plus 29–31 Dec are genuinely unavailable, so they must
 * be absent rather than zero.
 */
const BOULDER_RIDGE = [
  'December 2026',
  '1:$690', '2:$690', '3:$690', '4:$690', '5:$690', '6:$690',
  '7:$753', '8:$753', '9:$817', '10:$817', '11:$817', '12:$817', '13:$817', '14:$817', '15:$817', '16:$817',
  '17:$1,001',
  '21:$1,125', '22:$1,095', '23:$1,064', '24:$1,064', '25:$1,145', '26:$1,267', '27:$1,267', '28:$1,267',
  'January 2027',
  '3:$901', '4:$735', '5:$735', '6:$735', '7:$845', '8:$955', '9:$845',
  '10:$735', '11:$735', '12:$735', '13:$735', '14:$845', '15:$937', '16:$845',
  '17:$735', '18:$735', '19:$735', '20:$735', '21:$845', '22:$955', '23:$845',
  '24:$735', '25:$735', '26:$735', '27:$735', '28:$845', '29:$955', '30:$845', '31:$735',
].join(' | ');

test('the Boulder Ridge picker reads as real nightly asks across both months', () => {
  const nights = readVrboCalendarPrices(BOULDER_RIDGE, 2026);

  assert.equal(nights['2026-12-01'], 690);
  assert.equal(nights['2026-12-17'], 1001, 'a thousands separator must not break the read');
  assert.equal(nights['2026-12-27'], 1267, 'the holiday peak is the highest December night');
  assert.equal(nights['2027-01-01'], undefined, 'January 1 was unavailable and must not be invented');
  assert.equal(nights['2027-01-04'], 735);
  assert.equal(nights['2027-01-15'], 937);
  assert.equal(nights['2027-01-31'], 735);

  const dates = Object.keys(nights).sort();
  // 25 priced nights in December (1-6, 7-8, 9-17, 21-28) and 29 in January (3-9, 10-16, 17-23, 24-31).
  assert.equal(dates.length, 54, 'every priced night is read, and nothing else');
  assert.equal(dates[0], '2026-12-01');
  assert.equal(dates.at(-1), '2027-01-31');
});

test('a night the listing does not offer stays out of the band', () => {
  const nights = readVrboCalendarPrices(BOULDER_RIDGE, 2026);
  for (const date of ['2026-12-18', '2026-12-19', '2026-12-20', '2026-12-29', '2026-12-30', '2026-12-31']) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(nights, date),
      false,
      `${date} is unavailable — a zero would read as a free night`,
    );
  }
});

test('the December nights are not reused for January', () => {
  // Both months have a 1st through a 31st, so a value-based lookup would give January December's rates.
  const nights = readVrboCalendarPrices(BOULDER_RIDGE, 2026);
  assert.equal(nights['2026-12-07'], 753);
  assert.equal(nights['2027-01-07'], 845, 'January 7 took December 7\'s price');
  assert.equal(nights['2026-12-15'], 817);
  assert.equal(nights['2027-01-15'], 937, 'January 15 took December 15\'s price');
});
