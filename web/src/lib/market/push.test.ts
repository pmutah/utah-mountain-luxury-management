import assert from 'node:assert/strict';
import test from 'node:test';
import { planLines, pushHold, pushNights, pushPayload, pushPlanAll, pushPlanFor, pushSummaryLine, type PushGate } from './push.ts';
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
   */
  const plan = pushPlanFor('river', run('river', [night(), night({ date: '2026-12-05', action: 'promote', offerGuest: 960, promotionPercent: 20 })]), READY);
  const lines = planLines(plan);
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /raise/);
  assert.match(lines[1] ?? '', /20% promotion/);
  assert.match(lines[0] ?? '', /\$\d+ to \$\d+/, 'a raise line must name both prices');
  assert.match(lines[1] ?? '', /\$1000 to \$960/, 'a promotion line must name the base and the offer');
});
