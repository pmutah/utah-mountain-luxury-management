import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { onRequestPost } from '../api/book/index.ts';

/*
 * On 2026-11-08 the public booking form answered a Cloudflare **500 "Worker threw exception"** for every
 * request that included a party. The request was being saved; the crash came after, in `gmailSend`.
 *
 * `gmailSend` threw instead of returning an error — the production error was
 * `"Failed to refresh Gmail token"` — and with no guard that throw replaced the entire response. The
 * guest saw a crash page for a request that had already been written, and was never told it went through.
 *
 * `guests` was never the cause. Every request without it returned 409 early from
 * `bookingRequestHold`, so `guests` was merely the field that let execution reach the email call. That
 * cost an hour of chasing the wrong thing, which is why the first test here is about the *shape* of the
 * failure rather than about guests.
 */

const PASSWORD = 'test-password';

type Store = Map<string, string>;

function kv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function post(body: unknown) {
  return new Request('https://x/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAY = {
  propertyId: 'river',
  checkIn: '2027-09-21',
  checkOut: '2027-09-24',
  name: 'Diagnostic',
  email: 'probe@example.com',
  guests: 6,
};

test('the booking route guards its email call, because a throw there destroyed the response', () => {
  /*
   * Checked as source because the failure needs a throwing `gmailSend`, which the module imports
   * directly. A behavioural test can stub the token store but not that throw without mocking the module,
   * and the invariant that matters is simply: this call is inside a try.
   */
  const source = readFileSync(join(process.cwd(), 'functions', 'api', 'book', 'index.ts'), 'utf8');
  assert.match(
    source,
    /let sent: \{ error\?: string \};[\s\S]{0,400}?try\s*\{[\s\S]{0,200}?await gmailSend\(/,
    'the team email call is not guarded, so a failure replaces the guest response with a 500',
  );
  assert.match(
    source,
    /catch \(err\) \{\s*sent = \{ error:/,
    'the email failure is not captured into `sent`, so the response cannot report it',
  );
});

test('the guest receipt call is guarded too, and separately', () => {
  const source = readFileSync(join(process.cwd(), 'functions', 'api', 'book', 'index.ts'), 'utf8');
  assert.match(
    source,
    /await gmailSend\(env, email, receipt\.subject, receipt\.body\)\.catch\(/,
    'the guest receipt is unguarded, so a mail fault would still lose the response',
  );
});

test('a saved request answers even when both emails fail', async () => {
  /*
   * With no Gmail tokens in this store, `gmailSend` returns an error rather than sending. That is the
   * failure path that used to throw, so this is the case that must still answer 200 with the request
   * saved and the reason reported.
   */
  const store: Store = new Map();
  const res = await onRequestPost!({
    request: post(STAY),
    env: { SETTINGS: kv(store), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  } as never);

  assert.equal(res.status, 200, 'a failed email still took down the booking response');
  const body = (await res.json()) as {
    ok?: boolean;
    emailError?: string;
    statusPath?: string;
    notice?: string;
  };
  assert.equal(body.ok, true);
  assert.ok(body.emailError, 'the email failure was not reported back');
  assert.match(String(body.statusPath), /^\/request\/[a-f0-9]{32}$/, 'the guest got no status link');

  const saved = JSON.parse(store.get('booking-requests') ?? '[]') as unknown[];
  assert.equal(saved.length, 1, 'the request was not saved');
});
