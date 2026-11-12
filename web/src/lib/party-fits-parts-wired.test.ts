import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The booking page could take a request it knew could not work. A party of nine, the Garage Suite, and a submit button
 * that stayed enabled: the route refused with `over-capacity`, but only after the guest had typed name, email, phone,
 * dates, and ticked the house rules.
 *
 * The check itself is covered in party-fits-parts.test.ts, including that the page and the route agree at every boundary.
 * This is the guard that the page uses it — the defect was a missing condition in a readiness expression, which no unit
 * test of the helper can see. Retargeted from `/book/` when that route began rendering this card.
 */

const PAGE = readFileSync(new URL('../components/DirectReserveCard.tsx', import.meta.url), 'utf8');

test('a part booking is not ready unless the party fits', () => {
  assert.match(PAGE, /partyFitsParts\(/, 'the page never checks the party against the parts');
  assert.match(PAGE, /partParty\?\.ok === true/, 'part readiness no longer requires a fitting party');
});

test('the capacity message comes from the shared check, not a second hand-written sentence', () => {
  assert.match(PAGE, /stay-parts-capacity/, 'the capacity warning lost its hook');
  assert.match(PAGE, /partParty\.reason/, 'the warning no longer uses the shared reason');
  // The old inline sentence is what let the two drift apart.
  assert.equal(/is larger than these parts sleep/.test(PAGE), false, 'a second copy of the capacity wording is back');
});

test('the warning carries the code, so a refused party can be told apart from an unanswered one', () => {
  assert.match(PAGE, /data-code=\{partParty\.code\}/, 'the warning does not say which capacity case it is');
});

test('the guest-count hint reflects the parts chosen, not the whole house', () => {
  /*
   * The field said "Up to 24" with the Garage Suite chosen, so a guest typed nine with no objection from the page and met
   * the refusal only after filling the whole form.
   *
   * The card keeps a `partSleeps` count for exactly this, so the hint reads the parts when parts are chosen. It is
   * asserted against the conditional rather than one spelling of it, because the value is a template literal and the
   * identifier may be inlined without changing the behaviour.
   */
  const at = PAGE.indexOf('data-bot="stay-guests"');
  assert.ok(at > 0, 'the guest-count field is missing');
  // The placeholder sits after the data-bot attribute in this JSX, so the window runs forward from it.
  const hint = PAGE.slice(at, at + 420);
  assert.match(hint, /bookingParts/, 'the hint does not branch on the chosen parts');
  assert.match(hint, /partSleeps/, 'the hint still uses the house capacity while a part is chosen');
});
