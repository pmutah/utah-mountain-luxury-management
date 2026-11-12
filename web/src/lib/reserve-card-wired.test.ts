import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The house pages now book through `DirectReserveCard`, not through `/book`.
 *
 * Every guard that protects the old page — the part choice reaching the server, the quoted total the guest was
 * shown, the pet fee, the party-fit refusal, the single-visit rules gate — was written against
 * `DirectBook.tsx`. None of them saw the new component, so the new booking path shipped with no checks at all.
 *
 * These are source guards on purpose. The defects they protect against are missing conditions and missing fields
 * in a payload, which a unit test of a pure helper cannot observe: `units` was once absent from a request body
 * while the picker above it looked perfect.
 */

const PAGE = readFileSync(join(process.cwd(), 'src', 'components', 'DirectReserveCard.tsx'), 'utf8');

test('the reserve card sends the part choice, and only when a part is chosen', () => {
  assert.match(PAGE, /\.\.\.\(bookingParts \? \{ units: chosenParts \} : \{\}\)/, 'the part choice never reaches POST /api/book');
  // A whole-house request must stay byte-compatible with the request it always was.
  assert.equal(/units: chosenParts,/.test(PAGE), false, 'units is sent unconditionally');
});

test('the reserve card sends the total the guest was shown', () => {
  assert.match(PAGE, /quotedTotal: splitTotal/, 'the page does not send the total it displays');
  assert.match(PAGE, /const splitTotal = bookingParts \? partTotal : compoundTotal \?\? quote\.stayTotal/, 'splitTotal changed shape');
});

test('a part booking is refused when the party does not fit the parts chosen', () => {
  assert.match(PAGE, /partyFitsParts\(/, 'the card never checks the party against the parts');
  assert.match(PAGE, /partParty\?\.ok === true/, 'part readiness no longer requires a fitting party');
  assert.match(PAGE, /data-code=\{partParty\.code\}/, 'the warning does not say which capacity case it is');
});

test('the guest-count hint follows the parts, not the whole house', () => {
  assert.match(PAGE, /placeholder=\{[^}]*bookingParts \? `Up to \$\{partSleeps\}`/, 'the hint uses the house capacity while a part is chosen');
});

test('a part with no price shows no total rather than the house figure', () => {
  assert.match(PAGE, /stay-parts-unpriced/, 'an unpriced chosen part has no message, so the total would just go missing');
  assert.match(PAGE, /partTotal === null/, 'the null total is not handled');
});

test('the dog field cannot accept a count the policy refuses', () => {
  assert.match(PAGE, /data-bot="stay-dogs"/, 'the card has no dog field');
  assert.match(PAGE, /Math\.min\(Number\(digits\), MAX_DOGS\)/, 'the dog field accepts more than the policy allows');
  assert.match(PAGE, /\.\.\.\(dogCount !== null \? \{ dogs: dogCount \} : \{\}\)/, 'the declared dogs never reach the request');
});

test('a party larger than the house is refused before the form appears', () => {
  assert.match(PAGE, /party\.ok/, 'readiness does not check the party');
  assert.match(PAGE, /data-bot="stay-party"/, 'the refusal has nowhere to render');
});

test('the rules gate is one checkbox, per house, and lasts only the visit', () => {
  /*
   * The old page required opening seven agreement topics one at a time. Measured on production, a reload reset all
   * seven and the request form vanished. One tick is the fix — but it has to keep the same two properties: it is
   * scoped per house (so the Lindon tick cannot unlock River), and it lives in `sessionStorage` (so tomorrow starts
   * clean).
   */
  assert.match(PAGE, /const GATE_KEY = 'uml-book-gate'/, 'the gate has no storage key');
  assert.match(PAGE, /sessionStorage\.setItem\(GATE_KEY/, 'nothing writes the gate');
  assert.match(PAGE, /sessionStorage\.getItem\(GATE_KEY\)/, 'nothing reads the gate back');
  assert.equal(
    /localStorage[\s\S]{0,80}GATE_KEY|GATE_KEY[\s\S]{0,80}localStorage/.test(PAGE),
    false,
    'the gate was moved to localStorage, so it outlives the visit',
  );
  assert.match(PAGE, /read\[house\] === true/, 'the gate is not scoped to the house being booked');
  assert.match(PAGE, /for \(const id of \['river', 'ranch', 'lindon'\]/, 'the restore does not scope by house');
  // And it degrades to in-memory instead of crashing a page someone is trying to book from.
  const load = /function loadGate[\s\S]*?\n\}/.exec(PAGE)?.[0] ?? '';
  const save = /function saveGate[\s\S]*?\n\}/.exec(PAGE)?.[0] ?? '';
  assert.match(load, /catch\s*\{/, 'the gate read has no failure path');
  assert.match(save, /catch\s*\{/, 'the gate write has no failure path');
});

test('the terms are readable before the tick', () => {
  /*
   * Collapsing seven clicks into one blind checkbox would be a downgrade dressed as a simplification. The rules and
   * every agreement topic must be on the page, in a disclosure the guest can open, before the tick is meaningful.
   */
  assert.match(PAGE, /<details/, 'the terms are not in a readable disclosure');
  assert.match(PAGE, /houseRules\(house\)/, 'the card does not render the house rules');
  assert.match(PAGE, /agreementTopics\(house/, 'the card does not render the stay-agreement topics');
  assert.match(PAGE, /data-bot="stay-rules-check"/, 'the single rules checkbox is missing');
});

test('the terms do not claim the agreement is signed', () => {
  // Reading topics has never signed anything, and the card must not imply otherwise.
  assert.equal(/I have signed|signs the stay agreement|electronically sign/i.test(PAGE), false, 'the card claims to sign the agreement');
});

test('the button is off until the calendar, the quote, the party, and the tick all agree', () => {
  assert.match(PAGE, /const sendReady = submitReady && !\(bot\.enforced && !bot\.token\)/, 'readiness does not account for the bot check');
  assert.match(PAGE, /if \(!sendReady\) return;/, 'the submit handler does not gate');
  assert.match(PAGE, /disabled=\{busy \|\| !sendReady\}/, 'the button is enabled when the request cannot work');
});

test('the page never claims a card is charged', () => {
  assert.match(PAGE, /No card now/, 'the card does not say that no card is charged');
  assert.equal(/we will charge|card will be charged|pay now|charged today/i.test(PAGE), false, 'the card promises a charge');
});

test('a failed send says so instead of showing a sent state', () => {
  /*
   * The old page read `res.ok` and a JSON body that could be the SPA's HTML with a 200. A non-JSON answer must throw
   * here, not fall through to "Request sent".
   */
  assert.match(PAGE, /if \(!res\.ok\) throw new Error/, 'a refused request does not throw');
  assert.equal(/\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(PAGE), false, 'a non-JSON answer is treated as success');
});

test('extras and an arrival time survive on the rebuilt card', () => {
  /*
   * The first version of this component dropped both. A guest who wanted the hot tub warm, or who was driving up the
   * canyon and arriving at 6pm, had nowhere to say so — a regression against the page it replaced, and the kind that
   * costs a host a text message at check-in.
   *
   * They are named on the request, never folded into the price.
   */
  assert.match(PAGE, /quoteOffers\(/, 'the card does not ask which extras apply to these dates');
  assert.match(PAGE, /data-bot=\{`stay-addon-\$\{offer\.id\}`\}/, 'the extras are not rendered');
  assert.match(PAGE, /quoteAddonApart\(selectedOffers\)/, 'the card does not say the extras are outside the total');
  assert.match(PAGE, /ARRIVAL_SLOTS\.map/, 'the arrival slots are not rendered');
  assert.match(PAGE, /data-bot="stay-arrival-slot"/, 'the arrival control lost its hook');
});

test('the request note is built by the shared builder, not by hand', () => {
  /*
   * `stayRequestNote` is what the older page used and what the host desk reads. Hand-assembling the note here would
   * let the two pages describe the same booking differently, and the builder is also what strips a door code if one
   * ever reached the field.
   */
  assert.match(PAGE, /stayRequestNote\(\{/, 'the note is assembled by hand');
  assert.match(PAGE, /rules: rulesNote\(house\)/, 'the request no longer records that the rules were read');
  assert.match(PAGE, /agreement: agreementNote\(house\)/, 'the request no longer records the agreement state');
  assert.match(PAGE, /arrival: arrivalLine/, 'the chosen arrival time never reaches the request');
});

test('a two-house request still says it needs both houses', () => {
  assert.match(PAGE, /compoundRequestNote\(\)/, 'a 25-guest request no longer names the second house');
});
