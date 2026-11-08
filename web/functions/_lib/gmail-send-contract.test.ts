import assert from 'node:assert/strict';
import test from 'node:test';
import { gmailSend } from './gmail-store.ts';

/*
 * `gmailSend` promises `{ id } | { error }`. It used to *throw* when the token refresh failed, and that
 * throw escaped. On 2026-11-08 it did exactly that in production: the booking request was saved, then
 * `Failed to refresh Gmail token` threw out of this function and Cloudflare answered the guest with a
 * 500 crash page for a request that had already gone through.
 *
 * Six of the nine call sites wrap the call in `.catch`, which proves the signature was always meant to be
 * non-throwing — but four had no guard at all, including an e-signature send that has already written its
 * session and a nightly automation that has already done its work.
 *
 * Every caller now gets the failure back as data.
 */

/** A KV that answers with a token row whose refresh will fail, and records nothing else. */
function envWithDeadToken() {
  const row = {
    refreshToken: 'refresh-token-that-google-will-reject',
    accessToken: 'expired',
    // Already expired, so the code takes the refresh path rather than using the access token.
    expiry: Date.now() - 60_000,
    email: 'pmutah@gmail.com',
  };
  return {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'wrong-secret',
    SETTINGS: {
      async get(key: string) {
        return key === 'gmailTokens' ? JSON.stringify(row) : null;
      },
      async put() {
        // Nothing to save.
      },
    },
  } as never;
}

test('a failed token refresh comes back as an error, never a throw', async () => {
  const env = envWithDeadToken();

  /*
   * Google is reachable from the test host, so this exercises the real refresh path: the request is sent,
   * rejected, and the outcome must be an error object. A throw here fails the test by escaping it.
   */
  const result = await gmailSend(env, 'probe@example.com', 'Subject', 'Body');

  assert.ok(result, 'gmailSend returned nothing at all');
  assert.equal(typeof result.error, 'string', 'a failed send did not come back as an error object');
  assert.equal(result.id, undefined, 'a failed send reported a message id');
  // The reason has to name the cause, not just say "failed".
  assert.match(String(result.error), /token|refresh|connected|mailbox|invalid/i, `unhelpful error: ${result.error}`);
});

test('a mailbox with no tokens reports that, rather than throwing', async () => {
  const env = {
    SETTINGS: {
      async get() {
        return null;
      },
      async put() {},
    },
  } as never;

  const result = await gmailSend(env, 'probe@example.com', 'Subject', 'Body');
  assert.equal(typeof result.error, 'string');
  assert.match(String(result.error), /not connected/i);
});
