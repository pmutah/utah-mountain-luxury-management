import assert from 'node:assert/strict';
import test from 'node:test';
import { shadowDayDigest } from './shadow-day-record.ts';
import type { MarketBoard } from './market/types.ts';

/*
 * A shadow day was being **recorded from the sample fixtures**.
 *
 * The seven-day clock gates the whole rate push. A day counts only when its digest says it saw saved comps.
 * `shadowDayDigest` used to pass only `comps` (the fixtures) and no live boards, so every day saved by
 * opening the brief described an invented market. The digest has to say "saved comps" when boards are
 * real, and "sample comps" when they are not, so the clock can tell the two apart.
 *
 * That is the worst version of this bug: not a wrong figure on a screen, but the gate that decides whether
 * auto-pricing may act at all, satisfied by data that does not exist.
 */

const BASE = {
  taken: { river: [], ranch: [], lindon: [] },
  closed: { river: [], ranch: [], lindon: [] },
  paused: { river: false, ranch: false, lindon: false },
  stays: [],
  paceLive: true,
  preferenceTimes: null,
  compChoices: {
    river: { pinned: [], excluded: [] },
    ranch: { pinned: [], excluded: [] },
    lindon: { pinned: [], excluded: [] },
  },
} as const;

/** A board carrying saved comps, so a digest built from it may say "saved" and never "sample". */
function liveBoard(house: 'river' | 'ranch' | 'lindon'): MarketBoard {
  return {
    house,
    source: 'live',
    from: '2026-11-08',
    days: 90,
    targetPercentile: 70,
    nights: [],
    comps: [
      { id: `${house}-1`, name: 'A saved comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.9, reviews: 20, guestFavorite: false, distanceMi: 3, nextWeekendAsk: 500, occupancy: 60, score: 10, fit: 'close', inBand: true },
      { id: `${house}-2`, name: 'Another saved comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 15, guestFavorite: false, distanceMi: 4, nextWeekendAsk: 520, occupancy: 55, score: 9, fit: 'close', inBand: true },
      { id: `${house}-3`, name: 'Third saved comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.7, reviews: 10, guestFavorite: false, distanceMi: 5, nextWeekendAsk: 540, occupancy: 50, score: 8, fit: 'close', inBand: true },
      { id: `${house}-4`, name: 'Fourth saved comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.7, reviews: 9, guestFavorite: false, distanceMi: 6, nextWeekendAsk: 560, occupancy: 50, score: 7, fit: 'close', inBand: true },
    ],
    fit: { close: 4, compared: 4, narrowed: false },
    summary: { medianAsk: 500, liveMedianAsk: 500, measuredNights: 30, ourTypical: 500, ourPercentile: 50, raiseNights: 0, promoteNights: 0, compPace30: 0, liveNights: 0, liveComps: 4 },
  } as MarketBoard;
}

test('a recorded shadow day uses the live boards it is given, not the sample fixtures', () => {
  const record = shadowDayDigest({
    ...BASE,
    asOf: '2026-11-07',
    calendarLive: true,
    boards: { river: liveBoard('river'), ranch: liveBoard('ranch'), lindon: liveBoard('lindon') },
  });
  assert.equal(record.state, 'ready');
  assert.equal(/sample comps?/i.test(record.digest), false, 'the saved digest still described sample comps');
  assert.match(record.digest, /saved comps/);
});

test('without boards the digest falls back, and still says so honestly', () => {
  // The fallback must keep working, and it must not pretend the fixtures are real comps.
  const record = shadowDayDigest({ ...BASE, asOf: '2026-11-07', calendarLive: true });
  assert.equal(record.state, 'ready');
  assert.match(record.digest, /sample comps/);
});

test('an unread calendar is still refused, boards or not', () => {
  const record = shadowDayDigest({
    ...BASE,
    asOf: '2026-11-07',
    calendarLive: false,
    boards: { river: liveBoard('river'), ranch: liveBoard('ranch'), lindon: liveBoard('lindon') },
  });
  assert.equal(record.state, 'unread');
  assert.equal(record.digest, '');
});
