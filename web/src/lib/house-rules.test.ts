import assert from 'node:assert/strict';
import test from 'node:test';
import { directRequestReady, houseRules, rulesNote } from './house-rules.ts';

test('each house publishes its own rules and the request waits for them', () => {
  assert.equal(houseRules('river').some((rule) => rule.text.includes('septic')), true);
  assert.equal(houseRules('ranch').some((rule) => rule.text.includes('hot tub')), true);
  assert.equal(houseRules('lindon').some((rule) => rule.text.includes('No parties')), true);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: false, calendarLoading: false, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: true, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: false, rulesRead: true, calendarLoading: false, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, partyOk: false }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, partyOk: true }), true);
  assert.match(rulesNote('ranch'), /House rules read:.*Quiet hours 10 PM to 8 AM/);
  assert.match(rulesNote('ranch'), /hot tub/);
  assert.match(rulesNote('river'), /septic/);
  assert.match(rulesNote('lindon'), /No parties/);
  assert.equal(/password|door code/i.test(rulesNote('river')), false);
});
