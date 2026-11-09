import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blankUnitRates,
  sellableUnits,
  toUnitRates,
  unitNightlyOrNull,
  unitRateLine,
  unitRateState,
} from './river-unit-rates.ts';
import { RIVER_UNITS } from './river-units.ts';

/*
 * Unit prices start **unset**, and unset is not zero.
 *
 * The three units are unpublished Airbnb drafts with no price. If a unit rendered `$0` a guest could book a free
 * night; if it rendered an invented rate the guest could pay a number nobody chose. Both are worse than the unit being
 * absent, so a unit with anything missing is not sellable and says exactly what it lacks.
 */

test('every unit starts unset, and none of them is sellable', () => {
  const rates = blankUnitRates();
  for (const id of RIVER_UNITS) assert.equal(unitRateState(rates[id]), 'unset');
  assert.deepEqual(sellableUnits(rates), [], 'a unit with no price was treated as sellable');
});

test('a partially priced unit is not sellable and names what is missing', () => {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: null, minNights: 2 };
  assert.equal(unitRateState(rates['garage-suite']), 'partial');
  assert.deepEqual(sellableUnits(rates), [], 'a unit missing its cleaning fee was sellable');
  const line = unitRateLine(rates['garage-suite']);
  assert.match(line, /Not sellable yet/);
  assert.match(line, /cleaning fee/);
  assert.equal(line.includes('nightly rate'), false, 'it named a rate that was already set');
});

test('a complete unit is sellable and its line reads as a price', () => {
  const rates = blankUnitRates();
  rates['main-lodge'] = { nightly: 1150, cleaning: 200, minNights: 2 };
  assert.equal(unitRateState(rates['main-lodge']), 'ready');
  assert.deepEqual(sellableUnits(rates), ['main-lodge']);
  assert.match(unitRateLine(rates['main-lodge']), /\$1150 a night, \$200 cleaning, 2-night minimum/);
});

test('a stored zero or negative rate reads as unset, never as a free night', () => {
  /*
   * The dangerous shape: a 0 nightly would let a guest book for nothing, and a negative would credit them. Both are
   * refused at the read, the same way the approved-rate sheet refuses them.
   */
  const rates = toUnitRates({
    'garage-suite': { nightly: 0, cleaning: 90, minNights: 1 },
    'recreation-wing': { nightly: -500, cleaning: 150, minNights: 2 },
    'main-lodge': { nightly: 1150, cleaning: 200, minNights: 2 },
  });
  assert.equal(rates['garage-suite'].nightly, null, 'a zero nightly survived the read');
  assert.equal(rates['recreation-wing'].nightly, null, 'a negative nightly survived the read');
  assert.equal(unitNightlyOrNull(rates, 'garage-suite'), null);
  assert.deepEqual(sellableUnits(rates), ['main-lodge']);
});

test('nonsense stored values are dropped field by field, not repaired', () => {
  const rates = toUnitRates({
    'main-lodge': { nightly: 'lots', cleaning: null, minNights: 3.7, extra: true },
  });
  assert.equal(rates['main-lodge'].nightly, null);
  assert.equal(rates['main-lodge'].cleaning, null);
  assert.equal(rates['main-lodge'].minNights, 4, 'a whole number of nights should round');
  assert.equal(unitRateState(rates['main-lodge']), 'partial');
});

test('an unknown unit id never yields a price', () => {
  const rates = blankUnitRates();
  assert.equal(unitNightlyOrNull(rates, 'penthouse'), null);
  assert.equal(unitNightlyOrNull(rates, ''), null);
});

test('a malformed store reads as all-unset rather than throwing', () => {
  for (const value of [null, undefined, 'nonsense', 42, []]) {
    const rates = toUnitRates(value);
    assert.deepEqual(sellableUnits(rates), [], `stored ${JSON.stringify(value)} produced a sellable unit`);
  }
});

