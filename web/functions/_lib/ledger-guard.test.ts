import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerSafeToSave } from './ledger-guard.ts';

test('a first write is allowed, because there is nothing to lose', () => {
  /*
   * This used to assert `false`, and that "safety" was wrong in a way nobody saw: on a ledger that
   * had never been written, the turnover-cleaning write was skipped silently, so a fresh deployment
   * had no cleaning expenses and reported zero as though there were nothing to create.
   */
  assert.equal(ledgerSafeToSave([], [{ id: 'clean-1' }]), true);
  assert.equal(ledgerSafeToSave([], [{ id: 'exp-1' }]), true);
  // An empty ledger with no rows is still not a reason to refuse the next write.
  assert.equal(ledgerSafeToSave([], []), true);
});

test('turnover cleaning can be added or dropped without touching the other rows', () => {
  const previous = [{ id: 'exp-1' }, { id: 'clean-old' }];
  assert.equal(ledgerSafeToSave(previous, [{ id: 'exp-1' }, { id: 'clean-new' }]), true);
  assert.equal(ledgerSafeToSave(previous, [{ id: 'exp-1' }]), true);
});

test('a write that drops a saved expense is refused', () => {
  assert.equal(ledgerSafeToSave([{ id: 'exp-1' }, { id: 'exp-2' }], [{ id: 'exp-1' }]), false);
});

test('a ledger of only cleaning rows is not wiped down to nothing', () => {
  // Kept-row count is zero on both sides, so this is the one case the count alone cannot catch: a
  // read that came back holding only derived rows must not be replaced by an empty list.
  assert.equal(ledgerSafeToSave([{ id: 'clean-1' }], []), true);
  assert.equal(ledgerSafeToSave([{ id: 'clean-1' }, { id: 'clean-2' }], [{ id: 'clean-1' }]), true);
});
