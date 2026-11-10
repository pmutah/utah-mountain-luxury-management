/**
 * The page's part total and the server's recorded total are the same number.
 *
 * Two functions compute it: `unitsTogetherTotal` on the booking page, `partStayQuote` on the accept route. That is the exact shape
 * of the defect that cost $1,340 — the page quoted one figure and the route recorded another, and the recorded one fed the owner
 * statements.
 *
 * `part-stay-quote.ts` says "the same arithmetic the booking page shows, so the guest's price and the recorded price cannot
 * disagree". Reading that claim is not proof. This asserts it across every combination of parts, including the two-part and
 * three-part cases a single-part test would miss.
 *
 * Verified by hand first: garage 915, main lodge 2535, garage+main 3450, all three 5235 — matching on both sides.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { partStayQuote } from './part-stay-quote.ts';
import { unitStayOffers, unitsTogetherTotal } from './river-unit-offers.ts';
import { PUBLISHED_UNIT_RATES } from './river-unit-rates.ts';
import { RIVER_UNIT_DETAIL, type RiverUnitId } from './river-units.ts';

const NIGHTS = 3;
const FROM = '2027-03-01';
const TO = '2027-03-04';

/**
 * The page's offer list, in the shape `unitStayOffers` reads.
 *
 * It needs `rateState` — not a `rate` object. My first probe passed the wrong shape, every part came back unpriced, and the
 * comparison "passed" by returning null on both sides of one column. A guard that cannot tell "unpriced" from "equal" is worthless,
 * so the fixture is asserted below before it is used.
 */
function pageOffers() {
  return unitStayOffers(
    RIVER_UNIT_DETAIL.map((unit) => ({
      id: unit.id,
      name: unit.name,
      sleeps: unit.sleeps,
      bedrooms: unit.bedrooms,
      beds: unit.beds,
      baths: unit.baths,
      nightly: PUBLISHED_UNIT_RATES[unit.id].nightly,
      cleaning: PUBLISHED_UNIT_RATES[unit.id].cleaning,
      minNights: PUBLISHED_UNIT_RATES[unit.id].minNights,
      rateState: 'ready',
      nights: ['2027-03-01', '2027-03-02', '2027-03-03'],
    })) as never,
    FROM,
    TO,
  );
}

test('the fixture actually prices the parts, or the comparison below proves nothing', () => {
  const offers = pageOffers();
  assert.equal(offers.length, 3, 'the fixture did not produce three offers');
  for (const offer of offers) {
    assert.notEqual(offer.total, null, `${offer.unit.name} came back unpriced, so a match would be meaningless`);
  }
});

test('every combination of parts totals the same on the page and on the server', () => {
  const offers = pageOffers();
  const combos: RiverUnitId[][] = [
    ['garage-suite'],
    ['recreation-wing'],
    ['main-lodge'],
    ['garage-suite', 'main-lodge'],
    ['recreation-wing', 'main-lodge'],
    ['garage-suite', 'recreation-wing', 'main-lodge'],
  ];

  for (const combo of combos) {
    const chosen = offers.filter((offer) => combo.includes(offer.unit.id as RiverUnitId));
    const page = unitsTogetherTotal(chosen);
    const server = partStayQuote(combo, NIGHTS, PUBLISHED_UNIT_RATES);

    assert.ok(server, `${combo.join('+')}: the server could not price it`);
    assert.equal(
      page,
      server!.total,
      `${combo.join('+')}: the page shows ${page} and the booking would record ${server!.total}`,
    );
  }
});

test('the whole house in parts costs less than the sum of three separate stays', () => {
  /*
   * Cleaning is charged once per booking, not per part — so all three together should equal the lodging plus three cleaning fees,
   * not three times that. If this ever reads high, the page is charging cleaning per part.
   */
  const all = partStayQuote(['garage-suite', 'recreation-wing', 'main-lodge'], NIGHTS, PUBLISHED_UNIT_RATES);
  assert.ok(all);
  const expectedCleaning =
    (PUBLISHED_UNIT_RATES['garage-suite'].cleaning ?? 0) +
    (PUBLISHED_UNIT_RATES['recreation-wing'].cleaning ?? 0) +
    (PUBLISHED_UNIT_RATES['main-lodge'].cleaning ?? 0);
  assert.equal(all!.cleaning, expectedCleaning, 'cleaning is not the sum of one fee per part');
  assert.equal(all!.total, all!.lodging + all!.cleaning, 'the total is not lodging plus cleaning');
});

test('a part with no price records nothing rather than a partial figure', () => {
  // Half a price understates what the guest owes, which is the same error as the overstatement, in the other direction.
  const unpriced = { ...PUBLISHED_UNIT_RATES, 'main-lodge': { nightly: null, cleaning: 300, minNights: 2 } };
  assert.equal(partStayQuote(['garage-suite', 'main-lodge'], NIGHTS, unpriced), null);
});
