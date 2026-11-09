import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SPLIT,
  decideSplit,
  nightsBetween,
  offerableUnits,
  unitsVisible,
  wholeLikelihoodFor,
  type SplitPrices,
} from './river-split.ts';
import { RIVER_UNITS, type RiverUnitId } from './river-units.ts';

/*
 * Whole-versus-split, and the reasons a host can read.
 *
 * The spec's rule is a preference, not a calculation: hold the house whole whenever it can plausibly sell whole, and
 * split only to capture nights that would otherwise be lost. So the peak cases are checked *before* the arithmetic —
 * a peak weekend is held whole even when the units would pay more today, because splitting can take the nights a
 * whole group would have bought.
 */

const PRICES: SplitPrices = {
  wholeNightly: 2400,
  unitNightly: { 'garage-suite': 320, 'recreation-wing': 780, 'main-lodge': 1150 },
};

const allFree = (from: string, until: string) => {
  const nights = nightsBetween(from, until);
  const byNight: Record<string, number> = {};
  for (const night of nights) byNight[night] = 3;
  const perUnit = Object.fromEntries(RIVER_UNITS.map((u) => [u, new Set(nights)])) as Record<RiverUnitId, Set<string>>;
  return { byNight, perUnit };
};

// 2026-12-11 is a Friday. A Fri-Sat peak weekend, then Mon-Thu of the same week.
const PEAK_WEEKEND = { from: '2026-12-11', until: '2026-12-13' };
const FOLLOWING_WEEK = { from: '2026-12-14', until: '2026-12-18' };

test('a peak weekend is held whole, and says so with the numbers', () => {
  // Acceptance 9: a peak-season weekend with no bookings is held whole-only.
  const free = allFree(PEAK_WEEKEND.from, PEAK_WEEKEND.until);
  const d = decideSplit({
    ...PEAK_WEEKEND,
    prices: PRICES,
    freeUnitsByNight: free.byNight,
    unitFreeNightly: free.perUnit,
    season: 'peak',
  });
  assert.equal(d.choice, 'whole', 'a peak weekend was offered for splitting');
  assert.deepEqual(d.units, [], 'units were offered on a peak weekend');
  assert.equal(d.heldWholeForPeak, true);
  assert.match(d.reason, /Peak weekend held whole/);
  assert.match(d.reason, /\$2,400/, 'the reason does not name the whole-house rate');
});

test('the weekday block after a whole-house weekend is offered as units', () => {
  // Acceptance 7: whole house booked Fri-Sun, the following Mon-Thu is offered as split units.
  const free = allFree(FOLLOWING_WEEK.from, FOLLOWING_WEEK.until);
  const d = decideSplit({
    ...FOLLOWING_WEEK,
    prices: PRICES,
    freeUnitsByNight: free.byNight,
    unitFreeNightly: free.perUnit,
    season: 'off-peak',
  });
  assert.notEqual(d.choice, 'whole', 'an off-peak weekday gap was held whole');
  assert.ok(d.units.length > 0, 'no unit was offered for the gap');
  assert.match(d.reason, /\$/);
});

test('an off-peak month with nothing booked offers the units (acceptance 8)', () => {
  // Midweek in January.
  const from = '2027-01-12';
  const until = '2027-01-15';
  const free = allFree(from, until);
  const d = decideSplit({
    from,
    until,
    prices: PRICES,
    freeUnitsByNight: free.byNight,
    unitFreeNightly: free.perUnit,
    season: 'off-peak',
  });
  assert.notEqual(d.choice, 'whole', 'an off-peak midweek stretch was held whole');
  assert.equal(d.units.length, 3, 'not every free unit was offered');
});

test('split mode off shows no units at all (acceptance 5)', () => {
  assert.equal(unitsVisible('off'), false);
  assert.equal(unitsVisible('auto'), true);
  assert.equal(unitsVisible('suggest-only'), true);
});

test('a unit free on only part of the range is not offered for it', () => {
  /*
   * The failure this prevents: offering the Main Lodge for Mon-Thu when it is free Mon-Wed would take a booking for a
   * night it does not have. A unit must be free on **every** night of the range.
   */
  const nights = nightsBetween('2026-12-14', '2026-12-18');
  const perUnit = Object.fromEntries(RIVER_UNITS.map((u) => [u, new Set(nights)])) as Record<RiverUnitId, Set<string>>;
  perUnit['main-lodge'] = new Set(nights.slice(0, 3)); // free Mon-Wed only
  const byNight: Record<string, number> = {};
  for (const night of nights) byNight[night] = 2;

  const offered = offerableUnits(byNight, perUnit, '2026-12-14', '2026-12-18');
  assert.equal(offered.includes('main-lodge'), false, 'a partly-free unit was offered for the whole range');
  assert.deepEqual(offered, ['garage-suite', 'recreation-wing']);
});

test('when no unit is free for the range, only the whole house is offered', () => {
  const nights = nightsBetween('2026-12-14', '2026-12-18');
  const perUnit = Object.fromEntries(RIVER_UNITS.map((u) => [u, new Set<string>()])) as Record<RiverUnitId, Set<string>>;
  const byNight: Record<string, number> = {};
  for (const night of nights) byNight[night] = 0;
  const d = decideSplit({
    from: '2026-12-14',
    until: '2026-12-18',
    prices: PRICES,
    freeUnitsByNight: byNight,
    unitFreeNightly: perUnit,
  });
  assert.equal(d.choice, 'whole');
  assert.deepEqual(d.units, []);
  assert.match(d.reason, /No unit is free for every night/);
});

test('a night already sold whole is not counted as whole revenue again', () => {
  const free = allFree(FOLLOWING_WEEK.from, FOLLOWING_WEEK.until);
  const blocked = new Set(['2026-12-15']);
  const withBlocked = decideSplit({
    ...FOLLOWING_WEEK,
    prices: PRICES,
    freeUnitsByNight: free.byNight,
    unitFreeNightly: free.perUnit,
    wholeBlocked: blocked,
    season: 'off-peak',
  });
  const without = decideSplit({
    ...FOLLOWING_WEEK,
    prices: PRICES,
    freeUnitsByNight: free.byNight,
    unitFreeNightly: free.perUnit,
    season: 'off-peak',
  });
  assert.ok(
    withBlocked.wholeExpected < without.wholeExpected,
    'a blocked night still counted toward whole expected revenue',
  );
});

test('whole-house likelihood follows the night, not the range', () => {
  // Friday and Saturday beat a Tuesday, and an off-peak Tuesday is the least likely of all.
  const friday = wholeLikelihoodFor('2026-12-11');
  const tuesdayPeak = wholeLikelihoodFor('2026-12-15', { ...DEFAULT_SPLIT, offPeakMonths: [] });
  const tuesdayOffPeak = wholeLikelihoodFor('2027-01-12');
  assert.ok(friday > tuesdayPeak, 'a Friday was not likelier than a peak-month Tuesday');
  assert.ok(tuesdayPeak > tuesdayOffPeak, 'an off-peak Tuesday was not the least likely');
  // A holiday is the likeliest of all.
  assert.equal(wholeLikelihoodFor('2026-12-25', DEFAULT_SPLIT, true), DEFAULT_SPLIT.wholeLikelihood.peak);
});

test('every decision carries a reason naming real money', () => {
  // No branch may return an empty or numberless explanation: the spec asks for one line a host can read.
  const cases = [
    { ...PEAK_WEEKEND, season: 'peak' as const },
    { ...FOLLOWING_WEEK, season: 'off-peak' as const },
    { from: '2027-01-12', until: '2027-01-15', season: 'off-peak' as const },
  ];
  for (const c of cases) {
    const free = allFree(c.from, c.until);
    const d = decideSplit({
      from: c.from,
      until: c.until,
      prices: PRICES,
      freeUnitsByNight: free.byNight,
      unitFreeNightly: free.perUnit,
      season: c.season,
    });
    assert.ok(d.reason.length > 20, `a decision had no real explanation: ${d.reason}`);
    assert.match(d.reason, /\$/, `a decision did not name a number: ${d.reason}`);
  }
});

test('a unit with no price is never offered in a split', () => {
  /*
   * The route passes 0 for an unpriced part, and the engine used to sum that as a free night: a split that earns
   * nothing while still costing a turnover. The price is now checked where the decision is made.
   */
  const byNight: Record<string, number> = {};
  const perUnit: Record<string, Set<string>> = {};
  for (const night of ['2026-12-14', '2026-12-15']) {
    byNight[night] = 3;
    for (const unit of RIVER_UNITS) perUnit[unit] = new Set([...perUnit[unit] ?? [], night]);
  }
  const priced = { 'garage-suite': 320, 'recreation-wing': 640, 'main-lodge': 0 } as Record<RiverUnitId, number>;
  const offered = offerableUnits(byNight, perUnit, '2026-12-14', '2026-12-16', priced);
  assert.deepEqual(offered, ['garage-suite', 'recreation-wing'], 'the unpriced part was offered');
});

test('a split with every unit unpriced offers nothing at all', () => {
  const byNight: Record<string, number> = { '2026-12-14': 3 };
  const perUnit: Record<string, Set<string>> = {};
  for (const unit of RIVER_UNITS) perUnit[unit] = new Set(['2026-12-14']);
  const none = { 'garage-suite': 0, 'recreation-wing': 0, 'main-lodge': 0 } as Record<RiverUnitId, number>;
  assert.deepEqual(offerableUnits(byNight, perUnit, '2026-12-14', '2026-12-15', none), []);
});

test('omitting the price map keeps the old behaviour, so a caller is not silently narrowed', () => {
  const byNight: Record<string, number> = { '2026-12-14': 3 };
  const perUnit: Record<string, Set<string>> = {};
  for (const unit of RIVER_UNITS) perUnit[unit] = new Set(['2026-12-14']);
  // No price argument: availability alone decides, which is what every earlier caller relied on.
  assert.deepEqual(offerableUnits(byNight, perUnit, '2026-12-14', '2026-12-15'), [...RIVER_UNITS]);
});
