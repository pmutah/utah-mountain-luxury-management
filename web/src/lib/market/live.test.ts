import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bandSource,
  boardSourceLine,
  indexSnaps,
  liveAsk,
  liveCompFits,
  liveCardRows,
  liveCompLine,
  mergedCompCount,
  liveCoverage,
  toLiveComp,
  toLiveComps,
  toLiveSnaps,
} from './live.ts';
import { buildMarketBoard } from './board.ts';
import { isMarketBoard } from './overview-client.ts';

const TODAY = '2026-11-07';
const DATE = '2026-11-21';

const savedComp = {
  id: 'comp-1',
  label: 'Timpanogos lodge',
  sleeps: 16,
  bedrooms: 6,
  distanceMi: 2.4,
  rating: 4.9,
  reviews: 40,
  area: 'Sundance',
};

test('saved comps become cards with their ask and coverage, and a comp with no ask says so', () => {
  const comps = toLiveComps([
    { id: 'c1', label: 'Sundance lodge', sleeps: 18, distanceMi: 2.4, area: 'Sundance', guestFavorite: true },
    { id: 'c2', label: 'Vivian Park', sleeps: 16, distanceMi: 0.9, area: 'Vivian Park' },
    { id: 'c3', label: 'Too far', sleeps: 18, distanceMi: 44, area: 'Midway' },
  ]);
  const nights = ['2026-12-01', '2026-12-02', '2026-12-03'];
  const snaps = toLiveSnaps([
    { compId: 'c1', date: '2026-12-01', nightlyRate: 2100 },
    { compId: 'c1', date: '2026-12-02', nightlyRate: 2400 },
  ]);
  const rows = liveCardRows(comps, snaps, nights, 'river');
  assert.equal(rows.length, 3);
  const first = rows[0]!;
  assert.equal(first.comp.id, 'c1');
  assert.equal(first.coverage, 2);
  assert.equal(first.ask, 2100);
  assert.match(first.line, /2 nights have a saved ask/);
  const second = rows.find((row) => row.comp.id === 'c2')!;
  assert.equal(second.coverage, 0);
  assert.equal(second.ask, null);
  assert.match(second.line, /No saved ask yet/);
  const far = rows.find((row) => row.comp.id === 'c3')!;
  assert.match(far.line, /Not used in the rate band/);
  assert.equal(JSON.stringify(rows).includes('$'), false);
});

test('the count line names saved comps, not samples, once one exists', () => {
  assert.equal(mergedCompCount(10, 0), '10 sample comps.');
  assert.equal(mergedCompCount(0, 1), '1 saved comp.');
  assert.equal(mergedCompCount(0, 3), '3 saved comps.');
  assert.equal(mergedCompCount(4, 2), '2 saved comps and 4 samples.');
});

test('a saved comp needs a sleep count and a distance', () => {
  const live = toLiveComp(savedComp);
  assert.ok(live);
  assert.equal(live.sleeps, 16);
  assert.equal(live.distanceMi, 2.4);
  assert.equal(live.name, 'Timpanogos lodge');
  assert.equal(toLiveComp({ ...savedComp, sleeps: undefined }), null);
  assert.equal(toLiveComp({ ...savedComp, distanceMi: undefined }), null);
  assert.equal(toLiveComp({ ...savedComp, sleeps: 0 }), null);
  assert.equal(toLiveComp({ ...savedComp, sleeps: 400 }), null);
  assert.equal(toLiveComp({ ...savedComp, distanceMi: -1 }), null);
  assert.equal(toLiveComp({ ...savedComp, id: '' }), null);
  assert.equal(toLiveComp(null), null);
});

test('a saved comp that names no area or rating does not invent one', () => {
  const live = toLiveComp({ id: 'c', sleeps: 14, distanceMi: 3 });
  assert.ok(live);
  assert.equal(live.area, 'Nearby');
  assert.equal(live.rating, 0);
  assert.equal(live.reviews, 0);
  assert.equal(live.guestFavorite, false);
  assert.equal(live.beds, 0);
});

test('an observed ask needs a real date and a real rate', () => {
  const snaps = toLiveSnaps([
    { compId: 'comp-1', date: '2026-12-01', nightlyRate: 1450 },
    { compId: 'comp-1', date: '2026-13-01', nightlyRate: 1450 },
    { compId: 'comp-1', date: '2026-02-30', nightlyRate: 1450 },
    { compId: 'comp-1', date: '2026-12-02', nightlyRate: 0 },
    { compId: 'comp-1', date: '2026-12-03', nightlyRate: -20 },
    { compId: 'comp-1', date: '2026-12-04', nightlyRate: 999999 },
    { compId: '', date: '2026-12-05', nightlyRate: 900 },
    { compId: 'comp-1' },
    null,
  ]);
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0]!.nightlyRate, 1450);
  assert.deepEqual(toLiveSnaps('nope'), []);
});

test('the index keeps the latest ask per comp and night', () => {
  const index = indexSnaps(
    toLiveSnaps([
      { compId: 'comp-1', date: '2026-12-01', nightlyRate: 1450 },
      { compId: 'comp-1', date: '2026-12-01', nightlyRate: 1520 },
      { compId: 'comp-2', date: '2026-12-01', nightlyRate: 980 },
    ]),
  );
  assert.equal(liveAsk(index, 'comp-1', '2026-12-01'), 1520);
  assert.equal(liveAsk(index, 'comp-2', '2026-12-01'), 980);
  assert.equal(liveAsk(index, 'comp-3', '2026-12-01'), null);
  assert.equal(liveAsk(index, 'comp-1', '2026-12-09'), null);
});

test('coverage counts only the nights the comp actually watched', () => {
  const index = indexSnaps(
    toLiveSnaps([
      { compId: 'comp-1', date: '2026-12-01', nightlyRate: 1450 },
      { compId: 'comp-1', date: '2026-12-03', nightlyRate: 1600 },
    ]),
  );
  const cover = liveCoverage(index, 'comp-1', ['2026-12-01', '2026-12-02', '2026-12-03']);
  assert.equal(cover.dates, 2);
  assert.equal(cover.first, '2026-12-01');
  assert.equal(cover.last, '2026-12-03');
  assert.equal(liveCoverage(index, 'comp-9', ['2026-12-01']).dates, 0);
});

test('a comp fits the band only when it sleeps close and sits near', () => {
  assert.equal(liveCompFits('river', 16, 2.4), true);
  assert.equal(liveCompFits('river', 5, 2.4), false);
  assert.equal(liveCompFits('river', 16, 40), false);
  assert.equal(liveCompFits('lindon', 8, 3), true);
  assert.equal(liveCompFits('lindon', 4, 3), false);
});

test('a comp line says when there is no saved ask and never invents a rate', () => {
  const live = toLiveComp(savedComp)!;
  const none = liveCompLine(live, 0, 'river');
  assert.match(none, /No saved ask yet/);
  assert.equal(none.includes('$'), false);
  const some = liveCompLine(live, 3, 'river');
  assert.match(some, /3 nights have a saved ask/);
  const one = liveCompLine(live, 1, 'river');
  assert.match(one, /1 night has a saved ask/);
  const far = liveCompLine(toLiveComp({ ...savedComp, distanceMi: 45 })!, 5, 'river');
  assert.match(far, /Not used in the rate band/);
  assert.equal(far.includes('$'), false);
});

test('the board names which source set the band', () => {
  assert.equal(bandSource(0), 'sample');
  assert.equal(bandSource(4), 'live');
  assert.match(boardSourceLine('sample', 0, 0), /Every ask in this band is a sample/);
  assert.match(boardSourceLine('live', 4, 2), /2 saved comps on 4 nights/);
  assert.match(boardSourceLine('mixed', 1, 1), /keeps the sample, so this band is mixed/);
  for (const line of [boardSourceLine('sample', 0, 0), boardSourceLine('live', 3, 1), boardSourceLine('mixed', 9, 2)]) {
    assert.equal(line.includes('$'), false);
  }
});

test('one saved ask is not the market', () => {
  /*
   * A single recorded ask replaced the whole band, so the board showed a confident median, p25 and
   * p75 all equal to that one number and labelled the night `live`. Pricing was saved only by
   * `proposeGuestRate` holding under three comps, so the display claimed a market it was not acting
   * on. It is still shown â€” hiding the host's own ask would be worse â€” but it is called `thin`.
   */
  const comps = Array.from({ length: 1 }, (_, i) => ({
    id: `c${i}`,
    name: `Comp ${i}`,
    area: 'Provo Canyon',
    sleeps: 20,
    beds: 5,
    distanceMi: 2,
    rating: 4.8,
    reviews: 30,
    guestFavorite: false,
  }));
  const live = { comps, index: indexSnaps([{ compId: 'c0', date: DATE, nightlyRate: 4000 }]) };
  const night = buildMarketBoard('river', TODAY, 30, undefined, live as never).nights.find((n) => n.date === DATE)!;

  assert.equal(night.source, 'thin', 'a single ask was presented as a live band');
  assert.equal(night.compRates.length, 1);
  assert.equal(night.action, 'hold', 'the rate moved on a band of one');
  assert.equal(night.proposedGuest, night.ourGuest, 'a single ask changed the price');
  assert.match(boardSourceLine('thin', 1, 1), /too few to read a band from/);
  assert.match(boardSourceLine('thin', 1, 1), /the rate holds/);
});

test('two saved asks are still too few, and three is a band', () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      name: `Comp ${i}`,
      area: 'Provo Canyon',
      sleeps: 20,
      beds: 5,
      distanceMi: 2,
      rating: 4.8,
      reviews: 30,
      guestFavorite: false,
    }));
  const two = {
    comps: mk(2),
    index: indexSnaps([
      { compId: 'c0', date: DATE, nightlyRate: 4000 },
      { compId: 'c1', date: DATE, nightlyRate: 900 },
    ]),
  };
  const n2 = buildMarketBoard('river', TODAY, 30, undefined, two as never).nights.find((x) => x.date === DATE)!;
  assert.equal(n2.source, 'thin', 'two asks were presented as a live band');
  assert.equal(n2.action, 'hold');

  const three = {
    comps: mk(3),
    index: indexSnaps([
      { compId: 'c0', date: DATE, nightlyRate: 3000 },
      { compId: 'c1', date: DATE, nightlyRate: 3200 },
      { compId: 'c2', date: DATE, nightlyRate: 3400 },
    ]),
  };
  const n3 = buildMarketBoard('river', TODAY, 30, undefined, three as never).nights.find((x) => x.date === DATE)!;
  assert.equal(n3.source, 'live', 'three asks were not treated as a band');
  assert.equal(n3.compRates.length, 3);
  assert.equal(n3.median, 3200, 'the median of three asks was not the middle one');
});

test('a night with no saved ask is still the sample, and says so', () => {
  const plain = buildMarketBoard('river', TODAY, 30).nights.find((n) => n.date === DATE)!;
  assert.equal(plain.source, 'sample');
  assert.match(boardSourceLine('sample', 0, 0), /Every ask in this band is a sample/);
});

test('the client accepts every band source the type allows', () => {
  /*
   * `isMarketBoard` listed the sources by hand. Adding `thin` to the type made it reject the whole
   * board on any night with one or two saved asks, so a saved ask would have blanked the market page
   * instead of labelling the night. A hand-written list must be checked against the type it mirrors.
   */
  const sources = ['sample', 'live', 'mixed', 'thin'] as const;
  for (const source of sources) {
    const payload = {
      house: 'river',
      source,
      from: TODAY,
      days: 30,
      nights: [{ date: DATE, ourGuest: 2486 }],
      comps: [{ id: 'c1' }],
    };
    assert.equal(isMarketBoard(payload, 'river'), true, `the client rejects the "${source}" source`);
  }
  // And it still refuses something it does not know, so the check is not vacuous.
  assert.equal(
    isMarketBoard({ house: 'river', source: 'guessed', from: TODAY, days: 30, nights: [{ date: DATE, ourGuest: 1 }], comps: [{ id: 'c' }] }, 'river'),
    false,
  );
});

