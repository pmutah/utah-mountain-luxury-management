import assert from 'node:assert/strict';
import test from 'node:test';
import { riverMonth, riverMonthLine } from './river-calendar.ts';

/*
 * The parts calendar against a month that really happened.
 *
 * These are the four Riverhouse stays on the books in production at the time this was written (verified 2026-11-08), fed
 * through the calendar exactly as the host page feeds them. The point is not that the function adds up — the unit tests
 * cover that — but that real bookings produce a readable, correct month rather than something that only works on
 * synthetic data.
 */

const REAL_STAYS = [
  { propertyId: 'river', checkIn: '2026-11-14', checkOut: '2026-11-16', status: 'confirmed' },
  { propertyId: 'river', checkIn: '2026-11-21', checkOut: '2026-11-24', status: 'confirmed' },
  { propertyId: 'river', checkIn: '2026-11-27', checkOut: '2026-11-30', status: 'confirmed' },
  { propertyId: 'river', checkIn: '2026-12-27', checkOut: '2026-12-30', status: 'confirmed' },
];

test('the real November Riverhouse stays produce a correct month', () => {
  const days = riverMonth('2026-11', REAL_STAYS);
  assert.equal(days.length, 30);
  // Every stay in production is a whole-house stay, so every one of their nights blocks all three parts.
  for (const night of ['2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-27', '2026-11-28', '2026-11-29']) {
    const day = days.find((d) => d.date === night)!;
    assert.equal(day.wholeHouseSold, true, `${night} was not fully sold`);
    assert.deepEqual(day.freeParts, [], `${night} left a part free`);
    assert.equal(day.reason, 'Whole house sold.');
  }
  // A check-out day is free.
  for (const night of ['2026-11-16', '2026-11-24', '2026-11-30', '2026-11-13']) {
    const day = days.find((d) => d.date === night)!;
    assert.equal(day.houseTaken, false, `${night} was blocked by a check-out`);
    assert.equal(day.freeParts.length, 3);
  }
});

test('the real December stay lands on the right nights and leaves the rest open', () => {
  const days = riverMonth('2026-12', REAL_STAYS);
  const sold = days.filter((day) => day.wholeHouseSold).map((day) => day.date);
  assert.deepEqual(sold, ['2026-12-27', '2026-12-28', '2026-12-29']);
  assert.equal(days.find((d) => d.date === '2026-12-30')!.houseTaken, false);
});

test('the month line over real data counts nights a host can still sell', () => {
  const line = riverMonthLine(riverMonth('2026-11', REAL_STAYS));
  // 30 days, 8 fully sold, no parts sold separately, nothing closed.
  assert.match(line, /22 nights sell whole/);
  assert.match(line, /8 are fully sold/);
});

test('a part sold inside a real month shows the other two as open on exactly those nights', () => {
  const withPart = [...REAL_STAYS, { propertyId: 'river', checkIn: '2026-12-10', checkOut: '2026-12-13', status: 'confirmed', units: ['garage-suite'] }];
  const days = riverMonth('2026-12', withPart);
  for (const night of ['2026-12-10', '2026-12-11', '2026-12-12']) {
    const day = days.find((d) => d.date === night)!;
    assert.equal(day.houseTaken, true, `${night} was still sellable as a whole house with a part gone`);
    assert.equal(day.wholeHouseSold, false);
    assert.deepEqual(day.freeParts, ['recreation-wing', 'main-lodge']);
    assert.match(day.reason, /Garage Suite sold, Recreation Wing and Main Lodge still open/);
  }
  // The line must count those three as part-only nights, not as lost nights.
  assert.match(riverMonthLine(days), /3 sell as a part/);
});
