/**
 * The approved-rate route is the only door between the pricing engine and a guest's price. These
 * tests pin that it opens for a host on a free night and stays shut on every night the calendar has
 * already taken, and that what it saves is what a guest is then quoted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteStay } from './quote.ts';
import { nightAsk } from './market/rates.ts';
import { MAX_DAILY_MOVE } from './market/rate-sheet.ts';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

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

async function rates() {
  return (await import('../../functions/api/pricing/approved-rates.ts')) as unknown as Record<string, RouteHandler>;
}

function envFor(store: Store) {
  return { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
}

function approve(store: Store, body: unknown, cookie = COOKIE) {
  return {
    request: new Request('https://x/api/pricing/approved-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env: envFor(store),
    params: {},
  };
}

test('an approval needs the host', async () => {
  const store: Store = new Map();
  const route = await rates();
  const res = await route.onRequestPost!(approve(store, { house: 'ranch', date: '2026-12-01', guest: 660 }, ''));
  assert.equal(res.status, 401);
  assert.equal(store.get('approvedRates'), undefined, 'an unauthenticated approval wrote the sheet');
});

test('an approval fails closed when no password is set', async () => {
  const store: Store = new Map();
  const route = await rates();
  const res = await route.onRequestPost!({
    request: new Request('https://x/api/pricing/approved-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({ house: 'ranch', date: '2026-12-01', guest: 660 }),
    }),
    env: { SETTINGS: fakeKv(store) },
    params: {},
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'not-configured');
  assert.equal(store.get('approvedRates'), undefined);
});

test('a bad house, a bad night, or a zero price is refused', async () => {
  const store: Store = new Map();
  const route = await rates();
  for (const body of [
    { house: 'garage', date: '2026-12-01', guest: 660 },
    { house: 'ranch', date: '2026-13-01', guest: 660 },
    { house: 'ranch', date: '2026-12-01', guest: 0 },
    { house: 'ranch', date: '2026-12-01' },
  ]) {
    const res = await route.onRequestPost!(approve(store, body));
    assert.equal(res.status, 400, `${JSON.stringify(body)} was accepted`);
  }
  assert.equal(store.get('approvedRates'), undefined);
});

test('a price outside the floor, the ceiling, or the cap is refused', async () => {
  const store: Store = new Map();
  const route = await rates();
  const ask = nightAsk('ranch', '2026-12-01');
  const tooFar = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE) + 5;
  for (const guest of [5, tooFar, Math.round(ask.guest * 4)]) {
    const res = await route.onRequestPost!(approve(store, { house: 'ranch', date: '2026-12-01', guest }));
    assert.equal(res.status, 400, `a price of ${guest} was accepted`);
  }
  assert.equal(store.get('approvedRates'), undefined);
});

test('an approval inside the cap saves, and a guest is then quoted it', async () => {
  const store: Store = new Map();
  const route = await rates();
  const ask = nightAsk('ranch', '2026-12-01');
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  const res = await route.onRequestPost!(approve(store, { house: 'ranch', date: '2026-12-01', guest: lifted }));
  assert.equal(res.status, 201);

  const saved = JSON.parse(store.get('approvedRates') ?? '[]') as Array<{ guest: number; date: string }>;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.guest, lifted);

  const read = await route.onRequestGet!({
    request: new Request('https://x/api/pricing/approved-rates?house=ranch', { headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: {},
  });
  const body = (await read.json()) as { approved: Array<{ guest: number }>; line: string };
  assert.equal(read.status, 200);
  assert.equal(body.approved.length, 1);

  const quote = quoteStay('ranch', '2026-12-01', '2026-12-02', [], {
    asOf: '2026-11-07',
    sheet: body.approved as never,
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.nights[0]!.guest, lifted, 'the saved approval did not reach the guest quote');
});

test('a booked night is refused, so a rate the engine held cannot be repriced', async () => {
  const store: Store = new Map();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-booked-1',
        guestName: 'Test Guest',
        propertyId: 'ranch',
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        payout: 1000,
        source: 'Airbnb',
        status: 'confirmed',
      },
    ]),
  );
  const route = await rates();
  const ask = nightAsk('ranch', '2026-12-01');
  const res = await route.onRequestPost!(
    approve(store, { house: 'ranch', date: '2026-12-01', guest: ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE) }),
  );
  const detail = (await res.clone().json()) as { error?: string };
  assert.equal(res.status, 409, `unexpected: ${res.status} ${detail.error ?? ''}`);
  assert.equal(store.get('approvedRates'), undefined, 'a booked night was repriced');
});

test('a cancelled stay does not block an approval', async () => {
  const store: Store = new Map();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-cancelled-1',
        guestName: 'Test Guest',
        propertyId: 'ranch',
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        payout: 1000,
        source: 'Airbnb',
        status: 'cancelled',
      },
    ]),
  );
  const route = await rates();
  const ask = nightAsk('ranch', '2026-12-01');
  const res = await route.onRequestPost!(
    approve(store, { house: 'ranch', date: '2026-12-01', guest: ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE) }),
  );
  assert.equal(res.status, 201, 'a cancelled stay blocked a night it no longer holds');
});

test('clearing an approval returns the night to the card', async () => {
  const store: Store = new Map();
  const route = await rates();
  const ask = nightAsk('ranch', '2026-12-01');
  const lifted = ask.guest + Math.round(ask.guest * MAX_DAILY_MOVE);
  await route.onRequestPost!(approve(store, { house: 'ranch', date: '2026-12-01', guest: lifted }));

  const res = await route.onRequestDelete!({
    request: new Request('https://x/api/pricing/approved-rates?house=ranch&date=2026-12-01', {
      method: 'DELETE',
      headers: { Cookie: COOKIE },
    }),
    env: envFor(store),
    params: {},
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(store.get('approvedRates') ?? 'null'), []);

  const quote = quoteStay('ranch', '2026-12-01', '2026-12-02', [], { asOf: '2026-11-07' });
  assert.equal(quote.nights[0]!.guest, ask.guest);
});
