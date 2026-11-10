/**
 * A two-house booking must also be worth what the guest was quoted.
 *
 * The one-house fix recorded the guest's figure. A two-house party went through `houseShares`, which recomputes both houses
 * with `pace: 'unknown'` — the same shortcut that dropped the fill promotion — so the fix never reached it. The comment
 * above that code said the totals were "figures the guest actually saw", which was not true.
 *
 * These pin the scaling that fixes it: the two house totals sum to the quote exactly, and their proportions are preserved,
 * because the split reflects the party each house holds and is the ratio the payout uses too.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { twoHouseParties } from './payout-suggest.ts';
import { scaleToGuestQuote as scale } from '../../functions/api/book/accept.ts';

test('the two house totals add up to the quote exactly', () => {
  const scaled = scale({ river: 8000, ranch: 2000 }, 9000);
  const sum = Math.round((scaled.river! + scaled.ranch!) * 100) / 100;
  assert.equal(sum, 9000, `the houses summed to ${sum}, not the quote`);
});

test('an awkward quote still adds up to the cent', () => {
  // Thirds are where naive rounding leaves a cent behind.
  const scaled = scale({ river: 5000, ranch: 5000 }, 7777.77);
  const sum = Math.round((scaled.river! + scaled.ranch!) * 100) / 100;
  assert.equal(sum, 7777.77, `the houses summed to ${sum}, not the quote`);
});

test('the split keeps its proportions', () => {
  /*
   * The ratio matters: it follows the party each house holds, and the payout is split on the same basis. Scaling must not
   * quietly move money from one house to the other.
   */
  const scaled = scale({ river: 8000, ranch: 2000 }, 9000);
  assert.equal(scaled.river, 7200, 'the River share is not 80% of the quote');
  assert.equal(scaled.ranch, 1800, 'the Ranch share is not 20% of the quote');
});

test('a request with no quote is left exactly as it was', () => {
  // Every request made before the field existed carries none, so this path must be a no-op for them.
  const untouched = scale({ river: 8000, ranch: 2000 }, undefined);
  assert.deepEqual(untouched, { river: 8000, ranch: 2000 });

  // And a nonsense quote is treated as absent rather than dividing by it.
  assert.deepEqual(scale({ river: 8000, ranch: 2000 }, 0), { river: 8000, ranch: 2000 });
  assert.deepEqual(scale({ river: 8000, ranch: 2000 }, Number.NaN), { river: 8000, ranch: 2000 });
});

test('the party split the scaling preserves is the one the desk shows', () => {
  // A party of 30 puts 24 in the Riverhouse and 6 in the Ranch, which is why the River share is larger.
  const parties = twoHouseParties(30);
  assert.ok(parties, 'the party split no longer resolves');
  assert.deepEqual(
    [...parties].sort((a, b) => b[1] - a[1]),
    [
      ['river', 22],
      ['ranch', 8],
    ],
    'the party split changed, so the proportional scaling is now preserving a different ratio',
  );
});

test('the scaling is actually used by the two-house accept path', () => {
  /*
   * An exported function with no caller is the defect this session kept finding. `houseShares` must route its guest totals
   * through the scaling, and must give it the request's quote — not a fresh calculation.
   */
  const ROUTE = readFileSync('functions/api/book/accept.ts', 'utf8');
  assert.match(ROUTE, /guestTotals: scaleToGuestQuote\(/, 'houseShares does not scale the guest totals');
  assert.match(ROUTE, /request\.quotedTotal,/, 'the scaling is not given the request quote');
});
