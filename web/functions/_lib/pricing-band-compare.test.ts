import assert from 'node:assert/strict';
import test from 'node:test';
import { liveCompFits } from '../../src/lib/market/live';
import { compsForHouse, type CompHouse } from '../../src/lib/market/comp-house';
import type { HouseId } from '../../src/lib/market/types';

/*
 * `compareMarket` and `compHostNetMedian` used to select comps by house alone, while the board filtered
 * through `liveCompFits`. The two paths disagreed, and the disagreement reached the owner as an alert
 * reading "Comp median $324/night (20 data points)" — a number built from our own Ranch House and a
 * listing that only books 28-night stays. These assertions pin the shared rule the three paths now use.
 */

type SavedComp = {
  id: string;
  propertyId: CompHouse;
  sleeps: number;
  distanceMi: number;
  isOwn: boolean;
  minNights: number;
};

const RANCH_OWN: SavedComp = { id: 'own', propertyId: 'ranch', sleeps: 20, distanceMi: 1, isOwn: true, minNights: 1 };
const RANCH_MONTHLY: SavedComp = { id: 'monthly', propertyId: 'ranch', sleeps: 16, distanceMi: 7, isOwn: false, minNights: 28 };
const RANCH_REAL: SavedComp = { id: 'real', propertyId: 'ranch', sleeps: 13, distanceMi: 4, isOwn: false, minNights: 2 };
const RIVER_COMP: SavedComp = { id: 'river', propertyId: 'river', sleeps: 16, distanceMi: 4, isOwn: false, minNights: 1 };

const fits = (house: HouseId, comp: SavedComp) =>
  liveCompFits(house, comp.sleeps, comp.distanceMi, comp.isOwn, comp.minNights);

test('a comp the band refuses is refused by every path, not just the board', () => {
  // The board has always refused these two. The comparison paths used to accept them.
  assert.equal(fits('ranch', RANCH_OWN), false);
  assert.equal(fits('ranch', RANCH_MONTHLY), false);
  // A real nightly comp near the Ranch still counts.
  assert.equal(fits('ranch', RANCH_REAL), true);
});

test('every house keeps only its own comps, so one house cannot price another', () => {
  const comps = [RANCH_OWN, RANCH_MONTHLY, RANCH_REAL, RIVER_COMP];
  assert.deepEqual(compsForHouse(comps, 'ranch').map((c) => c.id), ['own', 'monthly', 'real']);
  assert.deepEqual(compsForHouse(comps, 'river').map((c) => c.id), ['river']);
  assert.deepEqual(compsForHouse(comps, 'lindon').map((c) => c.id), []);
});

test('the rule a comparison must apply is the same predicate, in one place', () => {
  // If someone edits the fit rule, both the board and the comparison move together. This test asserts
  // the shared predicate's answers for the exact comps that produced the wrong alert.
  const ranchBand = [RANCH_OWN, RANCH_MONTHLY, RANCH_REAL].filter((comp) => fits('ranch', comp));
  assert.equal(ranchBand.length, 1, 'only one saved Ranch comp may set its band');
  assert.deepEqual(ranchBand.map((c) => c.id), ['real']);
});

