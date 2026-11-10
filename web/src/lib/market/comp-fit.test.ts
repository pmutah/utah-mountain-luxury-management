import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { bandComps, compFitLine, compFitSummary, isCloseSleep, isNearby } from './comp-fit.ts';
import { compsFor } from './fixtures.ts';

test('a house that sleeps far fewer guests is left out of the band', () => {
  const river = compsFor('river');
  const band = bandComps('river', river);
  assert.equal(band.narrowed, true);
  assert.equal(band.used.every((comp) => isCloseSleep('river', comp.sleeps) && isNearby(comp.distanceMi)), true);
  /*
   * The threshold moves with the house. `isCloseSleep` asks a comp to sleep at least 60% of the house, so at 22 guests that
   * is 13.2 rather than the 15 it was when the house was published at 25. A 14-sleeper is genuinely close to a 22-guest
   * house, so this asserts the rule rather than a fixed number.
   */
  assert.equal(band.used.some((comp) => !isCloseSleep('river', comp.sleeps) || comp.distanceMi > 10), false);
  assert.ok(band.used.length >= 4);
  assert.ok(band.used.length < river.length);
  const summary = compFitSummary('river', river);
  assert.match(summary, /within 10 miles/);
  assert.match(summary, /The rate band uses those/);
  assert.equal(summary.includes('$'), false);
  assert.match(compFitLine('river', 10, 2, false), /smaller house/);
  assert.match(compFitLine('river', 16, 14, false), /Too far/);
  assert.match(compFitLine('river', 22, 3, true), /Close enough to compare/);
  assert.equal(compFitLine('river', 10, 2, false).includes('$'), false);
});

test('fewer than four close samples keeps the full list in the band', () => {
  const thin = [
    { sleeps: 22, distanceMi: 2 },
    { sleeps: 10, distanceMi: 2 },
    { sleeps: 8, distanceMi: 14 },
    { sleeps: 6, distanceMi: 3 },
  ];
  const band = bandComps('river', thin);
  assert.equal(band.narrowed, false);
  assert.equal(band.used.length, 4);
  assert.match(compFitSummary('river', thin), /keeps the full list/);
  assert.match(compFitLine('river', 10, 2, true), /Kept because fewer than 4/);
});

test('the river board still lists ten samples and prices only the close ones', () => {
  const board = buildMarketBoard('river', '2026-06-05', 14);
  assert.equal(board.comps.length, 10);
  assert.equal(board.fit.narrowed, true);
  assert.equal(board.fit.compared, 10);
  assert.ok(board.fit.close >= 4);
  assert.equal(board.fit.close, board.comps.filter((comp) => comp.inBand).length);
  const friday = board.nights.find((night) => night.date === '2026-06-05');
  assert.ok(friday);
  assert.ok(friday.compRates.length <= board.fit.close);
  assert.equal(friday.proposedGuest >= friday.ourGuest, true);
  const small = board.comps.find((comp) => comp.sleeps < 15);
  assert.equal(small?.inBand, false);
  assert.equal(small?.fit, 'small');
  const far = board.comps.find((comp) => comp.distanceMi > 10);
  assert.equal(far?.inBand, false);
  assert.equal(far?.fit, 'far');
});
