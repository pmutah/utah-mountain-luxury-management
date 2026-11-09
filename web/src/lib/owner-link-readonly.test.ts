import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * An owner link is a credential in a URL. Todd forwards it, or it sits in an inbox, so what it can do has to be exactly
 * what it should: read his statement and nothing else.
 *
 * Verified against a live server: GET answers 200, and POST, PUT, DELETE, and PATCH all answer 405. This test holds that
 * shape, because adding an export handler for "convenience" would quietly turn a read-only link into a write credential.
 */

const ROUTE = readFileSync(new URL('../../functions/api/owner/[token].ts', import.meta.url), 'utf8');

test('an owner link can only be read', () => {
  assert.match(ROUTE, /export const onRequestGet/, 'the owner route has no GET');
  for (const method of ['onRequestPost', 'onRequestPut', 'onRequestDelete', 'onRequestPatch', 'onRequestAll']) {
    assert.equal(new RegExp(`export const ${method}`).test(ROUTE), false, `the owner link can now ${method.replace('onRequest', '')}`);
  }
});

test('the token is the whole credential, and a malformed one is refused', () => {
  // It validates through a named helper rather than a loose truthiness check, so the shape is checked before any lookup.
  assert.match(ROUTE, /isOwnerToken\(token\)/, 'the owner route no longer validates the token shape');
  assert.match(ROUTE, /if \(!isOwnerToken\(token\)\) return corsJson\(request, \{ error: '[^']*not valid[^']*' \}, 404\)/, 'an invalid token is not refused as invalid');
});

test('the statement is built for the owner view, which excludes Lindon', () => {
  /*
   * Lindon is Brandon's own house and has no partner split. `buildOwnerStatement` filters to ranch and river; this checks
   * the route uses that builder rather than a general portfolio one.
   */
  assert.match(ROUTE, /buildOwnerStatement/, 'the owner route no longer uses the owner statement builder');
});

test('no guest name, door code, or Wi-Fi reaches the owner payload', () => {
  for (const forbidden of ['guestName', 'doorCode', 'wifiPassword', 'guestEmail']) {
    assert.equal(ROUTE.includes(forbidden), false, `the owner route now reads ${forbidden}`);
  }
});
