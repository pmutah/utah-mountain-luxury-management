/**
 * The returning flag on a saved request. The form sent `returning: false` always, so the team was told
 * every guest was new. The route now answers it from the past stays on the contact the guest typed.
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

function futureStay() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 40);
  // The River House asks for at least 5 nights, so this stays clear of its published rule.
  const out = new Date(day);
  out.setUTCDate(out.getUTCDate() + 6);
  return { checkIn: day.toISOString().slice(0, 10), checkOut: out.toISOString().slice(0, 10) };
}

async function route() {
  return (await import('../../functions/api/book/index.ts')) as unknown as Record<string, RouteHandler>;
}

function post(body: unknown) {
  return new Request('https://x/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seedPast(store: Store, over: Record<string, unknown> = {}) {
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-past-1',
        guestName: 'Ada Lovelace',
        propertyId: 'ranch',
        checkIn: '2026-02-04',
        checkOut: '2026-03-02',
        payout: 100,
        source: 'VRBO',
        status: 'confirmed',
        guestEmail: 'ada@example.com',
        guestPhone: '+18017874722',
        ...over,
      },
    ]),
  );
}

test('a past guest is saved as returning even though the form says false', async () => {
  const store: Store = new Map();
  seedPast(store);
  const dates = futureStay();
  const env = { SETTINGS: fakeKv(store) };
  const api = await route();
  const res = await api.onRequestPost!({
    request: post({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '(801) 787-4722',
      propertyId: 'river',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guests: 4,
      returning: false,
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const saved = JSON.parse(store.get('booking-requests') ?? '[]') as Array<{ returning: boolean }>;
  assert.equal(saved[0]!.returning, true, 'the route trusted the form and called a past guest new');
});

test('a stranger is saved as not returning', async () => {
  const store: Store = new Map();
  seedPast(store);
  const dates = futureStay();
  const env = { SETTINGS: fakeKv(store) };
  const api = await route();
  await api.onRequestPost!({
    request: post({
      name: 'Someone New',
      email: 'new@example.com',
      phone: '8010000000',
      propertyId: 'river',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guests: 4,
      returning: true,
    }),
    env,
    params: {},
  });
  const saved = JSON.parse(store.get('booking-requests') ?? '[]') as Array<{ returning: boolean }>;
  assert.equal(saved[0]!.returning, false, 'the route trusted the form and called a stranger returning');
});

test('a past phone alone is enough, and a cancelled stay is not', async () => {
  const store: Store = new Map();
  seedPast(store, { guestEmail: 'other@example.com' });
  const dates = futureStay();
  const env = { SETTINGS: fakeKv(store) };
  const api = await route();
  await api.onRequestPost!({
    request: post({
      name: 'Ada',
      email: 'brand-new@example.com',
      phone: '8017874722',
      propertyId: 'river',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guests: 4,
    }),
    env,
    params: {},
  });
  let saved = JSON.parse(store.get('booking-requests') ?? '[]') as Array<{ returning: boolean }>;
  assert.equal(saved[0]!.returning, true);

  const cancelled: Store = new Map();
  seedPast(cancelled, { status: 'cancelled' });
  await api.onRequestPost!({
    request: post({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '8017874722',
      propertyId: 'river',
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      guests: 4,
    }),
    env: { SETTINGS: fakeKv(cancelled) },
    params: {},
  });
  saved = JSON.parse(cancelled.get('booking-requests') ?? '[]') as Array<{ returning: boolean }>;
  assert.equal(saved[0]!.returning, false);
});
