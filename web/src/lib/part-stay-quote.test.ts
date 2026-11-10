import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { partStayQuote } from './part-stay-quote.ts';
import { blankUnitRates, type RiverUnitRates } from './river-unit-rates.ts';

/*
 * A part booking was saved with the whole-house guest total.
 *
 * The accept route called `quoteStay`, which prices the house, regardless of what the guest had asked for. Measured on the
 * running route: a two-night Garage Suite stay costing $790 was saved with `guestTotal: 4500`. That figure feeds the owner
 * statements and any invoice built from the booking, so a part booking overstated revenue by 5.7x.
 *
 * After the fix the same request records 790.
 */

function priced(): RiverUnitRates {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  rates['recreation-wing'] = { nightly: 640, cleaning: 250, minNights: 2 };
  rates['main-lodge'] = { nightly: 1150, cleaning: 400, minNights: 2 };
  return rates;
}

test('a two-night Garage Suite stay is priced at its own rate, not the house', () => {
  const quote = partStayQuote(['garage-suite'], 2, priced());
  assert.ok(quote, 'no quote for a priced part');
  assert.equal(quote!.lodging, 640);
  assert.equal(quote!.cleaning, 150);
  assert.equal(quote!.total, 790, 'the total is not 2 nights at $320 plus $150 cleaning');
  // The figure the defect produced, asserted absent so a regression is obvious.
  assert.notEqual(quote!.total, 4500);
});

test('the total is computed per night, not from a single night', () => {
  /*
   * A guard that a wrong multiplier would fail. A two-night stay must not price as one night's rate plus cleaning, which
   * is what a loop written over the wrong count produces.
   */
  const one = partStayQuote(['garage-suite'], 1, priced());
  const three = partStayQuote(['garage-suite'], 3, priced());
  assert.equal(one!.total, 470);
  assert.equal(three!.total, 1110);
  // Each extra night adds exactly the nightly rate.
  assert.equal(three!.total - one!.total, 320 * 2);
});

test('two parts add their nights and both cleaning fees', () => {
  const quote = partStayQuote(['garage-suite', 'main-lodge'], 2, priced());
  assert.equal(quote!.lodging, (320 + 1150) * 2);
  assert.equal(quote!.cleaning, 150 + 400);
});

test('a part with no price yields no quote, rather than a partial one', () => {
  /*
   * Quoting only the priced half would understate what the guest owes — the same error as the overstatement, in the other
   * direction. No figure is the safe answer: a missing total is visible, a wrong one is not.
   */
  const rates = priced();
  rates['main-lodge'] = { nightly: null, cleaning: null, minNights: null };
  assert.equal(partStayQuote(['garage-suite', 'main-lodge'], 2, rates), null);
});

test('an unknown part name is not priced as zero', () => {
  assert.equal(partStayQuote(['attic'], 2, priced()), null);
});

test('a stay with no nights has no quote', () => {
  assert.equal(partStayQuote(['garage-suite'], 0, priced()), null);
});

test('the accept route prices parts from their own rates', () => {
  const route = readFileSync(new URL('../../functions/api/book/accept.ts', import.meta.url), 'utf8');
  assert.match(route, /partStayQuote\(/, 'the accept route does not price a part stay');
  assert.match(route, /loadRiverUnitRates/, 'the accept route does not read the part rates');
  /*
   * The rates are read server-side rather than taken from the request, so a booking cannot be quoted off a price that has
   * since changed or was never set.
   */
  assert.match(route, /let unitRatesAtAccept/, 'the rates are not read at accept time');
});
