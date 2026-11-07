import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementBrief, agreementLine, agreementNote, agreementReadComplete, agreementTopics, visitorLine, visitorQuestion } from './stay-agreement.ts';

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
  assert.deepEqual(ranch, ['occupancy', 'damage', 'place', 'asis', 'belongings', 'safety', 'license', 'release']);
  assert.equal(agreementTopics('lindon').some((topic) => topic.id === 'place'), false);
  assert.match(agreementTopics('river').find((topic) => topic.id === 'place')?.detail ?? '', /does not sign/);
  assert.equal(agreementReadComplete('ranch', ['occupancy', 'damage', 'release']), false);
  assert.equal(agreementReadComplete('ranch', ranch), true);
  const text = agreementTopics('river').map((topic) => topic.detail).join(' ');
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
});

test('a visitor question stays on the occupancy topic', () => {
  assert.equal(visitorQuestion('Can we have visitors?'), true);
  assert.equal(visitorQuestion('Can we bring extra guests?'), true);
  assert.equal(visitorQuestion('Can we bring a dog?'), false);
  const page = visitorLine('page');
  const phone = visitorLine('phone');
  assert.match(page, /The stay is for the guests on the booking/);
  assert.match(page, /This page does not change that count/);
  assert.match(phone, /This phone does not change that count/);
  assert.equal(page.includes('$'), false);
  assert.equal(/allowed|fee|charge/i.test(page), false);
});

test('the quote lists the agreement topics and does not sign them', () => {
  const river = agreementTopics('river', 'page');
  const text = river.map((topic) => `${topic.title}. ${topic.detail}`).join('\n');
  assert.deepEqual(
    river.map((topic) => topic.id),
    ['occupancy', 'damage', 'place', 'asis', 'belongings', 'safety', 'license', 'release'],
  );
  assert.match(text, /This page does not sign/);
  assert.match(text, /septic/);
  assert.match(text, /provided as-is/);
  assert.match(text, /does not cancel the stay unless the host agrees in writing/);
  assert.match(text, /without a refund for a serious rules violation/);
  assert.match(text, /does not insure belongings, vehicles, or cash/);
  assert.match(text, /Travel insurance and medical coverage stay with the guest/);
  assert.match(text, /No lifeguard is on duty/);
  assert.match(text, /No fireworks/);
  assert.match(text, /not a residential lease/);
  assert.match(text, /The stay ends at checkout/);
  assert.equal(text.includes('This phone'), false);
  assert.match(agreementTopics('ranch', 'page').map((topic) => topic.title).join(' '), /Hot tub/);
  assert.equal(agreementTopics('lindon', 'page').some((topic) => topic.id === 'place'), false);
  assert.match(agreementTopics('ranch', 'paper')[0]?.detail ?? '', /This paper does not/);
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
});
