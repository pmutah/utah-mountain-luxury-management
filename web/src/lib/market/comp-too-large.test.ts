/**
 * A comp twice the size of the house is not a comp.
 *
 * `isCloseSleep` only had a floor: a comp had to sleep at least 60% of the house. Nothing stopped one that sleeps **twice** the
 * house from setting its band, so a 16-guest Orem house could price a 12-guest Lindon house — more bedrooms, more baths, often a
 * pool. That is a different product at a different price.
 *
 * Found while entering the owner's real comps on 2026-11-10: one listing the owner described as "4 bedrooms, sleeps 10" is
 * live at **7 bedrooms, 16+ guests**, which is exactly the shape the old rule let through.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { bandComps, isCloseSleep } from './comp-fit.ts';
import { SLEEPS } from '../house-stay.ts';

test('a comp at or below the house is close', () => {
  // The floor still works: a comp a little smaller than the house is a fair comparison.
  assert.equal(isCloseSleep('lindon', SLEEPS.lindon), true, 'a comp the same size as the house was refused');
  assert.equal(isCloseSleep('lindon', Math.ceil(SLEEPS.lindon * 0.6)), true, 'a comp at 60% was refused');
});

test('a comp far smaller than the house is not close', () => {
  assert.equal(isCloseSleep('river', 4), false, 'a 4-sleeper was called close to a 22-guest house');
});

test('a comp twice the size of the house is not close', () => {
  /*
   * The case the floor alone allowed. Lindon sleeps 12, so a 24-sleeper is twice the house — more rooms, more baths, a
   * different product.
   */
  const house = SLEEPS.lindon;
  assert.equal(isCloseSleep('lindon', house * 2), false, 'a comp twice the house was called close');
  assert.equal(isCloseSleep('lindon', house * 3), false, 'a comp three times the house was called close');
});

test('the boundary is 150%, so a somewhat larger comp still counts', () => {
  /*
   * Most of the Lindon market is a little larger than the house — a 16-guest Orem home against 12 — and refusing those would
   * leave no band at all. 150% is the line: inside it a comp is a bigger version of the same product.
   */
  const house = SLEEPS.lindon;
  assert.equal(isCloseSleep('lindon', Math.floor(house * 1.5)), true, 'a comp at exactly 150% was refused');
  assert.equal(isCloseSleep('lindon', Math.floor(house * 1.5) + 1), false, 'a comp above 150% was accepted');
});

test('a nonsense sleep count is not close in either direction', () => {
  for (const sleeps of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isCloseSleep('river', sleeps), false, `${sleeps} was treated as a real capacity`);
  }
});

test('an oversized comp does not narrow the band to itself', () => {
  /*
   * `bandComps` narrows to the close comps when there are four or more. An oversized comp in that set would become the whole
   * market, which is the same one-observation-as-the-market defect the band already guards against elsewhere.
   */
  const comps = [
    { sleeps: 12, distanceMi: 2 },
    { sleeps: 14, distanceMi: 3 },
    { sleeps: 16, distanceMi: 4 },
    { sleeps: 18, distanceMi: 5 },
    { sleeps: 40, distanceMi: 2 },
  ];
  const band = bandComps('lindon', comps);
  assert.equal(band.narrowed, true, 'the band was not narrowed, so the oversized comp stayed in');
  assert.equal(band.used.some((comp) => comp.sleeps === 40), false, 'a 40-sleeper set the band for a 12-guest house');
});
