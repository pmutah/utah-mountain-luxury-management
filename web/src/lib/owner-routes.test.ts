/**
 * A local harness for the owner routes. It runs the real Pages Functions against an in-memory KV,
 * so the auth gate, a paused read, and the statement figures can be checked without deploying.
 * It writes nothing outside this process.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failReads?: boolean } = {}) {
  return {
    async get(key: string) {
      if (opts.failReads) throw new Error('KV GET limit exceeded');
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const PASSWORD = 'test-password';

type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

async function loadRoutes() {
  const links = (await import('../../functions/api/owner/links.ts')) as unknown as Record<string, RouteHandler>;
  const token = (await import('../../functions/api/owner/[token].ts')) as unknown as Record<string, RouteHandler>;
  return { links, token };
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

test('the owner link routes refuse an unauthenticated host', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links } = await loadRoutes();
  const get = await links.onRequestGet!({ request: req('https://x/api/owner/links'), env, params: {} });
  assert.equal(get.status, 401);
  const post = await links.onRequestPost!({ request: req('https://x/api/owner/links', { method: 'POST' }), env, params: {} });
  assert.equal(post.status, 401);
  assert.equal(store.has('ownerAccess'), false);
});

test('a signed-in host mints one link and reads it back', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links } = await loadRoutes();
  const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;
  const post = await links.onRequestPost!({
    request: req('https://x/api/owner/links', { method: 'POST', headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(post.status, 201);
  const created = (await post.json()) as { token: string; path: string };
  assert.match(created.token, /^[a-f0-9]{32}$/);
  assert.equal(created.path, `/owner/${created.token}`);

  const get = await links.onRequestGet!({
    request: req('https://x/api/owner/links', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(get.status, 200);
  const listed = (await get.json()) as { links: Array<{ token: string; views: number }> };
  assert.equal(listed.links.length, 1);
  assert.equal(listed.links[0]!.token, created.token);
  assert.equal(listed.links[0]!.views, 0);
});

test('a paused settings read is not an empty link list', async () => {
  const env = { SETTINGS: fakeKv(new Map(), { failReads: true }), DASHBOARD_PASSWORD: PASSWORD };
  const { links } = await loadRoutes();
  const cookie = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;
  const get = await links.onRequestGet!({
    request: req('https://x/api/owner/links', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(get.status, 503);
  const body = (await get.json()) as { links: unknown; storageReads: string };
  assert.equal(body.links, null);
  assert.equal(body.storageReads, 'paused');
});

test('an owner token that was never minted is refused and reads nothing', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  const { token } = await loadRoutes();
  const bad = await token.onRequestGet!({
    request: req('https://x/api/owner/ffffffffffffffffffffffffffffffff'),
    env,
    params: { token: 'ffffffffffffffffffffffffffffffff' },
  });
  assert.equal(bad.status, 404);
  const short = await token.onRequestGet!({
    request: req('https://x/api/owner/not-a-token'),
    env,
    params: { token: 'not-a-token' },
  });
  assert.equal(short.status, 404);
});

test('a minted link returns Todd’s Ranch and River statement and stamps the view', async () => {
  const { createOwnerLink } = await import('../../functions/_lib/owner-store.ts');
  const store: Store = new Map();
  const kv = fakeKv(store);
  const env = { SETTINGS: kv, DASHBOARD_PASSWORD: PASSWORD };
  const link = await createOwnerLink(env as never);
  const { token } = await loadRoutes();
  const res = await token.onRequestGet!({
    request: req(`https://x/api/owner/${link.token}?period=ytd`),
    env,
    params: { token: link.token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    houses: Array<{ id: string }>;
    months: unknown[];
    todd: number;
    notes: string[];
    storageReads: string;
    rangeLabel: string;
  };
  assert.equal(body.storageReads, 'ok');
  assert.deepEqual(
    body.houses.map((house) => house.id),
    ['ranch', 'river'],
  );
  assert.equal(body.months.length > 0, true);
  assert.equal(typeof body.todd, 'number');
  assert.match(body.rangeLabel, /\d{4}/);
  const text = JSON.stringify(body);
  assert.equal(text.includes('lindon'), false);
  assert.equal(/guestName|guestEmail|guestPhone/.test(text), false);

  await new Promise((resolve) => setTimeout(resolve, 50));
  const saved = JSON.parse(store.get('ownerAccess') ?? '[]') as Array<{ views?: number; lastViewedAt?: string }>;
  assert.equal(saved[0]!.views, 1);
  assert.equal(typeof saved[0]!.lastViewedAt, 'string');
});
