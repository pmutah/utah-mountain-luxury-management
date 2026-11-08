import assert from 'node:assert/strict';
import test from 'node:test';
import { compIsForHouse, compNeedsHouse, compsForHouse, isCompHouse } from './comp-house';

/*
 * These cover the house a saved comp is compared against. The bug was that a comp with no house was
 * read as belonging to every house, so the River House's $2,100 canyon lodge sat in the Lindon
 * House's band beside a $210 rambler and moved a rate nobody had compared it to.
 */

test('a comp entered for one house is compared against that house only', () => {
  const river = { propertyId: 'river' as const };
  assert.equal(compIsForHouse(river, 'river'), true);
  assert.equal(compIsForHouse(river, 'ranch'), false, 'a River comp must not price the Ranch');
  assert.equal(compIsForHouse(river, 'lindon'), false, 'a River comp must not price Lindon');
});

test('a comp with no house is in no band, rather than every band', () => {
  // This is the regression. Every filter used to read a missing house as "counts everywhere".
  for (const house of ['ranch', 'lindon', 'river'] as const) {
    assert.equal(
      compIsForHouse({}, house),
      false,
      `${house} must not take a rate from a comp that was never compared to it`,
    );
    assert.equal(compIsForHouse({ propertyId: null }, house), false);
  }
  assert.equal(compNeedsHouse({}), true, 'the desk has to be able to find these and fix them');
  assert.equal(compNeedsHouse({ propertyId: 'river' }), false);
});

test('both means the Ranch and the River, and never Lindon', () => {
  const both = { propertyId: 'both' as const };
  assert.deepEqual(compsForHouse([both], 'river').length, 1);
  assert.deepEqual(compsForHouse([both], 'ranch').length, 1);
  // Lindon is Brandon's alone and is not part of a two-house party. Counting it here is the same
  // leak in a different direction.
  assert.equal(compsForHouse([both], 'lindon').length, 0);
});

test('the comps for one house keep their saved order and exclude the others', () => {
  const comps = [
    { id: 'a', propertyId: 'river' as const },
    { id: 'b', propertyId: 'lindon' as const },
    { id: 'c', propertyId: 'river' as const },
    { id: 'd' },
    { id: 'e', propertyId: 'both' as const },
  ];
  assert.deepEqual(compsForHouse(comps, 'river').map((c) => c.id), ['a', 'c', 'e']);
  assert.deepEqual(compsForHouse(comps, 'lindon').map((c) => c.id), ['b']);
  assert.deepEqual(compsForHouse(comps, 'ranch').map((c) => c.id), ['e']);
});

test('only a real house value is accepted from a request', () => {
  for (const good of ['ranch', 'lindon', 'river', 'both']) {
    assert.equal(isCompHouse(good), true, `${good} is a house a comp can carry`);
  }
  for (const bad of ['', 'River', 'RANCH', 'all', null, undefined, 3, {}]) {
    assert.equal(isCompHouse(bad), false, `${String(bad)} is not a house`);
  }
});
