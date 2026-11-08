import assert from 'node:assert/strict';
import test from 'node:test';
import { jobDoneCount, stepDone } from '../clean.ts';
import { stepIds } from '../clean-progress.ts';

/*
 * **With photo storage off, no turnover could ever reach done.**
 *
 * `stepDone('photos', …)` required `photoCount > 0`. Photo storage is not configured on this deployment, so an upload
 * always answers 503 and `photoCount` can never exceed zero — the step was permanently untickable.
 *
 * The two surfaces then disagreed in public. Measured on production with all seven steps ticked by a cleaner:
 *
 *     desk summary: "1 turnover is done."
 *     the card:     could only count 6 of 7
 *
 * `turnState` and `progressSummary` never applied the photo rule; only the card did. So the summary said the work was
 * finished while the card beside it said one step short, and neither was describing the same rule.
 *
 * Demanding a photo the site cannot accept is not a standard. It is a dead end. When storage is off the tick alone
 * counts, and both surfaces say why.
 */

const steps = stepIds(true).map((id) => ({ id }));

test('the photo step still requires a photo when storage works', () => {
  // The rule is not removed, it is made conditional. A working deployment must still see the evidence.
  assert.equal(stepDone('photos', true, 0), false, 'a tick with no photo counted');
  assert.equal(stepDone('photos', true, 1), true);
  assert.equal(stepDone('photos', false, 3), false, 'an unticked step counted because a photo existed');
});

test('with storage off, the tick alone counts', () => {
  assert.equal(stepDone('photos', true, 0, false), true, 'the photo step is still a dead end');
  assert.equal(stepDone('photos', false, 0, false), false, 'an unticked step counted');
});

test('every other step is unaffected either way', () => {
  for (const hasPhotos of [true, false]) {
    assert.equal(stepDone('beds', true, 0, hasPhotos), true);
    assert.equal(stepDone('beds', false, 0, hasPhotos), false);
  }
});

test('a fully-ticked turn counts seven of seven even with no photo', () => {
  // The production case: a cleaner ticked all seven, storage was off, and the card could only count six.
  const checks: Record<string, boolean> = {};
  for (const step of steps) checks[`turn-1:${step.id}`] = true;
  assert.equal(jobDoneCount(steps, checks, 'turn-1', 0, true), 6, 'with storage on, the photo step should be short');
  assert.equal(jobDoneCount(steps, checks, 'turn-1', 0, false), 7, 'with storage off, all seven must count');
});

test('the default keeps the stricter rule, so a caller that does not know is not loosened', () => {
  /*
   * Only a caller that has confirmed storage is off may relax this. Guessing "off" would silently drop the evidence
   * requirement everywhere the new argument was forgotten.
   */
  assert.equal(stepDone('photos', true, 0), false);
  // With the default (storage assumed on) a photo tick with no photo counts zero, which is the stricter rule.
  assert.equal(jobDoneCount(steps, { 'turn-1:photos': true }, 'turn-1', 0), 0);
  // A non-photo step under the same default still counts.
  assert.equal(jobDoneCount(steps, { 'turn-1:beds': true }, 'turn-1', 0), 1);
});

