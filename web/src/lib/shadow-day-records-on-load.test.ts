/**
 * Opening the dashboard records a shadow day, whichever tab it is.
 *
 * The seven-day shadow clock gates the whole rate push. `/api/pricing/push-plan` saves the day itself, and `App.tsx` calls it on
 * load — but the call was guarded on `activeTab === 'portfolio'`, the "Our expenses" tab. A host who opened Overview or Guests
 * every morning advanced the clock by **zero**.
 *
 * The owner's instruction on 2026-11-10 was to keep it recording "in the background" for six more days so auto-pricing can turn
 * on. A tab condition is the opposite of that: it makes a background job depend on which link someone clicked.
 *
 * What may still stop it is books that cannot be read — a day built from unread or sample data must not count, and the route
 * refuses those itself.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const APP = readFileSync('src/App.tsx', 'utf8');

/** The effect that records a day. */
function shadowEffect(): string {
  const call = APP.indexOf('api.getPushPlan()');
  assert.ok(call > 0, 'nothing calls the push plan, so no day is recorded');
  const start = APP.lastIndexOf('useEffect(', call);
  const end = APP.indexOf('}', call);
  return APP.slice(start, end + 1);
}

test('the shadow day is not gated on which tab is open', () => {
  const effect = shadowEffect();
  assert.equal(
    /activeTab\s*!==/.test(effect),
    false,
    'the shadow-day record is skipping when the host is not on a particular tab, so a daily Overview visit counts nothing',
  );
});

test('the shadow day still waits for the books to be readable', () => {
  // The one condition that should remain: a day built from unread books must not count.
  const effect = shadowEffect();
  assert.match(effect, /booksPaused/, 'the record no longer waits for the books, so an unread day could be saved');
});

test('the call is fire-and-forget, so a failure cannot interrupt the dashboard', () => {
  const effect = shadowEffect();
  assert.match(effect, /\.catch\(/, 'a failed save is not caught, so it could break the page');
  assert.equal(/await api\.getPushPlan/.test(effect), false, 'the record is awaited, which delays the dashboard');
});

test('the route still refuses a day built from sample or unread data', () => {
  /*
   * The guard moved from "which tab" to "is this day real". Both refusals are in the route: the unsent marker proves it is a
   * shadow digest, and the absence of "sample comps" proves no house fell back to the fixtures.
   */
  const route = readFileSync('functions/api/pricing/push-plan.ts', 'utf8');
  assert.match(route, /digest\.includes\('Nothing sent to Hospitable\.'\)/, 'the route no longer checks the digest is unsent');
  assert.match(route, /!digest\.includes\('sample comps'\)/, 'the route no longer checks the band is real');
  assert.match(route, /liveComps > 0/, 'the route no longer checks that every house had a live comp');
});
