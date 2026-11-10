/**
 * Per-part door codes: who gets which door.
 *
 * The house had one code for the whole building, so a guest staying in the Garage Suite held a code that opened the Main Lodge
 * — where a different guest might be. The owner settled it on 2026-11-10: separate codes per part when parts are booked
 * separately, one code for the whole house.
 *
 * The tests here are about what must **not** happen: a part guest receiving another part's code, or a part guest receiving the
 * house code because their own part has none set.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { doorCodesForStay, isPartStay, partCodeWarning } from './part-door-codes.ts';

const HOUSE = '1111';
const PARTS = {
  'garage-suite': '2222',
  'recreation-wing': '3333',
  'main-lodge': '4444',
} as const;

test('a whole-house stay gets the house code, exactly as before', () => {
  /*
   * Absent units is every stay recorded before the split, so this path must not change for them. It is also the only case
   * where the house code is the right answer: it opens the building because the guest has the building.
   */
  const plan = doorCodesForStay({ house: 'river', houseCode: HOUSE, partCodes: PARTS });
  assert.deepEqual(plan.codes, [{ label: 'Door code', code: HOUSE }]);
  assert.equal(plan.missing, null);

  // And the same with an explicit empty list, which is what the app sends for "whole house".
  assert.deepEqual(doorCodesForStay({ house: 'river', units: [], houseCode: HOUSE, partCodes: PARTS }).codes, [
    { label: 'Door code', code: HOUSE },
  ]);
});

test('a part stay gets only its own part code', () => {
  const plan = doorCodesForStay({ house: 'river', units: ['garage-suite'], houseCode: HOUSE, partCodes: PARTS });
  assert.deepEqual(plan.codes, [{ label: 'River Garage Suite', code: '2222' }]);
  assert.equal(plan.missing, null);

  // The house code must not appear anywhere in a part guest's answer.
  assert.equal(JSON.stringify(plan).includes(HOUSE), false, 'a part guest was handed the whole-house code');
  // Nor another part's code.
  assert.equal(JSON.stringify(plan).includes('3333'), false, 'a part guest was handed another part code');
});

test('two parts get both codes, because one reservation holds both', () => {
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite', 'main-lodge'],
    houseCode: HOUSE,
    partCodes: PARTS,
  });
  assert.deepEqual(plan.codes, [
    { label: 'River Garage Suite', code: '2222' },
    { label: 'River Main Lodge', code: '4444' },
  ]);
  // Still not the house code: a guest in two parts does not have the third.
  assert.equal(JSON.stringify(plan).includes(HOUSE), false);
  assert.equal(JSON.stringify(plan).includes('3333'), false, 'the Recreation Wing code was sent to a guest without it');
});

test('a part with no code set is told to call, and is never given the house code', () => {
  /*
   * This is the case that matters most. The house code opens every part, so falling back to it would defeat the whole change —
   * a Garage Suite guest would hold the Main Lodge door.
   */
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: HOUSE,
    partCodes: { 'main-lodge': '4444' },
  });
  assert.deepEqual(plan.codes, [], 'a code was shown for a part with none set');
  assert.ok(plan.missing, 'the guest was not told the code is missing');
  assert.match(plan.missing!, /River Garage Suite has no door code set yet/);
  assert.match(plan.missing!, /Text or call us/);
  assert.equal(JSON.stringify(plan).includes(HOUSE), false, 'the house code was used as a fallback for a part');
});

test('one missing part does not suppress the other part that has a code', () => {
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite', 'main-lodge'],
    houseCode: HOUSE,
    partCodes: { 'garage-suite': '2222' },
  });
  assert.deepEqual(plan.codes, [{ label: 'River Garage Suite', code: '2222' }]);
  assert.match(plan.missing!, /River Main Lodge have no door code set yet|River Main Lodge has no door code set yet/);
});

test('an unknown unit is ignored rather than invented', () => {
  const plan = doorCodesForStay({ house: 'river', units: ['attic'], houseCode: HOUSE, partCodes: PARTS });
  // `attic` is not a part, so the list is empty and the stay reads as the whole house — the conservative direction.
  assert.deepEqual(plan.codes, [{ label: 'Door code', code: HOUSE }]);
});

test('a blank or whitespace code is not a code', () => {
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: HOUSE,
    partCodes: { 'garage-suite': '   ' },
  });
  assert.deepEqual(plan.codes, [], 'a whitespace code was shown as a door code');
  assert.ok(plan.missing);
});

test('a whole-house stay with no code shows nothing and invents nothing', () => {
  const plan = doorCodesForStay({ house: 'river', houseCode: '', partCodes: PARTS });
  assert.deepEqual(plan.codes, []);
  assert.equal(plan.missing, null, 'a whole-house guest was told a part code is missing');
});

test('isPartStay reads the same way the rest of the app does', () => {
  assert.equal(isPartStay(undefined), false);
  assert.equal(isPartStay([]), false);
  assert.equal(isPartStay(['garage-suite']), true);
});

test('the host is warned about a part with no code, and the warning names it', () => {
  const warning = partCodeWarning({ 'garage-suite': '2222' }, HOUSE);
  assert.ok(warning);
  assert.match(warning!, /River Recreation Wing and River Main Lodge/);
  assert.match(warning!, /opens every part/, 'the warning does not say why the house code cannot be used instead');
});

test('no warning when every part has a code', () => {
  const warning = partCodeWarning(PARTS, HOUSE);
  assert.ok(warning);
  assert.match(warning!, /Each part has its own door code/);
});

test('a host who has not started selling parts gets no warning', () => {
  // Warning about three missing codes on a house nobody has split would be noise.
  assert.equal(partCodeWarning(undefined, HOUSE), null);
  assert.equal(partCodeWarning({}, HOUSE), null);
});
