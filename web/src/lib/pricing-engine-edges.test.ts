/**
 * The pricing engine must never propose a rate outside the floor and ceiling it is given.
 *
 * `proposeGuestRate` is the only thing standing between a comp band and a guest-facing price, so its guards get
 * exercised here on the shapes that actually break pricing code: comps far below the floor, comps far above the
 * ceiling, a single wild outlier, and a comp list of identical values (where a percentile is degenerate).
 *
 * Written after finding that part bookings blocked the parts they never sold — the lesson being that a guard is only
 * real if something runs it on the ugly inputs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeGuestRate } from './market/propose.ts';

const BASE = { floorGuest: 300, ceilingGuest: 1200, targetPercentile: 60, maxMove: 0.08, lockBase: false };

function propose(ourGuest: number, compRates: number[], over: Partial<typeof BASE> = {}) {
  return proposeGuestRate({ ourGuest, compRates, ...BASE, ...over });
}

test('a comp band far below the floor cannot drag the price under it', () => {
  const r = propose(600, [50, 60, 70]);
  assert.ok(r.proposedGuest >= 300, `proposed ${r.proposedGuest}, under the floor`);
});

test('a comp band far above the ceiling cannot lift the price over it', () => {
  const r = propose(600, [5000, 6000, 7000]);
  assert.ok(r.proposedGuest <= 1200, `proposed ${r.proposedGuest}, over the ceiling`);
});

test('a raise never exceeds the daily cap', () => {
  // Target is way above; the move is still capped at 8% for the day.
  const r = propose(600, [1100, 1150, 1200]);
  assert.ok(r.proposedGuest <= Math.round(600 * 1.08) + 1, `moved more than 8% in a day: ${r.proposedGuest}`);
});

test('one wild outlier does not decide the rate', () => {
  const r = propose(600, [600, 610, 620, 4000]);
  assert.ok(r.proposedGuest < 900, `an outlier pulled the price to ${r.proposedGuest}`);
});

test('three identical comps do not crash or divide by zero', () => {
  const r = propose(600, [700, 700, 700]);
  assert.ok(Number.isFinite(r.proposedGuest), 'proposed a non-finite rate');
  assert.ok(Number.isFinite(r.percentile), 'reported a non-finite percentile');
  assert.ok(r.proposedGuest >= 300 && r.proposedGuest <= 1200);
});

test('fewer than three comps holds, whatever the numbers say', () => {
  for (const band of [[], [5000], [10, 9000]]) {
    const r = propose(600, band);
    assert.equal(r.action, 'hold', `acted on ${band.length} comps`);
    assert.equal(r.proposedGuest, 600, 'moved the rate on too little evidence');
  }
});

test('a locked base is never moved', () => {
  const r = propose(600, [1100, 1150, 1200], { lockBase: true });
  assert.equal(r.action, 'locked');
  assert.equal(r.proposedGuest, 600);
});

test('a zero or negative our-guest does not produce a negative price', () => {
  for (const base of [0, -100]) {
    const r = propose(base, [500, 600, 700]);
    assert.ok(r.proposedGuest >= 0, `proposed a negative rate from a base of ${base}`);
  }
});

test('a comp band of zeroes cannot make the stay free', () => {
  const r = propose(600, [0, 0, 0]);
  assert.ok(r.proposedGuest >= 300, `zero comps produced ${r.proposedGuest}`);
});
