import assert from 'node:assert/strict';
import test from 'node:test';
import { openArrivals, nextOpenPhrase, lengthPhrase, addonPhrase } from './open-arrivals.ts';
import { quoteStay } from './quote.ts';
import { stayLengths } from './stay-lengths.ts';

test('the next open arrival is a stay the booking page will quote', () => {
  const openings = openArrivals('river', [], '2026-10-29', 'short');
  assert.equal(openings[0]?.checkIn, '2026-11-01');
  assert.equal(openings[0]?.checkOut, '2026-11-03');
  assert.equal(openings[0]?.nights, 2);
  assert.match(openings[0]?.label ?? '', /November 1, 2026 · 2 nights/);
  const quote = quoteStay('river', '2026-11-01', '2026-11-03', [], { asOf: '2026-10-29', pace: 'short' });
  assert.equal(quote.ok, true);
  assert.equal(openings[0]?.direct, quote.stayTotal);
  assert.equal(openings.length, 3);
  assert.equal(openings[1]?.checkIn, '2026-11-03');
  assert.equal(openings.every((item) => item.checkIn >= '2026-11-01'), true);
  assert.equal(nextOpenPhrase('river', [], '2026-10-29', 'short'), 'River Nov 1 for 2 nights');
  assert.equal(lengthPhrase('river', [], '2026-10-29', 'short'), 'River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights');
  assert.equal(
    addonPhrase('river', [], '2026-10-29', 'short'),
    'River Nov 1 can request an early arrival, a later checkout, and a grocery drop',
  );
  assert.equal(
    addonPhrase('river', ['2026-10-31'], '2026-10-29', 'short'),
    'River Nov 1 can request a later checkout and a grocery drop',
  );
  assert.equal(addonPhrase('ranch', [], '2026-10-29', 'short'), 'Ranch Oct 29 can request a later checkout');
  assert.equal(addonPhrase('river', [], '2026-10-29', 'short').includes('$'), false);
  const week = stayLengths('river', '2026-11-01', [], '2026-10-29', 'short')?.choices.find((choice) => choice.nights === 7);
  assert.equal(week?.direct, quoteStay('river', '2026-11-01', '2026-11-08', [], { asOf: '2026-10-29', pace: 'short' }).stayTotal);
});

test('a booked stay is skipped and a Ranch weekday can be one night', () => {
  const river = openArrivals('river', ['2026-11-01', '2026-11-02'], '2026-10-29', 'unknown');
  assert.equal(river[0]?.checkIn, '2026-11-03');
  assert.equal(river.some((item) => item.checkIn < '2026-11-03'), false);
  const ranch = openArrivals('ranch', [], '2026-10-29', 'unknown');
  assert.equal(ranch[0]?.checkIn, '2026-10-29');
  assert.equal(ranch[0]?.nights, 1);
});
