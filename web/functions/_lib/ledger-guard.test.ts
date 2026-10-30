import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerSafeToSave } from './ledger-guard.ts';

test('an empty read cannot replace the ledger', () => {
  assert.equal(ledgerSafeToSave([], [{ id: 'clean-1' }]), false);
  assert.equal(ledgerSafeToSave([], []), false);
});

test('turnover cleaning can be added or dropped without touching the other rows', () => {
  const previous = [{ id: 'exp-1' }, { id: 'clean-old' }];
  assert.equal(ledgerSafeToSave(previous, [{ id: 'exp-1' }, { id: 'clean-new' }]), true);
  assert.equal(ledgerSafeToSave(previous, [{ id: 'exp-1' }]), true);
});

test('a write that drops a saved expense is refused', () => {
  assert.equal(ledgerSafeToSave([{ id: 'exp-1' }, { id: 'exp-2' }], [{ id: 'exp-1' }]), false);
});
