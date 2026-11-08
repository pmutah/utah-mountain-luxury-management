import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildMarketBoard } from './board.ts';
import { compFitSummary } from './comp-fit.ts';

/*
 * The comp table described comps the board was not using.
 *
 * `buildMarketBoard` built `cards` from `listed` — the sample fixtures — unconditionally. So a house with
 * saved comps showed a ten-row table of listings named **"Sample · River bench home"** beside a band computed
 * from real asks, and the daily text said **"5 of 10 saved comps sleep close"** about a list containing no
 * saved comps at all. A host comparing their house against that table was comparing against nothing.
 *
 * Found by reading the rendered page, not the source: the JSON said `liveComps: 5` next to ten cards whose
 * every name began with "Sample · ".
 */

const comp = (over: Record<string, unknown> = {}) => ({
  id: 'saved-1',
  name: 'Real listing',
  area: 'Sundance',
  beds: 6,
  sleeps: 16,
  rating: 4.9,
  reviews: 40,
  guestFavorite: true,
  distanceMi: 1.2,
  isOwn: false,
  minNights: 1,
  ...over,
});

test('saved comps replace the sample table rather than sitting beside it', () => {
  const board = buildMarketBoard('river', '2026-12-01', 30, undefined, {
    comps: [comp({ id: 'a', name: 'A' }), comp({ id: 'b', name: 'B', sleeps: 18 })],
    index: new Map([
      ['a', new Map([['2026-12-01', 2400]])],
      ['b', new Map([['2026-12-01', 2600]])],
    ]),
  });

  assert.equal(board.summary.liveComps, 2);
  assert.equal(board.comps.length, 2, 'the table still carries the ten sample rows');

  for (const card of board.comps) {
    assert.equal(card.name.startsWith('Sample · '), false, `"${card.name}" is an invented comp on a live board`);
  }
  assert.deepEqual(board.comps.map((card) => card.name).sort(), ['A', 'B']);
});

test('a saved comp card carries the ask it was observed asking, not a fabricated one', () => {
  const board = buildMarketBoard('river', '2026-12-01', 30, undefined, {
    comps: [comp({ id: 'a', name: 'A' })],
    index: new Map([
      [
        'a',
        new Map([
          ['2026-12-01', 2000],
          ['2026-12-02', 2400],
        ]),
      ],
    ]),
  });
  const card = board.comps[0]!;
  assert.equal(card.nextWeekendAsk, 2200, 'the card ask should be the median of the observed asks');
  assert.equal(card.inBand, true, 'a fitting saved comp should be marked as banding');
});

test('a saved comp that is ours is shown but never marked as banding', () => {
  const board = buildMarketBoard('river', '2026-12-01', 30, undefined, {
    comps: [comp({ id: 'mine', name: 'Our own listing', isOwn: true })],
    index: new Map([['mine', new Map([['2026-12-01', 2400]])]]),
  });
  const card = board.comps[0]!;
  assert.equal(card.inBand, false, 'our own listing cannot set the band');
});

test('a house with no saved comp still shows the sample table rather than nothing', () => {
  const board = buildMarketBoard('river', '2026-12-01', 30);
  assert.equal(board.summary.liveComps, 0);
  assert.equal(board.comps.length, 10, 'the pre-comp page should still render a table');
  assert.equal(board.comps.every((card) => card.name.startsWith('Sample · ')), true);
});

test('the fit line uses the noun that matches the comps behind it', () => {
  /*
   * `compFitSummary` defaulted to "sample comps". Two of three call sites forgot to pass the kind, so the
   * same page said "saved comps" in the digest and "4 of 4 sample comps" in the caption beneath the table —
   * about the same four listings. The kind is now **required**, so the compiler finds the next caller.
   */
  const saved = buildMarketBoard('river', '2026-12-01', 30, undefined, {
    comps: [comp({ id: 'a' }), comp({ id: 'b' }), comp({ id: 'c' }), comp({ id: 'd' })],
    index: new Map([['a', new Map([['2026-12-01', 2400]])]]),
  });
  assert.equal(saved.summary.liveComps, 4);
  const line = compFitSummary('river', saved.comps, saved.summary.liveComps > 0 ? 'saved' : 'sample');
  assert.match(line, /saved comp/);
  assert.equal(line.includes('sample comp'), false, 'a saved board described itself as samples');

  const sampleOnly = buildMarketBoard('river', '2026-12-01', 30);
  assert.match(compFitSummary('river', sampleOnly.comps, 'sample'), /sample comp/);
});

test('no call site can describe real comps as samples by forgetting an argument', () => {
  /*
   * The guard for the *shape* of the mistake rather than one instance of it. A default of `'sample'` is wrong
   * for every caller that has saved comps, and three of them existed. `kind` is a required parameter now, so a
   * future two-argument call is a compile error — this reads the call sites so the intent survives even if
   * someone reintroduces a default.
   */
  for (const file of ['../../components/MarketBoard.tsx', '../agent-brief.ts', '../guide-desk.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const call of source.match(/compFitSummary\([^)]*\)/g) ?? []) {
      assert.match(call, /'(sample|saved)'/, `${file} calls compFitSummary without naming the kind: ${call}`);
    }
  }
  const helper = readFileSync(new URL('./comp-fit.ts', import.meta.url), 'utf8');
  assert.equal(
    /kind:\s*'sample'\s*\|\s*'saved'\s*=/.test(helper),
    false,
    'the kind parameter grew a default again, which is how real comps got described as samples',
  );
});
