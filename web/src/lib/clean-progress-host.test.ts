/**
 * The host progress route. A cleaner's ticks have to reach the desk, and the desk must not call a
 * turn done when the ticks do not say so.
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

function futureCheckout(daysAhead: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + daysAhead);
  return { today, checkout: day.toISOString().slice(0, 10) };
}

async function route() {
  return (await import('../../functions/api/clean/progress.ts')) as unknown as Record<string, RouteHandler>;
}

test('the progress route is host only', async () => {
  const env = { SETTINGS: fakeKv(new Map()), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({ request: new Request('https://x/api/clean/progress'), env, params: {} });
  assert.equal(res.status, 401);
});

test('a cleaner tick reaches the host summary', async () => {
  const store: Store = new Map();
  const { today, checkout } = futureCheckout(3);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'test-prog-river', guestName: 'Ada', propertyId: 'river', checkIn: today, checkOut: checkout, payout: 1, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  // The cleaner finished every step of a normal turn.
  store.set(
    'cleanProgress',
    JSON.stringify([
      { house: 'river', checkout, done: ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos'], updatedAt: new Date().toISOString() },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/progress', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    progress: Array<{ house: string; done: string[] }>;
    summary: string | null;
    storageReads: string;
  };
  assert.equal(body.storageReads, 'ok');
  assert.equal(body.progress.length, 1);
  assert.equal(body.progress[0]!.done.length, 6);
  assert.match(body.summary ?? '', /1 turnover is done/);
  assert.equal((body.summary ?? '').includes('$'), false);
});

test('a turn with no ticks is not called done', async () => {
  const store: Store = new Map();
  const { today, checkout } = futureCheckout(3);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'test-prog-ranch', guestName: 'One', propertyId: 'ranch', checkIn: today, checkOut: checkout, payout: 1, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  store.set('cleanProgress', JSON.stringify([]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/progress', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  const body = (await res.json()) as { summary: string };
  assert.match(body.summary, /No turnover is marked done/);
  assert.equal(/is done\./.test(body.summary.replace('No turnover is marked done.', '')), false);
});

test('a paused progress store is named, not read as no ticks', async () => {
  const env = { SETTINGS: fakeKv(new Map(), { failKey: 'cleanProgress' }), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/progress', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { progress: unknown; summary: unknown; storageReads: string };
  assert.equal(body.progress, null);
  assert.equal(body.summary, null);
  assert.equal(body.storageReads, 'paused');
});

test('a turn list that cannot be read still returns the ticks', async () => {
  const store: Store = new Map();
  store.set(
    'cleanProgress',
    JSON.stringify([{ house: 'river', checkout: '2026-11-14', done: ['beds'], updatedAt: new Date().toISOString() }]),
  );
  const env = { SETTINGS: fakeKv(store, { failKey: 'reservations' }), DASHBOARD_PASSWORD: PASSWORD };
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/clean/progress', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { progress: unknown[]; summary: unknown; storageReads: string };
  assert.equal(body.progress.length, 1);
  assert.equal(body.summary, null);
  assert.equal(body.storageReads, 'paused');
});
