import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingRules } from './booking-rules.ts';

test('each house page states the booking rules and leaves the price off', () => {
  const river = bookingRules('river').join('\n');
  const ranch = bookingRules('ranch').join('\n');
  const lindon = bookingRules('lindon').join('\n');
  assert.match(river, /at least 2 nights/);
  assert.match(river, /Thanksgiving is 4 nights/);
  assert.match(river, /Christmas through New Year is 5 nights/);
  assert.match(river, /July 4 week is 4 nights/);
  assert.match(river, /Pioneer Day weekend is 4 nights/);
  assert.match(river, /both weekend nights/);
  assert.match(river, /up to 28 nights/);
  assert.match(ranch, /A weekday can be 1 night/);
  assert.equal(ranch.includes('Thanksgiving'), false);
  assert.equal(lindon, ranch);
  const text = `${river}\n${ranch}`;
  assert.equal(text.includes('$'), false);
  assert.equal(/\bopen\b/i.test(text), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
});
