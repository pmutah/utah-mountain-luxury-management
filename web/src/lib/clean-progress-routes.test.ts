/**
 * A cleaner ticking off steps. The link is the credential, so these tests pin that it can only
 * touch a turn actually on its list, only with ids that turn has, and never writes a booking.
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

async function routes() {
  const links = (await import('../../functions/api/clean/links.ts')) as unknown as Record<string, RouteHandler>;
  const page = (await import('../../functions/api/clean/[token].ts')) as unknown as Record<string, RouteHandler>;
  return { links, page };
}

async function mint(store: Store) {
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { links } = await routes();
  const res = await links.onRequestPost!({
    request: new Request('https://x/api/clean/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ label: 'Maria' }),
    }),
    env,
    params: {},
  });
  return (await res.json()) as { token: string };
}

function tick(token: string, body: unknown) {
  return new Request(`https://x/api/clean/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A River turn on a fixed day, so the test does not depend on today. */
function seedRiver(store: Store) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 3);
  const checkout = day.toISOString().slice(0, 10);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'test-clean-r1', guestName: 'Ada Lovelace', propertyId: 'river', checkIn: today, checkOut: checkout, payout: 4000, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  return checkout;
}

test('a cleaner ticks a step and it is saved', async () => {
  const store: Store = new Map();
  const checkout = seedRiver(store);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();

  const res = await page.onRequestPost!({
    request: tick(token, { house: 'river', checkout, done: ['beds', 'linens'] }),
    env,
    params: { token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; progress: Array<{ house: string; checkout: string; done: string[] }> };
  assert.equal(body.ok, true);
  const row = body.progress.find((item) => item.house === 'river' && item.checkout === checkout);
  assert.ok(row);
  assert.deepEqual(row.done, ['beds', 'linens']);

  // The next read carries the ticks back, so a closed tab does not lose the work.
  const opened = await page.onRequestGet!({
    request: new Request(`https://x/api/clean/${token}`),
    env,
    params: { token },
  });
  const list = (await opened.json()) as { progress: Array<{ house: string; done: string[] }> };
  assert.deepEqual(list.progress.find((item) => item.house === 'river')?.done, ['beds', 'linens']);
});

test('a step id this turn does not have is dropped, not trusted', async () => {
  const store: Store = new Map();
  const checkout = seedRiver(store);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();
  const res = await page.onRequestPost!({
    request: tick(token, { house: 'river', checkout, done: ['beds', 'window', 'made-up', 99] }),
    env,
    params: { token },
  });
  const body = (await res.json()) as { progress: Array<{ house: string; done: string[] }> };
  // `window` is a same-day step and this turn is not same-day, so it is not kept.
  assert.deepEqual(body.progress.find((item) => item.house === 'river')?.done, ['beds']);
});

test('a turn that is not on the list cannot be ticked', async () => {
  const store: Store = new Map();
  seedRiver(store);
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();

  const wrongHouse = await page.onRequestPost!({
    request: tick(token, { house: 'ranch', checkout: '2026-12-01', done: ['beds'] }),
    env,
    params: { token },
  });
  assert.equal(wrongHouse.status, 404);

  const noHouse = await page.onRequestPost!({
    request: tick(token, { checkout: '2026-12-01', done: ['beds'] }),
    env,
    params: { token },
  });
  assert.equal(noHouse.status, 400);

  const notAList = await page.onRequestPost!({
    request: tick(token, { house: 'river', checkout: '2026-12-01', done: 'beds' }),
    env,
    params: { token },
  });
  assert.equal(notAList.status, 400);
  assert.equal(store.has('cleanProgress'), false);
});

test('a wrong link token writes nothing', async () => {
  const store: Store = new Map();
  const checkout = seedRiver(store);
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();
  const res = await page.onRequestPost!({
    request: tick('f'.repeat(32), { house: 'river', checkout, done: ['beds'] }),
    env,
    params: { token: 'f'.repeat(32) },
  });
  assert.equal(res.status, 404);
  assert.equal(store.has('cleanProgress'), false);
});

test('ticking one house leaves another house alone', async () => {
  const store: Store = new Map();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 3);
  const checkout = day.toISOString().slice(0, 10);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'test-clean-a', guestName: 'One', propertyId: 'river', checkIn: today, checkOut: checkout, payout: 1, source: 'Airbnb', status: 'confirmed' },
      { id: 'test-clean-b', guestName: 'Two', propertyId: 'ranch', checkIn: today, checkOut: checkout, payout: 1, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  const { token } = await mint(store);
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();
  await page.onRequestPost!({ request: tick(token, { house: 'river', checkout, done: ['beds'] }), env, params: { token } });
  const second = await page.onRequestPost!({
    request: tick(token, { house: 'ranch', checkout, done: ['kitchen'] }),
    env,
    params: { token },
  });
  const body = (await second.json()) as { progress: Array<{ house: string; done: string[] }> };
  assert.deepEqual(body.progress.find((item) => item.house === 'river')?.done, ['beds']);
  assert.deepEqual(body.progress.find((item) => item.house === 'ranch')?.done, ['kitchen']);
});

test('the tick writes no booking, expense, or receipt', async () => {
  const store: Store = new Map();
  const checkout = seedRiver(store);
  const { token } = await mint(store);
  const before = store.get('reservations');
  const env = { SETTINGS: fakeKv(store) };
  const { page } = await routes();
  await page.onRequestPost!({
    request: tick(token, { house: 'river', checkout, done: ['beds', 'linens', 'kitchen', 'baths', 'floors', 'photos'] }),
    env,
    params: { token },
  });
  assert.equal(store.get('reservations'), before);
  assert.equal(store.has('customExpenses'), false);
  assert.equal(store.has('booking-requests'), false);
});
