import assert from 'node:assert/strict';
import test from 'node:test';
import { guestPromoLine, guestPromoMark, quoteStay, directNight, directSavings, publishedStayRule, seasonSpan } from './quote.ts';

test('a guest discount does not use host wording', () => {
  assert.equal(guestPromoLine(0), '');
  assert.equal(guestPromoLine(1), 'One night is 20% off.');
  assert.equal(guestPromoLine(2), '2 nights are 20% off.');
  assert.equal(guestPromoMark(), '20% off');
  const text = `${guestPromoLine(2)} ${guestPromoMark()}`;
  assert.equal(/\bfill\b|published base|\$|\bis open\b/i.test(text), false);
});

test('each house charges its own cleaning fee on a direct quote', () => {
  // Pinned so a fee cannot quietly drift back to zero and understate the cleaning cost.
  assert.equal(quoteStay('ranch', '2026-11-10', '2026-11-12').cleaning, 350);
  assert.equal(quoteStay('lindon', '2026-11-10', '2026-11-12').cleaning, 160);
  assert.equal(quoteStay('river', '2026-11-06', '2026-11-08').cleaning, 600);
});

test('a River shoulder weekend quotes the direct host net and keeps the Airbnb list beside it', () => {
  const quote = quoteStay('river', '2026-11-06', '2026-11-08');
  assert.equal(quote.ok, true);
  assert.equal(quote.nights.length, 2);
  assert.equal(quote.nights[0]?.guest, 2486);
  assert.equal(quote.nights[0]?.direct, 2100);
  assert.equal(quote.channelLodging, 4972);
  assert.equal(quote.lodging, 4200);
  assert.equal(quote.cleaning, 600);
  assert.equal(quote.stayTotal, 4800);
  assert.equal(quote.promotionNights, 0);
  assert.equal(quote.nights[0]?.season, 'Shoulder');
  // The cleaning fee is on both sides, so the saving is the lodging difference alone.
  assert.equal(quote.channelTotal, 5572);
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
  assert.equal(quote.cleaning, 600);
  assert.equal(quote.stayTotal, 3960);
  // Both sides carry the same cleaning fee, so the saving is the lodging difference alone.
  assert.equal(quote.channelTotal, 5572);
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
  const onlyClosed = quoteStay('lindon', '2026-11-03', '2026-11-06', [], { closed: ['2026-11-04'] });
  assert.equal(onlyClosed.ok, false);
  assert.equal(onlyClosed.reason, 'Those nights are closed on the calendar.');
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

test('a published stay rule does not read the calendar or name a price', () => {
  assert.match(publishedStayRule('river', '2026-11-06', '2026-11-07', 4, undefined, '2026-10-30') ?? '', /at least 2 nights/);
  assert.match(
    publishedStayRule('ranch', '2026-11-13', '2026-11-14', 4, undefined, '2026-10-30') ?? '',
    /both weekend nights/,
  );
  assert.match(
    publishedStayRule('river', '2026-10-30', '2026-11-02', 4, undefined, '2026-10-30') ?? '',
    /first stays on November 1, 2026/,
  );
  assert.equal(publishedStayRule('river', '2026-11-06', '2026-11-08', 4, undefined, '2026-10-30'), null);
  assert.equal(publishedStayRule('ranch', '2026-11-06', '2026-11-08', 30, undefined, '2026-10-30'), null);
  const text = [
    publishedStayRule('river', '2026-11-06', '2026-11-07', 4, undefined, '2026-10-30'),
    publishedStayRule('ranch', '2026-11-13', '2026-11-14', 4, undefined, '2026-10-30'),
    publishedStayRule('river', '2026-10-30', '2026-11-02', 4, undefined, '2026-10-30'),
  ].join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(text.toLowerCase().includes('open'), false);
  assert.equal(text.toLowerCase().includes('booked'), false);
});

test('a check-in that has already passed is refused', () => {
  const past = quoteStay('ranch', '2026-10-01', '2026-10-03', [], { asOf: '2026-10-30', guests: 4 });
  assert.equal(past.ok, false);
  assert.equal(past.reason, 'That check-in has already passed.');
  assert.equal(past.lodging, 0);
  assert.equal(past.stayTotal, 0);
  const today = quoteStay('ranch', '2026-10-30', '2026-11-01', [], { asOf: '2026-10-30', guests: 2 });
  assert.equal(today.ok, true);
  assert.equal(today.reason, null);
  const rule = publishedStayRule('ranch', '2026-10-01', '2026-10-03', 4, 0, '2026-10-30');
  assert.equal(rule, 'That check-in has already passed.');
  assert.equal((rule ?? '').includes('$'), false);
});

test('a direct price that is not lower does not claim a savings', () => {
  assert.equal(directSavings(100, 100), null);
  assert.equal(directSavings(50, 80), null);
});

test('a River stay that crosses seasons names each one and does not quote a price', () => {
  const crossed = seasonSpan('river', '2026-11-28', '2026-12-02');
  assert.match(crossed ?? '', /Thanksgiving, then Shoulder, then Early ski season/);
  assert.match(crossed ?? '', /Nothing is charged yet/);
  assert.equal((crossed ?? '').includes('$'), false);
  assert.equal(/\bopen\b/i.test(crossed ?? ''), false);
  assert.equal(
    seasonSpan('river', '2026-11-06', '2026-11-08'),
    'The rate card calls these nights Shoulder. The nightly rate follows the rate card. Nothing is charged yet.',
  );
  assert.equal(seasonSpan('ranch', '2026-11-28', '2026-12-02'), null);
  assert.equal(seasonSpan('river', '2026-12-02', '2026-11-28'), null);
});
