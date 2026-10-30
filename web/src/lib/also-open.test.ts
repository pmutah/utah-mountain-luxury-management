import assert from 'node:assert/strict';
import test from 'node:test';
import { alsoOpen } from './also-open.ts';
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
});
