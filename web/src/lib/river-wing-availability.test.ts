/**
 * The wing map said "Open" for a part that was sold out.
 *
 * `PublicUnit.nights` is the nights a part is **free**. The map's own input calls its list `taken`, and the component
 * passed the free list straight into it. So every part was inverted: a part with no free nights read "Open on these
 * dates", and a part that was completely free read "Taken on these dates". The part picker below it was correct, so
 * the same page contradicted itself.
 *
 * No test caught it, because `quoteWings` was correct the whole time — it reads `taken` as taken. The defect was in
 * the mapping from the API's vocabulary to the map's, which nothing exercised. This file exercises it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { toWings } from '../components/RiverWingMap.tsx';
import { quoteWings } from './river-wing-map.ts';
import type { PublicUnit } from './booked-nights.ts';
import type { RiverUnitId } from './river-units.ts';

function unit(id: RiverUnitId, nights: string[]): PublicUnit {
  // The Garage Suite's own published ask, so the expected total below is arithmetic anyone can check.
  return {
    id,
    name: `River ${id}`,
    sleeps: 4,
    bedrooms: 1,
    beds: 2,
    baths: 1,
    nightly: 265,
    cleaning: 150,
    minNights: 2,
    rateState: 'ready',
    nights,
  };
}

const NIGHTS = ['2026-12-10', '2026-12-11', '2026-12-12'];

test('a free night is not passed through as a taken night', () => {
  const wings = toWings([unit('main-lodge', NIGHTS)]);
  assert.ok(wings);
  const lodge = wings.find((row) => row.id === 'main-lodge')!;
  for (const night of NIGHTS) {
    assert.equal(lodge.taken.includes(night), false, `${night} was marked taken although the part is free`);
  }
});

test('a sold-out part is marked taken, which is the case that read as open', () => {
  /*
   * The regression in one assertion. A part with no free nights must produce a `taken` list containing the nights
   * the page asks about — otherwise the map offers a stay the booking gate will refuse.
   */
  const wings = toWings([unit('main-lodge', []), unit('garage-suite', NIGHTS)]);
  assert.ok(wings);
  const quote = quoteWings(['main-lodge'], wings, '2026-12-10', '2026-12-13');
  assert.deepEqual(quote.unavailable, ['main-lodge'], 'a sold-out part read as available');
});

test('a free part is offered, and priced', () => {
  const wings = toWings([unit('garage-suite', NIGHTS)]);
  assert.ok(wings);
  const quote = quoteWings(['garage-suite'], wings, '2026-12-10', '2026-12-13');
  assert.deepEqual(quote.unavailable, [], 'a free part read as taken');
  // Three nights at $265 plus a $150 clean. The figure comes from the same `partCost` the accept route uses.
  assert.equal(quote.nights, 3);
  assert.equal(quote.total, 265 * 3 + 150);
});

test('one part free and one sold out cannot be quoted together', () => {
  /*
   * A guest selecting both must be told the pair is unavailable rather than shown a total for a stay that cannot
   * happen. This is the two-part case the map draws as one selection.
   */
  const wings = toWings([unit('main-lodge', []), unit('recreation-wing', NIGHTS)]);
  assert.ok(wings);
  const quote = quoteWings(['main-lodge', 'recreation-wing'], wings, '2026-12-10', '2026-12-13');
  assert.deepEqual(quote.unavailable, ['main-lodge']);
  assert.equal(quote.total, null, 'a blocked pair still produced a total');
});

test('an unread part list is null rather than an empty one', () => {
  // Null means "could not be read" and the page says so; an empty array would read as "no parts for sale".
  assert.equal(toWings(null), null);
});

test('the wing map reports every part, not only the selected ones', () => {
  /*
   * The second half of the same defect, found in the browser after the first was fixed. `quoteWings` answers about the
   * parts it is given, and the map gave it only the *selection* — so with nothing selected, `unavailable` was empty
   * and every card read "Open on these dates", including a part that was sold out. A guest had to select a wing to
   * discover it was taken.
   *
   * The premise, first: quoting an empty selection reports nothing unavailable.
   */
  const wings = toWings([unit('main-lodge', []), unit('recreation-wing', NIGHTS)]);
  assert.ok(wings);
  assert.deepEqual(quoteWings([], wings, '2026-12-10', '2026-12-13').unavailable, [], 'the premise changed');
  // And quoting every part reports the sold-out one, which is what the cards must read from.
  const all = toWings([unit('main-lodge', []), unit('recreation-wing', NIGHTS), unit('garage-suite', NIGHTS)]);
  assert.ok(all);
  assert.deepEqual(quoteWings(['main-lodge', 'recreation-wing', 'garage-suite'], all, '2026-12-10', '2026-12-13').unavailable, ['main-lodge']);

  const source = readFileSync(new URL('../components/RiverWingMap.tsx', import.meta.url), 'utf8');
  assert.match(source, /const everyPart = quoteWings\(ORDER,/, 'the cards no longer quote every part');
  assert.match(source, /const off = everyPart\.unavailable\.includes\(id\)/, 'the card state reads from the selection, not the full list');
  assert.equal(/const off = quote\.unavailable\.includes\(id\)/.test(source), false, 'the card state is back on the selection');
});
