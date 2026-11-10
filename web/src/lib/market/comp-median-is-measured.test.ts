import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarketBoard } from './board.ts';
import { SAMPLE_COMPS } from './fixtures.ts';
import type { HouseId } from './types.ts';

/*
 * The market card's "Comp median" described a market that does not exist.
 *
 * Measured on production 2026-11-10 (`GET /api/market/overview?house=lindon`): `summary.medianAsk` was **$175**, and 86
 * of the 90 nights behind it were priced off the `sample` set - the invented `baseGuest` fields in `fixtures.ts`
 * (`Sample · Lindon family home` is literally `baseGuest: 175`). The host's four real saved comps charged $388-$556.
 *
 * So the card's headline market figure was the median of numbers this repo made up, labelled "Comp median" beside a live
 * calendar. A host acts on that number, which makes it worse than showing nothing.
 *
 * These guards pin the separation: the measured figure is its own field, it is null when nothing was measured, and the
 * surface refuses to print a sample as a market.
 */

const BOARD = readFileSync(join(process.cwd(), 'src', 'lib', 'market', 'board.ts'), 'utf8');
const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'MarketBoard.tsx'), 'utf8');

/** A saved comp of the shape the store returns, so the board sees a real ask source. */
function savedComp(id: string, house: HouseId, sleeps = 16) {
  return { id, label: `Saved ${id}`, propertyId: house, sleeps, distanceMi: 1, platform: 'airbnb', url: `https://example.test/${id}` };
}

test('a house measured on nothing does not report a median', () => {
  /*
   * The Lindon case: a live comp set exists, but no saved ask covers the window, so every night falls back to the sample.
   * The board must say "no measured median" rather than hand back the fixture median.
   */
  const board = buildMarketBoard(
    'lindon',
    '2026-11-10',
    90,
    undefined,
    { comps: [{ id: 'c1', name: 'Saved c1', sleeps: 16, distanceMi: 1, isOwn: false, minNights: 1 }] as never, index: new Map() },
    [],
    undefined,
  );
  assert.equal(board.summary.liveMedianAsk, null, 'a sample-only window reported a measured median');
  assert.equal(board.summary.measuredNights, 0, 'a sample-only window claimed measured nights');
  // The blended figure still exists for callers that want it, and it is the sample number - which is why it must not be
  // the one the surface shows.
  assert.equal(board.summary.medianAsk > 0, true);
});

test('a measured window reports the measured median, not the sample one', () => {
  /*
   * One saved comp with a real ask on every night of the window. The measured median must equal that ask and must differ
   * from the sample-driven `medianAsk`, or the separation has not happened.
   */
  const days = 30;
  const index = new Map<string, Map<string, number>>();
  const byDate = new Map<string, number>();
  const start = new Date('2026-11-10T00:00:00Z');
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    byDate.set(d.toISOString().slice(0, 10), 455);
  }
  index.set('c1', byDate);

  const board = buildMarketBoard(
    'lindon',
    '2026-11-10',
    days,
    undefined,
    { comps: [{ id: 'c1', name: 'Saved c1', sleeps: 16, distanceMi: 1, isOwn: false, minNights: 1 }] as never, index },
    [],
    undefined,
  );
  assert.equal(board.summary.liveMedianAsk, 455, 'the measured median does not equal the only measured ask');
  assert.equal(board.summary.measuredNights, 30, 'measured nights were not counted');
});

test('the surface shows the measured median and refuses to print a sample as a market', () => {
  // It must read the measured field, not the blended one.
  assert.match(PANEL, /summary\.liveMedianAsk/, 'the card does not read the measured median');
  assert.equal(
    /formatWhole\(board\.summary\.medianAsk\)/.test(PANEL),
    false,
    'the card still prints the blended median as the market',
  );
  /*
   * The gate is one expression, used twice (for the value and for the hint). Reading it from the **Comp median** stat's
   * own value expression is what makes this guard real. Two earlier versions passed against a broken value gate: one
   * matched the phrase anywhere in the file, and one sliced from the first `value={` - which belongs to the *previous*
   * stat (ourTypical) - so the slice contained the hint's copy of the gate and looked satisfied.
   */
  const label = PANEL.indexOf('label="Comp median"');
  const valueEnd = PANEL.indexOf('bot="market-median-off"');
  assert.ok(label > 0 && valueEnd > label, 'the Comp median stat could not be located');
  const VALUE = PANEL.slice(label, valueEnd);
  const valueAt = VALUE.indexOf('value={');
  assert.ok(valueAt > 0, 'the Comp median stat has no value expression');
  const VALUE_EXPR = VALUE.slice(valueAt, VALUE.indexOf('hint={', valueAt));
  assert.match(
    VALUE_EXPR,
    /board\.summary\.measuredNights >= 5/,
    'the value does not require a minimum number of measured nights',
  );
  assert.match(VALUE_EXPR, /Not measured yet/, 'the card has no answer for a window that was not measured');
  assert.match(PANEL, /Record asks under Saved comps/, 'the refusal does not say how to fix it');
});

test('the invented sample values are still recognisably samples', () => {
  /*
   * The `$175` came straight from `Sample · Lindon family home`. That fixture is allowed to exist as a fallback - the
   * board needs something to draw before a host saves comps - but every row must be named as a sample so nothing can
   * quietly promote it to a measurement.
   */
  const lindonSamples = SAMPLE_COMPS.filter((comp) => comp.house === 'lindon');
  assert.ok(lindonSamples.length > 0, 'the Lindon sample set disappeared');
  for (const comp of lindonSamples) {
    assert.match(comp.name, /^Sample · /, `${comp.id} is not labelled as a sample`);
  }
  // And the exact figure from the production report, so this test documents where $175 came from.
  assert.equal(
    lindonSamples.some((comp) => comp.baseGuest === 175),
    true,
    'the fixture the $175 figure came from is gone; update the comment in board.ts if that is intended',
  );
});
