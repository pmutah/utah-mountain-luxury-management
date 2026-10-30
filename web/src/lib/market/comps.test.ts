import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseComps } from './comps.ts';
import { compsFor } from './fixtures.ts';

test('an untouched set is the original ten comps', () => {
  const chosen = chooseComps('river', { pinned: [], excluded: [] });
  assert.deepEqual(
    chosen.map((comp) => comp.id),
    compsFor('river').map((comp) => comp.id),
  );
});

test('hiding a comp brings in the next bench home and keeps ten', () => {
  const chosen = chooseComps('river', { pinned: [], excluded: ['river-1'] });
  assert.equal(chosen.length, 10);
  assert.equal(chosen.some((comp) => comp.id === 'river-1'), false);
  assert.equal(chosen.some((comp) => comp.id === 'river-b1'), true);
});

test('a pinned comp stays first', () => {
  const chosen = chooseComps('river', { pinned: ['river-10'], excluded: [] });
  assert.equal(chosen[0]?.id, 'river-10');
  assert.equal(chosen.length, 10);
});
