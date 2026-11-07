import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertCleanFix, upsertHouseFix } from './clean-notes.ts';

test('a blank fix is dropped and a real one stays short', () => {
  const empty = upsertCleanFix([], { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '   ' });
  assert.equal(empty.length, 0);
  const saved = upsertCleanFix(empty, { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '  Hot tub cover is loose.  ' });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.note, 'Hot tub cover is loose.');
  const cleared = upsertCleanFix(saved, { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '' });
  assert.equal(cleared.length, 0);
  const house = upsertHouseFix([], 'river', '  Septic smell in the hall.  ');
  assert.equal(house.refused, false);
  assert.equal(house.notes[0]?.note, 'Septic smell in the hall.');
  const coded = upsertHouseFix(house.notes, 'river', 'door code 4412');
  assert.equal(coded.refused, true);
  assert.equal(coded.notes[0]?.note, 'Septic smell in the hall.');
  const priced = upsertHouseFix(house.notes, 'ranch', 'needs $40 of soap');
  assert.equal(priced.refused, true);
  assert.equal(priced.notes.some((row) => row.house === 'ranch'), false);
  const clearedHouse = upsertHouseFix(house.notes, 'river', '   ');
  assert.equal(clearedHouse.notes.length, 0);
});
