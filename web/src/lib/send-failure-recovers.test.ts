import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * Email does not send on this deployment - the client secret is invalid - and the send route answered a failed send with
 * the provider's own words: "invalid_client". A host reading that has a guest, a link that was already built, and no
 * stated way to get it to them.
 *
 * Three things have to hold together for the recovery to work, and any one of them failing makes it invisible again:
 *
 *   1. the route returns the link with the failure,
 *   2. the client's `request()` keeps that body on the thrown error, and
 *   3. the desk uses it.
 *
 * The middle one was broken: `request()` threw a bare `Error`, so the link was discarded in transit even though the
 * route sent it.
 */

const SEND = readFileSync(new URL('../../functions/api/surveys/send.ts', import.meta.url), 'utf8');
const API = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const GUESTS = readFileSync(new URL('../components/GuestsPanel.tsx', import.meta.url), 'utf8');

test('a failed send returns the link it already built', () => {
  // Both channels, because either one can be the broken provider.
  const failures = SEND.match(/if \(sent\.error\)/g) ?? [];
  assert.equal(failures.length, 2, 'the two send channels no longer both report a failure');
  const linkReturns = SEND.match(/link,\s*\n\s*canCopy: true,/g) ?? [];
  assert.equal(linkReturns.length, 2, 'a failed send does not return the link');
});

test('a failed send says what to do instead of only what went wrong', () => {
  assert.match(SEND, /alternatives:/, 'the failure names no alternative');
  assert.match(SEND, /Copy it and send it to the guest yourself/, 'the failure does not say the link can be sent by hand');
  // The two channels must point at each other: that is the whole reason for having both.
  assert.match(SEND, /text channel, which uses a different provider/, 'an email failure does not point at SMS');
  assert.match(SEND, /email, which uses a different provider/, 'an SMS failure does not point at email');
});

test('the client keeps the error body on the thrown error', () => {
  /*
   * This is the link in the chain that was broken. A caller could read the message and nothing else, so the route's
   * link never reached the desk.
   */
  const block = API.slice(API.indexOf('if (!res.ok)'), API.indexOf('if (!res.ok)') + 1600);
  assert.match(block, /new Error\(message\) as/, 'the thrown error is still a bare Error');
  assert.match(block, /failure\[key\] = value/, 'the error body fields are dropped');
});

test('the desk uses the link from a failed send', () => {
  assert.match(GUESTS, /failure\.link/, 'the desk ignores the link a failed send returned');
  assert.match(GUESTS, /clipboard\.writeText\(failure\.link\)/, 'the desk does not offer to copy it');
  assert.match(GUESTS, /failure\.alternatives/, 'the desk does not tell the host what to do next');
});
