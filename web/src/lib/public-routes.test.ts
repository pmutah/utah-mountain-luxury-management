/**
 * The public site has to keep working. A security fix that also locks out the booking page or the
 * guest portal is not a fix, so these routes are checked to stay open on purpose.
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

test('the booking availability route stays public and still lists only nights', async () => {
  const store: Store = new Map();
  // A far-future day, clear of the seed bookings that this route merges from the repo.
  const checkIn = '2028-03-06';
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'r-new', guestName: 'Ada Lovelace', propertyId: 'river', checkIn, checkOut: '2028-03-08', payout: 12345, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  // No password and no cookie: a guest browser.
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/book/availability.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/book/availability'),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  // The guest gets nights, never a name or a payout.
  assert.equal(text.includes('Ada Lovelace'), false);
  assert.equal(text.includes('12345'), false);
  const body = JSON.parse(text) as { nights: Record<string, string[]>; storageReads: string };
  assert.equal(body.storageReads, 'ok');
  assert.ok(body.nights.river.includes(checkIn), `river nights did not include ${checkIn}`);
});

test('the market overview stays public and carries no ledger', async () => {
  const env = { SETTINGS: fakeKv(new Map()) };
  const mod = (await import('../../functions/api/market/overview.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/market/overview?house=river'),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(/expenses|reservation|payout/i.test(text), false);
});

test('a guest with a stay token still reads their own page without a host login', async () => {
  const store: Store = new Map();
  const token = 'a'.repeat(32);
  store.set(
    'guestSurveys',
    JSON.stringify([
      { token, reservationId: 'r1', propertyId: 'river', guestName: 'Ada Lovelace', checkIn: '2027-12-01', checkOut: '2027-12-03', createdAt: '2026-11-07T00:00:00.000Z' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store) };
  const prefs = (await import('../../functions/api/stay-preferences/[token].ts')) as unknown as Record<string, RouteHandler>;
  const res = await prefs.onRequestGet!({
    request: new Request(`https://x/api/stay-preferences/${token}`),
    env,
    params: { token },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { guestName: string };
  assert.equal(body.guestName, 'Ada Lovelace');
});

test('the public house guide no longer carries the way in, even with no password set', async () => {
  const store: Store = new Map();
  store.set(
    'guestGuides',
    JSON.stringify({ river: { enabled: true, doorCode: '4821', wifiPassword: 'fixture-wifi-secret-not-real' } }),
  );
  const env = { SETTINGS: fakeKv(store) };
  const mod = (await import('../../functions/api/guest-guide.ts')) as unknown as RouteHandler & Record<string, RouteHandler>;
  const res = await mod.onRequestGet!({
    request: new Request('https://x/api/guest-guide'),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('fixture-wifi-secret-not-real'), false);
  assert.equal(text.includes('4821'), false);
});

test('a booking request from a guest still saves without a host login', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: 'set-but-irrelevant' };
  const mod = (await import('../../functions/api/book/index.ts')) as unknown as Record<string, RouteHandler>;
  const res = await mod.onRequestPost!({
    request: new Request('https://x/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        propertyId: 'river',
        checkIn: '2027-12-01',
        checkOut: '2027-12-04',
        guests: 8,
      }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const saved = JSON.parse(store.get('booking-requests') ?? '[]') as unknown[];
  assert.equal(saved.length, 1);
});
