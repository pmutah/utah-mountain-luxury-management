/**
 * A part guest is never shown a whole-house price as if it were their stay.
 *
 * Found in a browser walk of the old booking page. With the Main Lodge chosen, the quote was right — "$1,790 for 2 nights"
 * for $745 × 2 plus $300 cleaning — but the "arrivals this page will quote" chips beside it still read **$3,600** and
 * **$3,780**, which are the whole-house figures from `openArrivals`. It calls `nightAsk(house)` and knows nothing about parts.
 *
 * Two numbers for one stay, one of them 2× the other, on the page a guest reads to decide. That is the same class as the
 * $1,340 overstatement recorded on the accept route: the guest's figure and a figure beside it that is not theirs.
 *
 * The rebuilt card has no arrival chips, so that exact surface is gone. The property they were guarding is not: **every
 * figure on the card must be the figure for what is being booked.** It is re-expressed here against the surfaces the card
 * actually has, and the arrival-chip case is kept as history so the reason is not lost.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { arrivalChipText } from './open-arrivals.ts';

const CARD = readFileSync('src/components/DirectReserveCard.tsx', 'utf8');

test('the chip helper still drops the price when asked', () => {
  // The mechanism the original fix relied on, still worth pinning: a label alone is a valid chip.
  assert.equal(arrivalChipText('November 14, 2026 · 2 nights', '$3,780', false), 'November 14, 2026 · 2 nights');
  assert.equal(arrivalChipText('November 14, 2026 · 2 nights', '$3,780', true), 'November 14, 2026 · 2 nights · $3,780');
});

test('the headline price follows the parts when parts are chosen', () => {
  /*
   * The card's primary number. Reading `quote.stayTotal` unconditionally would put the house total above a part guest's
   * own quote — the same two-prices-for-one-stay defect, in the largest type on the page.
   */
  assert.match(CARD, /data-bot="stay-headline"/, 'the headline lost its hook');
  assert.match(CARD, /bookingParts/, 'the headline does not branch on the chosen parts');
  const headline = CARD.slice(CARD.indexOf('data-bot="stay-headline"'), CARD.indexOf('data-bot="stay-headline"') + 700);
  assert.match(headline, /partTotal/, 'the headline does not show the part total');
  assert.match(headline, /quote\.stayTotal/, 'the headline does not fall back to the house total');
});

test('an unpriced part is never rendered as a free stay', () => {
  /*
   * `partTotal ?? 0` was the first version of this line: a chosen part with no price produced **$0**, which reads as
   * "this stay is free". A number that is not known must not be shown as the best possible number.
   */
  assert.equal(/partTotal \?\? 0/.test(CARD), false, 'an unpriced part falls back to $0');
  assert.match(CARD, /Part not priced/, 'there is no honest state for a chosen part with no price');
});

test('the per-guest share splits the total of what is being booked', () => {
  // It read `quote.stayTotal` unconditionally, so a part guest saw a share of the house.
  assert.match(CARD, /const splitTotal = bookingParts \? partTotal : compoundTotal \?\? quote\.stayTotal/, 'the share no longer follows the chosen parts');
  assert.match(CARD, /splitStayLine\(splitTotal, guestCount\)/, 'the share does not use the resolved total');
});

test('the card never shows a whole-house figure while a part is chosen', () => {
  /*
   * A structural check: the savings line is a whole-house statement and must be off while a part is chosen, or a part
   * guest reads a discount belonging to the house.
   */
  const savings = CARD.slice(CARD.indexOf('data-bot="stay-save"') - 400, CARD.indexOf('data-bot="stay-save"') + 60);
  assert.match(savings, /!bookingParts/, 'the whole-house saving renders while a part is chosen');
  assert.match(CARD, /quoteWithTax\(\{ lodging: quote\.lodging/, 'the tax estimate no longer comes from the same calculator the receipt uses');
});
