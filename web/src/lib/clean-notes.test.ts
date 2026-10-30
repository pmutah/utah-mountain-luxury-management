import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertCleanFix } from './clean-notes.ts';

test('a blank fix is dropped and a real one stays short', () => {
  const empty = upsertCleanFix([], { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '   ' });
  assert.equal(empty.length, 0);
  const saved = upsertCleanFix(empty, { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '  Hot tub cover is loose.  ' });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.note, 'Hot tub cover is loose.');
  const cleared = upsertCleanFix(saved, { id: 'job', house: 'Lindon', checkout: '2026-11-07', note: '' });
  assert.equal(cleared.length, 0);
});
