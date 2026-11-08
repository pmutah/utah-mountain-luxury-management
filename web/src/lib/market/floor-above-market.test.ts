import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';

/*
 * The River House was offered **23 promotions** that arithmetic forbids.
 *
 * Its floor is a flat $1,500 host net — $1,776 as a guest price — while the comp cluster's 75th percentile
 * sits around $1,531. So on 21 of 23 live nights the floor alone is above the entire market, and even a 20%
 * discount lands above p75 on 22 of 23. A plan listing those as promotions reads as "discount this and it
 * will fill", when nothing within the rules can reach the market.
 *
 * The board now says that instead: the night holds, and the reason names the floor and the p75.
 */

test('a floor above the whole market holds the night and says why', () => {
  // A saved comp set with asks well below the floor, so p75 lands under it.
  const board = buildMarketBoard('river', '2026-11-08', 30, undefined, {
    comps: [
      { id: 'c1', name: 'Cheap comp', area: 'Sundance', beds: 6, sleeps: 15, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 3, isOwn: false, minNights: 1 },
      { id: 'c2', name: 'Cheap comp 2', area: 'Sundance', beds: 6, sleeps: 15, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 3, isOwn: false, minNights: 1 },
      { id: 'c3', name: 'Cheap comp 3', area: 'Sundance', beds: 6, sleeps: 15, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 3, isOwn: false, minNights: 1 },
    ],
    index: new Map([
      ['c1', new Map([['2026-11-16', 1200]])],
      ['c2', new Map([['2026-11-16', 1250]])],
      ['c3', new Map([['2026-11-16', 1300]])],
    ]),
  });

  const night = board.nights.find((n) => n.date === '2026-11-16');
  assert.ok(night, 'the night is missing from the board');
  // The premise: this night has a real three-comp band under the floor.
  assert.equal(night.source, 'live');
  assert.ok(night.floorGuest > night.p75, `expected floor ${night.floorGuest} above p75 ${night.p75}`);
  // And the rule: no promotion is offered, and the reason names both numbers.
  assert.notEqual(night.action, 'promote', 'a promotion was offered that the floor forbids');
  assert.match(night.reason, /floor is \$/);
  assert.match(night.reason, /75th percentile/);
});

test('a floor below the market leaves the normal recommendation alone', () => {
  // Ranch has a low floor relative to its comps, so its nights should still be able to move.
  const board = buildMarketBoard('ranch', '2026-11-08', 30, undefined, {
    comps: [
      { id: 'r1', name: 'Comp', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'r2', name: 'Comp 2', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
      { id: 'r3', name: 'Comp 3', area: 'Orem', beds: 6, sleeps: 20, rating: 4.8, reviews: 10, guestFavorite: false, distanceMi: 4, isOwn: false, minNights: 1 },
    ],
    index: new Map([
      ['r1', new Map([['2026-11-16', 600]])],
      ['r2', new Map([['2026-11-16', 650]])],
      ['r3', new Map([['2026-11-16', 700]])],
    ]),
  });
  const night = board.nights.find((n) => n.date === '2026-11-16')!;
  assert.ok(night.floorGuest <= night.p75, 'this fixture no longer has a floor below the market');
  assert.equal(/the floor is \$/i.test(night.reason), false, 'the floor rule fired on a night it does not apply to');
});
