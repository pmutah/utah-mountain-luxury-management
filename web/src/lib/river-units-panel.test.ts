import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { blankUnitRates, sellableUnits, toUnitRates, unitRateLine } from './river-unit-rates.ts';
import { RIVER_UNIT_DETAIL } from './river-units.ts';

/*
 * The Riverhouse parts panel is the only place a host can price a unit, so the two failures that matter most are:
 *
 *   1. a unit with no price rendered as a number (a guest could book a free or invented night), and
 *   2. the panel claiming a block or a rate reaches Airbnb, Vrbo, or Hospitable when nothing does.
 *
 * Both are checked here against the panel source rather than the rendered DOM, because these are claims written
 * into the copy, and copy is what a host acts on.
 */

const PANEL = readFileSync(new URL('../components/RiverUnitsPanel.tsx', import.meta.url), 'utf8');

test('the panel never renders a zero or a guess for a unit with no rate', () => {
  // The input is seeded from the saved rate, and a null rate becomes a blank field, never `0`.
  assert.match(PANEL, /saved === null \? '' : String\(saved\)/, 'a null rate stopped rendering as a blank field');
  // A blank field is skipped by the save, so it can never be sent as a zero.
  assert.match(PANEL, /if \(raw === ''\) continue;/, 'a blank field is no longer skipped, so it could save as zero');
});

test('the units panel says it publishes nothing to another channel', () => {
  assert.match(PANEL, /publishNote/, 'the panel stopped showing the route\'s publish note');
  const fallback = PANEL.match(/publishes|Nothing is sent to Hospitable/gi) ?? [];
  assert.ok(fallback.length > 0, 'the panel can claim a channel send it cannot make');
});

test('a unit with no price reads as not sellable, in the same words the route uses', () => {
  // The panel renders `rateLine` verbatim, so the sentence and the state cannot drift apart.
  assert.match(PANEL, /\{unit\.rateLine\}/, 'the panel builds its own price sentence instead of showing the route\'s');
  for (const unit of RIVER_UNIT_DETAIL) {
    const line = unitRateLine(blankUnitRates()[unit.id]);
    assert.match(line, /Not sellable yet/);
    assert.equal(/\$0\b/.test(line), false, `${unit.name} described an unpriced unit with a zero`);
  }
});

test('every unit the panel can show has a real capacity and a listing it belongs to', () => {
  const rates = blankUnitRates();
  assert.deepEqual(sellableUnits(rates), [], 'an unpriced unit was sellable');
  for (const unit of RIVER_UNIT_DETAIL) {
    assert.ok(unit.sleeps > 0, `${unit.name} has no capacity`);
    assert.match(unit.airbnbListingId, /^\d{10,}$/, `${unit.name} lost its Airbnb draft id`);
  }
  // A stored zero or negative is not a rate: it must read back as null, so the unit stays unsellable.
  const zeroed = toUnitRates({ 'garage-suite': { nightly: 0, cleaning: 0, minNights: 0 } });
  assert.equal(zeroed['garage-suite'].nightly, null, 'a stored nightly of 0 read back as a real price');
  assert.equal(sellableUnits(zeroed).includes('garage-suite'), false, 'a zero-priced unit was sellable');
});

test('the panel compares the parts total with the house, from one source', () => {
  /*
   * The three parts sleep 22 and the house sleeps 22, so the note no longer appears — but the comparison must stay, because
   * it is what would catch the figures drifting apart again. The constant is read from `SLEEPS` rather than written down, so
   * the panel cannot compare against a capacity no other surface uses.
   */
  assert.match(PANEL, /HOUSE_SLEEPS = SLEEPS\.river/, 'the house capacity is not read from SLEEPS');
  assert.doesNotMatch(PANEL, /HOUSE_SLEEPS = \d/, 'the house capacity is a literal again, so it can drift');
  assert.match(PANEL, /sleepsTotal !== HOUSE_SLEEPS/, 'the capacity comparison is gone');
  assert.match(PANEL, /river-units-capacity/, 'the capacity note lost its hook, so it can vanish unnoticed');
});
