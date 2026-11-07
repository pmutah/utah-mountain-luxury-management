/**
 * The cleaner link. It is the whole credential, so these tests pin what it must never carry: a door
 * code, a guest name, a payout, or another cleaner's link.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failKey?: string } = {}) {
  return {
    async get(key: string) {
      if (opts.failKey && key === opts.failKey) throw new Error('KV GET limit exceeded');
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

async function routes() {
  const links = (await import('../../functions/api/clean/links.ts')) as unknown as Record<string, RouteHandler>;
  const page = (await import('../../functions/api/clean/[token].ts')) as unknown as Record<string, RouteHandler>;
  return { links, page };
}

function hostRequest(url: string, init: RequestInit = {}) {
  return new Request(url, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie } });
}

test('minting a clean link needs the host', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  const { links } = await routes();
  const res = await links.onRequestPost!({
    request: new Request('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 401);
});

test('a minted link opens the job list and never carries a door code or a guest name', async () => {
  const store: Store = new Map();
  // A stay with a name and a payout, plus a River guide that holds a code.
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'res-1', guestName: 'Ada Lovelace', propertyId: 'river', checkIn: '2026-11-10', checkOut: '2026-11-14', payout: 4800, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  store.set('guestGuides', JSON.stringify({ river: { doorCode: '4821', wifiPassword: 'fixture-wifi-secret-not-real' } }));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links, page } = await routes();

  const minted = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  assert.equal(minted.status, 201);
  const created = (await minted.json()) as { token: string; path: string };
  assert.match(created.token, /^[a-f0-9]{32}$/);
  assert.equal(created.path, `/clean/${created.token}`);

  const opened = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${created.token}`),
    env,
    params: { token: created.token },
  });
  assert.equal(opened.status, 200);
  const text = await opened.text();
  assert.equal(text.includes('Ada Lovelace'), false, 'a guest name reached the cleaner');
  assert.equal(text.includes('4821'), false, 'a door code reached the cleaner');
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false, 'a Wi-Fi password reached the cleaner');
  assert.equal(text.includes('4800'), false, 'a payout reached the cleaner');
  assert.equal(text.includes('Maria'), false, 'the host label reached the cleaner');

  const body = JSON.parse(text) as {
    jobs: Array<{ house: string; houseName: string; checkout: string; steps: string[]; arrive: string }>;
    note: string;
    storageReads: string;
    lang: string;
  };
  assert.equal(body.storageReads, 'ok');
  assert.equal(body.lang, 'en');
  const job = body.jobs.find((row) => row.house === 'river' && row.checkout === '2026-11-14');
  assert.ok(job, 'the River turnover was not listed');
  assert.equal(job.houseName, 'The River House');
  assert.ok(job.steps.length >= 6);
  assert.match(job.arrive, /Vivian Park/);
  assert.match(body.note, /door code stays on the guest phone/);
});

test('a same-day turn is marked in the list', async () => {
  const store: Store = new Map();
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'a', guestName: 'One', propertyId: 'ranch', checkIn: '2026-11-10', checkOut: '2026-11-14', payout: 1, source: 'Airbnb', status: 'confirmed' },
      { id: 'b', guestName: 'Two', propertyId: 'ranch', checkIn: '2026-11-14', checkOut: '2026-11-18', payout: 1, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links, page } = await routes();
  const minted = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  const { token } = (await minted.json()) as { token: string };
  const opened = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}`),
    env,
    params: { token },
  });
  const body = (await opened.json()) as { jobs: Array<{ checkout: string; sameDay: boolean; steps: string[] }> };
  const turn = body.jobs.find((row) => row.checkout === '2026-11-14');
  assert.ok(turn);
  assert.equal(turn.sameDay, true);
  assert.match(turn.steps[0] ?? '', /Same-day turn/);
});

test('a wrong or missing token reads nothing', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();
  const bad = await page.onRequestGet!({
    request: new Request('https://x/api/clean/not-a-token'),
    env,
    params: { token: 'not-a-token' },
  });
  assert.equal(bad.status, 404);
  const missing = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${'f'.repeat(32)}`),
    env,
    params: { token: 'f'.repeat(32) },
  });
  assert.equal(missing.status, 404);
});

test('a revoked link stops working', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links, page } = await routes();
  const minted = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  const { token } = (await minted.json()) as { token: string };
  const before = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}`),
    env,
    params: { token },
  });
  assert.equal(before.status, 200);

  const revoked = await links.onRequestDelete!({
    request: hostRequest(`https://x/api/clean/links?token=${token}`, { method: 'DELETE' }),
    env,
    params: {},
  });
  assert.equal(revoked.status, 200);

  const after = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}`),
    env,
    params: { token },
  });
  assert.equal(after.status, 404);
});

test('the host list counts views and a paused read is named', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links, page } = await routes();
  const minted = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  const { token } = (await minted.json()) as { token: string };
  await page.onRequestGet!({ request: new Request(`https://x/api/clean/${token}`), env, params: { token } });
  await new Promise((resolve) => setTimeout(resolve, 60));

  const listed = await links.onRequestGet!({
    request: hostRequest('https://x/api/clean/links'),
    env,
    params: {},
  });
  const body = (await listed.json()) as { links: Array<{ token: string; views: number; lastViewedAt: string | null }> };
  assert.equal(body.links.length, 1);
  assert.equal(body.links[0]!.views, 1);
  assert.equal(typeof body.links[0]!.lastViewedAt, 'string');

  const paused = await links.onRequestGet!({
    request: hostRequest('https://x/api/clean/links'),
    env: { SETTINGS: fakeKv(store, { failKey: 'cleanLinks' }), DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  });
  assert.equal(paused.status, 503);
  const pausedBody = (await paused.json()) as { links: unknown; storageReads: string };
  assert.equal(pausedBody.links, null);
  assert.equal(pausedBody.storageReads, 'paused');
});

test('a label is required and a job list that cannot be read says so', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links, page } = await routes();
  const noLabel = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: '   ' }),
    }),
    env,
    params: {},
  });
  assert.equal(noLabel.status, 400);

  const minted = await links.onRequestPost!({
    request: hostRequest('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  const { token } = (await minted.json()) as { token: string };
  const unread = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}`),
    env: { SETTINGS: fakeKv(store, { failKey: 'reservations' }) },
    params: { token },
  });
  assert.equal(unread.status, 200);
  const body = (await unread.json()) as { jobs: unknown[]; note: string; storageReads: string };
  assert.deepEqual(body.jobs, []);
  assert.equal(body.storageReads, 'paused');
  assert.match(body.note, /could not be read/);
});
