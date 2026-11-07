/**
 * An expired hold used to be told to the guest as "nobody answered in time, send the request again",
 * while the host could still accept that same request. Both halves were wrong: the request *was* still
 * live, and telling the guest to resend invited a duplicate for the same nights.
 *
 * These tests pin the guest wording, the host warning, and the fact that accepting a dead-hold request
 * still cannot double-book.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStatusLine, requestView } from './request-status.ts';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const PW = 'pw';
const COOKIE = `wpm_auth=${btoa(`wpm:${PW}`).replace(/=+$/, '')}`;

const REQUEST = { propertyId: 'river', checkIn: '2027-05-01', checkOut: '2027-05-04', guests: 8 };

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

function seeded(holds: unknown[]): Store {
  const store: Store = new Map();
  store.set(
    'booking-requests',
    JSON.stringify([
      { id: 'book-1', name: 'Guest', email: 'g@example.com', ...REQUEST, createdAt: '2026-11-01T09:00:00.000Z' },
    ]),
  );
  store.set('reservations', JSON.stringify([]));
  store.set('calendarBlocks', JSON.stringify([]));
  store.set('bookingHolds', JSON.stringify(holds));
  return store;
}

function accept(store: Store, body: Record<string, unknown> = {}) {
  return {
    request: new Request('https://x/api/book/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({ id: 'book-1', payout: 5000, ...body }),
    }),
    env: { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PW },
    params: {},
  };
}

async function route() {
  return (await import('../../functions/api/book/accept.ts')) as unknown as Record<string, RouteHandler> & {
    holdWarning: (holds: readonly { expiresAt?: string; released?: boolean }[], now: Date) => string | null;
  };
}

test('an expired hold does not tell the guest nobody answered or to resend', () => {
  const view = requestView(REQUEST, {
    requestId: 'book-1',
    stays: [],
    decline: null,
    hold: { expiresAt: '2026-11-01T09:30:00.000Z', released: false },
    asOf: '2026-11-07',
    now: '2026-11-07T20:00:00.000Z',
  });
  assert.equal(view?.status, 'expired');
  const line = requestStatusLine(view!);
  // The request is still live, so this claim must not be made.
  assert.equal(/nobody answered/i.test(line), false, 'an unanswered request was called unanswered');
  assert.match(line, /still with us/i);
  assert.match(line, /do not need to send it again/i);
  assert.equal(line.includes('$'), false);
});

test('the host is told when the nights were never actually held', async () => {
  const { holdWarning } = await route();
  const now = new Date('2026-11-07T20:00:00.000Z');

  // A live hold says nothing: the dates were held as promised.
  assert.equal(holdWarning([{ expiresAt: '2026-11-07T21:00:00.000Z' }], now), null);

  // A hold that ran out says they were not reserved.
  assert.match(holdWarning([{ expiresAt: '2026-11-01T09:30:00.000Z' }], now) ?? '', /had already ended/);
  // A released hold is the same story.
  assert.match(holdWarning([{ expiresAt: '2099-01-01T00:00:00.000Z', released: true }], now) ?? '', /had already ended/);
  // No hold at all is its own warning: never held.
  assert.match(holdWarning([], now) ?? '', /never held/);
});

test('accepting a request whose hold died still books it, with the warning attached', async () => {
  const store = seeded([
    {
      id: 'hold-1',
      requestId: 'book-1',
      propertyId: 'river',
      checkIn: REQUEST.checkIn,
      checkOut: REQUEST.checkOut,
      expiresAt: '2026-11-01T09:30:00.000Z',
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ]);
  const mod = await route();
  const res = await mod.onRequestPost!(accept(store));
  assert.equal(res.status, 201, 'an expired-hold request should still be acceptable');
  const body = (await res.json()) as { holdLine?: string | null };
  assert.match(body.holdLine ?? '', /had already ended/, 'the accept did not warn that the nights were never held');
});

test('a live hold adds no warning to the accept', async () => {
  const future = new Date(Date.now() + 20 * 60_000).toISOString();
  const store = seeded([
    {
      id: 'hold-1',
      requestId: 'book-1',
      propertyId: 'river',
      checkIn: REQUEST.checkIn,
      checkOut: REQUEST.checkOut,
      expiresAt: future,
      createdAt: new Date().toISOString(),
    },
  ]);
  const mod = await route();
  const res = await mod.onRequestPost!(accept(store));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { holdLine?: string | null };
  assert.equal(body.holdLine, null, 'a live hold produced a warning');
});

test('an expired request cannot double-book the nights a fresh one took', async () => {
  // Two requests for the same nights: the first expired, the second is fresh.
  const store = seeded([
    {
      id: 'hold-old',
      requestId: 'book-1',
      propertyId: 'river',
      checkIn: REQUEST.checkIn,
      checkOut: REQUEST.checkOut,
      expiresAt: '2026-11-01T09:30:00.000Z',
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ]);
  const requests = JSON.parse(store.get('booking-requests') ?? '[]') as unknown[];
  store.set(
    'booking-requests',
    JSON.stringify([
      ...requests,
      { id: 'book-2', name: 'Guest', email: 'g@example.com', ...REQUEST, createdAt: '2026-11-06T09:00:00.000Z' },
    ]),
  );

  const mod = await route();
  const first = await mod.onRequestPost!(accept(store));
  assert.equal(first.status, 201);
  const second = await mod.onRequestPost!(accept(store, { id: 'book-2' }));
  assert.equal(second.status, 409, 'the same nights were booked twice');

  const saved = JSON.parse(store.get('reservations') ?? '[]') as unknown[];
  assert.equal(saved.filter((row) => (row as { propertyId?: string }).propertyId === 'river').length, 1);
});
