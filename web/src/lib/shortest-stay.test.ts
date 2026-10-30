import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { shortestStay } from './shortest-stay.ts';

test('a short Friday becomes the shortest stay that check-in can start', () => {
  const next = shortestStay('river', '2026-11-06', [], '2026-10-29', 'unknown');
  assert.equal(next?.checkOut, '2026-11-08');
  assert.equal(next?.nights, 2);
  assert.equal(next?.through, 'November 8, 2026');
  const quote = quoteStay('river', '2026-11-06', '2026-11-08', [], { asOf: '2026-10-29', pace: 'unknown' });
  assert.equal(quote.ok, true);
  assert.equal(shortestStay('river', '2026-11-06', ['2026-11-06'], '2026-10-29', 'unknown'), null);
  assert.equal(shortestStay('river', '2026-10-30', [], '2026-10-29', 'unknown'), null);
  assert.equal(shortestStay('river', '2026-11-06', [], '2026-10-29', 'unknown', 26), null);
  const ranch = shortestStay('ranch', '2026-11-06', [], '2026-10-29', 'unknown');
  assert.equal(ranch?.checkOut, '2026-11-08');
  assert.equal(ranch?.nights, 2);
});
