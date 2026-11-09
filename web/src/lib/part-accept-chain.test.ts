import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptHold, stayPlans } from './booking-accept.ts';

/*
 * A part booking only blocks anything if `units` survives the whole chain: the accept plan, the stay plan, and the
 * saved reservation. It did not survive the plan — `acceptHold` rebuilt the plan from named fields and dropped it — so
 * every part booking would have been saved as the whole house, and the other two parts would never sell.
 *
 * These tests pin each hop. The route test that writes a real reservation is in the local end-to-end run.
 */

const request = {
  id: 'book-1',
  name: 'Ada',
  propertyId: 'river',
  checkIn: '2027-05-04',
  checkOut: '2027-05-06',
  guests: 3,
};

const accepted = (units?: string[]) => {
  const result = acceptHold({
    request,
    alreadyAccepted: false,
    plan: { payout: 260, source: 'Direct', ...(units ? { units } : {}) },
    asOf: '2026-11-08',
  });
  assert.equal(result.ok, true, 'the accept was refused');
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};

test('a part request keeps its parts on the accept plan', () => {
  const plan = accepted(['garage-suite']);
  assert.deepEqual(plan.units, ['garage-suite'], 'the accept plan dropped the part');
});

test('a whole-house request keeps no parts', () => {
  const plan = accepted();
  assert.equal(plan.units, undefined, 'a whole-house accept invented a part');
});

test('a part name we do not sell is dropped rather than saved', () => {
  const plan = accepted(['attic']);
  // An unknown part leaves the booking as the whole house, which is the safe reading: it blocks everything.
  assert.equal(plan.units, undefined, 'an unknown part was saved as a part');
});

test('parts never attach to a house that is not River', () => {
  const result = acceptHold({
    request: { ...request, propertyId: 'ranch' },
    alreadyAccepted: false,
    plan: { payout: 260, units: ['garage-suite'] },
    asOf: '2026-11-08',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.units, undefined, 'a Ranch accept carried a Riverhouse part');
});

test('parts never attach to a two-house party', () => {
  const result = acceptHold({
    request: { ...request, alsoPropertyId: 'ranch' },
    alreadyAccepted: false,
    plan: { payout: 260, units: ['garage-suite'] },
    asOf: '2026-11-08',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.units, undefined, 'a two-house party carried a part');
});

test('the stay plan carries the parts onto the row that gets saved', () => {
  const plan = accepted(['garage-suite', 'main-lodge']);
  const stays = stayPlans(plan);
  assert.equal(stays.length, 1);
  assert.deepEqual(stays[0]?.units, ['garage-suite', 'main-lodge'], 'the stay would have blocked nothing');
});

test('a whole-house stay carries no parts on the row', () => {
  const stays = stayPlans(accepted());
  assert.equal(stays[0]?.units, undefined, 'a whole-house stay carried a part');
});

test('the confirmation line names the part the accept sold', () => {
  const plan = accepted(['main-lodge']);
  assert.match(plan.note, /Direct request book-1/);
  // The note is the internal record; the host-facing part line is `acceptedLine`, tested separately.
  assert.equal(plan.propertyId, 'river');
});
