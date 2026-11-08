import assert from 'node:assert/strict';
import test from 'node:test';
import { leadDays, pushNights, MIN_LEAD_DAYS } from './push.ts';
import type { ShadowNight } from './shadow.ts';

/*
 * The shadow preview proposed raising **tonight's** Ranch rate from $640 to $662. A night that is already
 * here is not repriced: the guests who would book it have decided, and a rate typed in on the day cannot
 * pay for itself. Promotions already respected lead time in `fill.ts`; a raise did not.
 */

function night(over: Partial<ShadowNight> = {}): ShadowNight {
  return {
    date: '2026-12-01',
    season: null,
    ourGuest: 600,
    floorGuest: 300,
    compRates: [700, 720, 740],
    p25: 700,
    median: 720,
    p75: 740,
    openComps: 3,
    percentile: 10,
    proposedGuest: 648,
    promotionPercent: 0,
    offerGuest: 648,
    minNights: 2,
    action: 'raise',
    reason: 'test',
    compBookedShare: 0,
    source: 'live',
    ...over,
  } as ShadowNight;
}

test('leadDays counts whole nights between two dates', () => {
  assert.equal(leadDays('2026-11-08', '2026-11-08'), 0);
  assert.equal(leadDays('2026-11-08', '2026-11-09'), 1);
  assert.equal(leadDays('2026-11-08', '2026-12-01'), 23);
  assert.equal(leadDays('2026-11-08', 'not-a-date'), null);
});

test('tonight and tomorrow are never repriced', () => {
  // The real case: asOf 2026-11-08 with a raise proposed for 2026-11-08.
  const asOf = '2026-11-08';
  const tonight = night({ date: '2026-11-08' });
  const tomorrow = night({ date: '2026-11-09' });
  assert.deepEqual(pushNights('ranch', [tonight], asOf), [], 'tonight must not be repriced');
  assert.deepEqual(pushNights('ranch', [tomorrow], asOf), [], 'tomorrow must not be repriced');
});

test('a night at the lead-time edge and beyond is still planned', () => {
  const asOf = '2026-11-08';
  const edge = night({ date: '2026-11-10' }); // exactly MIN_LEAD_DAYS
  const later = night({ date: '2026-11-11' });
  assert.equal(pushNights('ranch', [edge], asOf).length, 1, `a night ${MIN_LEAD_DAYS} days out should be planned`);
  assert.equal(pushNights('ranch', [later], asOf).length, 1);
});

test('without an asOf the lead-time rule does not silently guess', () => {
  // Existing callers that pass no date keep their old behaviour rather than getting a wrong cutoff.
  assert.equal(pushNights('ranch', [night({ date: '2026-11-08' })]).length, 1);
});

test('the other exclusions still hold with a date supplied', () => {
  const asOf = '2026-11-08';
  assert.equal(pushNights('ranch', [night({ date: '2026-12-01', action: 'booked' })], asOf).length, 0);
  assert.equal(pushNights('ranch', [night({ date: '2026-12-01', action: 'hold' })], asOf).length, 0);
  assert.equal(
    pushNights('ranch', [night({ date: '2026-12-01', ourGuest: 600, offerGuest: 600 })], asOf).length,
    0,
    'a night whose price would not move is not a change',
  );
});
