import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { blankUnitRates, type RiverUnitRates } from './river-unit-rates.ts';
import { unitRequestCheck } from './river-unit-request.ts';
import { nightAsk } from './market/rates.ts';

/*
 * The house's minimum stay lives in the rate card, and the whole-house path enforces it through `quoteStay`. The part path
 * did not: a guest could book **two nights in the Garage Suite over Christmas**, when the house needs five.
 *
 * A part is part of the house. It cannot undercut the house's own rule, so the minimum is read from the same rate card the
 * house reads rather than hard-coded.
 *
 * Verified on the real booking route before and after: the 2-night Christmas part request now answers 409
 * `min-nights` with "This stay needs at least 5 nights, the same as the whole house", and a 2-night shoulder week still
 * books.
 */

function priced(): RiverUnitRates {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  rates['recreation-wing'] = { nightly: 640, cleaning: 250, minNights: 2 };
  rates['main-lodge'] = { nightly: 1150, cleaning: 400, minNights: 2 };
  return rates;
}

const check = (checkIn: string, checkOut: string, units: string[], guests = 2) =>
  unitRequestCheck([], priced(), { units, checkIn, checkOut, guests });

test('the rate card really does ask five nights over Christmas', () => {
  // The test is only meaningful if the data says so; this pins the fact rather than assuming it.
  assert.equal(nightAsk('river', '2026-12-23').minNights, 5);
  assert.equal(nightAsk('river', '2026-11-17').minNights, 2);
});

test('a part cannot undercut the Christmas minimum', () => {
  const refused = check('2026-12-23', '2026-12-25', ['garage-suite']);
  assert.equal(refused.ok, false, 'a two-night Christmas part booking was allowed');
  if (!refused.ok) {
    assert.equal(refused.code, 'min-nights');
    assert.match(refused.reason, /at least 5 nights/);
  }
});

test('the same part over the full five nights is allowed', () => {
  assert.equal(check('2026-12-23', '2026-12-28', ['garage-suite']).ok, true);
});

test('a short stay in a shoulder week is still allowed', () => {
  // The fix must not turn the minimum into a blanket two-night rule.
  assert.equal(check('2026-11-17', '2026-11-19', ['garage-suite']).ok, true);
});

test('every part obeys the same minimum', () => {
  for (const unit of ['garage-suite', 'recreation-wing', 'main-lodge']) {
    const refused = check('2026-12-23', '2026-12-25', [unit]);
    assert.equal(refused.ok, false, `${unit} allowed a two-night Christmas stay`);
  }
});

test('the minimum comes from the rate card, not from a number written here', () => {
  /*
   * If the holiday rule changes in the card, the gate must follow. Reading `nightAsk` is what makes that true; a literal
   * `5` would drift the moment the season table moved.
   */
  const source = readFileSync(new URL('./river-unit-request.ts', import.meta.url), 'utf8');
  assert.match(source, /nightAsk\('river', night\)\.minNights/, 'the gate no longer reads the minimum from the rate card');
  assert.equal(/at least 5 nights/.test(source), false, 'a five-night figure is written into the gate');
});

test('the whole house refuses a too-short stay on its own, not because a caller checked first', () => {
  /*
   * The minimum used to be checked below the whole-house branch, so that branch returned before it. The two paths were
   * only consistent because the booking route happened to run `bookingRequestHold` — which quotes — before reaching this
   * gate. Calling the gate directly with nothing else in front of it showed the hole.
   */
  const house = check('2026-12-23', '2026-12-25', []);
  assert.equal(house.ok, false, 'the gate alone allowed a two-night Christmas whole-house stay');
  if (!house.ok) assert.equal(house.code, 'min-nights');
});

test('the house capacity on the whole-house answer is read, not repeated', () => {
  // It was a literal 24 here, the same duplication that has drifted twice elsewhere in this session.
  const allowed = check('2026-11-17', '2026-11-19', [], 10);
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.sleeps, 22);
  const source = readFileSync(new URL('./river-unit-request.ts', import.meta.url), 'utf8');
  assert.equal(/sleeps: 24,/.test(source), false, 'a literal 24 is back in the gate');
});
