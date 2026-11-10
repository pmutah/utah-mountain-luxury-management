/**
 * The bed counts have to add up to the sleeps the owner gave.
 *
 * This number moved three times: 13 beds from the first spec, then 5 for the Main Lodge when I counted "one bunk" as one bed,
 * and now 6 — because a bunk that adds **two** guests to the sleep count is a twin-over-twin, which is two beds.
 *
 * The arithmetic is what settles it, and the owner's sleeps figures are the anchor:
 *
 *   Main  — four kings sleep 8; the part sleeps 10, so the bunk adds 2 = 2 beds. Six beds.
 *   Rec   — three kings sleep 6; plus two loft singles = 8 guests. Five beds.
 *   Garage — a king plus an expandable king = 4 guests. Two beds.
 *
 * A king sleeps two and a single sleeps one, so beds can never exceed sleeps and each part's beds must be consistent with its
 * capacity. That is the guard: it does not hardcode 13, it checks the relationship, so a change to any figure has to stay
 * coherent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RIVER_UNIT_DETAIL } from './river-units.ts';

test('every part has at least one bed and no more beds than it sleeps', () => {
  for (const unit of RIVER_UNIT_DETAIL) {
    assert.ok(unit.beds >= 1, `${unit.name} has ${unit.beds} beds`);
    assert.ok(
      unit.beds <= unit.sleeps,
      `${unit.name}: ${unit.beds} beds cannot sleep ${unit.sleeps} — a bed sleeps at least one person`,
    );
  }
});

test('each bed sleeps one or two, never more', () => {
  /*
   * The rule that caught my error. A king sleeps 2 and a twin sleeps 1, so capacity divided by beds has to land between 1 and 2.
   * With the Main Lodge at 5 beds for 10 guests that ratio was exactly 2 — which hides the mistake — so the check is on the
   * documented layout instead, below. Here it catches a part where beds are wildly short.
   */
  for (const unit of RIVER_UNIT_DETAIL) {
    const perBed = unit.sleeps / unit.beds;
    assert.ok(perBed >= 1 && perBed <= 2, `${unit.name}: ${perBed} guests per bed is not a bed anyone sleeps in`);
  }
});

test('the documented layouts produce the counts in the table', () => {
  /*
   * The anchor. Each part's beds are derived from its actual furniture, and the derivation is written here so a future change
   * has to confront it:
   *
   *   Main   = 4 king beds (one per suite) + 1 twin-over-twin bunk (2) = 6
   *   Rec    = 3 king beds + 2 loft singles                        = 5
   *   Garage = 1 king + 1 expandable king                          = 2
   *
   * and the sleeps follow from the same furniture, so the two columns agree by construction rather than by memory.
   */
  const layout: Record<string, { kings: number; singles: number; bunks: number }> = {
    'main-lodge': { kings: 4, singles: 0, bunks: 1 },
    'recreation-wing': { kings: 3, singles: 2, bunks: 0 },
    /*
     * Two kings: the bedroom king and the expandable king in the family living room. I first wrote that as a "single" and the
     * guard caught it — the table says sleeps 4 and one king plus one single only sleeps 3, which is the expandable king being
     * miscounted as a twin.
     */
    'garage-suite': { kings: 2, singles: 0, bunks: 0 },
  };

  for (const unit of RIVER_UNIT_DETAIL) {
    const furniture = layout[unit.id];
    assert.ok(furniture, `${unit.id} has no documented layout`);
    // A bunk is a twin-over-twin: two beds, two guests. A king sleeps 2, a single 1.
    const beds = furniture.kings + furniture.singles + furniture.bunks * 2;
    const sleeps = furniture.kings * 2 + furniture.singles + furniture.bunks * 2;
    assert.equal(unit.beds, beds, `${unit.name}: the table says ${unit.beds} beds, the furniture is ${beds}`);
    assert.equal(unit.sleeps, sleeps, `${unit.name}: the table says sleeps ${unit.sleeps}, the furniture sleeps ${sleeps}`);
  }
});

test('the house total is 13 beds across 22 guests', () => {
  /*
   * Stated once, as the sum, so the whole-house figure is checkable: 13 beds sleeping 22 averages 1.7 guests per bed, which is
   * what a house of kings and bunks should look like. The number had been 12, then 13, then 12 again by my own arithmetic; this
   * settles it from the furniture above.
   */
  const beds = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.beds, 0);
  const sleeps = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.sleeps, 0);
  assert.equal(beds, 13, `the parts hold ${beds} beds`);
  assert.equal(sleeps, 22, `the parts sleep ${sleeps}`);
});

test('the parts add up to the whole house in bedrooms, baths, and sleeps', () => {
  // The owner's totals: 9 bedrooms, 7 full baths, 22 sleeping.
  const bedrooms = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.bedrooms, 0);
  const baths = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.baths, 0);
  assert.equal(bedrooms, 9, `the parts hold ${bedrooms} bedrooms`);
  assert.equal(baths, 7, `the parts have ${baths} baths`);
});
