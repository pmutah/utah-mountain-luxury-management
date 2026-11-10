import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RIVER_UNITS,
  RIVER_UNIT_DETAIL,
  riverAvailability,
  unitBookingConflict,
  unitBlockedNights,
  unitsTakenBy,
  wholeHouseBlockedNights,
  type UnitSpan,
} from './river-units.ts';

/*
 * The Riverhouse can be sold whole or as three units, and the only rule that matters is that a night is never sold
 * twice. These are the acceptance tests from the spec, written against the truth table.
 *
 * Every case is derived from one `UnitSpan` list — the same shape `availability.ts` already uses — so there is no
 * second calendar to drift.
 */

const WEEK = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'];
const FROM = '2026-12-01';
const UNTIL = '2026-12-31';

const stay = (over: Partial<UnitSpan> = {}): UnitSpan => ({
  propertyId: 'river',
  checkIn: '2026-12-07',
  checkOut: '2026-12-12',
  status: 'confirmed',
  ...over,
});

test('an empty calendar sells the whole house and every unit', () => {
  const a = riverAvailability([], FROM, UNTIL);
  assert.deepEqual(a.wholeHouse, daysBetween(FROM, UNTIL));
  for (const unit of RIVER_UNITS) assert.deepEqual(a.units[unit], daysBetween(FROM, UNTIL));
});

test('a whole-house booking blocks the whole house and all three units (rule 1)', () => {
  const spans = [stay()];
  const a = riverAvailability(spans, FROM, UNTIL);
  for (const night of WEEK) {
    assert.equal(a.wholeHouse.includes(night), false, `${night} still sellable as the house`);
    for (const unit of RIVER_UNITS) {
      assert.equal(a.units[unit].includes(night), false, `${night} still sellable as ${unit}`);
      assert.equal(a.freeUnitsByNight[night], 0);
    }
  }
});

test('a unit booking blocks the whole house and itself, and leaves the other two (rules 2 and 3)', () => {
  const a = riverAvailability([stay({ units: ['garage-suite'] })], FROM, UNTIL);
  for (const night of WEEK) {
    assert.equal(a.wholeHouse.includes(night), false, 'the house stayed sellable over a unit booking');
    assert.equal(a.units['garage-suite'].includes(night), false, 'the booked unit stayed sellable');
    assert.equal(a.units['recreation-wing'].includes(night), true, 'Recreation Wing was blocked too');
    assert.equal(a.units['main-lodge'].includes(night), true, 'Main Lodge was blocked too');
    assert.equal(a.freeUnitsByNight[night], 2);
  }
});

test('two units together block both and the house, and leave the third (rule 4)', () => {
  const a = riverAvailability([stay({ units: ['garage-suite', 'recreation-wing'] })], FROM, UNTIL);
  for (const night of WEEK) {
    assert.equal(a.wholeHouse.includes(night), false);
    assert.equal(a.units['garage-suite'].includes(night), false);
    assert.equal(a.units['recreation-wing'].includes(night), false);
    assert.equal(a.units['main-lodge'].includes(night), true, 'the remaining unit was blocked');
    assert.equal(a.freeUnitsByNight[night], 1);
  }
});

test('all three units booked leave nothing sellable (rule 5)', () => {
  const a = riverAvailability([stay({ units: [...RIVER_UNITS] })], FROM, UNTIL);
  for (const night of WEEK) {
    assert.equal(a.wholeHouse.includes(night), false);
    assert.equal(a.freeUnitsByNight[night], 0);
  }
});

test('cancelling a unit frees the house and that unit again (acceptance 4)', () => {
  const booked = [stay({ units: ['recreation-wing'] })];
  const cancelled = [stay({ units: ['recreation-wing'], status: 'cancelled' })];
  assert.equal(riverAvailability(booked, FROM, UNTIL).units['recreation-wing'].includes('2026-12-08'), false);
  const a = riverAvailability(cancelled, FROM, UNTIL);
  assert.equal(a.units['recreation-wing'].includes('2026-12-08'), true, 'a cancelled unit stayed blocked');
  assert.equal(a.wholeHouse.includes('2026-12-08'), true, 'a cancelled unit kept the house blocked');
});

test('a whole-house stay with no units field blocks every unit — existing bookings need no migration', () => {
  /*
   * Every reservation already on the books predates this feature, so it carries no `units`. The spec's acceptance
   * test 6 names Dec 28, 2026 – Jan 2, 2027; the same shape applies to all of them, and reading "no units" as "the
   * whole house" is what makes that true without touching the stored rows.
   */
  const a = riverAvailability(
    [{ propertyId: 'river', checkIn: '2026-12-28', checkOut: '2027-01-02', status: 'confirmed' }],
    '2026-12-25',
    '2027-01-05',
  );
  for (const night of ['2026-12-28', '2026-12-30', '2027-01-01']) {
    for (const unit of RIVER_UNITS) {
      assert.equal(a.units[unit].includes(night), false, `${unit} sellable inside the existing stay on ${night}`);
    }
  }
});

test('a unit on one night does not block the whole house on another', () => {
  // Rule 2 is per night. A Garage booking over the weekend must not freeze the following week.
  const a = riverAvailability([stay({ checkIn: '2026-12-07', checkOut: '2026-12-10', units: ['garage-suite'] })], FROM, UNTIL);
  assert.equal(a.wholeHouse.includes('2026-12-08'), false);
  assert.equal(a.wholeHouse.includes('2026-12-10'), true, 'the checkout day was blocked');
  assert.equal(a.wholeHouse.includes('2026-12-11'), true);
});

test('the Ranch and Lindon are untouched by any Riverhouse unit logic', () => {
  const spans = [
    { propertyId: 'ranch', checkIn: '2026-12-07', checkOut: '2026-12-12' },
    { propertyId: 'lindon', checkIn: '2026-12-07', checkOut: '2026-12-12' },
  ];
  const a = riverAvailability(spans, FROM, UNTIL);
  assert.deepEqual(a.wholeHouse, daysBetween(FROM, UNTIL), 'a Ranch or Lindon stay reached the Riverhouse');
  for (const unit of RIVER_UNITS) assert.deepEqual(a.units[unit], daysBetween(FROM, UNTIL));
});

test('a proposed unit booking is refused on an occupied night, and allowed on a free one', () => {
  const spans = [stay({ checkIn: '2026-12-07', checkOut: '2026-12-10', units: ['main-lodge'] })];
  const clash = unitBookingConflict(
    spans,
    { units: ['main-lodge'], checkIn: '2026-12-09', checkOut: '2026-12-11' },
    FROM,
    UNTIL,
  );
  assert.ok(clash, 'an overlapping booking of the same unit was allowed');
  assert.equal(clash!.unit, 'main-lodge');
  assert.equal(clash!.night, '2026-12-09');

  const free = unitBookingConflict(
    spans,
    { units: ['garage-suite'], checkIn: '2026-12-09', checkOut: '2026-12-11' },
    FROM,
    UNTIL,
  );
  assert.equal(free, null, 'a different unit on the same nights was refused');
});

test('two units in one booking are checked as one request, and both must be free', () => {
  // Spec rule 6: Main Lodge + Recreation Wing is one reservation. If either is taken, the pair cannot be sold.
  const spans = [stay({ units: ['recreation-wing'] })];
  const pair = unitBookingConflict(
    spans,
    { units: ['main-lodge', 'recreation-wing'], checkIn: '2026-12-08', checkOut: '2026-12-10' },
    FROM,
    UNTIL,
  );
  assert.ok(pair, 'a pair including a taken unit was allowed');
  assert.equal(pair!.unit, 'recreation-wing');
});

test('no units named means the whole house, in both directions', () => {
  assert.deepEqual(unitsTakenBy({ propertyId: 'river', checkIn: '2026-12-07', checkOut: '2026-12-08' }), [...RIVER_UNITS]);
  assert.deepEqual(
    unitsTakenBy({ propertyId: 'river', checkIn: '2026-12-07', checkOut: '2026-12-08', wholeHouse: true }),
    [...RIVER_UNITS],
  );
  assert.deepEqual(unitsTakenBy({ propertyId: 'ranch', checkIn: '2026-12-07', checkOut: '2026-12-08' }), []);
});

test('the two helpers agree with the full availability computation', () => {
  // One rule, expressed twice for different callers; they must not drift.
  const spans = [stay({ units: ['garage-suite', 'main-lodge'] })];
  const a = riverAvailability(spans, FROM, UNTIL);
  assert.deepEqual(wholeHouseBlockedNights(spans, FROM, UNTIL), daysBetween(FROM, UNTIL).filter((d) => !a.wholeHouse.includes(d)));
  assert.deepEqual(
    unitBlockedNights(spans, 'recreation-wing', FROM, UNTIL),
    daysBetween(FROM, UNTIL).filter((d) => !a.units['recreation-wing'].includes(d)),
  );
});

test('the unit facts are the ones the owner confirmed', () => {
  /*
   * Corrected by the owner on 2026-11-10. The first spec had the Main Lodge at 13 with an expandable king and a triple twin
   * bunk that are not in the house; it sleeps 10, in four bedrooms and three baths. So the parts sum to 22, which is what the
   * whole house sleeps — the two figures agree now instead of the parts outnumbering the house by one.
   */
  assert.equal(RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.sleeps, 0), 22);
  assert.deepEqual(
    RIVER_UNIT_DETAIL.map((unit) => `${unit.id}:${unit.sleeps}:${unit.bedrooms}:${unit.baths}`),
    ['garage-suite:4:1:1', 'recreation-wing:8:4:3', 'main-lodge:10:4:3'],
  );
});

function daysBetween(from: string, until: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  for (let d = start; d < end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
