/**
 * Who can get into the dashboard, and what proves it.
 *
 * This follows the Performance Motors DMS pattern — a comma-separated email allowlist — but the proof
 * differs on purpose. The DMS uses Firebase ID tokens; this app uses Google Identity Services, so the
 * credential is a Google ID token. The properties that matter are the same, and each is pinned here
 * because a mistake in any one of them is a total bypass:
 *
 * - the token must be signed by **Google**, not merely well-formed;
 * - its **audience** must be this app's client id, or a token from any other app could be replayed;
 * - the email must be **verified**, because an unverified address is just a claim;
 * - the address must be on the **allowlist**;
 * - and the resulting cookie must be **signed**, because an email is not a secret.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { allowlistSummary, emailAllowlist, isAllowedEmail, parseEmailList } from '../../functions/_lib/email-allowlist.ts';
import { readSession, sessionSecret, signSession } from '../../functions/_lib/email-session.ts';
import { verifyGoogleSignIn } from '../../functions/_lib/google-token.ts';
import { hostOnly } from '../../functions/_lib/auth.ts';

const CLIENT = '1234567890-fixture.apps.googleusercontent.com';
const SECRET = 'a-really-long-session-secret-value';

test('the three household addresses are allowed, and a stranger is not', () => {
  const list = emailAllowlist({});
  for (const email of ['pmutah@gmail.com', 'stephlouw@gmail.com', 'utahviper@hotmail.com']) {
    assert.equal(isAllowedEmail(email, list), true, `${email} should be allowed`);
  }
  assert.equal(isAllowedEmail('stranger@evil.com', list), false);
  assert.equal(isAllowedEmail('', list), false);
  assert.equal(isAllowedEmail(null, list), false);
});

test('case and surrounding spaces do not lock someone out or let someone in', () => {
  const list = emailAllowlist({});
  assert.equal(isAllowedEmail('PMUTAH@GMAIL.COM', list), true);
  assert.equal(isAllowedEmail('  stephlouw@gmail.com  ', list), true);
  // A different address that differs only by case must still be refused.
  assert.equal(isAllowedEmail('Stranger@Evil.com', list), false);
});

test('the configured list replaces the built-in one', () => {
  /*
   * This is what "put the emails we want to have access into the program" has to mean: setting the
   * env var is the list, not an addition to it.
   */
  const env = { ALLOWED_EMAILS: 'pmutah@gmail.com, newperson@example.com' };
  const list = emailAllowlist(env);
  assert.deepEqual(list, ['pmutah@gmail.com', 'newperson@example.com']);
  assert.equal(isAllowedEmail('stephlouw@gmail.com', list), false, 'a removed address still has access');
  assert.equal(isAllowedEmail('newperson@example.com', list), true);
  assert.match(allowlistSummary(env), /2 email addresses have access/);
});

test('the list parses commas, semicolons, spaces, and duplicates', () => {
  assert.deepEqual(
    parseEmailList('a@x.com, b@x.com; c@x.com  d@x.com,a@x.com'),
    ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'],
  );
});

test('a token signed by anyone but Google is refused', async () => {
  /*
   * The single most important check. A token whose payload *looks* exactly right — right email, right
   * audience, right issuer, unexpired — is worthless if the signature is not Google's, because
   * anyone can write that JSON.
   */
  const { privateKey } = await generateKeyPair('RS256');
  const forged = await new SignJWT({ email: 'pmutah@gmail.com', email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'not-a-google-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(CLIENT)
    .setSubject('123')
    .setExpirationTime('1h')
    .sign(privateKey);

  const result = await verifyGoogleSignIn(forged, { clientId: CLIENT, env: {} });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'bad-token');
});

test('junk, an empty token, and a missing client id are all refused', async () => {
  assert.equal((await verifyGoogleSignIn('not.a.jwt', { clientId: CLIENT, env: {} })).ok, false);
  assert.equal((await verifyGoogleSignIn('', { clientId: CLIENT, env: {} })).ok, false);
  const noClient = await verifyGoogleSignIn('anything', { clientId: undefined, env: {} });
  assert.equal(noClient.ok, false);
  if (!noClient.ok) assert.equal(noClient.reason, 'not-configured');
});

test('a session cookie carries a signature, so an email inside it cannot be swapped', () => {
  /*
   * The old cookie was base64 of the password, which was safe because the password is secret. An email
   * is not: anyone can read it off this repo. Without the HMAC, `btoa("attacker@evil.com")` would be a
   * valid session.
   */
  const cookie = signSession('stephlouw@gmail.com', SECRET);
  const req = (value: string) => new Request('https://x', { headers: { Cookie: `wpm_auth=${value}` } });

  assert.deepEqual(readSession(req(cookie), SECRET), { ok: true, email: 'stephlouw@gmail.com' });

  const forged = cookie.replace(
    Buffer.from('stephlouw@gmail.com').toString('base64url'),
    Buffer.from('attacker@evil.com').toString('base64url'),
  );
  assert.notEqual(forged, cookie, 'the fixture did not actually change the address');
  const check = readSession(req(forged), SECRET);
  assert.equal(check.ok, false, 'a swapped address was accepted');
  if (!check.ok) assert.equal(check.reason, 'bad-signature');

  // A cookie signed with a different secret is refused too.
  assert.equal(readSession(req(cookie), 'a-different-long-secret-yes').ok, false);
  // And with no secret configured the whole email path is closed, not open.
  assert.equal(readSession(req(cookie), undefined).ok, false);
});

test('a short session secret is refused, because it cannot be a real one', () => {
  assert.equal(sessionSecret({ SESSION_SECRET: 'abc' }), undefined);
  assert.equal(sessionSecret({ SESSION_SECRET: '' }), undefined);
  assert.equal(sessionSecret({}), undefined);
  assert.equal(sessionSecret({ SESSION_SECRET: SECRET }), SECRET);
});

test('every host route accepts an allowlisted email and refuses the rest', () => {
  /*
   * `hostOnly` is the one gate all 68 host routes go through, so it is the right place to prove the
   * email path is wired rather than merely implemented.
   */
  const env = { SESSION_SECRET: SECRET };
  const withEmail = (email: string) =>
    new Request('https://x', { headers: { Cookie: `wpm_auth=${signSession(email, SECRET)}` } });

  for (const email of ['pmutah@gmail.com', 'stephlouw@gmail.com', 'utahviper@hotmail.com']) {
    assert.equal(hostOnly(withEmail(email), env), true, `${email} was refused`);
  }
  assert.equal(hostOnly(withEmail('stranger@evil.com'), env), false, 'a stranger was let in');
  assert.equal(hostOnly(new Request('https://x'), env), false, 'no cookie was treated as signed in');
  // A deployment with no secret has no email path at all.
  assert.equal(hostOnly(withEmail('pmutah@gmail.com'), {}), false);
});

test('removing an address from the list revokes it, even with a valid cookie', () => {
  /*
   * A session that outlives removal from the allowlist would make the list advisory. The address is
   * re-checked on every request, so removal takes effect immediately.
   */
  const cookie = new Request('https://x', { headers: { Cookie: `wpm_auth=${signSession('stephlouw@gmail.com', SECRET)}` } });
  assert.equal(hostOnly(cookie, { SESSION_SECRET: SECRET }), true);
  assert.equal(
    hostOnly(cookie, { SESSION_SECRET: SECRET, ALLOWED_EMAILS: 'pmutah@gmail.com' }),
    false,
    'a removed address kept access with an old cookie',
  );
});
