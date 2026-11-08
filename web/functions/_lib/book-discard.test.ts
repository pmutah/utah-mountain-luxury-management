import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost } from '../api/book/discard.ts';

/*
 * The host inbox had only accept and decline, and decline **emails the guest**. So there was no way to
 * clear a duplicate, a test, or a request already answered by phone — twelve agent probes sat in the
 * production inbox on 2026-11-08 for exactly this reason, and a host could not tell them from live demand.
 *
 * Discard is that missing action. These tests pin the three things that stop it being a way to lose real
 * business: it cannot remove a booking, it cannot free nights a guest is still holding, and it never mails
 * anyone.
 */

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

type Store = Map<string, string>;

function kv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function envWith(store: Store) {
  return { SETTINGS: kv(store), DASHBOARD_PASSWORD: PASSWORD };
}

function post(body: unknown, headers: Record<string, string> = { Cookie: COOKIE }) {
  return onRequestPost!({
    request: new Request('https://x/api/book/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env: envWith(storeFor(body)),
    params: {},
  } as never);
}

/** Each test builds its own store; this is set just before the call so `post` can read it. */
let current: Store = new Map();
function storeFor(_body: unknown) {
  return current;
}

function seed(rows: unknown[], reservations: unknown[] = []) {
  current = new Map();
  current.set('booking-requests', JSON.stringify(rows));
  current.set('reservations', JSON.stringify(reservations));
  return current;
}

const REQ = { id: 'book-1', name: 'Probe', email: 'p@example.com', propertyId: 'ranch', checkIn: '2027-01-10', checkOut: '2027-01-13' };

test('it needs the host', async () => {
  seed([REQ]);
  const res = await onRequestPost!({
    request: new Request('https://x/api/book/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'book-1' }),
    }),
    env: envWith(current),
    params: {},
  } as never);
  assert.equal(res.status, 401);
  assert.equal((JSON.parse(current.get('booking-requests')!) as unknown[]).length, 1, 'an unauthenticated call removed a row');
});

test('discarding removes the request and sends nothing', async () => {
  seed([REQ]);
  const res = await post({ id: 'book-1' });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok?: boolean; sent?: number; remaining?: number; note?: string };
  assert.equal(body.ok, true);
  assert.equal(body.sent, 0, 'a discard must never mail the guest');
  assert.equal(body.remaining, 0);
  assert.match(String(body.note), /Nothing was sent/i, 'the response does not say that no mail went out');
  assert.deepEqual(JSON.parse(current.get('booking-requests')!), []);
});

test('a request that became a booking cannot be discarded', async () => {
  /*
   * The confirmation email and the guest's own status page both point at this request. Removing the row
   * would leave a real booking with no trail behind it.
   */
  seed(
    [REQ],
    [{ id: 'res-1', propertyId: 'ranch', checkIn: REQ.checkIn, checkOut: REQ.checkOut, payout: 1, source: 'direct', note: 'Accepted from request book-1' }],
  );
  const res = await post({ id: 'book-1' });
  assert.equal(res.status, 409);
  assert.equal((JSON.parse(current.get('booking-requests')!) as unknown[]).length, 1, 'a booked request was removed');
});

test('a live hold blocks the discard, so nights are not freed under an asking guest', async () => {
  seed([REQ]);
  current.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-ranch',
        propertyId: 'ranch',
        checkIn: REQ.checkIn,
        checkOut: REQ.checkOut,
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        requestId: 'book-1',
      },
    ]),
  );
  const res = await post({ id: 'book-1' });
  assert.equal(res.status, 409, 'a live hold did not block the discard');
  const body = (await res.json()) as { error?: string };
  assert.match(String(body.error), /hold is still running/i, 'the refusal does not explain the hold');
  assert.equal((JSON.parse(current.get('booking-requests')!) as unknown[]).length, 1);
});

test('an expired hold does not block it, because the guest can no longer claim those nights', async () => {
  seed([REQ]);
  current.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-ranch',
        propertyId: 'ranch',
        checkIn: REQ.checkIn,
        checkOut: REQ.checkOut,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        requestId: 'book-1',
      },
    ]),
  );
  const res = await post({ id: 'book-1' });
  assert.equal(res.status, 200);
});

test('an unknown id is refused rather than silently reported as success', async () => {
  seed([REQ]);
  const res = await post({ id: 'not-there' });
  assert.equal(res.status, 404);
});
