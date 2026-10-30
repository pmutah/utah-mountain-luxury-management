import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay, directNight, directSavings } from './quote.ts';

test('a River shoulder weekend quotes the direct host net and keeps the Airbnb list beside it', () => {
  const quote = quoteStay('river', '2026-11-06', '2026-11-08');
  assert.equal(quote.ok, true);
  assert.equal(quote.nights.length, 2);
  assert.equal(quote.nights[0]?.guest, 2486);
  assert.equal(quote.nights[0]?.direct, 2100);
  assert.equal(quote.channelLodging, 4972);
  assert.equal(quote.lodging, 4200);
  assert.equal(quote.cleaning, 0);
  assert.equal(quote.stayTotal, 4200);
  assert.equal(quote.promotionNights, 0);
  assert.equal(quote.nights[0]?.season, 'Shoulder');
  assert.equal(directSavings(quote.channelTotal, quote.stayTotal), 772);
});

test('a short year takes 20 percent off the direct host net and leaves the Airbnb list', () => {
  const quote = quoteStay('river', '2026-11-06', '2026-11-08', [], { asOf: '2026-10-29', pace: 'short' });
  assert.equal(quote.ok, true);
  assert.equal(quote.nights[0]?.direct, 1680);
  assert.equal(quote.nights[0]?.guest, 2486);
  assert.equal(quote.promotionNights, 2);
  assert.equal(quote.lodging, 3360);
  assert.equal(quote.channelLodging, 4972);
  assert.equal(quote.stayTotal, 3360);
  assert.equal(directSavings(quote.channelTotal, quote.stayTotal), 1612);
  assert.equal(quote.nights[0]?.direct, directNight('river', '2026-11-06', [], '2026-10-29', 'short').direct);
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
  const closed = quoteStay('lindon', '2026-11-03', '2026-11-06', ['2026-11-04'], { closed: ['2026-11-04'] });
  assert.equal(closed.ok, false);
  assert.equal(closed.reason, 'Those nights are closed on the calendar.');
  const mixed = quoteStay('lindon', '2026-11-03', '2026-11-06', ['2026-11-04', '2026-11-05'], { closed: ['2026-11-04'] });
  assert.equal(mixed.reason, 'Those nights are already booked.');
});

test('a Ranch weekday adds the house cleaning fee to the direct price', () => {
  const quote = quoteStay('ranch', '2026-11-04', '2026-11-05', [], { asOf: '2026-10-29', pace: 'short' });
  assert.equal(quote.ok, true);
  assert.equal(quote.channelLodging, 640);
  assert.equal(quote.channelTotal, 990);
  assert.equal(quote.lodging, 433);
  assert.equal(quote.cleaning, 350);
  assert.equal(quote.stayTotal, 783);
  assert.equal(quote.promotionNights, 1);
  assert.equal(directSavings(quote.channelTotal, quote.stayTotal), 207);
});

test('a party larger than the house is not quoted', () => {
  const quote = quoteStay('river', '2026-11-06', '2026-11-08', [], { guests: 26 });
  assert.equal(quote.ok, false);
  assert.match(quote.reason ?? '', /sleeps 25/);
  const open = quoteStay('river', '2026-11-06', '2026-11-08', [], { guests: 25 });
  assert.equal(open.ok, true);
  const kids = quoteStay('ranch', '2026-11-04', '2026-11-05', [], { guests: 4, children: 4 });
  assert.equal(kids.ok, false);
  assert.match(kids.reason ?? '', /adult/);
  assert.equal(quoteStay('ranch', '2026-11-04', '2026-11-05', [], { guests: 4, children: 1 }).ok, true);
});

test('a lone Ranch weekend night waits until the last week', () => {
  const early = quoteStay('ranch', '2026-11-06', '2026-11-07', [], { asOf: '2026-10-29' });
  assert.equal(early.ok, false);
  assert.match(early.reason ?? '', /both weekend nights/);

  const late = quoteStay('ranch', '2026-11-06', '2026-11-07', [], { asOf: '2026-11-01' });
  assert.equal(late.ok, true);
});

test('a direct price that is not lower does not claim a savings', () => {
  assert.equal(directSavings(100, 100), null);
  assert.equal(directSavings(50, 80), null);
});
