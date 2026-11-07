import assert from 'node:assert/strict';
import test from 'node:test';
import { openingStay } from './booking-open.ts';
import { quoteStay } from './quote.ts';

test('a blank booking page opens on a stay the quote accepts', () => {
  const shoulder = openingStay('river', '2026-10-31');
  assert.equal(shoulder.checkIn, '2026-11-06');
  assert.equal(shoulder.checkOut, '2026-11-08');
  assert.equal(quoteStay('river', shoulder.checkIn, shoulder.checkOut, [], { asOf: '2026-10-31', pace: 'unknown' }).ok, true);

  const thanksgiving = openingStay('river', '2026-11-25');
  assert.equal(thanksgiving.checkIn, '2026-11-27');
  const holiday = quoteStay('river', thanksgiving.checkIn, thanksgiving.checkOut, [], { asOf: '2026-11-25', pace: 'unknown' });
  assert.equal(holiday.ok, true);
  assert.equal(holiday.nights.length >= 4, true);
  assert.equal(holiday.reason ?? '', '');

  const christmas = openingStay('river', '2026-12-18');
  const peak = quoteStay('river', christmas.checkIn, christmas.checkOut, [], { asOf: '2026-12-18', pace: 'unknown' });
  assert.equal(peak.ok, true);
  assert.equal(peak.nights.length >= 5, true);
  assert.equal(`${thanksgiving.checkIn} ${christmas.checkIn}`.includes('$'), false);
});

test('a blank page skips a Friday that is already booked', () => {
  const thanksgiving = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
  const ranch = openingStay('ranch', '2026-11-25', thanksgiving);
  assert.equal(ranch.checkIn, '2026-12-04');
  assert.equal(ranch.checkOut, '2026-12-06');
  const open = quoteStay('ranch', ranch.checkIn, ranch.checkOut, thanksgiving, { asOf: '2026-11-25', pace: 'unknown' });
  assert.equal(open.ok, true);
  assert.equal(open.nights.some((night) => thanksgiving.includes(night.date)), false);

  const christmas = [
    '2026-12-18',
    '2026-12-19',
    '2026-12-20',
    '2026-12-23',
    '2026-12-24',
    '2026-12-25',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
  ];
  const peak = openingStay('ranch', '2026-12-18', christmas);
  assert.equal(peak.checkIn, '2027-01-08');
  const peakQuote = quoteStay('ranch', peak.checkIn, peak.checkOut, christmas, { asOf: '2026-12-18', pace: 'unknown' });
  assert.equal(peakQuote.ok, true);
  assert.equal(peakQuote.nights.some((night) => christmas.includes(night.date)), false);

  const closed = ['2026-11-06', '2026-11-07'];
  const later = openingStay('river', '2026-10-31', [], closed);
  assert.equal(later.checkIn, '2026-11-13');
  assert.equal(later.checkOut, '2026-11-15');
  assert.equal(
    quoteStay('river', later.checkIn, later.checkOut, [], { asOf: '2026-10-31', pace: 'unknown', closed }).ok,
    true,
  );
  assert.equal(`${ranch.checkIn} ${peak.checkIn} ${later.checkIn}`.includes('$'), false);
});
