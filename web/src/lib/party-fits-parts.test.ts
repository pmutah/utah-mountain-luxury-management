import assert from 'node:assert/strict';
import test from 'node:test';
import { partyFitsParts, partsSleeps } from './party-fits-parts.ts';
import { RIVER_UNIT_DETAIL } from './river-units.ts';
import { unitRequestCheck } from './river-unit-request.ts';
import { blankUnitRates, type RiverUnitRates } from './river-unit-rates.ts';

/*
 * The booking page let a party of nine submit for the Garage Suite, which sleeps four. The server refused it — correctly
 * — but only after the guest had filled the whole form. The page now knows before it submits.
 *
 * The important property is that the page and the server agree. A page that allows what the route refuses wastes a
 * guest's time; a page that refuses what the route allows loses a booking. So the last test runs both against the same
 * numbers.
 */

function priced(): RiverUnitRates {
  const rates = blankUnitRates();
  rates['garage-suite'] = { nightly: 320, cleaning: 150, minNights: 2 };
  rates['recreation-wing'] = { nightly: 640, cleaning: 250, minNights: 2 };
  rates['main-lodge'] = { nightly: 1150, cleaning: 400, minNights: 2 };
  return rates;
}

test('the capacities come from the published unit table, not a second copy', () => {
  assert.equal(partsSleeps(['garage-suite']), 4);
  assert.equal(partsSleeps(['recreation-wing']), 8);
  assert.equal(partsSleeps(['main-lodge']), 13);
  assert.equal(partsSleeps(['garage-suite', 'main-lodge']), 17);
  // Every part's real capacity, so a change to one table breaks this.
  for (const detail of RIVER_UNIT_DETAIL) assert.equal(partsSleeps([detail.id]), detail.sleeps);
});

test('a party that fits is allowed', () => {
  const fit = partyFitsParts(['garage-suite'], 4);
  assert.equal(fit?.ok, true);
  assert.equal(fit?.sleeps, 4);
});

test('a party of nine in the Garage Suite is refused, with the real numbers', () => {
  const fit = partyFitsParts(['garage-suite'], 9);
  assert.equal(fit?.ok, false);
  if (fit?.ok === false) {
    assert.equal(fit.code, 'too-many');
    assert.match(fit.reason, /sleep 4/);
    assert.match(fit.reason, /party is 9/);
    assert.match(fit.reason, /5 guests are over/);
    // It has to offer a way forward, not just say no.
    assert.match(fit.reason, /add another part|whole house/);
  }
});

test('one guest over is described in the singular', () => {
  const fit = partyFitsParts(['garage-suite'], 5);
  assert.match(fit?.ok === false ? fit.reason : '', /One guest is over/);
});

test('two parts are judged together', () => {
  assert.equal(partyFitsParts(['garage-suite', 'main-lodge'], 17)?.ok, true);
  assert.equal(partyFitsParts(['garage-suite', 'main-lodge'], 18)?.ok, false);
});

test('a party size not given yet is not a failure', () => {
  assert.equal(partyFitsParts(['garage-suite'], null), null);
  assert.equal(partyFitsParts(['garage-suite'], undefined), null);
});

test('no parts chosen is the whole house, and is left to the house check', () => {
  assert.equal(partyFitsParts([], 9), null);
});

test('a zero or negative party is refused rather than treated as no answer', () => {
  const fit = partyFitsParts(['garage-suite'], 0);
  assert.equal(fit?.ok, false);
  if (fit?.ok === false) assert.equal(fit.code, 'no-guests');
});

test('a part with no recorded capacity is refused, not assumed to fit', () => {
  // A slug that is not a real part has no capacity, so the sum is 0 and the page must not wave it through.
  const fit = partyFitsParts(['attic' as never], 2);
  assert.equal(fit?.ok, false);
  if (fit?.ok === false) assert.equal(fit.code, 'no-sleeps');
});

test('the page and the booking route agree on every capacity boundary', () => {
  /*
   * The one property that matters: if the page says yes, the route must not refuse for capacity; if the page says no,
   * the route must refuse. Any drift here is a wasted form or a lost booking.
   */
  const rates = priced();
  const combos = [
    ['garage-suite'],
    ['main-lodge'],
    ['garage-suite', 'main-lodge'],
    ['garage-suite', 'recreation-wing', 'main-lodge'],
  ] as const;
  for (const units of combos) {
    const sleeps = partsSleeps([...units]);
    for (const guests of [1, sleeps - 1, sleeps, sleeps + 1, sleeps + 5]) {
      if (guests < 1) continue;
      const page = partyFitsParts([...units], guests);
      const route = unitRequestCheck([], rates, {
        units: [...units],
        checkIn: '2027-03-10',
        checkOut: '2027-03-12',
        guests,
      });
      if (page?.ok) {
        assert.equal(route.ok, true, `the page allowed ${guests} in ${units.join('+')} and the route refused it`);
      } else {
        assert.equal(route.ok, false, `the page refused ${guests} in ${units.join('+')} and the route allowed it`);
        if (!route.ok) assert.equal(route.code, 'over-capacity', `the route refused for a reason other than capacity: ${route.code}`);
      }
    }
  }
});

test('all three parts never sleep more than the house', () => {
  /*
   * 4 + 8 + 13 = 25 against a 24-guest house. Booking every part *is* the whole house, so 25 could take the entire
   * building as "three parts" while the same 25 is refused as a whole-house booking.
   */
  const all = ['garage-suite', 'recreation-wing', 'main-lodge'] as const;
  assert.equal(partsSleeps([...all]), 24, 'all three parts sleep more than the house');

  const rates = priced();
  const at24 = unitRequestCheck([], rates, { units: [...all], checkIn: '2027-03-10', checkOut: '2027-03-12', guests: 24 });
  assert.equal(at24.ok, true, '24 was refused for all three parts');
  const at25 = unitRequestCheck([], rates, { units: [...all], checkIn: '2027-03-10', checkOut: '2027-03-12', guests: 25 });
  assert.equal(at25.ok, false, '25 was allowed for all three parts');
  if (!at25.ok) {
    assert.equal(at25.code, 'over-capacity');
    // It has to say why, since the parts' own numbers add up to 25.
    assert.match(at25.reason, /whole house, which sleeps 24/);
  }
});

test('two parts still get their own sum, uncapped', () => {
  // Only the full set is the house. Two parts are their own rooms and keep their real capacity.
  assert.equal(partsSleeps(['garage-suite', 'main-lodge']), 17);
  assert.equal(partsSleeps(['recreation-wing']), 8);
});
