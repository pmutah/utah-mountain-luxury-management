import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../../functions/api/book/index.ts';

/*
 * **Every guest request today saves, then fails to email, and the page said nothing.**
 *
 * The route has always reported `guestEmailed` and `guestEmailError`. The page never read either, so a guest saw an
 * unqualified "We have the request. Someone will write back." and waited for a receipt that was never coming.
 *
 * Measured on production: `guestEmailed: false`, `guestEmailError: "Failed to refresh Gmail token (401):
 * invalid_client"`. That is every request on this deployment, because the OAuth client secret is invalid.
 *
 * The status link is the part that still works â€” it is why the fix points at it rather than apologising.
 */

const desk = readFileSync(new URL('../../components/DirectReserveCard.tsx', import.meta.url), 'utf8');

test('the page reads the receipt outcome the route reports', () => {
  assert.match(desk, /guestEmailed\?: boolean/, 'the response type still omits the receipt outcome');
  assert.match(desk, /setReceiptFailed\(body\.guestEmailed === false\)/, 'the page does not act on a failed receipt');
});

test('a failed receipt is stated, not left to be discovered', () => {
  assert.match(desk, /data-bot="stay-receipt-failed"/, 'the guest is never told the email failed');
  assert.match(desk, /do not wait for it/i, 'the note does not tell the guest what to do');
  assert.match(desk, /keep that link/i, 'the note does not point at the status page that still works');
});

test('the status link becomes essential when the email failed', () => {
  // "Keep this link" is a suggestion on the normal path and the only route to the request when email is down.
  assert.match(desk, /This link is the only copy you will get/, 'the status link is not elevated on the failure path');
});

test('a request is still saved when the email fails, and the route says which half failed', async () => {
  /*
   * The behaviour that must not regress: a broken mailbox must not lose a booking request. Verified against the route
   * with no Gmail configured, which is the production state.
   */
  const store = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
  const res = await (onRequestPost as unknown as (c: unknown) => Promise<Response>)({
    request: new Request('https://x/api/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        propertyId: 'lindon',
        checkIn: '2027-02-10',
        checkOut: '2027-02-12',
        name: 'A Guest',
        email: 'guest@example.com',
        guests: 2,
      }),
    }),
    env: { SETTINGS: kv },
    params: {},
  });
  assert.equal(res.status, 200, 'a request with no mailer still saves');
  const body = (await res.json()) as { ok: boolean; guestEmailed?: boolean; statusPath?: string | null };
  assert.equal(body.ok, true, 'the request was not saved');
  assert.equal(body.guestEmailed, false, 'the route did not report the email failure');
  assert.ok(body.statusPath, 'no status link was returned, so the guest has nothing to hold');
});

