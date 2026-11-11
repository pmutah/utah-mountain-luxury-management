import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The part picker only matters if the choice reaches the server. It did not at first: the guest could choose a part,
 * see its price, and submit a plain whole-house request, because `units` was never added to the POST body.
 *
 * These are source guards on the booking page, because the defect was a missing field in a payload rather than a wrong
 * value in a function — the kind of thing a unit test of the pure helpers cannot see.
 */

const PAGE = readFileSync(new URL('../components/DirectBook.tsx', import.meta.url), 'utf8');

test('the chosen part is sent with the request', () => {
  assert.match(PAGE, /\.\.\.\(bookingParts \? \{ units: chosenParts \} : \{\}\)/, 'the part choice never reaches POST /api/book');
});

test('a whole-house request sends no units field, so it stays the request it always was', () => {
  // The spread is conditional. An unconditional `units: []` would be a different request body for every guest.
  assert.equal(/units: chosenParts,/.test(PAGE), false, 'units is sent unconditionally');
  assert.match(PAGE, /bookingParts \? \{ units: chosenParts \}/);
});

test('a part booking can submit when the whole house is refused', () => {
  // The whole-house quote refuses a house that is entirely taken, which is exactly when a guest looks at the parts.
  assert.match(PAGE, /const submitReady = requestReady \|\| partBookingReady;/, 'a part booking cannot submit');
  /*
   * The submit path reads one readiness value that is derived from `submitReady`, so a part booking still passes. Asserting
   * the derivation rather than the identifier keeps this test about the behaviour: `sendReady` is `submitReady` plus the bot
   * check, and reverting to the whole-house-only flag would drop the part path.
   */
  assert.match(PAGE, /const sendReady = submitReady && !botBlocked;/, 'readiness no longer derives from submitReady');
  assert.match(PAGE, /if \(!sendReady\) return;/, 'the submit handler gates on a flag that is not submitReady-derived');
  assert.match(PAGE, /disabled=\{busy \|\| !sendReady\}/, 'the button is still disabled for a valid part booking');
});

test('a part booking does not show the whole-house refusal', () => {
  assert.match(PAGE, /const requestHold = submitReady/, 'the hold line still renders while a part is chosen');
});

test('the part picker never offers a part the gate would refuse', () => {
  assert.match(PAGE, /data-available=\{offer\.available \? 'yes' : 'no'\}/);
  assert.match(PAGE, /disabled=\{!offer\.available\}/, 'an unavailable part has an enabled Choose button');
});

test('an unreadable part list is reported, not hidden', () => {
  assert.match(PAGE, /parts === null &&/, 'a part list that could not be read renders as no parts');
  assert.match(PAGE, /stay-parts-paused/, 'the page has no way to say the part prices were unreadable');
});

test('the part total is not shown when a chosen part has no price', () => {
  assert.match(PAGE, /stay-parts-unpriced/, 'an unpriced chosen part has no message, so the total would just go missing');
  assert.match(PAGE, /partTotal === null/, 'the null total is not handled');
});

test('the party is warned when the parts are too small', () => {
  assert.match(PAGE, /stay-parts-capacity/, 'a party larger than the chosen parts is not warned');
});
