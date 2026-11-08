import assert from 'node:assert/strict';
import test from 'node:test';
import { batchRows, decideBatch } from './rate-batch.ts';
import { withApprovedRates, type ApprovedRate } from './rate-sheet.ts';

/*
 * A batch approval is a convenience with a hazard: it hides the independent checks behind it.
 *
 * The ladder needed one approval per night per day, so a seven-night plan climbing two weeks was ~100
 * single-night calls — the kind of work a host abandons halfway. This covers the batch path, and specifically
 * the two ways it could go wrong: a refused night swallowed silently, and a per-night write loop that thrashes
 * KV (which is what produced the transient 503s I hit on production).
 */

const CARD = 179;
const FLOOR = 51;
const card = () => ({ guest: CARD, floorGuest: FLOOR });

const sheetRow = (date: string, guest: number): ApprovedRate => ({
  house: 'lindon',
  date,
  guest,
  approvedAt: '2026-11-01T00:00:00.000Z',
});

test('a batch approves every night it can and keeps each night its own decision', () => {
  const plan = decideBatch({
    house: 'lindon',
    requested: [
      { date: '2026-12-08', guest: 193 },
      { date: '2026-12-09', guest: 193 },
    ],
    sheet: [],
    card,
  });
  assert.equal(plan.approved, 2);
  assert.equal(plan.refused, 0);
  assert.deepEqual(
    plan.nights.map((night) => `${night.date}|${night.ok}|${night.written}`),
    ['2026-12-08|true|193', '2026-12-09|true|193'],
  );
  assert.match(plan.line, /2 nights were approved/);
});

test('a booked night in the middle of a batch is refused, named, and does not stop the others', () => {
  /*
   * The hazard in one test. If the batch had skipped this silently, a host would believe all three landed and a
   * guest would be quoted a price on a night that is already let.
   */
  const plan = decideBatch({
    house: 'lindon',
    requested: [
      { date: '2026-12-08', guest: 193 },
      { date: '2026-12-09', guest: 193 },
      { date: '2026-12-10', guest: 193 },
    ],
    sheet: [],
    card,
    taken: ['2026-12-09'],
  });
  assert.equal(plan.approved, 2);
  assert.equal(plan.refused, 1);
  const middle = plan.nights.find((night) => night.date === '2026-12-09')!;
  assert.equal(middle.ok, false);
  assert.match(middle.reason ?? '', /booked or closed/);
  assert.match(plan.line, /2 nights were approved; 1 was refused/);
});

test('a batch climbs from an approved base, not from the card', () => {
  /*
   * The exact production bug, in the batch path. With $193 already approved, the next 8% step is $208. Measured
   * against the $179 card it would be refused, and the ladder would break at its second rung again.
   */
  const plan = decideBatch({
    house: 'lindon',
    requested: [{ date: '2026-12-09', guest: 208 }],
    sheet: [sheetRow('2026-12-09', 193)],
    card,
  });
  assert.equal(plan.nights[0]!.base, 193, 'the batch measured from the card');
  assert.equal(plan.nights[0]!.ok, true, 'the second rung was refused again');
  assert.equal(plan.nights[0]!.written, 208);
});

test('a batch still refuses a single jump past the cap', () => {
  const plan = decideBatch({
    house: 'lindon',
    requested: [{ date: '2026-12-09', guest: 421 }],
    sheet: [],
    card,
  });
  assert.equal(plan.approved, 0);
  assert.equal(plan.refused, 1);
  assert.match(plan.line, /No night was approved/);
  assert.match(plan.nights[0]!.reason ?? '', /8%/);
});

test('a refused night reports the price that still stands, not the one it wanted', () => {
  /*
   * `written` is what the guest will actually be quoted. For a refused night that is the base, so a caller
   * cannot accidentally write the requested number.
   */
  const plan = decideBatch({
    house: 'lindon',
    requested: [{ date: '2026-12-09', guest: 421 }],
    sheet: [sheetRow('2026-12-09', 300)],
    card,
  });
  assert.equal(plan.nights[0]!.ok, false);
  assert.equal(plan.nights[0]!.written, 300, 'a refused night must keep the standing price');
  assert.match(plan.nights[0]!.reason ?? '', /already approved at \$300/);
});

test('the batch writes only approved rows', () => {
  const plan = decideBatch({
    house: 'lindon',
    requested: [
      { date: '2026-12-08', guest: 193 },
      { date: '2026-12-09', guest: 900 },
    ],
    sheet: [],
    card,
  });
  const rows = batchRows(plan, '2026-11-08T00:00:00.000Z');
  assert.deepEqual(
    rows.map((row) => `${row.date}|${row.guest}`),
    ['2026-12-08|193'],
    'a refused night reached the write',
  );
});

test('many rows replace existing nights in one pass', () => {
  /*
   * `withApprovedRates` exists so a seven-night plan is **one** KV write. A per-night loop rewrote the whole
   * value each time, which is what produced transient 503s on production.
   */
  const before = [sheetRow('2026-12-08', 179), sheetRow('2026-12-09', 193), { ...sheetRow('2026-12-10', 179) }];
  const { sheet, dropped } = withApprovedRates(before, [
    { house: 'lindon', date: '2026-12-09', guest: 208, approvedAt: '2026-11-08T00:00:00.000Z' },
    { house: 'lindon', date: '2026-12-11', guest: 179, approvedAt: '2026-11-08T00:00:00.000Z' },
  ]);
  assert.equal(dropped, 0);
  const byDate = new Map(sheet.map((row) => [row.date, row.guest]));
  assert.equal(byDate.get('2026-12-09'), 208, 'the replaced night kept its old price');
  assert.equal(byDate.get('2026-12-11'), 179, 'the new night was not written');
  assert.equal(byDate.get('2026-12-08'), 179, 'an untouched night was changed');
  assert.equal(sheet.length, 4, 'a replace must not duplicate a night');
  // One answer per night is the invariant the sheet exists to keep.
  assert.equal(new Set(sheet.map((row) => `${row.house}|${row.date}`)).size, sheet.length);
});
