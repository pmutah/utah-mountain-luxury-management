/**
 * Signing in on a deployment that cannot sign anyone in.
 *
 * The preview alias has no `DASHBOARD_PASSWORD` and no `SESSION_SECRET`, so no cookie can be minted. The login
 * route used to answer `{ authenticated: true, authRequired: false }` anyway — telling the caller it was signed
 * in while granting nothing, and disagreeing with `/api/auth/session`, which said `authenticated: false`, and
 * with every private route, which answered 401.
 *
 * Found by probing the live preview: `POST /api/auth/login` with any password returned 200 and issued no
 * cookie, and `/api/book/requests` still answered 401 with the same session.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Handler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

async function route() {
  return (await import('../../functions/api/auth/login.ts')) as unknown as Record<string, Handler>;
}

function login(body: unknown) {
  return new Request('https://x/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a deployment with no password does not claim the caller is signed in', async () => {
  const { onRequestPost } = await route();
  // Neither DASHBOARD_PASSWORD nor SESSION_SECRET: there is no credential that could be issued.
  const res = await onRequestPost!({ request: login({ password: 'anything' }), env: {}, params: {} });

  assert.equal(res.status, 503, 'an unconfigured login answered success');
  const body = (await res.json()) as { authenticated: boolean; open?: boolean; code?: string };
  assert.equal(body.authenticated, false, 'the route reported a session it could not issue');
  assert.equal(body.open, true, 'the route does not agree with /api/auth/session about being unconfigured');
  assert.equal(body.code, 'not-configured');
  assert.equal(res.headers.get('Set-Cookie'), null, 'a cookie was issued with no secret to sign it');
});

test('the unconfigured answer matches what the session route reports', async () => {
  /*
   * Two routes answering "am I signed in" differently is how the dashboard ends up rendering a screen it has
   * no data for. This pins them to the same shape.
   */
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: login({ password: 'x' }), env: {}, params: {} });
  const loginBody = (await res.json()) as { authenticated: boolean; open?: boolean };

  const session = (await import('../../functions/api/auth/session.ts')) as unknown as Record<string, Handler>;
  const sessionRes = await session.onRequestGet!({
    request: new Request('https://x/api/auth/session'),
    env: {},
    params: {},
  });
  const sessionBody = (await sessionRes.json()) as { authenticated: boolean; open?: boolean };

  assert.equal(
    loginBody.authenticated,
    sessionBody.authenticated,
    'login and session disagree about whether the caller is signed in',
  );
  assert.equal(loginBody.open, sessionBody.open, 'login and session disagree about whether the site is unconfigured');
});

test('a real password still signs in and sets the cookie', async () => {
  // The fix must not break the deployment that does have a password — production.
  const { onRequestPost } = await route();
  const env = { DASHBOARD_PASSWORD: 'correct-horse' };

  const wrong = await onRequestPost!({ request: login({ password: 'nope' }), env, params: {} });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('Set-Cookie'), null, 'a failed password still issued a cookie');

  const right = await onRequestPost!({ request: login({ password: 'correct-horse' }), env, params: {} });
  assert.equal(right.status, 200);
  const body = (await right.json()) as { authenticated: boolean; authRequired: boolean };
  assert.equal(body.authenticated, true);
  assert.equal(body.authRequired, true);
  assert.ok(right.headers.get('Set-Cookie'), 'a correct password did not set a session cookie');
});
