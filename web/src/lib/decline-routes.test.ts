/**
 * Declining a request. The inbox could accept but not decline, so a host who could not take a stay
 * had to wait out the hold and the guest was left with "someone will write back".
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

function futureStay(days = 40, nights = 6) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  const out = new Date(day);
  out.setUTCDate(out.getUTCDate() + nights);
  return { checkIn: day.toISOString().slice(0, 10), checkOut: out.toISOString().slice(0, 10) };
}

function seed(store: Store, over: Record<string, unknown> = {}) {
  const dates = futureStay();
  store.set(
    'booking-requests',
    JSON.stringify([
      {
        id: 'book-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        propertyId: 'river',
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guests: 8,
        ...over,
      },
    ]),
  );
  return dates;
}

async function route() {
  return (await import('../../functions/api/book/decline.ts')) as unknown as Record<string, RouteHandler>;
}

function post(body: unknown, withCookie = true) {
  return new Request('https://x/api/book/decline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test('declining is host only and needs a known reason', async () => {
  const store: Store = new Map();
  seed(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();

  const open = await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'dates-taken' }, false), env, params: {} });
  assert.equal(open.status, 401);

  const noReason = await api.onRequestPost!({ request: post({ id: 'book-1' }), env, params: {} });
  assert.equal(noReason.status, 400);

  const badReason = await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'because' }), env, params: {} });
  assert.equal(badReason.status, 400);
  assert.equal(store.has('bookingDeclines'), false);
});

test('a declined request is recorded and its hold lets go', async () => {
  const store: Store = new Map();
  const dates = seed(store);
  store.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-river',
        propertyId: 'river',
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
        requestId: 'book-1',
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({
    request: post({ id: 'book-1', reason: 'dates-taken' }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; line: string; reason: string; guestEmailed: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.reason, 'dates-taken');
  assert.match(body.line, /Declined: Those dates are taken/);

  const saved = JSON.parse(store.get('bookingDeclines') ?? '[]') as Array<{ id: string; reason: string }>;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.id, 'book-1');
  assert.equal(saved[0]!.reason, 'dates-taken');

  const holds = JSON.parse(store.get('bookingHolds') ?? '[]') as Array<{ released?: boolean }>;
  assert.equal(holds[0]!.released, true, 'the hold kept blocking after the decline');
});

test('a request that is already a booking cannot be declined', async () => {
  const store: Store = new Map();
  seed(store);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'res-1', guestName: 'Direct guest', propertyId: 'river', checkIn: '2027-12-01', checkOut: '2027-12-04', payout: 1, source: 'Direct', status: 'confirmed', note: 'Direct request book-1.' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'maintenance' }), env, params: {} });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /already a booking/);
  assert.equal(store.has('bookingDeclines'), false);
});

test('declining twice is refused and keeps one record', async () => {
  const store: Store = new Map();
  seed(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'dates-taken' }), env, params: {} });
  const second = await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'maintenance' }), env, params: {} });
  assert.equal(second.status, 409);
  const saved = JSON.parse(store.get('bookingDeclines') ?? '[]') as unknown[];
  assert.equal(saved.length, 1);
});

test('an unknown request is refused', async () => {
  const store: Store = new Map();
  seed(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  const res = await api.onRequestPost!({ request: post({ id: 'nope', reason: 'other' }), env, params: {} });
  assert.equal(res.status, 409);
});

test('a decline writes no booking, expense, or receipt', async () => {
  const store: Store = new Map();
  seed(store);
  const before = store.get('reservations');
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const api = await route();
  await api.onRequestPost!({ request: post({ id: 'book-1', reason: 'owner-stay' }), env, params: {} });
  assert.equal(store.get('reservations'), before);
  assert.equal(store.has('customExpenses'), false);
});

test('the inbox shows the decline instead of offering the buttons again', async () => {  const store: Store = new Map();
  seed(store);
  store.set('bookingDeclines', JSON.stringify([{ id: 'book-1', reason: 'dates-taken', at: new Date().toISOString() }]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const requests = (await import('../../functions/api/book/requests.ts')) as unknown as Record<string, RouteHandler>;
  const res = await requests.onRequestGet!({
    request: new Request('https://x/api/book/requests', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rows: Array<{ id: string; declined?: boolean; declineLine?: string; accepted?: boolean }> };
  const row = body.rows.find((item) => item.id === 'book-1');
  assert.ok(row);
  assert.equal(row.declined, true);
  assert.match(row.declineLine ?? '', /Those dates are taken/);
  assert.equal(row.accepted, false);
});

test('the inbox tallies why requests were declined', async () => {
  const store: Store = new Map();
  seed(store);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  store.set(
    'bookingDeclines',
    JSON.stringify([
      { id: 'book-a', reason: 'dates-taken', at: `${today}T09:00:00Z` },
      { id: 'book-b', reason: 'dates-taken', at: `${today}T10:00:00Z` },
      { id: 'book-c', reason: 'minimum-stay', at: `${today}T11:00:00Z` },
      { id: 'book-old', reason: 'maintenance', at: '2020-01-01T00:00:00Z' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const requests = (await import('../../functions/api/book/requests.ts')) as unknown as Record<string, RouteHandler>;
  const res = await requests.onRequestGet!({
    request: new Request('https://x/api/book/requests', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  const body = (await res.json()) as { declineTally?: { total: number; line: string; byReason: Array<{ reason: string; count: number }> } };
  assert.ok(body.declineTally);
  assert.equal(body.declineTally.total, 3, 'a decline outside the 30-day window was counted');
  assert.equal(body.declineTally.byReason[0]!.reason, 'dates-taken');
  assert.match(body.declineTally.line, /dates taken/);
  assert.equal(body.declineTally.line.includes('$'), false);
});
