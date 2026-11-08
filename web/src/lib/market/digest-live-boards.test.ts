import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioDigest } from './shadow.ts';
import type { MarketBoard } from './types.ts';

/*
 * The market page showed a live rate band in one panel and a daily text computed from **sample comps** in
 * another. `portfolioDigest` rebuilt each house with `buildMarketBoard(house, asOf, 90, input.comps)` — and
 * `input.comps` are the invented fixtures — while the board beside it used the real comps from
 * `/api/market/overview`. The text read "5 of 10 sample comps" for River and "8 of 10" for Ranch while 19
 * real comps sat in the store.
 *
 * The digest now accepts the boards the caller already built. These tests pin that it uses them.
 */

const quiet = { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 };

/** A minimal board carrying one live-comp night, so a digest built from it must mention that rate. */
function liveBoard(house: 'river' | 'ranch' | 'lindon', median: number): MarketBoard {
  return {
    house,
    source: 'live',
    from: '2026-11-08',
    days: 90,
    targetPercentile: 70,
    nights: [
      {
        date: '2026-12-06',
        season: null,
        ourGuest: median,
        floorGuest: 100,
        compRates: [median, median, median],
        p25: median,
        median,
        p75: median,
        openComps: 3,
        percentile: 50,
        proposedGuest: median,
        promotionPercent: 0,
        offerGuest: median,
        minNights: 2,
        action: 'hold',
        reason: 'test',
        compBookedShare: 0,
        source: 'live',
      },
    ],
    comps: [],
    fit: { close: 0, compared: 0, narrowed: false },
    summary: {
      medianAsk: median,
      ourTypical: median,
      ourPercentile: 50,
      raiseNights: 0,
      promoteNights: 0,
      compPace30: 0,
      liveNights: 1,
      liveComps: 3,
    },
  } as MarketBoard;
}

const base = {
  asOf: '2026-11-08',
  taken: { river: [], ranch: [], lindon: [] },
  paused: { river: false, ranch: false, lindon: false },
  pace: { river: 'unknown', ranch: 'unknown', lindon: 'unknown' },
  calendarLive: true,
} as const;

test('the digest prices from the boards it is given, not from sample comps', () => {
  // With live boards supplied, the digest must not describe a sample band.
  const text = portfolioDigest({
    ...base,
    pace: { ...base.pace },
    boards: {
      river: liveBoard('river', 1520),
      ranch: liveBoard('ranch', 527),
      lindon: liveBoard('lindon', 421),
    },
  });
  assert.equal(/sample comps?/i.test(text), false, 'the digest still described sample comps');
  // The fit line comes from compFitSummary on the supplied board, so a board with no comps says so.
  assert.match(text, /River:/);
});

test('without boards the digest still falls back to building its own, rather than failing', () => {
  const text = portfolioDigest({ ...base, pace: { ...base.pace } });
  assert.match(text, /UML shadow 2026-11-08/);
  assert.equal(text.length > 80, true);
});

test('the digest still refuses to price anything when the calendar is unread', () => {
  const text = portfolioDigest({
    ...base,
    calendarLive: false,
    pace: { ...base.pace },
    boards: { river: liveBoard('river', 1520), ranch: liveBoard('ranch', 527), lindon: liveBoard('lindon', 421) },
  });
  assert.match(text, /calendar could not be read/);
  assert.equal(/raises,/i.test(text), false, 'an unread calendar must not report raise counts');
});
