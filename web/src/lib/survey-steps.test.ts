import assert from 'node:assert/strict';
import test from 'node:test';
import { vipStepIds } from './survey-steps.ts';

test('the River preference form asks for an arrival time before the last step sends', () => {
  const steps = vipStepIds(['Fishing']);
  assert.equal(steps[3], 'arrive');
  assert.equal(steps[4], 'leave');
  assert.ok(steps.indexOf('leave') < steps.indexOf('else'));
  assert.equal(steps.at(-1), 'else');
  assert.equal(steps.includes('fishing'), true);
  assert.equal(steps.includes('movie'), false);
  assert.equal(steps.includes('popcorn'), false);
});
