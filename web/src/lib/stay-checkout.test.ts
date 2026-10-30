import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutDoneCount, checkoutSteps, loadCheckoutChecks, saveCheckoutChecks } from './stay-checkout.ts';

test('checkout lines become steps and blank lines drop', () => {
  const steps = checkoutSteps('Start the dishwasher.\n\nLock the door.\n');
  assert.deepEqual(steps, ['Start the dishwasher.', 'Lock the door.']);
  assert.equal(checkoutDoneCount(steps, [true, false]), 1);
  assert.equal(checkoutSteps('One paragraph.').length, 1);
});

test('checks are saved for that stay only', () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    configurable: true,
  });
  saveCheckoutChecks('stay-a', [true, false]);
  assert.deepEqual(loadCheckoutChecks('stay-a'), [true, false]);
  assert.deepEqual(loadCheckoutChecks('stay-b'), []);
  store.set('uml-stay-checkout', '{');
  assert.deepEqual(loadCheckoutChecks('stay-a'), []);
});
