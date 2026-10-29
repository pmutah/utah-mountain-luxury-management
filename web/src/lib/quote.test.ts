import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';

test('a River shoulder weekend quotes two locked list prices and no cleaning', () => {
  const quote = quoteStay('river', '2026-11-06', '2026-11-08');
  assert.equal(quote.ok, true);
  assert.equal(quote.nights.length, 2);
  assert.equal(quote.nights[0]?.guest, 2486);
  assert.equal(quote.lodging, 4972);
  assert.equal(quote.cleaning, 0);
  assert.equal(quote.stayTotal, 4972);
  assert.equal(quote.nights[0]?.season, 'Shoulder');
});

test('River refuses dates before the first stay and a one-night weekend', () => {
  const early = quoteStay('river', '2026-10-30', '2026-11-02');
  assert.equal(early.ok, false);
  assert.match(early.reason ?? '', /November 1, 2026/);

  const short = quoteStay('river', '2026-11-06', '2026-11-07');
  assert.equal(short.ok, false);
  assert.match(short.reason ?? '', /at least 2 nights/);
});

test('a night already on the calendar cannot be quoted', () => {
  const open = quoteStay('lindon', '2026-11-03', '2026-11-06');
  assert.equal(open.ok, true);
  const taken = quoteStay('lindon', '2026-11-03', '2026-11-06', ['2026-11-04']);
  assert.equal(taken.ok, false);
  assert.equal(taken.reason, 'Those nights are already booked.');
});

test('a Ranch weekday adds the house cleaning fee', () => {
  const quote = quoteStay('ranch', '2026-11-04', '2026-11-05');
  assert.equal(quote.ok, true);
  assert.equal(quote.lodging, 640);
  assert.equal(quote.cleaning, 350);
  assert.equal(quote.stayTotal, 990);
});
