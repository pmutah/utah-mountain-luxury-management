import assert from 'node:assert/strict';
import test from 'node:test';
import { codesReady, loadRuleAck, saveRuleAck } from './stay-rules.ts';

test('the door code stays hidden until the rules are read', () => {
  assert.equal(codesReady({ unlocked: true, acknowledged: false }), false);
  assert.equal(codesReady({ unlocked: false, acknowledged: true }), false);
  assert.equal(codesReady({ unlocked: true, acknowledged: true }), true);
});

test('a saved read is kept for that stay only', () => {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: memory, configurable: true });
  saveRuleAck('stay-a', true);
  assert.equal(loadRuleAck('stay-a'), true);
  assert.equal(loadRuleAck('stay-b'), false);
  saveRuleAck('stay-a', false);
  assert.equal(loadRuleAck('stay-a'), false);
  store.set('uml-stay-rules', '{');
  assert.equal(loadRuleAck('stay-a'), false);
});
