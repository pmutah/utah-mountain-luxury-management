/**
 * The market board described a promotion it never computed.
 *
 * `buildMarketBoard` hardcoded `promotionPercent: 0` and set `offerGuest` to the full base. So a night could read
 * "Above the comp cluster. A promotion can fill the night." beside the undiscounted rate — and the dashboard line
 * `promotionPercent === 20 ? ' The 20% fill rate is on.' : ''` could **never** render, because 0 never equals 20.
 *
 * `promotionForNight` had been written, tested, and used by the shadow run; the board simply never called it. That is the
 * recurring defect in this build: the fact exists, the surface that a host acts on does not show it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';

const FROM = '2026-11-08';

/**
 * A live comp watching every night, so the band is real rather than invented.
 *
 * `invented` is true when no saved comp ask covers a night, and the board correctly refuses to recommend a promotion on
 * an invented band — my first fixture used the sample set and every promotion was withheld, which was the guard working.
 */
const LIVE = {
  comps: [{ id: 'c1', house: 'river' as const, name: 'Real comp' }],
  index: new Map<string, Map<string, number>>(),
};

function board(over: { pace?: 'short' | 'met' | 'unknown'; taken?: string[] } = {}) {
  // A recorded ask on every night in the window, so `liveAsk` returns a figure and the band is measured.
  const index = new Map<string, Map<string, number>>();
  const byDate = new Map<string, number>();
  for (let i = 0; i < 70; i++) {
    const d = new Date(`${FROM}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    byDate.set(d.toISOString().slice(0, 10), 2400);
  }
  index.set('c1', byDate);

  return buildMarketBoard('river', FROM, 60, undefined, { comps: LIVE.comps as never, index: index as never }, [], {
    pace: over.pace ?? 'short',
    taken: over.taken ?? [],
  });
}

test('a promotion night carries 20% and an offer below the base', () => {
  /*
   * A weekend night inside 21 days with the year short is exactly the case `promotionForNight` recommends. The board must
   * show the discounted offer, not the base relabelled.
   */
  const nights = board().nights;
  const promoted = nights.filter((night) => night.promotionPercent === 20);
  assert.ok(promoted.length > 0, 'no night carried a promotion even with a short year');

  for (const night of promoted) {
    assert.ok(night.offerGuest < night.ourGuest, `${night.date} claims a promotion but offers the full base`);
    assert.ok(night.offerGuest >= night.floorGuest, `${night.date} offers below the floor`);
  }
});

test('the offer only drops where the promotion is on', () => {
  // A night without a promotion must offer exactly its proposed price, not a stale discount.
  for (const night of board().nights) {
    if (night.promotionPercent === 20) continue;
    assert.equal(night.offerGuest, night.proposedGuest, `${night.date} offers a discount it did not claim`);
  }
});

test('no promotion is recommended when the year is on the books', () => {
  const promoted = board({ pace: 'met' }).nights.filter((night) => night.promotionPercent === 20);
  assert.deepEqual(promoted, [], 'the board promoted nights for a year that is already met');
});

test('an unknown pace promotes nothing, rather than guessing', () => {
  const promoted = board({ pace: 'unknown' }).nights.filter((night) => night.promotionPercent === 20);
  assert.deepEqual(promoted, [], 'the board promoted nights on an unknown pace');
});

test('the floor still stops a promotion', () => {
  /*
   * A 20% cut that lands under the floor is not allowed. When that happens the fill function returns percent 0 and the
   * base stays — which must reach the board as "no promotion", never as a discount nobody can honour.
   */
  for (const night of board().nights) {
    if (night.promotionPercent !== 20) continue;
    assert.ok(
      Math.round(night.ourGuest * 0.8) >= night.floorGuest || night.offerGuest >= night.floorGuest,
      `${night.date} discounted through the floor`,
    );
  }
});

test('the dashboard line can now actually appear', () => {
  /*
   * `MarketBoard.tsx` renders ' The 20% fill rate is on.' only when promotionPercent === 20. Before this fix that branch
   * was unreachable, which is why it is checked here rather than trusted.
   */
  const promoted = board().nights.some((night) => night.promotionPercent === 20);
  assert.ok(promoted, 'promotionPercent is never 20, so the dashboard line is dead code');

  const UI = fs.readFileSync('src/components/MarketBoard.tsx', 'utf8');
  assert.match(UI, /promotionPercent === 20/, 'the dashboard no longer checks for the 20% promotion');
});

test('the overview route feeds the promotion the facts it needs', () => {
  // Without pace and taken the board answers "not loaded" on every night and the promotion is silently withheld — which
  // is exactly what happened to pace in the sibling route before it was fixed.
  const ROUTE = fs.readFileSync('functions/api/market/overview.ts', 'utf8');
  assert.match(ROUTE, /grossPace\(house, stays, from\)/, 'the route does not compute the year pace');
  assert.match(ROUTE, /fill = \{ taken, pace \}/, 'the route does not pass the calendar and pace to the board');
});
