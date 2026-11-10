import assert from 'node:assert/strict';
import test from 'node:test';
import { arriveReady, arriveReadyExtra, arriveReadyNote, readArriveChecks, writeArriveChecks } from './arrive-ready.ts';

test('before arrival uses the published guide and does not send', () => {
  const river = arriveReady('river');
  const text = river.map((step) => step.text).join('\n');
  assert.match(text, /groceries in Orem/);
  assert.match(text, /Winter driving/);
  assert.match(text, /Only toilet paper/);
  assert.match(text, /Quiet hours/);
  assert.equal(text.includes('$'), false);
  assert.equal(/door\s*code|password|wi-?fi/i.test(text), false);
  assert.equal(/\bthe house is open\b/i.test(text), false);
  const extra = arriveReadyExtra('river');
  assert.match(extra, /Winter driving/);
  assert.equal(extra.includes('groceries in Orem'), false);
  assert.equal(extra.includes('$'), false);

  const ranch = arriveReady('ranch').map((step) => step.text).join('\n');
  assert.match(ranch, /cover on when not in use/);
  assert.match(ranch, /do not block neighbors/i);
  assert.equal(ranch.includes('Winter driving'), false);
  assert.equal(ranch.includes('$'), false);

  const lindon = arriveReady('lindon').map((step) => step.text).join('\n');
  assert.match(lindon, /Quiet hours 10 PM to 6 AM/);
  assert.equal(/hot tub/i.test(lindon), false);
});

test('the quote arrival list does not call the house open', () => {
  const quote = arriveReadyNote('quote');
  const phone = arriveReadyNote('phone');
  assert.match(quote, /does not say the house is open/);
  // A check staying on the page is useful to the guest, so it must survive; the plumbing note that
  // used to follow it does not belong on an arrival list.
  assert.match(quote, /A check stays on this page/);
  assert.equal(/Nothing is sent/.test(quote), false);
  assert.equal(quote.includes('$'), false);
  assert.equal(phone.includes('house is open'), false);
  assert.match(phone, /A check stays on this page/);
  const saved = writeArriveChecks(null, 'quote', 'ranch', ['arrival']);
  assert.deepEqual(readArriveChecks(saved, 'quote', 'ranch'), ['arrival']);
  assert.deepEqual(readArriveChecks(saved, 'phone', 'ranch'), []);
  assert.deepEqual(readArriveChecks(JSON.stringify({ ranch: ['arrival'] }), 'phone', 'ranch'), []);
  const both = writeArriveChecks(saved, 'phone', 'ranch', ['parking']);
  assert.deepEqual(readArriveChecks(both, 'quote', 'ranch'), ['arrival']);
  assert.deepEqual(readArriveChecks(both, 'phone', 'ranch'), ['parking']);
});
