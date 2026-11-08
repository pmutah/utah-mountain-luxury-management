import assert from 'node:assert/strict';
import test from 'node:test';
import { openSteps, turnState, turnStateLine, stepIds, type CleanProgress } from '../clean-progress.ts';
import { readFileSync } from 'node:fs';

/*
 * **One card said "The cleaner marked this turn done" above "0 of 7".**
 *
 * Both were on the host's clean desk, about the same turn, at the same moment. The line came from the server — what
 * the cleaner had actually ticked — while the count came from `checks`, this browser's own `sessionStorage`.
 *
 * A cleaner works on their phone. The host's browser holds none of their ticks, so the count was **always zero for
 * real work** while the line above it said done. Measured on production with a fully-ticked turn: `"The cleaner
 * marked this turn done."` and `"0 of 7"`.
 *
 * This file pins the arithmetic that must now back that count, and the wiring that makes the two read one store.
 */

const DAY = '2026-11-22';
const HOUSE = 'lindon' as const;
const SAME_DAY = true;

const row = (done: string[]): CleanProgress[] => [{ house: HOUSE, checkout: DAY, done, updatedAt: '2026-11-08T00:00:00.000Z' }];

test('a fully-ticked turn counts every step, not zero', () => {
  // The production case. Server said 7 of 7; the card said 0.
  const progress = row(stepIds(SAME_DAY));
  const total = stepIds(SAME_DAY).length;
  assert.equal(total - openSteps(HOUSE, DAY, SAME_DAY, progress), total);
  assert.equal(turnState(HOUSE, DAY, SAME_DAY, progress), 'done');
});

test('a partly-ticked turn counts only what the cleaner ticked', () => {
  const progress = row(['window', 'beds']);
  assert.equal(stepIds(SAME_DAY).length - openSteps(HOUSE, DAY, SAME_DAY, progress), 2);
  assert.equal(turnState(HOUSE, DAY, SAME_DAY, progress), 'started');
});

test('a turn with no server row counts zero, and that zero is real', () => {
  // The other direction: a genuine zero must still read as zero, or the fix trades one lie for another.
  assert.equal(stepIds(SAME_DAY).length - openSteps(HOUSE, DAY, SAME_DAY, []), 0);
  assert.equal(turnState(HOUSE, DAY, SAME_DAY, []), 'none');
});

test('a stale id from an older step list does not inflate the count', () => {
  // The route already drops unknown ids; the count must not resurrect them.
  const progress = row(['window', 'beds', 'a-step-that-no-longer-exists']);
  assert.equal(stepIds(SAME_DAY).length - openSteps(HOUSE, DAY, SAME_DAY, progress), 2);
});

test('the card count is wired to the server store, not to local checks', () => {
  /*
   * The defect was a source, not a formula, so the source is what this checks. `serverDoneCount` must consult the
   * progress rows, and the local `checks` map may only be used when the server read failed — in which case the line
   * above the count already says the ticks could not be read.
   */
  const desk = readFileSync(new URL('../../components/CleanDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /function serverDoneCount/, 'the server-backed count is gone');
  assert.match(desk, /openSteps\(job\.house/, 'the count no longer reads the shared progress rule');
  assert.match(
    desk,
    /cleanProgress === null\s*\?\s*jobDoneCount\(job\.steps, checks/,
    'the local checks are no longer confined to the failed-read branch',
  );
});

test('the line and the count describe the same turn from the same rows', () => {
  // Both must be derived from `progressRows`; a line from one store beside a count from another is the whole bug.
  const progress = row(stepIds(SAME_DAY));
  const total = stepIds(SAME_DAY).length;
  const line = turnStateLine(HOUSE, DAY, SAME_DAY, progress);
  const count = total - openSteps(HOUSE, DAY, SAME_DAY, progress);
  assert.match(line, /done/i, `the line did not say done: ${line}`);
  assert.equal(count, total, 'the line says done while the count says otherwise');
});

