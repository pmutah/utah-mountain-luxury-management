import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { publishedShortestLine, shortestStay } from './shortest-stay.ts';

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

test('a refused stay names the shortest rate-card length and does not call the house open', () => {
  const line = publishedShortestLine('river', '2026-11-13', '2026-11-14', '2026-10-30', 4);
  assert.match(line ?? '', /through November 15, 2026, 2 nights/);
  assert.match(line ?? '', /does not say the house is open/);
  assert.match(line ?? '', /Nothing is charged yet/);
  assert.equal((line ?? '').includes('$'), false);
  assert.equal((line ?? '').replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  assert.equal(publishedShortestLine('river', '2026-11-13', '2026-11-15', '2026-10-30', 4), null);
  assert.equal(publishedShortestLine('river', '2026-11-13', '2026-11-14', '2026-10-30', 4, ['2026-11-14']), null);
  assert.equal(publishedShortestLine('river', '2026-11-13', '2026-11-14', '2026-10-30', 4, [], ['2026-11-14']), null);
  assert.equal(publishedShortestLine('ranch', '2026-10-01', '2026-10-03', '2026-10-30', 4), null);
  assert.equal(shortestStay('ranch', '2026-11-16', [], '2026-10-31', 'unknown', 4, [], 4), null);
  assert.notEqual(shortestStay('ranch', '2026-11-16', [], '2026-10-31', 'unknown', 4, [], 1), null);
});
