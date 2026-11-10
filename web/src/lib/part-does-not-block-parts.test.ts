/**
 * A part booking must not block the parts it never sold.
 *
 * Two gates sit between a guest and a Riverhouse part request, and they disagreed:
 *
 *   1. `unitRequestCheck` — unit-aware, correctly refused only a clashing part.
 *   2. `holdConflict` — house-level, refused if **any** stay was on those nights.
 *
 * And underneath both, `POST /api/book` built its stay spans without `units`, so every booking read as the whole house
 * before either gate saw it. A host who sold the Garage Suite lost the Recreation Wing and the Main Lodge for those
 * nights, which is the exact opposite of selling the house in parts.
 *
 * Found by trying to book one part while another part was held: the refusal said the part was "already booked" when only
 * a different part was.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { holdConflict } from './booking-hold.ts';
import { occupiedNights } from './availability.ts';
import { unitBlockedNights } from './river-units.ts';

const NOW = new Date('2026-11-10T12:00:00Z');

const WING = {
  propertyId: 'river',
  checkIn: '2027-04-05',
  checkOut: '2027-04-08',
  status: 'confirmed',
  units: ['recreation-wing'],
};

test('a part booking leaves the other parts sellable for a part request', () => {
  const blocked = holdConflict([], [WING as never], 'river', '', '2027-04-05', '2027-04-08', NOW, ['garage-suite']);
  assert.equal(blocked, null, 'the Garage Suite was blocked by a Recreation Wing booking');
});

test('a part booking still blocks the part it actually sold', () => {
  const blocked = holdConflict([], [WING as never], 'river', '', '2027-04-05', '2027-04-08', NOW, ['recreation-wing']);
  assert.equal(blocked, 'river', 'the Recreation Wing did not block itself');
});

test('a whole-house request is still blocked by any stay, which is the safe reading', () => {
  // No units named means the whole house, so every existing behaviour must stand.
  const blocked = holdConflict([], [WING as never], 'river', '', '2027-04-05', '2027-04-08', NOW);
  assert.equal(blocked, 'river', 'a whole-house request ignored a part booking');
});

test('a whole-house booking blocks every part', () => {
  // A stay with no units is the whole house, so nothing is sellable through it.
  const WHOLE = { ...WING, units: undefined };
  for (const unit of ['garage-suite', 'recreation-wing', 'main-lodge']) {
    const blocked = holdConflict([], [WHOLE as never], 'river', '', '2027-04-05', '2027-04-08', NOW, [unit]);
    assert.equal(blocked, 'river', `${unit} was offered on a whole-house booking`);
  }
});

test('a part on other nights does not block', () => {
  const blocked = holdConflict([], [WING as never], 'river', '', '2027-05-01', '2027-05-04', NOW, ['garage-suite']);
  assert.equal(blocked, null, 'a part on other nights blocked these nights');
});

test('the house-level helper still answers house-level questions', () => {
  /*
   * `occupiedNights` is deliberately unit-blind and stays that way: many callers ask "is anything on these nights". This
   * pins that it is unchanged, so the fix above cannot be mistaken for licence to loosen it.
   */
  const nights = occupiedNights([WING as never], 'river', '2027-04-05', '2027-04-08');
  assert.deepEqual(nights, ['2027-04-05', '2027-04-06', '2027-04-07'], 'occupiedNights changed behaviour');

  // And the unit-aware helper gives the narrower answer the part gate needs.
  assert.deepEqual(unitBlockedNights([WING as never], 'garage-suite', '2027-04-05', '2027-04-08'), []);
  assert.equal(unitBlockedNights([WING as never], 'recreation-wing', '2027-04-05', '2027-04-08').length, 3);
});

test('the request route carries units into its stay spans', () => {
  /*
   * The route built spans from `propertyId`, `checkIn`, `checkOut`, and `status` only. Because absent units means the
   * whole house, every part booking was read as the entire house before any gate ran.
   */
  const ROUTE = fs.readFileSync('functions/api/book/index.ts', 'utf8');
  assert.match(ROUTE, /\.\.\.\(stay\.units && stay\.units\.length > 0 \? \{ units: stay\.units \}/, 'the route drops units from its stay spans');
  assert.match(ROUTE, /wantedUnits\.length > 0 && propertyId === 'river'/, 'the route does not pass units to the hold check');
});

test('a part can be recorded with its unit and not silently become the whole house', () => {
  // `POST /api/reservations` dropped `units`, so a part sale recorded by a host blocked all three parts.
  const ROUTE = fs.readFileSync('functions/api/reservations/index.ts', 'utf8');
  assert.match(ROUTE, /units\?: string\[\]/, 'the create route does not accept units');
  assert.match(ROUTE, /body\.propertyId === 'river' && Array\.isArray\(body\.units\)/, 'the create route ignores units');
});
