import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanJobView } from '../clean-link.ts';
import { keepDone, stepIds, stepRows } from '../clean-progress.ts';

/*
 * **A cleaner's tick reported success and saved nothing.**
 *
 * `GET /api/clean/:token` returned `steps` as plain label strings — "Strip and remake every bed". `POST` filters
 * whatever it is given against `stepIds(sameDay)` — `window`, `beds`, `linens`, `kitchen`, `baths`, `floors`,
 * `photos` — and drops the rest. So a client could only ever echo a label, every tick was discarded, and the route
 * still answered `ok: true` with a row whose `done` was empty.
 *
 * Measured on production, same route: labels gave `done: []`, ids gave `done: ["beds","window"]`.
 *
 * This is worse than a visible failure. A cleaner ticks seven boxes, sees them light up, and the desk sees zero —
 * and there is nothing on their phone to say the work did not register.
 */

const DAY = '2026-11-22';

test('the cleaner payload carries the id each step is ticked by', () => {
  const job = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'en' })!;
  assert.ok(Array.isArray(job.stepRows) && job.stepRows.length > 0, 'the payload has no tick ids at all');
  const ids = stepIds(true);
  assert.deepEqual(
    job.stepRows.map((row) => row.id),
    ids,
    'the ids do not match what the route accepts',
  );
  // And the label is still there for the guest-facing half of the page.
  for (const row of job.stepRows) assert.ok(row.label.length > 0, `step ${row.id} has no label`);
});

test('a tick built from the payload actually persists', () => {
  /*
   * The end-to-end assertion, without a server: take the ids the payload offers, hand them to the same filter the
   * route uses, and require that they survive.
   */
  const job = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'en' })!;
  const fromPayload = job.stepRows.slice(0, 2).map((row) => row.id);
  const kept = keepDone('lindon', DAY, job.sameDay, fromPayload);
  assert.ok(kept, 'the route refused a real turnover');
  assert.deepEqual(kept!.done, [...fromPayload].sort(), 'the tick was filtered away — this is the production bug');
});

test('the labels would have been dropped, which is why ids are not optional', () => {
  /*
   * The failing case, pinned so nobody "simplifies" the payload back to labels. If this ever starts passing, the
   * route has changed and the payload rule should be revisited.
   */
  const job = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'en' })!;
  const kept = keepDone('lindon', DAY, job.sameDay, job.steps);
  assert.ok(kept);
  assert.deepEqual(kept!.done, [], 'labels are accepted by the route now — the payload rule needs revisiting');
});

test('a Spanish payload has the same ids as the English one', () => {
  // A tick must not depend on which language the cleaner reads.
  const en = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'en' })!;
  const es = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'es' })!;
  assert.deepEqual(es.stepRows.map((row) => row.id), en.stepRows.map((row) => row.id));
  assert.notDeepEqual(es.stepRows.map((row) => row.label), en.stepRows.map((row) => row.label));
});

test('a same-day turn has the deadline step and a normal turn does not', () => {
  const same = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 0, lang: 'en' })!;
  const gap = cleanJobView({ house: 'lindon', checkout: DAY, gapNights: 3, lang: 'en' })!;
  assert.equal(same.stepRows[0]!.id, 'window', 'the same-day deadline step is missing its id');
  assert.equal(gap.stepRows.some((row) => row.id === 'window'), false, 'a gap turn was given the deadline step');
  // `stepRows` and `steps` must agree in length, or the labels and ids drift apart.
  assert.equal(same.stepRows.length, same.steps.length);
  assert.equal(gap.stepRows.length, gap.steps.length);
});

