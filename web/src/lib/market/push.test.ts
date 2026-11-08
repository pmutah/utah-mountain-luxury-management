import assert from 'node:assert/strict';
import test from 'node:test';
import { planLines, planProvenance, pushHold, pushNights, pushPayload, pushPlanAll, pushPlanFor, pushSummaryLine, type PushGate } from './push.ts';
import type { ShadowNight, ShadowRun } from './shadow.ts';

const READY: PushGate = { shadowReady: true, hasToken: true, paused: false, calendarReady: true };

function night(over: Partial<ShadowNight> = {}): ShadowNight {
  return {
    date: '2026-12-01',
    season: 'winter',
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

function run(house: ShadowRun['house'], nights: ShadowNight[]): ShadowRun {
  return {
    house,
    paused: false,
    nights,
    counts: { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 },
    digest: 'Nothing sent to Hospitable.',
  };
}

test('a booked, closed, paused, or locked night is never in the plan', () => {
  const nights = [
    night({ date: '2026-12-01', action: 'raise' }),
    night({ date: '2026-12-02', action: 'booked' }),
    night({ date: '2026-12-03', action: 'closed' }),
    night({ date: '2026-12-04', action: 'paused' }),
    night({ date: '2026-12-05', action: 'locked' }),
    night({ date: '2026-12-06', action: 'hold' }),
  ];
  const plan = pushNights('river', nights);
  assert.deepEqual(
    plan.map((row) => row.date),
    ['2026-12-01'],
  );
});

test('a night whose price would not move is dropped', () => {
  const plan = pushNights('river', [night({ action: 'raise', ourGuest: 1080, offerGuest: 1080 })]);
  assert.deepEqual(plan, []);
});

test('a raise never goes below the floor', () => {
  const below = pushNights('river', [night({ floorGuest: 2000, ourGuest: 1000, offerGuest: 1500, action: 'raise' })]);
  assert.deepEqual(below, []);
  const ok = pushNights('river', [night({ floorGuest: 900, ourGuest: 1000, offerGuest: 1200, action: 'raise' })]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0]!.kind, 'raise');
});

test('a promotion and a restore are labelled and sorted by day', () => {
  const plan = pushNights('ranch', [
    night({ date: '2026-12-05', ourGuest: 1200, offerGuest: 960, promotionPercent: 20, action: 'promote' }),
    // A held night is dropped even though its numbers look like a move.
    night({ date: '2026-12-01', ourGuest: 1400, offerGuest: 1150, action: 'hold' }),
    night({ date: '2026-12-03', ourGuest: 1100, offerGuest: 1000, action: 'raise' }),
  ]);
  assert.deepEqual(
    plan.map((row) => `${row.date}|${row.kind}`),
    ['2026-12-03|restore', '2026-12-05|promote'],
  );
});

test('the gate refuses each reason it should and names it', () => {
  assert.match(pushHold({ ...READY, calendarReady: false }) ?? '', /calendar was not read/);
  assert.match(pushHold({ ...READY, paused: true }) ?? '', /paused for the season/);
  assert.match(pushHold({ ...READY, shadowReady: false }) ?? '', /shadow week is not finished/);
  assert.match(pushHold({ ...READY, hasToken: false }) ?? '', /no Hospitable write token/);
  assert.equal(pushHold(READY), null);
});

test('a waiting gate previews the nights but still produces no payload', () => {
  /*
   * The missing write token is a state of *permission*, not of data. The nights are real and are exactly
   * what the desk needs to watch during the shadow week, so they are shown — but `allowed` stays false and
   * `pushPayload` still returns null, so a preview can never become a send. Hiding the nights made the
   * seven-day watching period show nothing at all, which is the one thing it exists for.
   */
  const r = run('river', [night()]);
  const plan = pushPlanFor('river', r, { ...READY, hasToken: false });
  assert.equal(plan.allowed, false, 'a plan without a token must never be allowed');
  assert.ok(plan.nights.length > 0, 'the preview dropped the nights it should be showing');
  assert.equal(pushPayload(plan), null, 'a preview must never produce a payload');
  assert.match(plan.line, /Preview only/);
  assert.match(plan.line, /write token/);
});

test('an unusable gate drops the nights, because those nights would be invented', () => {
  // An unread calendar is different from a permission gate: the night data itself cannot be trusted.
  const r = run('river', [night()]);
  const plan = pushPlanFor('river', r, { ...READY, calendarReady: false });
  assert.equal(plan.allowed, false);
  assert.deepEqual(plan.nights, [], 'a night from an unread calendar must not be previewed');
  assert.equal(pushPayload(plan), null);
});

test('a paused run blocks even when the gate says otherwise', () => {
  const r = { ...run('ranch', [night()]), paused: true };
  const plan = pushPlanFor('ranch', r, READY);
  assert.equal(plan.allowed, false);
  assert.deepEqual(plan.nights, []);
});

test('an allowed plan names what would change and quotes no price', () => {
  const plan = pushPlanFor('river', run('river', [night(), night({ date: '2026-12-02' })]), READY);
  assert.equal(plan.allowed, true);
  assert.equal(plan.nights.length, 2);
  assert.match(plan.line, /2 nights would change: 2 nights up/);
  assert.equal(plan.line.includes('$'), false);
});

test('the payload carries only allowed nights, ready for a sender', () => {
  const plan = pushPlanFor('river', run('river', [night({ date: '2026-12-01', offerGuest: 1080 })]), READY);
  const payload = pushPayload(plan);
  assert.ok(payload);
  assert.deepEqual(payload.nights, [{ date: '2026-12-01', rate: 1080 }]);
});

test('an empty plan says nothing would change rather than pretending work', () => {
  const plan = pushPlanFor('lindon', run('lindon', [night({ action: 'booked' })]), READY);
  assert.equal(plan.allowed, true);
  assert.equal(plan.nights.length, 0);
  assert.match(plan.line, /No night would change/);
  assert.equal(pushPayload(plan), null);
});

test('the summary counts across houses and never quotes a rate', () => {
  const plans = pushPlanAll(
    [run('river', [night()]), run('ranch', [night({ date: '2026-12-02' }), night({ date: '2026-12-03' })]), run('lindon', [])],
    READY,
  );
  const line = pushSummaryLine(plans);
  assert.match(line, /3 nights across 2 houses would change/);
  assert.equal(line.includes('$'), false);
  assert.match(pushSummaryLine(pushPlanAll([run('river', [])], READY)), /No night would change/);
  assert.match(pushSummaryLine([]), /No house to plan for/);
});

test('a fully blocked board says why and sends nothing', () => {
  const plans = pushPlanAll([run('river', [night()])], { ...READY, shadowReady: false });
  assert.match(pushSummaryLine(plans), /No rate is sent\. The shadow week is not finished/);
});

test('the plan lines carry the price to type, because a plan without one is not actionable', () => {
  /*
   * These lines used to omit the price on purpose, so a plan could never read as a published rate. But "Dec 5:
   * 20% promotion." leaves the host to find the number elsewhere to do the one thing the line exists to
   * prompt. The panel is host-only and states that nothing is sent, so the figure belongs here — and the
   * previous price goes with it, so the change is visible rather than implied.
   *
   * A **measured** band only: that is the case where a price is worth typing into a live listing.
   */
  const plan = pushPlanFor(
    'river',
    run('river', [
      night({ source: 'live' }),
      night({ date: '2026-12-05', action: 'promote', offerGuest: 960, promotionPercent: 20, source: 'live' }),
    ]),
    READY,
  );
  const lines = planLines(plan);
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /raise/);
  assert.match(lines[1] ?? '', /20% promotion/);
  assert.match(lines[0] ?? '', /\$\d+ to \$\d+/, 'a raise line must name both prices');
  assert.match(lines[1] ?? '', /\$1000 to \$960/, 'a promotion line must name the base and the offer');
});

test('a price built on the invented sample set is never printed as a price to type', () => {
  /*
   * The bug this locks: the plan is an instruction — "type the listed price into Airbnb". Fifty of sixty live
   * plan lines were priced off `fixtures.ts`, whose comps are named "Sample · Canyon lodge" and carry invented
   * rates. Under a "Copy these prices" button that invites the host to paste a fabrication into a real listing.
   * The night still gets a line, because the host should see the engine wants to move it; it just does not get
   * a number.
   */
  const plan = pushPlanFor('lindon', run('lindon', [night({ source: 'sample', action: 'promote', offerGuest: 800 })]), READY);
  const lines = planLines(plan);
  assert.equal(lines.length, 1, 'the night should still be named');
  assert.equal(/\$\d/.test(lines[0] ?? ''), false, 'a sample-priced line must not print a price');
  assert.match(lines[0] ?? '', /no price to type/);
  assert.match(lines[0] ?? '', /invented sample set/);
});

test('the provenance count separates measured lines from sample lines and says so', () => {
  const mixed = pushPlanFor(
    'ranch',
    run('ranch', [
      night({ date: '2026-12-01', source: 'live' }),
      night({ date: '2026-12-02', source: 'sample' }),
      night({ date: '2026-12-03', source: 'sample' }),
      night({ date: '2026-12-04', source: 'thin' }),
    ]),
    READY,
  );
  const provenance = planProvenance(mixed);
  assert.equal(provenance.liveLines, 2, 'live and thin bands both rest on a saved ask');
  assert.equal(provenance.sampleLines, 2);
  assert.match(provenance.sampleNote ?? '', /2 of these 4 lines are not measured/);

  const allLive = pushPlanFor('ranch', run('ranch', [night({ source: 'live' })]), READY);
  assert.equal(planProvenance(allLive).sampleNote, null, 'a fully measured plan needs no warning');
  assert.equal(planProvenance(allLive).liveLines, 1);

  const allSample = pushPlanFor('ranch', run('ranch', [night({ source: 'sample' })]), READY);
  assert.match(planProvenance(allSample).sampleNote ?? '', /None of these prices is measured/);
  assert.equal(planProvenance(allSample).sampleLines, 1);
});

test('a raise that leaves the house at the bottom of its market says so', () => {
  /*
   * The plan read "raise, $179 to $193" and nothing more, while the band for that night was $418–$489 with a
   * $421 median — so $193 was still **p0**. Approving every line left the host believing the house was
   * repriced when it was still the cheapest on the street. The 8% daily cap is the right guard against a wild
   * swing; the gap it creates is what has to be visible.
   */
  const plan = pushPlanFor(
    'lindon',
    run('lindon', [
      night({
        date: '2026-12-08',
        source: 'live',
        ourGuest: 179,
        floorGuest: 51,
        proposedGuest: 179,
        offerGuest: 193,
        compRates: [418, 421, 489],
        p25: 418,
        median: 421,
        p75: 489,
        action: 'raise',
      }),
    ]),
    READY,
  );
  const line = planLines(plan)[0] ?? '';
  assert.match(line, /\$179 to \$193/);
  assert.match(line, /Still the lowest in a band/, 'the line reads as a repricing when it is one step');
  assert.match(line, /8% cap means more steps/);
  assert.equal(plan.nights[0]!.percentileAfter, 0);
  assert.equal(plan.nights[0]!.bandP75, 455);
  assert.match(line, /\$455/);
});

test('a raise already at the top of its market says that instead', () => {
  const plan = pushPlanFor(
    'lindon',
    run('lindon', [
      night({ date: '2026-12-08', source: 'live', ourGuest: 900, floorGuest: 300, proposedGuest: 900, offerGuest: 980, compRates: [600, 620, 640], p75: 640, action: 'raise' }),
    ]),
    READY,
  );
  assert.match(planLines(plan)[0] ?? '', /at the top of a band/);
});

test('a raise inside the band carries the price and no band commentary', () => {
  /*
   * The note is for the two ends, where the number misleads without it. A mid-band raise is just a raise, and
   * padding every line with a percentile would bury the cases that matter.
   */
  const plan = pushPlanFor(
    'lindon',
    run('lindon', [
      night({ date: '2026-12-08', source: 'live', ourGuest: 400, floorGuest: 125, proposedGuest: 400, offerGuest: 432, compRates: [300, 430, 600, 700], p75: 625, action: 'raise' }),
    ]),
    READY,
  );
  const line = planLines(plan)[0] ?? '';
  assert.match(line, /\$400 to \$432/);
  assert.equal(/Still the lowest|at the top of a band/.test(line), false);
});

test('a sample-priced night carries no percentile, because there is no band to be in', () => {
  const plan = pushPlanFor('lindon', run('lindon', [night({ source: 'sample', action: 'raise' })]), READY);
  assert.equal(plan.nights[0]!.percentileAfter, null);
  assert.equal(plan.nights[0]!.bandP75, null);
});

