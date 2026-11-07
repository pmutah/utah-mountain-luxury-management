import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './board.ts';
import { chooseComps, EMPTY_COMP_CHOICE } from './comps.ts';
import { boardFromOverview, isMarketBoard } from './overview-client.ts';

test('the overview is used only for the default comp set', () => {
  const from = '2026-11-04';
  const local = buildMarketBoard('river', from, 90);
  const remote = { ...local, summary: { ...local.summary, raiseNights: 4242 } };
  const defaults = chooseComps('river', EMPTY_COMP_CHOICE);
  const used = boardFromOverview('river', from, 90, defaults, remote);
  assert.equal(used.summary.raiseNights, 4242);
  assert.equal(isMarketBoard(remote, 'river'), true);
  assert.equal(isMarketBoard(remote, 'ranch'), false);
  assert.equal(isMarketBoard({ house: 'river', source: 'sample' }, 'river'), false);
  assert.equal(isMarketBoard({ ...remote, source: 'invented' }, 'river'), false);
  assert.equal(isMarketBoard({ ...remote, source: 'live' }, 'river'), true);

  const hidden = chooseComps('river', { pinned: [], excluded: ['river-1'] });
  const kept = boardFromOverview('river', from, 90, hidden, remote);
  assert.equal(kept.summary.raiseNights === 4242, false);
  assert.equal(kept.comps.some((comp) => comp.id === 'river-1'), false);
  assert.equal(JSON.stringify(kept).includes('$'), false);
});

test('a live overview is what the board shows when the comp set is the default', () => {
  const from = '2026-11-04';
  const local = buildMarketBoard('river', from, 90);
  const live = {
    ...local,
    source: 'live' as const,
    nights: local.nights.map((night) => ({ ...night, source: 'live' as const })),
    summary: { ...local.summary, liveNights: local.nights.length, liveComps: 3 },
  };
  const defaults = chooseComps('river', EMPTY_COMP_CHOICE);
  const used = boardFromOverview('river', from, 90, defaults, live);
  assert.equal(used.source, 'live');
  assert.equal(used.summary.liveComps, 3);
});
