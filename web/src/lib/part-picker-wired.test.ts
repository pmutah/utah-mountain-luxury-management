import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The part picker only matters if the choice reaches the server. It did not at first: the guest could choose a part,
 * see its price, and submit a plain whole-house request, because `units` was never added to the POST body.
 *
 * These are source guards on the booking card, because the defect was a missing field in a payload rather than a wrong
 * value in a function — the kind of thing a unit test of the pure helpers cannot see. They were retargeted from the old
 * `/book/` page when `/book/` began rendering this card, so the properties are unchanged and the identifiers match the
 * component that now owns them.
 */

const PAGE = readFileSync(new URL('../components/DirectReserveCard.tsx', import.meta.url), 'utf8');

test('the chosen part is sent with the request', () => {
  assert.match(PAGE, /\.\.\.\(bookingParts \? \{ units: chosenParts \} : \{\}\)/, 'the part choice never reaches POST /api/book');
});

test('a whole-house request sends no units field, so it stays the request it always was', () => {
  // The spread is conditional. An unconditional `units: []` would be a different request body for every guest.
  assert.equal(/units: chosenParts,/.test(PAGE), false, 'units is sent unconditionally');
  assert.match(PAGE, /bookingParts \? \{ units: chosenParts \}/);
});

test('a part booking can submit when the whole house is refused', () => {
  /*
   * The whole-house quote refuses a house that is entirely taken, which is exactly when a guest looks at the parts.
   * The card has two readiness paths — one for the house, one for the chosen parts — and the submit gate must accept
   * either.
   */
  assert.match(PAGE, /const partReady =/, 'the part readiness path is gone, so a part can never be requested');
  assert.match(PAGE, /const houseReady =/, 'the house readiness path is gone');
  assert.match(PAGE, /const submitReady = Boolean\(partReady \|\| houseReady\)/, 'readiness no longer accepts either path');
  assert.match(PAGE, /if \(!sendReady\) return;/, 'the submit handler does not gate on readiness');
  assert.match(PAGE, /disabled=\{busy \|\| !sendReady\}/, 'the button is enabled when the request cannot work');
});

test('a part booking is not blocked by the whole-house refusal', () => {
  // The refusal belongs to the house path only; a part guest must not be held by a quote about the whole house.
  const at = PAGE.indexOf('data-bot="stay-quote-blocked"');
  assert.ok(at > 0, 'the whole-house refusal lost its hook');
  const blocked = PAGE.slice(Math.max(0, at - 300), at + 60);
  assert.match(blocked, /!bookingParts/, 'the whole-house refusal renders while a part is chosen');
});

test('the part picker never offers a part the gate would refuse', () => {
  assert.match(PAGE, /data-available=\{offer\.available \? 'yes' : 'no'\}/);
  assert.match(PAGE, /disabled=\{!offer\.available\}/, 'an unavailable part has an enabled Choose button');
});

test('an unreadable part list is reported, not hidden', () => {
  assert.match(PAGE, /units === null/, 'a part list that could not be read renders as no parts');
  assert.match(PAGE, /stay-parts-paused/, 'the page has no way to say the part prices were unreadable');
});

test('the part total is not shown when a chosen part has no price', () => {
  assert.match(PAGE, /stay-parts-unpriced/, 'an unpriced chosen part has no message, so the total would just go missing');
  assert.match(PAGE, /partTotal === null/, 'the null total is not handled');
});

test('the party is warned when the parts are too small', () => {
  assert.match(PAGE, /stay-parts-capacity/, 'a party larger than the chosen parts is not warned');
});
