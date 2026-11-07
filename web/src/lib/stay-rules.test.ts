import assert from 'node:assert/strict';
import test from 'node:test';
import { codesReady, conciergeAccessLine, loadRuleAck, saveRuleAck, stayAccessSecrets } from './stay-rules.ts';

test('the door code stays hidden until the rules are read', () => {
  assert.equal(codesReady({ unlocked: true, acknowledged: false }), false);
  assert.equal(codesReady({ unlocked: false, acknowledged: true }), false);
  assert.equal(codesReady({ unlocked: true, acknowledged: true }), true);
  assert.equal(codesReady({ unlocked: true, acknowledged: true, agreementRead: false }), false);
  assert.equal(codesReady({ unlocked: true, acknowledged: true, agreementRead: true }), true);
});

test('the first stay load leaves the door code off, and Nora does not receive it', () => {
  const hidden = stayAccessSecrets({
    unlocked: true,
    ready: false,
    wifiName: 'Ranch',
    wifiPassword: 'secret-pass',
    doorCode: '2468',
    doorNotes: 'Side door',
  });
  assert.equal(hidden.doorCode, null);
  assert.equal(hidden.wifiPassword, null);
  assert.equal(hidden.wifiName, null);
  assert.equal(hidden.doorNotes, null);
  const closed = stayAccessSecrets({
    unlocked: false,
    ready: true,
    wifiName: 'Ranch',
    wifiPassword: 'secret-pass',
    doorCode: '2468',
    doorNotes: 'Side door',
  });
  assert.equal(closed.doorCode, null);
  const shown = stayAccessSecrets({
    unlocked: true,
    ready: true,
    wifiName: ' Ranch ',
    wifiPassword: 'secret-pass',
    doorCode: '2468',
    doorNotes: ' Side door ',
  });
  assert.equal(shown.wifiName, 'Ranch');
  assert.equal(shown.wifiPassword, 'secret-pass');
  assert.equal(shown.doorCode, '2468');
  assert.equal(shown.doorNotes, 'Side door');
  const blank = stayAccessSecrets({
    unlocked: true,
    ready: true,
    wifiName: ' ',
    wifiPassword: '',
    doorCode: '',
    doorNotes: '',
  });
  assert.equal(blank.wifiName, null);
  assert.equal(blank.doorCode, null);
  const nora = conciergeAccessLine('2026-11-30');
  assert.match(nora, /stay on the guest phone/);
  assert.match(nora, /2026-11-30/);
  assert.match(nora, /Do not invent a code/);
  assert.equal(nora.includes('2468'), false);
  assert.equal(nora.includes('secret-pass'), false);
  assert.equal(/code\s*\d/.test(nora), false);
  assert.equal(conciergeAccessLine('soon').includes('soon'), false);
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
