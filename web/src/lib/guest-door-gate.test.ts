import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stayAccessSecrets } from './stay-rules.ts';

/*
 * The guest stay page carries the door code, so two things have to hold and neither may be merely visual:
 *
 *   1. the code is **withheld on the server** until the window opens — hidden in the UI is not withheld;
 *   2. an API route never answers the app's HTML, because a 200 HTML fallback would make a refused token look like a
 *      working page to anything checking the status code.
 *
 * Verified against a live server first: a stay checking in on 2026-12-10, read on 2026-11-09, returned
 * access.phase "before", unlocked false, doorCode "", and no code value anywhere in the payload.
 */

const ROUTE = readFileSync(new URL('../../functions/api/stay-guide/[token]/index.ts', import.meta.url), 'utf8');

test('the door code is withheld by the server before the window opens', () => {
  const locked = stayAccessSecrets({
    unlocked: false,
    ready: false,
    wifiName: 'Rivernet',
    wifiPassword: 'secret-pass',
    doorCode: '4821',
    doorNotes: 'The lock is on the side door.',
  });
  assert.equal(locked.doorCode, null, 'a locked stay still returns the door code');
  assert.equal(locked.wifiPassword, null, 'a locked stay still returns the Wi-Fi password');
  /*
   * The Wi-Fi name is withheld too. I assumed it travelled because it is not a secret, but the code hides all four access
   * fields together — the network name is still a hint about the property, and one switch is easier to reason about than
   * four. Asserting the behaviour that exists, not the behaviour I expected.
   */
  assert.equal(locked.wifiName, null, 'the Wi-Fi name now leaks before the window opens');
  assert.equal(locked.doorNotes, null, 'the door notes leak before the window opens');
});

test('an unlocked but unread stay still withholds the code', () => {
  /*
   * The window and the "read the house rules" step are separate. The route cannot enforce the second, and it says so —
   * but a stay inside the window whose rules have not been opened must still not hand out the code.
   */
  const early = stayAccessSecrets({
    unlocked: true,
    ready: false,
    wifiName: 'Rivernet',
    wifiPassword: 'secret-pass',
    doorCode: '4821',
    doorNotes: '',
  });
  assert.equal(early.doorCode, null, 'the code arrived before the rules were read');
});

test('an open, read stay does return the code', () => {
  const open = stayAccessSecrets({
    unlocked: true,
    ready: true,
    wifiName: 'Rivernet',
    wifiPassword: 'secret-pass',
    doorCode: '4821',
    doorNotes: 'Side door.',
  });
  assert.equal(open.doorCode, '4821');
  assert.equal(open.wifiPassword, 'secret-pass');
});

test('the guest route can only be read', () => {
  assert.match(ROUTE, /export const onRequestGet/, 'the stay route has no GET');
  for (const method of ['onRequestPost', 'onRequestPut', 'onRequestDelete', 'onRequestPatch']) {
    assert.equal(new RegExp(`export const ${method}`).test(ROUTE), false, `the guest link can now ${method.replace('onRequest', '')}`);
  }
});
