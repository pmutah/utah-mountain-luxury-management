import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementBrief, agreementLine, agreementNote, agreementReadComplete, agreementTopics } from './stay-agreement.ts';

test('the stay agreement is named and not signed from these pages', () => {
  assert.match(agreementLine('ranch', 'page'), /hot tub/);
  assert.doesNotMatch(agreementLine('ranch', 'page'), /the river/);
  assert.match(agreementLine('river', 'phone'), /the river/);
  assert.match(agreementLine('river', 'phone'), /This phone does not sign it/);
  assert.match(agreementLine('lindon', 'paper'), /This paper does not sign it/);
  assert.doesNotMatch(agreementLine('lindon', 'paper'), /hot tub|the river/);
  assert.match(agreementNote('ranch'), /Stay agreement not signed.*hot tub/);
  assert.match(agreementBrief(), /Nothing here signs it/);
  assert.equal(/password|door code/i.test(`${agreementLine('river', 'page')} ${agreementBrief()}`), false);
  assert.equal(agreementBrief().includes('Guest'), false);
});

test('agreement topics can be read on the phone without signing', () => {
  const ranch = agreementTopics('ranch').map((topic) => topic.id);
  assert.deepEqual(ranch, ['occupancy', 'damage', 'place', 'release']);
  assert.equal(agreementTopics('lindon').some((topic) => topic.id === 'place'), false);
  assert.match(agreementTopics('river').find((topic) => topic.id === 'place')?.detail ?? '', /does not sign/);
  assert.equal(agreementReadComplete('ranch', ['occupancy', 'damage', 'release']), false);
  assert.equal(agreementReadComplete('ranch', ranch), true);
  const text = agreementTopics('river').map((topic) => topic.detail).join(' ');
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
});
