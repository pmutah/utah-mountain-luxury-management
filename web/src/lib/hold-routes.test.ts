/**
 * The hold routes and the booking route against an in-memory KV. The point of these tests is the
 * race: two guests must not both get the same nights.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failReads?: boolean; failKey?: string } = {}) {
  return {
    async get(key: string) {
      if (opts.failReads) throw new Error('KV GET limit exceeded');
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
  const holds = (await import('../../functions/api/book/holds.ts')) as unknown as Record<string, RouteHandler>;
  const book = (await import('../../functions/api/book/index.ts')) as unknown as Record<string, RouteHandler>;
  const availability = (await import('../../functions/api/book/availability.ts')) as unknown as Record<string, RouteHandler>;
  return { holds, book, availability };
}

function request(body: unknown) {
  return new Request('https://x/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const booking = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  propertyId: 'river',
  checkIn: '2027-12-01',
  checkOut: '2027-12-04',
  guests: 8,
};

test('a request saves a hold on every house it names', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { book, holds } = await routes();
  const res = await book.onRequestPost!({ request: request({ ...booking, alsoPropertyId: 'ranch', guests: 30 }), env, params: {} });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; id: string; heldUntil: string };
  assert.equal(body.ok, true);
  assert.equal(typeof body.heldUntil, 'string');

  const listed = await holds.onRequestGet!({
    request: new Request('https://x/api/book/holds', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(listed.status, 200);
  const list = (await listed.json()) as { holds: Array<{ propertyId: string; requestId: string }> };
  assert.deepEqual(
    list.holds.map((hold) => hold.propertyId).sort(),
    ['ranch', 'river'],
  );
  assert.ok(list.holds.every((hold) => hold.requestId === body.id));
});

test('a second guest is refused the same nights while the hold is live', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { book } = await routes();
  const first = await book.onRequestPost!({ request: request(booking), env, params: {} });
  assert.equal(first.status, 200);

  const second = await book.onRequestPost!({
    request: request({ ...booking, name: 'Grace Hopper', email: 'grace@example.com' }),
    env,
    params: {},
  });
  assert.equal(second.status, 409);
  const body = (await second.json()) as { error: string; held: boolean; house: string };
  assert.equal(body.held, true);
  assert.equal(body.house, 'river');
  assert.match(body.error, /held while another guest finishes/);
  assert.equal(body.error.includes('$'), false);

  // Only the first request is saved.
  const saved = JSON.parse(store.get('booking-requests') ?? '[]') as Array<{ name: string }>;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.name, 'Ada Lovelace');
});

test('a released hold lets the next guest request the same nights', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { book, holds } = await routes();
  const first = await book.onRequestPost!({ request: request(booking), env, params: {} });
  const firstBody = (await first.json()) as { id: string };

  const blocked = await book.onRequestPost!({
    request: request({ ...booking, name: 'Grace Hopper', email: 'grace@example.com' }),
    env,
    params: {},
  });
  assert.equal(blocked.status, 409);

  const released = await holds.onRequestPost!({
    request: new Request('https://x/api/book/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ requestId: firstBody.id }),
    }),
    env,
    params: {},
  });
  assert.equal(released.status, 200);

  const second = await book.onRequestPost!({
    request: request({ ...booking, name: 'Grace Hopper', email: 'grace@example.com' }),
    env,
    params: {},
  });
  assert.equal(second.status, 200);
});

test('a stale hold does not block, so an abandoned request frees the dates', async () => {
  const store: Store = new Map();
  store.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-old',
        propertyId: 'river',
        checkIn: '2027-12-01',
        checkOut: '2027-12-04',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        requestId: 'book-old',
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { book } = await routes();
  const res = await book.onRequestPost!({ request: request(booking), env, params: {} });
  assert.equal(res.status, 200);

  const listed = await (await import('../../functions/api/book/holds.ts')).onRequestGet!({
    request: new Request('https://x/api/book/holds', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  const body = (await listed.json()) as { holds: Array<{ id: string }> };
  assert.equal(body.holds.some((hold) => hold.id === 'hold-old'), false);
});

test('the holds list is host only and releasing needs an id', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { holds } = await routes();
  const open = await holds.onRequestGet!({ request: new Request('https://x/api/book/holds'), env, params: {} });
  assert.equal(open.status, 401);
  const release = await holds.onRequestPost!({
    request: new Request('https://x/api/book/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({}),
    }),
    env,
    params: {},
  });
  assert.equal(release.status, 400);
  const missing = await holds.onRequestPost!({
    request: new Request('https://x/api/book/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ id: 'nope' }),
    }),
    env,
    params: {},
  });
  assert.equal(missing.status, 404);
});

test('the public calendar lists a held night apart from a booked one', async () => {
  const store: Store = new Map();
  store.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-live',
        propertyId: 'river',
        checkIn: '2099-12-01',
        checkOut: '2099-12-03',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
        requestId: 'book-live',
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store) };
  const { availability } = await routes();
  const res = await availability.onRequestGet!({
    request: new Request('https://x/api/book/availability'),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    held: Record<string, string[]> | null;
    nights: Record<string, string[]> | null;
    storageReads: string;
  };
  assert.equal(body.storageReads, 'ok');
  assert.ok(body.held);
  // A held night is not copied into the booked list.
  assert.equal(body.nights?.river.includes('2099-12-01'), false);
  assert.equal(JSON.stringify(body).includes('Ada'), false);
});

test('an unreadable hold list refuses the request instead of guessing', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store, { failKey: 'bookingHolds' }), DASHBOARD_PASSWORD: PASSWORD };
  const { book } = await routes();
  const res = await book.onRequestPost!({ request: request(booking), env, params: {} });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /could not be read/);
  // Nothing was saved over the requests that were already there.
  assert.equal(store.has('booking-requests'), false);
});
