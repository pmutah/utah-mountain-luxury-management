import assert from 'node:assert/strict';
import test from 'node:test';
import { liveCardRows } from './live.ts';

/*
 * Two panels counted saved comps differently and neither said why.
 *
 * The saved-comps panel lists **every** comp the host entered; the band table lists only the ones that can set
 * a band. River showed "6 saved comps" in one and "5 of 5 saved comps" in the other, on the same screen. Both
 * numbers were right, and a host reading them together had no way to know a comp had been left out — or which
 * one, or why. `liveCompLine` already explained it on the comp's own row, but the counts themselves never
 * reconciled.
 *
 * `liveCardRows` now reports `setsBand` as a fact, so the panel states the split instead of a caller guessing
 * it from the prose of a sentence.
 */

const comp = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'A listing',
  area: 'Sundance',
  sleeps: 16,
  beds: 6,
  distanceMi: 2,
  rating: 4.9,
  reviews: 30,
  guestFavorite: false,
  isOwn: false,
  minNights: 1,
  ...over,
});

const nights = ['2026-12-01', '2026-12-02'];

test('a comp too small for the house is listed and marked as not setting the band', () => {
  /*
   * Carpe Montem sleeps 14 against the River House's 24. The rule needs 60% (14.4), so it misses by one guest
   * and is correctly left out of the band — but it was also invisible in the count, which is what made the two
   * panels disagree.
   */
  const rows = liveCardRows([comp({ id: 'big', sleeps: 20 }), comp({ id: 'small', sleeps: 14 })], [], nights, 'river');
  assert.equal(rows.length, 2, 'both comps should be listed');
  const small = rows.find((row) => row.comp.id === 'small')!;
  assert.equal(small.setsBand, false, 'a comp below the 60% rule must not claim to set the band');
  assert.match(small.line, /Not used in the rate band/);
  assert.equal(rows.find((row) => row.comp.id === 'big')!.setsBand, true);
});

test('our own listing is listed and never sets the band', () => {
  const rows = liveCardRows([comp({ isOwn: true })], [], nights, 'river');
  assert.equal(rows[0]!.setsBand, false);
  assert.match(rows[0]!.line, /our own listing/);
});

test('a long-minimum rental is listed and never sets the band', () => {
  const rows = liveCardRows([comp({ minNights: 28 })], [], nights, 'river');
  assert.equal(rows[0]!.setsBand, false);
  assert.match(rows[0]!.line, /28-night stays/);
});

test('a comp that fits but has no ask still counts as able to set the band', () => {
  // These are different facts: fitting is about size and distance, an ask is about a night. A fitting comp
  // with no asks yet contributes nothing *today*, but it is not excluded from the band.
  const rows = liveCardRows([comp({ id: 'unwatched' })], [], nights, 'river');
  assert.equal(rows[0]!.setsBand, true);
  assert.equal(rows[0]!.ask, null);
  assert.match(rows[0]!.line, /No saved ask yet/);
});

test('the ask reported is the first observed one, formatted upstream', () => {
  const rows = liveCardRows(
    [comp({ id: 'c1' })],
    [
      { compId: 'c1', date: '2026-12-01', nightlyRate: 2400 },
      { compId: 'c1', date: '2026-12-02', nightlyRate: 2600 },
    ],
    nights,
    'river',
  );
  assert.equal(rows[0]!.ask, 2400);
});
