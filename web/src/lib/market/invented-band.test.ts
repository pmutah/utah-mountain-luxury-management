import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { planLines, pushPlanFor, pushNights, type PushGate } from './push.ts';
import { runShadow } from './shadow.ts';

/*
 * The board priced nights against comps this repo invented.
 *
 * `fixtures.ts` holds ten "Sample · Canyon lodge" style comps with made-up rates, so the board can render
 * before any real listing is saved. That is a reasonable stand-in for a *picture*. It is not a basis for a
 * **price instruction**, and the app treated it as one:
 *
 *   - `buildMarketBoard` fed the sample band to `proposeGuestRate`, which returned a confident raise or a 20%
 *     promotion, because eight plausible numbers look exactly like a market.
 *   - `pushNights` dropped the provenance on the way into a `PushNight`, so the plan was indistinguishable
 *     from a measured one.
 *   - `planLines` printed both in the same shape, under a button labelled "Copy these prices", and the panel
 *     told the host to type the listed price into Airbnb.
 *
 * Measured on production on 2026-11-08: **50 of 60 plan lines** were priced off the sample set. Lindon's
 * 10 November night was to be promoted from $179 to $143 against a fabricated band, on a house whose real
 * comp median that week was $421.
 *
 * The fix is at the source. A night no saved comp has watched does not move. The band is still shown and
 * still labelled `sample`, because the page has to render before the first comp is saved.
 */

test('a night with no saved ask recommends no rate move, whatever the sample band says', () => {
  // No `live` argument at all: every band on this board is the invented sample set.
  const board = buildMarketBoard('lindon', '2026-11-08', 30);
  assert.equal(board.source, 'sample');
  assert.ok(board.nights.length > 0);

  const moving = board.nights.filter((night) => night.action === 'raise' || night.action === 'promote');
  assert.deepEqual(
    moving.map((night) => `${night.date} ${night.action}`),
    [],
    'the sample band produced a rate move',
  );

  // Every night is still on the board, still carries its band, and says why it is not moving.
  const open = board.nights.filter((night) => night.action === 'hold');
  assert.ok(open.length > 0, 'an open night should still be listed');
  for (const night of open) {
    assert.equal(night.proposedGuest, night.ourGuest, `${night.date} proposes a price the sample set cannot support`);
    assert.match(night.reason, /invented sample set/);
    assert.ok(night.compRates.length > 0, 'the stand-in band is still shown, it just does not move the rate');
  }
});

test('one real ask on a night unlocks that night and leaves the rest held', () => {
  /*
   * The rule is per night, not per house. A single night watched by a saved comp is a night that can move;
   * the neighbours stay held. Anything coarser would either freeze a house that has good data or reopen
   * nights that have none.
   */
  const comps = [
    { id: 'c1', name: 'A', area: 'Lindon', beds: 4, sleeps: 8, rating: 4.9, reviews: 20, guestFavorite: true, distanceMi: 0.5, isOwn: false, minNights: 1 },
    { id: 'c2', name: 'B', area: 'Lindon', beds: 4, sleeps: 8, rating: 4.9, reviews: 20, guestFavorite: true, distanceMi: 0.5, isOwn: false, minNights: 1 },
    { id: 'c3', name: 'C', area: 'Lindon', beds: 4, sleeps: 9, rating: 4.9, reviews: 20, guestFavorite: true, distanceMi: 0.5, isOwn: false, minNights: 1 },
  ];
  const board = buildMarketBoard('lindon', '2026-12-01', 5, undefined, {
    comps,
    // Real asks far above our $179 card: this night should be a raise.
    index: new Map([
      ['c1', new Map([['2026-12-01', 600]])],
      ['c2', new Map([['2026-12-01', 640]])],
      ['c3', new Map([['2026-12-01', 680]])],
    ]),
  });

  const watched = board.nights.find((night) => night.date === '2026-12-01')!;
  assert.equal(watched.source, 'live');
  assert.equal(watched.action, 'raise', 'a night with three real asks above our card should raise');
  assert.ok(watched.proposedGuest > watched.ourGuest);

  for (const night of board.nights.filter((row) => row.date !== '2026-12-01')) {
    assert.equal(night.source, 'sample', `${night.date} should have no saved ask`);
    assert.equal(night.action, 'hold', `${night.date} moved on an invented band`);
    assert.equal(night.proposedGuest, night.ourGuest);
  }
});

test('the plan and the board now agree about which nights may move', () => {
  /*
   * This is the join that was missing. The board labelled these nights `promote` while the plan carried a
   * price derived from the same fabricated band, and no layer compared the two. Now a plan built from a
   * sample-only board is empty.
   */
  const board = buildMarketBoard('ranch', '2026-11-08', 30);
  const run = runShadow(board, [], false, '2026-11-08', 'short');
  const gate: PushGate = { shadowReady: true, hasToken: true, paused: false, calendarReady: true };
  const plan = pushPlanFor('ranch', run, gate, '2026-11-08');

  assert.deepEqual(plan.nights, [], 'a house with no saved comps still produced a priced plan');
  assert.deepEqual(planLines(plan), []);

  // And the run reports holds with a reason rather than a count of moves.
  const promoting = run.nights.filter((night) => night.action === 'promote');
  assert.deepEqual(promoting, [], 'the shadow run still promoted a night on the sample band');
});

test('provenance travels with a planned night instead of being dropped', () => {
  /*
   * `PushNight` used to drop `source`, which is how a fabricated price became indistinguishable from a
   * measured one at the only layer that prints it. The field is now carried, so `planLines` can tell.
   */
  const comps = [
    { id: 'x1', name: 'A', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    { id: 'x2', name: 'B', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    { id: 'x3', name: 'C', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
  ];
  const board = buildMarketBoard('ranch', '2026-11-01', 40, undefined, {
    comps,
    index: new Map([
      ['x1', new Map([['2026-12-01', 1400]])],
      ['x2', new Map([['2026-12-01', 1450]])],
      ['x3', new Map([['2026-12-01', 1500]])],
    ]),
  });
  const run = runShadow(board, [], false, '2026-11-01', 'short');
  const nights = pushNights('ranch', run.nights, '2026-11-01');
  const raise = nights.find((night) => night.kind === 'raise');
  assert.ok(raise, 'the fixture should produce a raise');
  assert.equal(raise.source, 'live', 'a measured night lost its provenance on the way into the plan');
});
