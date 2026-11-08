import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pushPlanFor, planProvenance, type PushGate } from './push.ts';
import type { ShadowNight, ShadowRun } from './shadow.ts';

/*
 * A field computed on the server and never read by the page is the defect this codebase keeps producing in a
 * new costume: `allowed` beside a `payload`, `action: promote` beside `promotionPercent: 0`, a sample band
 * inside a "live" digest. Here it was `planProvenance` returning `{ live, sample, note }` while
 * `PushPlanPanel` rendered `plan.sampleNote` — so the warning was built, serialised, and dropped.
 *
 * It was found by fetching the deployed route and noticing the keys were **absent** from the JSON, not by
 * reading either file. That is the check this test automates: the names the panel reads must be the names the
 * route sends.
 */

const READY: PushGate = { shadowReady: false, hasToken: false, paused: false, calendarReady: true };

function night(over: Partial<ShadowNight> = {}): ShadowNight {
  return {
    date: '2026-12-01',
    season: null,
    ourGuest: 1000,
    floorGuest: 800,
    compRates: [1100],
    p25: 1000,
    median: 1100,
    p75: 1200,
    openComps: 5,
    percentile: 60,
    proposedGuest: 1080,
    promotionPercent: 0,
    offerGuest: 1080,
    minNights: 2,
    action: 'raise',
    reason: 'Inside the band.',
    compBookedShare: 40,
    source: 'sample',
    ...over,
  };
}

function run(nights: ShadowNight[]): ShadowRun {
  return {
    house: 'lindon',
    paused: false,
    nights,
    counts: { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 },
    digest: 'Nothing sent to Hospitable.',
  };
}

test('the provenance keys are exactly the names the panel renders', () => {
  const plan = pushPlanFor('lindon', run([night({ source: 'sample' }), night({ date: '2026-12-02', source: 'live' })]), READY);
  const provenance = planProvenance(plan);

  // What the route spreads onto each plan, and therefore what reaches the page.
  const payload = { ...plan, ...provenance };
  assert.equal(payload.sampleLines, 1);
  assert.equal(payload.liveLines, 1);
  assert.match(payload.sampleNote ?? '', /not measured/);

  // And the panel must actually read those names. If either side is renamed on its own, this fails.
  const panel = readFileSync(new URL('../../components/PushPlanPanel.tsx', import.meta.url), 'utf8');
  for (const key of ['sampleNote', 'sampleLines', 'liveLines']) {
    assert.ok(panel.includes(`plan.${key}`), `the panel does not render plan.${key}, so the value is dropped`);
  }
});

test('a fully measured plan sends no warning rather than an empty one', () => {
  const plan = pushPlanFor('lindon', run([night({ source: 'live' })]), READY);
  const provenance = planProvenance(plan);
  assert.equal(provenance.sampleNote, null, 'an empty string would render a blank panel row');
  assert.equal(provenance.sampleLines, 0);
});

test('the approve list never offers a sample-priced night', () => {
  /*
   * The typed price is the danger; the approve button is the delivery mechanism, because it writes the number
   * onto our own booking page where a guest is actually charged it. The panel filters these out, and this pins
   * the filter so a future refactor cannot quietly re-offer them.
   */
  const panel = readFileSync(new URL('../../components/PushPlanPanel.tsx', import.meta.url), 'utf8');
  assert.match(
    panel,
    /filter\(\(night\)\s*=>\s*night\.source\s*!==\s*'sample'\)/,
    'the approve list no longer filters out sample-priced nights',
  );
});
