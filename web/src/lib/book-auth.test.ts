/**
 * The routes that touch a booking had no fail-closed guard. `/api/book` is public in the middleware,
 * so each of these routes relies on its own check, and `isAuthenticated` returns true when
 * DASHBOARD_PASSWORD is unset. Against production that meant an anonymous caller could read every
 * guest's name, email, phone, and note, and could accept a request into a real booking.
 *
 * These tests pin the closed behaviour on an unconfigured deployment, which is the state production
 * is in right now.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const SAVED_REQUEST = [
  {
    id: 'book-1',
    name: 'Hidden Guest',
    email: 'hidden@example.com',
    phone: '801-555-0199',
    note: 'secret note',
    propertyId: 'river',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 8,
    createdAt: '2026-11-06T18:00:00.000Z',
  },
];

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

/** An env with no password at all: the state production is in. */
function unconfigured(store: Store) {
  return { SETTINGS: fakeKv(store) };
}

function seeded(): Store {
  const store: Store = new Map();
  store.set('booking-requests', JSON.stringify(SAVED_REQUEST));
  store.set('bookingHolds', JSON.stringify([]));
  store.set('reservations', JSON.stringify([]));
  store.set('bookingDeclines', JSON.stringify([]));
  return store;
}

async function routeOf(path: string) {
  return (await import(path)) as unknown as Record<string, RouteHandler>;
}

test('the request inbox refuses an anonymous caller when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/book/requests.ts');
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/book/requests'),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(res.status, 401, 'the guest list answered a caller with no credential');
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, 'not-configured', 'the refusal did not name the misconfiguration');
  const text = JSON.stringify(body);
  assert.equal(text.includes('Hidden Guest'), false, 'the guest name leaked in the refusal');
  assert.equal(text.includes('hidden@example.com'), false);
});

test('accepting a request is refused when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/book/accept.ts');
  const res = await mod.onRequestPost!({
    request: new Request('https://x/api/book/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'book-1', payout: 5000 }),
    }),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(res.status, 401, 'a booking could be created with no credential');
  // Nothing may be written on a refused accept.
  assert.deepEqual(JSON.parse(store.get('reservations') ?? '[]'), []);
});

test('listing or releasing a hold is refused when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/book/holds.ts');
  const list = await mod.onRequestGet!({
    request: new Request('https://x/api/book/holds'),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(list.status, 401);

  const release = await mod.onRequestPost!({
    request: new Request('https://x/api/book/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'h1' }),
    }),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(release.status, 401);
});

test('minting Todd a link is refused when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/owner/links.ts');
  const mint = await mod.onRequestPost!({
    request: new Request('https://x/api/owner/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(mint.status, 401, 'an owner link could be minted with no credential');
});

test('the shadow clock is refused when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/pricing/shadow-days.ts');
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/pricing/shadow-days'),
    env: unconfigured(store),
    params: {},
  });
  assert.equal(res.status, 401);
});

test('a door-code preview needs a real host, not just an unset password', async () => {
  // `?preview=1` shows the door code and Wi-Fi early. With no password set, the old check treated
  // every caller as the host, so anyone with a stay link could read the codes a day early.
  const store = seeded();
  store.set(
    'surveys',
    JSON.stringify([
      {
        token: 'staytoken1234',
        reservationId: 'res-stay',
        propertyId: 'river',
        guestName: 'Guest',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ]),
  );
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'res-stay',
        guestName: 'Guest',
        propertyId: 'river',
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        payout: 1000,
        source: 'Direct',
        status: 'confirmed',
      },
    ]),
  );
  const mod = await routeOf('../../functions/api/stay-guide/[token]/index.ts');
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/stay-guide/staytoken1234?preview=1'),
    env: unconfigured(store),
    params: { token: 'staytoken1234' },
  });
  const body = (await res.json()) as { access?: { doorCode?: string }; doorCode?: string };
  const text = JSON.stringify(body);
  assert.equal(body.access?.doorCode ?? body.doorCode ?? '', '', 'a door code came back on a preview with no password set');
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false, 'the Wi-Fi password leaked on an unauthenticated preview');
});

test('the host reply into a guest thread is refused when no password is set', async () => {
  const store = seeded();
  const mod = await routeOf('../../functions/api/stay-guide/[token]/thread.ts');
  const res = await mod.onRequestPost!({
    request: new Request('https://x/api/stay-guide/staytoken1234/thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'A reply as the host' }),
    }),
    env: unconfigured(store),
    params: { token: 'staytoken1234' },
  });
  assert.equal(res.status, 401, 'anyone could post into a guest thread as the host');
});
