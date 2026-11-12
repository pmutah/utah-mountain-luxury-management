/**
 * A token in the path is the credential, and the middleware was blocking it.
 *
 * `_middleware.ts` gates every `/api/*` path and allows a short list through without a host password.
 * That list had the guest stay guide and the e-sign flow, but not the owner portal, the cleaner link,
 * or a guest's own request page. All three answered **401** in production: the token was never looked
 * at. Todd's statement, a cleaner's jobs, and a guest's request status were all unreachable.
 *
 * Letting a request past the middleware is not the same as trusting it — each of these routes checks
 * its own token and refuses a bad one. Both halves are pinned here, because fixing only the first would
 * turn a broken page into an open one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../../functions/_middleware.ts';

/** Run the middleware for one path and say whether it let the request through. */
async function passes(path: string, env: Record<string, unknown> = { DASHBOARD_PASSWORD: 'pw' }): Promise<boolean> {
  let reached = false;
  await onRequest!({
    request: new Request(`https://x${path}`),
    env,
    params: {},
    next: async () => {
      reached = true;
      return new Response('ok');
    },
  } as never);
  return reached;
}

test('the three token-in-the-path pages reach their route without a host login', async () => {
  /*
   * These are the pages a person without an account has to open: Todd, a cleaner, and a guest who
   * asked for dates. The token is the whole credential, so a host password cannot be the gate.
   */
  assert.equal(await passes('/api/owner/0123456789abcdef0123456789abcdef'), true, 'the owner portal was blocked');
  assert.equal(await passes('/api/clean/abc123'), true, 'a cleaner link was blocked');
  assert.equal(await passes('/api/book/request/tok'), true, "a guest's request page was blocked");
});

test('the private routes are still closed, so opening those three opened nothing else', async () => {
  /*
   * The dangerous direction. `/api/clean/` and `/api/owner/` are prefixes, so a mistake here would
   * expose the host's own cleaner and owner management routes.
   */
  for (const path of [
    '/api/expenses',
    '/api/reservations',
    '/api/portfolio/metrics',
    '/api/portfolio/history',
    '/api/owner/links',
    '/api/clean/links',
    '/api/clean/photos',
    '/api/clean/progress',
    // The host's booking desk. These used to sit behind a bare `/api/book` prefix, so the middleware
    // waved them through; each one guards itself, but the outer gate should not have been open.
    '/api/book/requests',
    '/api/book/accept',
    '/api/book/decline',
    '/api/book/holds',
  ]) {
    assert.equal(await passes(path), false, `${path} was opened to anyone`);
  }
});

test('the older public paths still work', async () => {
  // Nothing that already worked may have been broken by the change.
  for (const path of [
    '/api/stay-guide/abc',
    '/api/stay-guide/abc/requests',
    '/api/stay-preferences/abc',
    '/api/esign/sign/abc',
    '/api/book',
    '/api/book/availability',
    '/api/auth/login',
    '/api/agent/map',
  ]) {
    assert.equal(await passes(path), true, `${path} is no longer reachable`);
  }
});

test('a signed-in host still reaches the private routes', async () => {
  const cookie = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;
  let reached = false;
  await onRequest!({
    request: new Request('https://x/api/expenses', { headers: { Cookie: cookie } }),
    env: { DASHBOARD_PASSWORD: 'pw' },
    params: {},
    next: async () => {
      reached = true;
      return new Response('ok');
    },
  } as never);
  assert.equal(reached, true, 'a signed-in host could not reach the ledger');
});
