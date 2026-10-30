import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { proposeGuestRate } from './propose.ts';
import { percentileValue } from './stats.ts';

test('percentile value sits between the neighbors', () => {
  assert.equal(percentileValue([100, 200, 300, 400], 0), 100);
  assert.equal(percentileValue([100, 200, 300, 400], 100), 400);
  assert.equal(percentileValue([100, 200, 300, 400], 50), 250);
});

test('a raise never jumps more than 8 percent and never drops the base', () => {
  const result = proposeGuestRate({
    ourGuest: 1000,
    compRates: [1400, 1500, 1600, 1700, 1800],
    floorGuest: 800,
    ceilingGuest: 3000,
    targetPercentile: 80,
    maxMove: 0.08,
    lockBase: false,
  });
  assert.equal(result.action, 'raise');
  assert.equal(result.proposedGuest, 1080);
});

test('the floor stops a cut and a holiday stays locked', () => {
  const locked = proposeGuestRate({
    ourGuest: 4000,
    compRates: [1000, 1100, 1200, 1300],
    floorGuest: 1800,
    ceilingGuest: 8000,
    targetPercentile: 85,
    maxMove: 0.08,
    lockBase: true,
  });
  assert.equal(locked.action, 'locked');
  assert.equal(locked.proposedGuest, 4000);
});

test('the river board prices June weekends above the sample canyon comps', () => {
  const board = buildMarketBoard('river', '2026-06-05', 14);
  const friday = board.nights.find((night) => night.date === '2026-06-05');
  assert.ok(friday);
  assert.equal(friday.season, 'June and July peak');
  assert.ok(friday.ourGuest > friday.median);
  assert.equal(friday.proposedGuest >= friday.ourGuest, true);
  assert.equal(friday.minNights, 4);
  assert.equal(board.comps.length, 10);
  assert.equal(board.source, 'sample');
});

test('a locked holiday does not move', () => {
  const board = buildMarketBoard('river', '2026-12-24', 3);
  const christmas = board.nights[0];
  assert.equal(christmas?.action, 'locked');
  assert.equal(christmas?.proposedGuest, christmas?.ourGuest);
});
