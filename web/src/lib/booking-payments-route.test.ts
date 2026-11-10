/**
 * Recording money against a direct booking, against an in-memory KV.
 *
 * The module's arithmetic is tested in `payment-ledger.test.ts`. What matters here is the route: what it
 * refuses, that a payment is appended rather than overwritten, and that a booking which cannot state a
 * balance says so instead of answering zero.
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

const STAY = {
  id: 'res-direct-1',
  guestName: 'Ada Lovelace',
  propertyId: 'river',
  checkIn: '2027-06-01',
  checkOut: '2027-06-04',
  payout: 1800,
  guestTotal: 2400,
  source: 'direct',
  status: 'confirmed',
};

function seedStay(store: Store, over: Record<string, unknown> = {}) {
  store.set('reservations', JSON.stringify([{ ...STAY, ...over }]));
}

async function route() {
  return (await import('../../functions/api/book/payments.ts')) as unknown as Record<string, RouteHandler>;
}

function post(body: unknown, withCookie = true) {
  return new Request('https://x/api/book/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function get(id: string, withCookie = true) {
  return new Request(`https://x/api/book/payments?id=${id}`, {
    method: 'GET',
    headers: withCookie ? { Cookie: cookie } : {},
  });
}

function del(id: string, paymentId: string) {
  return new Request(`https://x/api/book/payments?id=${id}&paymentId=${paymentId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
}

test('recording a deposit leaves the rest owed, and the row is appended', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const res = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: 900, receivedOn: '2026-11-01', method: 'card' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { received: number; outstanding: number; sent: number };
  assert.equal(body.received, 900);
  assert.equal(body.outstanding, 1500);
  assert.equal(body.sent, 0, 'recording a payment mailed the guest');

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: Array<{ amount: number }> }>;
  assert.equal(saved[0]!.payments?.length, 1, 'the payment was not saved');
  assert.equal(saved[0]!.payments![0]!.amount, 900);
});

test('a second payment is added to the first, not written over it', async () => {
  const store: Store = new Map();
  seedStay(store, { payments: [{ id: 'p1', amount: 900, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const res = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: 1500, receivedOn: '2026-11-05' } }),
    env,
    params: {},
  });
  const body = (await res.json()) as { received: number; outstanding: number; paidInFull: boolean };
  assert.equal(body.received, 2400);
  assert.equal(body.outstanding, 0);
  assert.equal(body.paidInFull, true);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: unknown[] }>;
  assert.equal(saved[0]!.payments?.length, 2, 'the earlier payment was lost');
});

test('a retried submit does not record the same money twice', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const payment = { id: 'retry-1', amount: 500, receivedOn: '2026-11-01' };
  const first = await onRequestPost!({ request: post({ id: 'res-direct-1', payment }), env, params: {} });
  assert.equal(first.status, 201);
  const second = await onRequestPost!({ request: post({ id: 'res-direct-1', payment }), env, params: {} });
  assert.equal(second.status, 200);
  const body = (await second.json()) as { duplicate?: boolean; received: number };
  assert.equal(body.duplicate, true);
  assert.equal(body.received, 500, 'the retry counted the money twice');

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: unknown[] }>;
  assert.equal(saved[0]!.payments?.length, 1);
});

test('a channel booking refuses a payment, so the payout is not counted twice', async () => {
  for (const source of ['Airbnb', 'VRBO', 'Hospitable']) {
    const store: Store = new Map();
    seedStay(store, { source });
    const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
    const { onRequestPost } = await route();

    const res = await onRequestPost!({
      request: post({ id: 'res-direct-1', payment: { amount: 100, receivedOn: '2026-11-01' } }),
      env,
      params: {},
    });
    assert.equal(res.status, 409, `${source} accepted a payment`);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /count the same money twice/, `${source} did not explain the refusal`);

    const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: unknown[] }>;
    assert.equal(saved[0]!.payments, undefined, `${source} was written anyway`);
  }
});

test('a booking with no guest total refuses a payment rather than sitting against nothing', async () => {
  const store: Store = new Map();
  seedStay(store, { guestTotal: undefined });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const res = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: 100, receivedOn: '2026-11-01' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /no guest total/);
});

test('a cancelled booking refuses a new charge but still takes a refund', async () => {
  /*
   * The first version of this route said "cancelled bookings cannot take a payment" and the test failed with 404 —
   * `getAllReservations` drops cancelled rows, so the stay was invisible and the guard was unreachable code. But a
   * guest who cancels after paying is exactly who needs a refund recorded. The cancelled row is still in the store,
   * so it is looked up by any status, a new charge is refused, and a refund is allowed.
   */
  const store: Store = new Map();
  seedStay(store, { status: 'cancelled', payments: [{ id: 'p1', amount: 2400, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const charge = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: 100, receivedOn: '2026-11-02' } }),
    env,
    params: {},
  });
  assert.equal(charge.status, 409, 'a cancelled booking accepted a new charge');
  const chargeBody = (await charge.json()) as { error: string };
  assert.match(chargeBody.error, /negative amount/, 'the refusal does not say how to record a refund');

  const refund = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: -2400, receivedOn: '2026-11-02' } }),
    env,
    params: {},
  });
  assert.equal(refund.status, 201, 'a cancelled booking could not take a refund');
  const refundBody = (await refund.json()) as { received: number; outstanding: number };
  assert.equal(refundBody.received, 0);
  assert.equal(refundBody.outstanding, 2400);
});

test('a cancelled booking can still be read, so the refund has somewhere to land', async () => {
  const store: Store = new Map();
  seedStay(store, { status: 'cancelled', payments: [{ id: 'p1', amount: 2400, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet } = await route();

  const res = await onRequestGet!({ request: get('res-direct-1'), env, params: {} });
  assert.equal(res.status, 200, 'a cancelled stay is invisible to the payments route');
  const body = (await res.json()) as { status: string; received: number };
  assert.equal(body.status, 'cancelled');
  assert.equal(body.received, 2400);
});

test('an amount that is not money is refused', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  for (const amount of ['lots', 0, '', null, Number.NaN]) {
    const res = await onRequestPost!({
      request: post({ id: 'res-direct-1', payment: { amount, receivedOn: '2026-11-01' } }),
      env,
      params: {},
    });
    assert.equal(res.status, 400, `${String(amount)} was accepted as a payment`);
  }
});

test('a date that is not a real day is refused', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  for (const receivedOn of ['2026-02-30', 'undefined', '', '2026-11-9']) {
    const res = await onRequestPost!({
      request: post({ id: 'res-direct-1', payment: { amount: 100, receivedOn } }),
      env,
      params: {},
    });
    assert.equal(res.status, 400, `${receivedOn} was accepted as a date`);
  }
});

test('a refund is a negative payment and the record of what arrived survives', async () => {
  const store: Store = new Map();
  seedStay(store, { payments: [{ id: 'p1', amount: 2400, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  const res = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: -400, receivedOn: '2026-11-03', note: 'one night' } }),
    env,
    params: {},
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { received: number; outstanding: number };
  assert.equal(body.received, 2000);
  assert.equal(body.outstanding, 400);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: unknown[] }>;
  assert.equal(saved[0]!.payments?.length, 2, 'the refund erased the payment it reversed');
});

test('the ledger reads back for a direct booking and says what is owed', async () => {
  const store: Store = new Map();
  seedStay(store, { payments: [{ id: 'p1', amount: 900, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet } = await route();

  const res = await onRequestGet!({ request: get('res-direct-1'), env, params: {} });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { direct: boolean; received: number; outstanding: number; line: string };
  assert.equal(body.direct, true);
  assert.equal(body.received, 900);
  assert.equal(body.outstanding, 1500);
  assert.match(body.line, /\$1,500\.00 is still owed/);
});

test('a booking with no total answers unknown, not zero', async () => {
  const store: Store = new Map();
  seedStay(store, { guestTotal: undefined });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet } = await route();

  const res = await onRequestGet!({ request: get('res-direct-1'), env, params: {} });
  const body = (await res.json()) as { total: number | null; outstanding: number | null; paidInFull: boolean; line: string };
  assert.equal(body.total, null);
  assert.equal(body.outstanding, null, 'a booking with no total reported a numeric balance');
  assert.equal(body.paidInFull, false, 'a booking with no total reported as paid');
  assert.match(body.line, /unknown/);
});

test('a channel booking reads as not ours to collect', async () => {
  const store: Store = new Map();
  seedStay(store, { source: 'Airbnb' });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet } = await route();

  const res = await onRequestGet!({ request: get('res-direct-1'), env, params: {} });
  const body = (await res.json()) as { direct: boolean; outstanding: number | null };
  assert.equal(body.direct, false);
  assert.equal(body.outstanding, null);
});

test('deleting a mistyped payment puts the balance back', async () => {
  const store: Store = new Map();
  seedStay(store, {
    payments: [
      { id: 'p1', amount: 900, receivedOn: '2026-11-01' },
      { id: 'typo', amount: 9000, receivedOn: '2026-11-02' },
    ],
  });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestDelete } = await route();

  const res = await onRequestDelete!({ request: del('res-direct-1', 'typo'), env, params: {} });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { received: number; outstanding: number; note: string };
  assert.equal(body.received, 900);
  assert.equal(body.outstanding, 1500);
  assert.match(body.note, /refund should be a negative payment/, 'the delete does not steer a refund to a row');

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: Array<{ id: string }> }>;
  assert.deepEqual(saved[0]!.payments?.map((p) => p.id), ['p1']);
});

test('deleting a payment that is not there changes nothing', async () => {
  const store: Store = new Map();
  seedStay(store, { payments: [{ id: 'p1', amount: 900, receivedOn: '2026-11-01' }] });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestDelete } = await route();

  const res = await onRequestDelete!({ request: del('res-direct-1', 'nope'), env, params: {} });
  assert.equal(res.status, 404);
});

test('a booking that is not on the calendar is refused everywhere', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet, onRequestPost, onRequestDelete } = await route();

  const got = await onRequestGet!({ request: get('nope'), env, params: {} });
  assert.equal(got.status, 404);
  const posted = await onRequestPost!({
    request: post({ id: 'nope', payment: { amount: 10, receivedOn: '2026-11-01' } }),
    env,
    params: {},
  });
  assert.equal(posted.status, 404);
  const removed = await onRequestDelete!({ request: del('nope', 'p1'), env, params: {} });
  assert.equal(removed.status, 404);
});

test('a caller with no session cannot read or write a balance', async () => {
  const store: Store = new Map();
  seedStay(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestGet, onRequestPost } = await route();

  const read = await onRequestGet!({ request: get('res-direct-1', false), env, params: {} });
  assert.equal(read.status, 401);
  const wrote = await onRequestPost!({
    request: post({ id: 'res-direct-1', payment: { amount: 10, receivedOn: '2026-11-01' } }, false),
    env,
    params: {},
  });
  assert.equal(wrote.status, 401);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ payments?: unknown[] }>;
  assert.equal(saved[0]!.payments, undefined, 'an unauthenticated call wrote a payment');
});
