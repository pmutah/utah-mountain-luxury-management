import assert from 'node:assert/strict';
import test from 'node:test';
import { emailAllowlist, isAllowedEmail } from './email-allowlist.ts';

/*
 * On 2026-11-08 Google sign-in looked broken. It was not: the browser was signed into Google as
 * `jws.utah@gmail.com`, which is not on this dashboard's allowlist, and the refusal did not name the
 * address — so the only visible symptom was "Google is not allowing me", which sends a person to look
 * at OAuth settings instead of at which account they are signed into.
 *
 * These tests pin the allowlist itself. The route test below pins that a refusal names the account.
 */

const EMPTY = {} as never;

test('the three bootstrap addresses are allowed when no env list is set', () => {
  const list = emailAllowlist(EMPTY);
  assert.deepEqual(list, ['pmutah@gmail.com', 'stephlouw@gmail.com', 'utahviper@hotmail.com']);
  for (const email of list) {
    assert.equal(isAllowedEmail(email, list), true, `${email} was refused`);
  }
});

test('an address that merely looks like the owner is refused', () => {
  const list = emailAllowlist(EMPTY);
  // The account that actually blocked sign-in, plus the near-miss shapes.
  for (const email of ['jws.utah@gmail.com', 'pmutah@gmail.co', 'pmutah+2@gmail.com', 'xpmutah@gmail.com']) {
    assert.equal(isAllowedEmail(email, list), false, `${email} was allowed`);
  }
});

test('the env list replaces the bootstrap list rather than adding to it', () => {
  const env = { ALLOWED_EMAILS: 'jws.utah@gmail.com' } as never;
  const list = emailAllowlist(env);
  assert.deepEqual(list, ['jws.utah@gmail.com']);
  assert.equal(isAllowedEmail('jws.utah@gmail.com', list), true);
  // Adding one address must not silently keep the others, or removing an address would not revoke it.
  assert.equal(isAllowedEmail('pmutah@gmail.com', list), false);
});

test('an address is matched without regard to case or surrounding space', () => {
  const list = emailAllowlist(EMPTY);
  assert.equal(isAllowedEmail('  PMUtah@Gmail.com  ', list), true);
});

test('the two bot addresses are always allowed', () => {
  const list = emailAllowlist({ ALLOWED_EMAILS: 'nobody@example.com' } as never);
  assert.equal(isAllowedEmail('muse-dms@pmutah.com', list), true);
  assert.equal(isAllowedEmail('barbara-dms@pmutah.com', list), true);
});
