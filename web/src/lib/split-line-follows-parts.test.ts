import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { splitStayLine } from './stay-split.ts';

/*
 * The booking page showed two prices for one stay.
 *
 * The per-guest line read `quote.stayTotal` — the whole-house total — so a guest who had chosen the Garage Suite saw
 * "This part for 2 nights, before tax: $790" directly above "3 overnight guests would each cover $1,200". $1,200 is
 * $3,600/3: the house. Two different prices, one screen, and the larger one was not what they were booking.
 *
 * Verified on the rendered page after the fix: with the part chosen, the lines read $790 and $263.34 + $263.33, which
 * sums to $790.
 */

const PAGE = readFileSync(new URL('../components/DirectBook.tsx', import.meta.url), 'utf8');

test('the per-guest line splits the total of what is being booked', () => {
  // It read `quote.stayTotal` unconditionally, which is the house even when a part is chosen.
  assert.match(PAGE, /const splitTotal = bookingParts \? partTotal : quote\.stayTotal/, 'the share no longer follows the chosen parts');
  assert.match(PAGE, /splitStayLine\(splitTotal, guestCount\)/, 'the share does not use the resolved total');
});

test('a part total of $790 across three guests adds back up to $790', () => {
  // The property that matters: the shares are a split of one number, not a second price.
  const line = splitStayLine(790, 3);
  assert.ok(line, 'no share line for a part total');
  const amounts = [...line!.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) => Number(m[1]!.replace(/,/g, '')));
  assert.equal(amounts.length, 2, 'expected a two-tier split for an uneven total');
  // One guest at the higher share, two at the lower.
  assert.equal(amounts[0]! + amounts[1]! * 2, 790);
});

test('a part with no price shows no share, rather than the house figure', () => {
  /*
   * `partTotal` is null when a chosen part has no price. Falling back to the house total there would reinstate the very
   * defect this fixed, and the guest would read a share of a stay they cannot book.
   */
  assert.match(PAGE, /splitTotal !== null/, 'a null part total is not guarded');
});
