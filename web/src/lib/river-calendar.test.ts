import assert from 'node:assert/strict';
import test from 'node:test';
import { RIVER_UNITS } from './river-units.ts';
import { riverMonth, riverMonthLine } from './river-calendar.ts';

/*
 * The host calendar's job is to answer "what can I still sell on this date, and why not the rest". A whole-house stay,
 * one part sold, two parts sold, and a maintenance block all make the house unsellable and are four different situations.
 * A calendar that paints them the same colour loses the only information a host needs.
 */

const stay = (over: Record<string, unknown> = {}) => ({
  propertyId: 'river',
  checkIn: '2026-12-10',
  checkOut: '2026-12-13',
  status: 'confirmed',
  ...over,
});

const day = (days: ReturnType<typeof riverMonth>, date: string) => days.find((d) => d.date === date)!;

test('an empty month is open every day and says so', () => {
  const days = riverMonth('2026-12', []);
  assert.equal(days.length, 31);
  for (const d of days) {
    assert.equal(d.houseTaken, false);
    assert.equal(d.closed, false);
    assert.equal(d.freeParts.length, 3);
    // A blank cell reads as "no data", so every day carries a real line.
    assert.match(d.reason, /all three parts free/);
  }
});

test('a whole-house stay takes all three parts and is called the whole house', () => {
  const days = riverMonth('2026-12', [stay()]);
  const tenth = day(days, '2026-12-10');
  assert.equal(tenth.houseTaken, true);
  assert.deepEqual(tenth.freeParts, []);
  assert.equal(tenth.reason, 'Whole house sold.');
  // Check-out day is free: a stay covers nights from check-in up to it.
  assert.equal(day(days, '2026-12-13').houseTaken, false);
});

test('one part sold leaves the other two named as open', () => {
  const days = riverMonth('2026-12', [stay({ units: ['main-lodge'] })]);
  const tenth = day(days, '2026-12-10');
  assert.equal(tenth.houseTaken, true, 'a part booking must still block the whole house');
  assert.deepEqual(tenth.freeParts, ['garage-suite', 'recreation-wing']);
  assert.match(tenth.reason, /Main Lodge sold/);
  assert.match(tenth.reason, /Garage Suite and Recreation Wing still open/);
});

test('two parts sold names only the one left', () => {
  const days = riverMonth('2026-12', [stay({ units: ['main-lodge', 'garage-suite'] })]);
  const tenth = day(days, '2026-12-10');
  assert.deepEqual(tenth.freeParts, ['recreation-wing']);
  assert.match(tenth.reason, /Recreation Wing still open/);
  assert.equal(/Main Lodge sold.*Main Lodge/.test(tenth.reason), false, 'a part was named twice');
});

test('two separate part stays on the same night combine', () => {
  const days = riverMonth('2026-12', [
    stay({ units: ['garage-suite'] }),
    stay({ units: ['main-lodge'], checkIn: '2026-12-11', checkOut: '2026-12-12', status: 'confirmed' }),
  ]);
  // The 10th has one part; the 11th has two.
  assert.deepEqual(day(days, '2026-12-10').freeParts, ['recreation-wing', 'main-lodge']);
  assert.deepEqual(day(days, '2026-12-11').freeParts, ['recreation-wing']);
});

test('a block is called closed, not booked', () => {
  const days = riverMonth('2026-12', [stay({ checkIn: '2026-12-10', checkOut: '2026-12-11', blocked: true })]);
  const tenth = day(days, '2026-12-10');
  assert.equal(tenth.closed, true);
  assert.equal(tenth.reason, 'Closed by the host.');
  assert.equal(/sold/i.test(tenth.reason), false, 'a closed night was called sold');
});

test('a cancelled stay takes nothing', () => {
  const days = riverMonth('2026-12', [stay({ status: 'cancelled' })]);
  for (const d of days) assert.equal(d.freeParts.length, 3, `${d.date} stayed blocked by a cancelled stay`);
});

test('another house never touches the Riverhouse calendar', () => {
  const days = riverMonth('2026-12', [stay({ propertyId: 'ranch' })]);
  for (const d of days) assert.equal(d.houseTaken, false);
});

test('an unknown part name does not take a part it does not name', () => {
  // A stray name is dropped, leaving no listed parts, which reads as the whole house. That is the safe direction.
  const days = riverMonth('2026-12', [stay({ units: ['attic'] })]);
  const tenth = day(days, '2026-12-10');
  assert.equal(tenth.houseTaken, true, 'an unknown part freed the house');
  assert.deepEqual(tenth.freeParts, []);
});

test('today is marked as tonight in the line', () => {
  const days = riverMonth('2026-12', [], '2026-12-10');
  assert.match(day(days, '2026-12-10').reason, /Open tonight/);
  assert.match(day(days, '2026-12-11').reason, /Open:/);
});

test('the month line counts nights a host can still sell, and does not call a part-only night lost', () => {
  const days = riverMonth('2026-12', [
    stay({ checkIn: '2026-12-10', checkOut: '2026-12-12' }),
    stay({ checkIn: '2026-12-13', checkOut: '2026-12-14', units: ['main-lodge'] }),
    stay({ checkIn: '2026-12-15', checkOut: '2026-12-16', blocked: true }),
  ]);
  const line = riverMonthLine(days);
  // 31 days: 2 whole-house, 1 part-only, 1 closed, leaving 27 that still sell whole.
  assert.match(line, /27 nights sell whole/);
  assert.match(line, /1 sells as a part/);
  assert.match(line, /2 are fully sold/);
  assert.match(line, /1 is closed/);
});

test('every day of a month has a real line, so no cell can be blank', () => {
  const days = riverMonth('2026-12', [
    stay({ checkIn: '2026-12-05', checkOut: '2026-12-08' }),
    stay({ checkIn: '2026-12-09', checkOut: '2026-12-10', units: ['garage-suite'] }),
    stay({ checkIn: '2026-12-11', checkOut: '2026-12-12', blocked: true }),
  ]);
  for (const d of days) {
    assert.ok(d.reason.trim().length > 0, `${d.date} has no reason`);
    assert.equal(d.parts.length, RIVER_UNITS.length, `${d.date} did not list every part`);
  }
});

test('a month that cannot be parsed produces nothing rather than a wrong grid', () => {
  assert.deepEqual(riverMonth('not-a-month', []), []);
  assert.equal(riverMonthLine([]), 'No days to show.');
});
