import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAN_LINE_CAP, planLines, type PushNight, type PushPlan } from './push.ts';

/*
 * **"Copy these prices" copied 14 and said nothing about the rest.**
 *
 * `planLines` has always capped at 14 nights, and the panel's button reads "Copy these prices" and then reports
 * "Copied N nights". A house with 34 changing nights would therefore copy 14 prices, confirm success, and leave
 * twenty unmentioned — a host typing them into Airbnb would believe the house was done.
 *
 * Today no house reaches the cap (River 0, Ranch 3, Lindon 7 on production), so this was latent rather than live.
 * Latent is exactly the wrong time to leave it: the silence only surfaces on the day a plan is large.
 *
 * The list now ends with a line that says how many nights were not shown, so a short list can never read as a
 * complete one.
 */

const night = (date: string): PushNight => ({
  house: 'lindon',
  date,
  from: 179,
  to: 193,
  kind: 'raise',
  source: 'live',
  percentileAfter: 40,
  bandP75: 489,
});

const plan = (count: number): PushPlan => ({
  house: 'lindon',
  allowed: true,
  actionable: true,
  sends: false,
  hold: null,
  nights: Array.from({ length: count }, (_, index) => night(`2026-12-${String(index + 1).padStart(2, '0')}`)),
  line: '',
});

test('a plan inside the cap lists every night and adds no notice', () => {
  const lines = planLines(plan(5));
  assert.equal(lines.length, 5, 'a short plan gained or lost a line');
  assert.equal(lines.some((line) => /more nights are in this plan/.test(line)), false, 'a complete list claimed it was short');
});

test('a plan past the cap says how many nights it did not show', () => {
  // The production shape if Lindon ever carried a full month of changes.
  const lines = planLines(plan(34));
  assert.equal(lines.length, PLAN_LINE_CAP + 1, 'the notice was not added, or the cap moved without this test');
  assert.match(lines[lines.length - 1] ?? '', /20 more nights are in this plan and not listed here/);
});

test('the notice is singular for one hidden night', () => {
  const lines = planLines(plan(PLAN_LINE_CAP + 1));
  assert.match(lines[lines.length - 1] ?? '', /1 more night is in this plan/);
});

test('the cap is one constant, so the list and the provenance count cannot drift', () => {
  /*
   * `planProvenance` counts measured versus sample lines within the same slice. Two hardcoded 14s would let one
   * change while the other stayed, and a "3 of 14 lines are not measured" beside a 20-line list is worse than no
   * count at all.
   */
  assert.equal(typeof PLAN_LINE_CAP, 'number');
  assert.equal(PLAN_LINE_CAP, 14);
  const lines = planLines(plan(PLAN_LINE_CAP * 2));
  assert.equal(lines.length, PLAN_LINE_CAP + 1);
});
