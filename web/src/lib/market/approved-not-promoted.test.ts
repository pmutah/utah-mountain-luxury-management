import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { quoteStay } from '../quote.ts';

/*
 * The board called a host-approved night a **promotion**, and the guest paid full price.
 *
 * Approving a night is how the engine's price reaches a guest. The quote charges that night at the approved price
 * with **no discount** — `quote.ts` says so in its own comment: "the night takes no promotion: the host already
 * set this price on purpose."
 *
 * The board did not know that. It ran the market comparison anyway, and when the approved price sat above the
 * band the engine concluded "above the comp cluster, a promotion can fill the night" and labelled the night
 * `promote`. The market page renders that as **"20% off"**, and `summary.promoteNights` counted it. So a host
 * read a discount that no guest was ever offered.
 *
 * Found by approving a night the engine thought was expensive, then comparing the three surfaces.
 */

const comp = (id: string) => ({
  id,
  name: id,
  area: 'Lindon',
  beds: 4,
  sleeps: 8,
  rating: 4.9,
  reviews: 20,
  guestFavorite: true,
  distanceMi: 0.5,
  isOwn: false,
  minNights: 1,
});

/** A band far under our card, so the engine's own rule says "promote this". */
const lowBand = {
  comps: [comp('a'), comp('b'), comp('c')],
  index: new Map([
    ['a', new Map([['2026-11-20', 60]])],
    ['b', new Map([['2026-11-20', 70]])],
    ['c', new Map([['2026-11-20', 80]])],
  ]),
};

/** A band far above our card, so the engine's own rule says "raise this". */
const highBand = {
  comps: [comp('a'), comp('b'), comp('c')],
  index: new Map([
    ['a', new Map([['2026-11-20', 418]])],
    ['b', new Map([['2026-11-20', 421]])],
    ['c', new Map([['2026-11-20', 489]])],
  ]),
};

const DATE = '2026-11-20';

test('an approved night is never called a promotion, because it is quoted at full price', () => {
  const board = buildMarketBoard('lindon', '2026-11-08', 40, undefined, lowBand, [{ date: DATE, guest: 249 }]);
  const night = board.nights.find((row) => row.date === DATE)!;

  assert.equal(night.ourGuest, 249, 'the board should start from the approved price');
  assert.notEqual(night.action, 'promote', 'an approved night was labelled as a discount');
  assert.equal(night.promotionPercent, 0);
  assert.equal(night.offerGuest, 249, 'nothing is discounted off an approved price');
  assert.equal(board.summary.promoteNights, 0, 'the summary counted a promotion that does not exist');
  assert.match(night.reason, /approved price of \$249/);
  assert.match(night.reason, /no discount/);
});

test('the same night, unapproved, is still a promotion — the fix is not a blanket suppression', () => {
  /*
   * The guard must key on the approval, not on "this price is high". Without it, an unapproved night above its
   * band should still be offered the fill discount, because that is the whole pricing doctrine.
   */
  const board = buildMarketBoard('lindon', '2026-11-08', 40, undefined, {
    comps: lowBand.comps,
    index: new Map([
      ['a', new Map([[DATE, 60]])],
      ['b', new Map([[DATE, 70]])],
      ['c', new Map([[DATE, 80]])],
    ]),
  });
  const night = board.nights.find((row) => row.date === DATE)!;
  // Nov 20 is a Friday, so the card itself is the weekend rate.
  assert.ok(night.ourGuest > 0);
  assert.equal(night.action, 'promote', 'an unpriced night above its band should still be promotable');
});

test('an approved night can still be raised — that is the 8% ladder', () => {
  /*
   * The narrow version of the fix. Suppressing *every* market action on an approved night would have broken the
   * ladder I had just repaired, so this case is the one that must keep working.
   */
  const board = buildMarketBoard('lindon', '2026-11-08', 40, undefined, highBand, [{ date: DATE, guest: 193 }]);
  const night = board.nights.find((row) => row.date === DATE)!;
  assert.equal(night.ourGuest, 193);
  assert.equal(night.action, 'raise', 'the ladder stopped at an approved night');
  assert.ok(night.proposedGuest > 193, 'the board no longer proposes the next step');
});

test('the board and the quote agree about what a guest pays for an approved night', () => {
  /*
   * The end of the chain, which is what the whole file is about: whatever the board says, the guest is charged
   * the approved price and no discount. If these two ever disagree again, one of them is lying.
   */
  const sheet = [{ date: DATE, guest: 249 }];
  const board = buildMarketBoard('lindon', '2026-11-08', 40, undefined, lowBand, sheet);
  const night = board.nights.find((row) => row.date === DATE)!;

  const quote = quoteStay('lindon', DATE, '2026-11-21', [], { asOf: '2026-11-08', pace: 'short', sheet });
  const quoted = quote.nights[0]!;

  assert.equal(quoted.approved, true);
  assert.equal(quoted.guest, night.ourGuest, 'the board and the quote disagree about the price');
  assert.equal(quoted.promotionPercent, 0, 'the guest was discounted a night the host priced');
  assert.equal(night.promotionPercent, 0);
});
