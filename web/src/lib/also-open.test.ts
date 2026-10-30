import assert from 'node:assert/strict';
import test from 'node:test';
import { alsoHeld, alsoOpen, comparePhrase } from './also-open.ts';
import { quoteStay } from './quote.ts';

const pace = () => 'unknown' as const;

test('the other houses quote the same dates, and a party has to fit', () => {
  const open = alsoOpen('river', '2026-11-01', '2026-11-03', {}, '2026-10-29', pace);
  assert.deepEqual(
    open.map((item) => item.house),
    ['ranch', 'lindon'],
  );
  const ranch = quoteStay('ranch', '2026-11-01', '2026-11-03', [], { asOf: '2026-10-29', pace: 'unknown' });
  assert.equal(open[0]?.direct, ranch.stayTotal);
  assert.equal(open[0]?.nights, 2);

  const full = alsoOpen('river', '2026-11-01', '2026-11-03', {}, '2026-10-29', pace, 25);
  assert.equal(full.length, 0);

  const booked = alsoOpen(
    'river',
    '2026-11-01',
    '2026-11-03',
    { ranch: ['2026-11-01'] },
    '2026-10-29',
    pace,
  );
  assert.deepEqual(
    booked.map((item) => item.house),
    ['lindon'],
  );
  const held = alsoHeld('river', '2026-11-01', '2026-11-03', {}, '2026-10-29', pace, 25);
  assert.deepEqual(
    held.map((item) => item.house),
    ['ranch', 'lindon'],
  );
  assert.match(held[0]?.reason ?? '', /sleeps 20/);
  assert.match(held[1]?.reason ?? '', /sleeps 12/);
  const bookedHeld = alsoHeld('river', '2026-11-01', '2026-11-03', { ranch: ['2026-11-01'] }, '2026-10-29', pace);
  assert.match(bookedHeld[0]?.reason ?? '', /Ranch: Those nights are already booked/);
  assert.equal(held.some((item) => item.reason.includes('$')), false);
  assert.equal(held.every((item) => item.longer === null), true);
  const short = alsoHeld('lindon', '2026-11-13', '2026-11-14', {}, '2026-10-30', pace);
  const ranchLonger = short.find((item) => item.house === 'ranch');
  const river = short.find((item) => item.house === 'river');
  assert.equal(ranchLonger?.longer?.nights, 2);
  assert.equal(ranchLonger?.longer?.checkOut, '2026-11-15');
  assert.equal(river?.longer?.nights, 2);
  assert.equal(river?.longer?.checkOut, '2026-11-15');
  const compared = comparePhrase('river', {}, '2026-10-29', pace);
  assert.match(compared, /River: Ranch and Lindon will quote the same dates/);
  assert.equal(compared.includes('$'), false);
  const blocked = comparePhrase('ranch', { lindon: ['2026-10-29'] }, '2026-10-29', pace);
  assert.match(blocked, /Lindon is booked/);
  assert.match(blocked, /River is not open yet/);
  const closedCompare = comparePhrase('river', { ranch: ['2026-11-01'] }, '2026-10-29', pace, { ranch: ['2026-11-01'] });
  assert.match(closedCompare, /Ranch is closed/);
  assert.equal(closedCompare.includes('booked'), false);
  assert.equal(closedCompare.includes('$'), false);
});
