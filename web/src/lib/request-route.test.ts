/**
 * The guest request route is reachable by anyone holding a link, so the token must be the only way
 * in and the response must carry nothing private. These tests read the real handler.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const TOKEN = 'a'.repeat(32);

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

async function route() {
  return (await import('../../functions/api/book/request/[token].ts')) as unknown as Record<string, RouteHandler>;
}

function envFor(store: Store) {
  return { SETTINGS: fakeKv(store) };
}

function get(token: string, store: Store) {
  return {
    request: new Request(`https://x/api/book/request/${token}`),
    env: envFor(store),
    params: { token },
  };
}

function seeded(over: Record<string, unknown> = {}): Store {
  const store: Store = new Map();
  store.set(
    'booking-requests',
    JSON.stringify([
      {
        id: 'book-1',
        statusToken: TOKEN,
        name: 'Hidden Guest',
        email: 'hidden@example.com',
        phone: '801-555-0199',
        note: 'secret note about the family',
        propertyId: 'river',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        guests: 20,
        children: 2,
        ...over,
      },
    ]),
  );
  store.set('bookingHolds', JSON.stringify([]));
  store.set('reservations', JSON.stringify([]));
  store.set('bookingDeclines', JSON.stringify([]));
  return store;
}

test('a real token returns the request and never a private field', async () => {
  const store = seeded();
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(body.status, 'waiting');
  assert.equal(body.houseLine, 'The River House');
  assert.equal(body.nights, 3);
  assert.equal(body.guests, 20);
  assert.equal(body.children, 2);

  const text = JSON.stringify(body);
  assert.equal(text.includes('Hidden Guest'), false, 'the guest name leaked');
  assert.equal(text.includes('hidden@example.com'), false, 'the email leaked');
  assert.equal(text.includes('801-555-0199'), false, 'the phone leaked');
  assert.equal(text.includes('secret note'), false, 'the host note leaked');
  assert.equal(text.includes('$'), false, 'a price leaked');
  assert.equal(text.includes('book-1'), false, 'the internal id leaked');
  assert.equal(text.includes(TOKEN), false, 'the token was echoed back');
});

test('a token that is not 32 hex characters is refused', async () => {
  const store = seeded();
  const handler = await route();
  for (const bad of ['', 'abc', 'Z'.repeat(32), `${'a'.repeat(31)}g`]) {
    const res = await handler.onRequestGet!(get(bad, store));
    assert.equal(res.status, 404, `"${bad}" was accepted`);
  }
});

test('a well-formed token that matches no request reads as invalid, not empty', async () => {
  const store = seeded();
  const handler = await route();
  const res = await handler.onRequestGet!(get('b'.repeat(32), store));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? '', /not valid/);
});

test('a decline is visible to the guest, with the reason and no price', async () => {
  const store = seeded();
  store.set(
    'bookingDeclines',
    JSON.stringify([{ id: 'book-1', reason: 'too-many-guests', at: '2026-11-07T15:00:00.000Z' }]),
  );
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  const body = (await res.json()) as { status: string; reason?: string; line: string };
  assert.equal(body.status, 'declined');
  assert.match(body.reason ?? '', /party this size/);
  assert.equal(body.line.includes('$'), false);
});

test('an accepted stay shows as confirmed through the route', async () => {
  const store = seeded();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-accepted-1',
        guestName: 'Hidden Guest',
        propertyId: 'river',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        payout: 5000,
        source: 'Direct',
        note: 'Direct request book-1.',
        status: 'confirmed',
      },
    ]),
  );
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  const body = (await res.json()) as { status: string; line: string };
  assert.equal(body.status, 'accepted');
  assert.match(body.line, /confirmed/i);
  assert.equal(JSON.stringify(body).includes('5000'), false);
});

test('a live hold is named, and a released one is not', async () => {
  const store = seeded();
  store.set(
    'bookingHolds',
    JSON.stringify([
      { id: 'h1', requestId: 'book-1', propertyId: 'river', checkIn: '2026-12-01', checkOut: '2026-12-04', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-11-07T00:00:00.000Z' },
    ]),
  );
  const handler = await route();
  const live = (await (await handler.onRequestGet!(get(TOKEN, store))).json()) as { hold: string | null };
  assert.match(live.hold ?? '', /Mountain time/);

  store.set(
    'bookingHolds',
    JSON.stringify([
      { id: 'h1', requestId: 'book-1', propertyId: 'river', checkIn: '2026-12-01', checkOut: '2026-12-04', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-11-07T00:00:00.000Z', released: true },
    ]),
  );
  const released = (await (await handler.onRequestGet!(get(TOKEN, store))).json()) as { status: string; hold: string | null };
  assert.equal(released.status, 'expired');
  assert.equal(released.hold, null);
});

test('a cancelled booking shows as cancelled through the route, not expired', async () => {
  const store = seeded();
  // A cancellation can live on the raw row or on the override map, and `getAllReservations` drops it
  // from the active list, so both are seeded here the way the real store writes them.
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-cancelled-stay',
        guestName: 'Hidden Guest',
        propertyId: 'river',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        payout: 5000,
        source: 'Direct',
        note: 'Direct request book-1.',
        status: 'cancelled',
      },
    ]),
  );
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  const body = (await res.json()) as { status: string; line: string };
  assert.equal(body.status, 'cancelled');
  assert.equal(/nobody answered/i.test(body.line), false);
  assert.equal(body.line.includes('$'), false);
});

test('a cancellation recorded on an override row is seen too', async () => {
  const store = seeded();
  store.set(
    'reservationOverrides',
    JSON.stringify({
      'seed-stay-9': { note: 'Direct request book-1.', status: 'cancelled' },
    }),
  );
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, 'cancelled', 'a cancelled override row was not seen');
});

test('a live booking still reads as confirmed, not cancelled', async () => {
  const store = seeded();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-live-stay',
        guestName: 'Hidden Guest',
        propertyId: 'river',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        payout: 5000,
        source: 'Direct',
        note: 'Direct request book-1.',
        status: 'confirmed',
      },
    ]),
  );
  const handler = await route();
  const res = await handler.onRequestGet!(get(TOKEN, store));
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, 'accepted');
});

test('a paused store says so instead of showing an empty request', async () => {
  const handler = await route();
  const res = await handler.onRequestGet!({
    request: new Request(`https://x/api/book/request/${TOKEN}`),
    env: {
      SETTINGS: {
        async get() {
          throw new Error('KV GET limit exceeded');
        },
        async put() {},
      },
    },
    params: { token: TOKEN },
  });
  assert.equal(res.status, 503);
});
