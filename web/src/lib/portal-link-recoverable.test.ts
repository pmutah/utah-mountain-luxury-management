import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * On this deployment email does not send at all, so the only way a guest receives their stay page is the host copying it.
 * The accept message shows that link once, in a line the next inbox load replaces - and when the link was made, the
 * message said nothing about where to find it again. A host who dismissed the line had no link and no obvious way back.
 *
 * The link has always been on the Guests page. These guards hold the message to saying so, and hold the Guests page to
 * actually offering it.
 */

const ACCEPT = readFileSync(new URL('../../functions/api/book/accept.ts', import.meta.url), 'utf8');
const GUESTS = readFileSync(new URL('../components/GuestsPanel.tsx', import.meta.url), 'utf8');

test('the accept message says the guest page can be found again', () => {
  /*
   * This must check the *success* branch, not the file. The first version matched "stays on the Guests page" anywhere,
   * and the app-off branch carries a similar sentence, so replacing the success line with a placeholder still passed.
   */
  const start = ACCEPT.indexOf('const portalNote');
  assert.ok(start > -1, 'the portal note is gone');
  const block = ACCEPT.slice(start, start + 1400);
  assert.match(block, /portalLinks\.some\(\(row\) => row\.link\)/, 'the success branch is gone');
  assert.match(block, /The guest page stays on the Guests page/, 'a successful link is reported with no way to re-find it');
});

test('the message still reports a link that could not be made', () => {
  // A failure must not be replaced by the "you can find it again" line, which would be false.
  assert.match(ACCEPT, /A guest link could not be made/, 'a failed link is no longer reported');
});

test('the app-off note also says where the link lives', () => {
  assert.match(ACCEPT, /The link stays on the Guests page/, 'the app-off note does not say where to find the link');
});

test('the Guests page really does offer the link, which is what the message promises', () => {
  // The message names the Guests page; if this button disappears the promise becomes false.
  assert.match(GUESTS, /survey-copy-link/, 'the Guests page has no copy-link control');
  assert.match(GUESTS, /Copy guest app link/, 'the copy control no longer says what it copies');
});

test('the copied link is an absolute address, not a path', () => {
  /*
   * The cleaner link had this bug: the desk showed `/clean/<token>`, which cannot be opened from a phone. A stay link
   * copied here has to carry its origin, or the host pastes something that goes nowhere.
   */
  const copy = readFileSync(new URL('../../functions/_lib/survey-copy.ts', import.meta.url), 'utf8');
  const fn = copy.slice(copy.indexOf('export function surveyPublicUrl'));
  assert.match(fn.slice(0, 200), /origin/, 'the stay link is built without an origin');
  assert.match(fn.slice(0, 200), /\/stay\//, 'the stay link is not a stay path');
});
