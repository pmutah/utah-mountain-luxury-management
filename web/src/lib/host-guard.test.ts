/**
 * Every private route has to refuse an anonymous caller, and it has to refuse *harder* when the
 * deployment has no password. Before this test the missing-password state read as "signed in",
 * which left the ledger, the booking list, and the document vault open to anyone with the URL.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;

function fakeKv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const PASSWORD = 'test-password';
const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

/** The routes that hold money, guest identity, or documents. */
const PRIVATE: Array<{ name: string; load: () => Promise<Record<string, RouteHandler>>; path: string; method?: string }> = [
  { name: 'portfolio metrics', load: () => import('../../functions/api/portfolio/metrics.ts'), path: '/api/portfolio/metrics' },
  { name: 'portfolio history', load: () => import('../../functions/api/portfolio/history.ts'), path: '/api/portfolio/history' },
  { name: 'reservations', load: () => import('../../functions/api/reservations/index.ts'), path: '/api/reservations' },
  { name: 'expenses', load: () => import('../../functions/api/expenses/index.ts'), path: '/api/expenses' },
  { name: 'surveys', load: () => import('../../functions/api/surveys/index.ts'), path: '/api/surveys' },
  { name: 'esign documents', load: () => import('../../functions/api/esign/documents/index.ts'), path: '/api/esign/documents' },
  { name: 'construction documents', load: () => import('../../functions/api/construction/documents/index.ts'), path: '/api/construction/documents' },
  { name: 'calendar blocks', load: () => import('../../functions/api/calendar/blocks.ts'), path: '/api/calendar/blocks' },
  { name: 'pricing alerts', load: () => import('../../functions/api/pricing/alerts.ts'), path: '/api/pricing/alerts' },
];

test('an unconfigured deployment refuses every private route instead of opening it', async () => {
  // No DASHBOARD_PASSWORD. This is the state production was in.
  const env = { SETTINGS: fakeKv(new Map()) };
  for (const route of PRIVATE) {
    const mod = await route.load();
    const res = await mod.onRequestGet!({
      request: new Request(`https://x${route.path}`),
      env,
      params: {},
    });
    assert.equal(res.status, 401, `${route.name} answered ${res.status} with no password set`);
    const body = (await res.json()) as { code: string; authRequired: boolean };
    assert.equal(body.code, 'not-configured', `${route.name} did not say the site is unprotected`);
    assert.equal(body.authRequired, false);
  }
});

test('a configured deployment refuses an anonymous caller and names sign-in', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  for (const route of PRIVATE) {
    const mod = await route.load();
    const res = await mod.onRequestGet!({
      request: new Request(`https://x${route.path}`),
      env,
      params: {},
    });
    assert.equal(res.status, 401, `${route.name} answered ${res.status} for an anonymous caller`);
    const body = (await res.json()) as { code: string; authRequired: boolean };
    assert.equal(body.code, 'sign-in');
    assert.equal(body.authRequired, true);
  }
});

test('a signed-in host still reaches the private routes', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  for (const route of PRIVATE) {
    const mod = await route.load();
    const res = await mod.onRequestGet!({
      request: new Request(`https://x${route.path}`, { headers: { Cookie: cookie } }),
      env,
      params: {},
    });
    assert.notEqual(res.status, 401, `${route.name} refused a signed-in host`);
  }
});

test('a write route refuses an anonymous caller too', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  const expenses = await import('../../functions/api/expenses/index.ts');
  const res = await expenses.onRequestPost!({
    request: new Request('https://x/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: 'ranch', month: '2026-11', category: 'Test', amount: 1 }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 401);

  const surveys = await import('../../functions/api/surveys/send.ts');
  const send = await surveys.onRequestPost!({
    request: new Request('https://x/api/surveys/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: 'x', channel: 'email' }),
    }),
    env,
    params: {},
  });
  assert.equal(send.status, 401);
});

test('the bot bearer still reaches every private route, even with no password set', async () => {
  // A Grok bot has no cookie. The bearer is documented to operate every /api route, so a guard
  // that only knew about the dashboard cookie would silently break the assistants.
  const secret = 'muse-secret-value';
  const env = { SETTINGS: fakeKv(new Map()), MUSE_BOT_SECRET: secret };
  for (const route of PRIVATE) {
    const mod = await route.load();
    const res = await mod.onRequestGet!({
      request: new Request(`https://x${route.path}`, { headers: { Authorization: `Bearer ${secret}` } }),
      env,
      params: {},
    });
    assert.notEqual(res.status, 401, `${route.name} refused the Muse bearer`);
  }
});

test('the Amanda bearer works the same way', async () => {
  const secret = 'amanda-secret-value';
  const env = { SETTINGS: fakeKv(new Map()), AMANDA_BOT_SECRET: secret };
  const mod = (await import('../../functions/api/portfolio/metrics.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/portfolio/metrics', { headers: { Authorization: `Bearer ${secret}` } }),
    env,
    params: {},
  });
  assert.notEqual(res.status, 401);
});

test('a wrong bearer is still refused', async () => {
  const env = { SETTINGS: fakeKv(new Map()), MUSE_BOT_SECRET: 'real-secret', DASHBOARD_PASSWORD: PASSWORD };
  const mod = (await import('../../functions/api/portfolio/metrics.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/portfolio/metrics', { headers: { Authorization: 'Bearer guess' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 401);
});
