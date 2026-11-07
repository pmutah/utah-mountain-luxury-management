/**
 * Accepting a request, against an in-memory KV. The point is the guard: one request becomes exactly
 * one booking, and a night already on the calendar cannot be accepted over.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestedPayouts } from './payout-suggest.ts';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failKey?: string } = {}) {
  return {
    async get(key: string) {
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

const REQUEST = {
  id: 'book-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  propertyId: 'river',
  checkIn: '2027-12-01',
  checkOut: '2027-12-04',
  guests: 8,
};

function seedRequest(store: Store, over: Record<string, unknown> = {}) {
  store.set('booking-requests', JSON.stringify([{ ...REQUEST, ...over }]));
}

async function route() {
  return (await import('../../functions/api/book/accept.ts')) as unknown as Record<string, RouteHandler>;
}

function accept(body: unknown, withCookie = true) {
  return new Request('https://x/api/book/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test('accepting a request saves one stay and releases its hold', async () => {
  const store: Store = new Map();
  seedRequest(store);
  store.set(
    'bookingHolds',
    JSON.stringify([
      {
        id: 'hold-river',
        propertyId: 'river',
        checkIn: REQUEST.checkIn,
        checkOut: REQUEST.checkOut,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
        requestId: 'book-1',
      },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 4200 }), env, params: {} });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    ok: boolean;
    reservationId: string;
    line: string;
    plan: { payout: number };
    guestEmailed: boolean;
    guestEmailError: string | null;
    guestLine: string | null;
  };
  assert.equal(body.ok, true);
  assert.equal(body.plan.payout, 4200);
  assert.match(body.line, /booked for 3 nights/);
  assert.equal(body.line.includes('$'), false);

  // The confirmation is attempted in every case. With no Gmail token wired here it reports why,
  // which proves the guest path ran rather than being skipped, and the booking still stands.
  assert.equal(body.guestEmailed, false);
  assert.match(body.guestEmailError ?? '', /Gmail/i);
  assert.equal(body.guestLine, null);

  // A direct guest also gets a working portal link, so the house guide and the door code work.
  const withPortal = body as unknown as { portalLink: string | null; portalError: string | null };
  assert.equal(withPortal.portalError, null);
  assert.match(withPortal.portalLink ?? '', /\/stay\/[a-f0-9]{32}$/);
  const surveys = JSON.parse(store.get('guestSurveys') ?? '[]') as Array<{ token: string; reservationId: string }>;
  assert.equal(surveys.length, 1);
  assert.equal(surveys[0]!.reservationId, JSON.parse(store.get('reservations') ?? '[]')[0].id);
  assert.match(withPortal.portalLink ?? '', new RegExp(surveys[0]!.token));
  const savedStay = (JSON.parse(store.get('reservations') ?? '[]') as Array<{ surveyToken?: string }>)[0]!;
  assert.equal(savedStay.surveyToken, surveys[0]!.token);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ note: string; payout: number }>;
  assert.equal(saved.length, 1);
  assert.match(saved[0]!.note, /Direct request book-1/);
  assert.equal(saved[0]!.payout, 4200);

  const holds = JSON.parse(store.get('bookingHolds') ?? '[]') as Array<{ released?: boolean }>;
  assert.equal(holds[0]!.released, true);
});

test('a request with no email is refused a confirmation but still books', async () => {
  const store: Store = new Map();
  seedRequest(store, { email: '' });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 100 }), env, params: {} });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { guestEmailed: boolean; guestEmailError: string | null };
  assert.equal(body.guestEmailed, false);
  assert.match(body.guestEmailError ?? '', /no guest email/);
  assert.equal((JSON.parse(store.get('reservations') ?? '[]') as unknown[]).length, 1);
});

test('accepting the same request twice is refused and saves one stay', async () => {
  const store: Store = new Map();
  seedRequest(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const first = await onRequestPost!({ request: accept({ id: 'book-1', payout: 100 }), env, params: {} });
  assert.equal(first.status, 201);
  const second = await onRequestPost!({ request: accept({ id: 'book-1', payout: 100 }), env, params: {} });
  assert.equal(second.status, 409);
  const body = (await second.json()) as { error: string };
  assert.match(body.error, /already a booking/);
  const saved = JSON.parse(store.get('reservations') ?? '[]') as unknown[];
  assert.equal(saved.length, 1);
});

test('a night now on the calendar is refused rather than double-booked', async () => {
  const store: Store = new Map();
  seedRequest(store);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'res-other', guestName: 'Other', propertyId: 'river', checkIn: '2027-12-02', checkOut: '2027-12-05', payout: 900, source: 'Airbnb', status: 'confirmed' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 100 }), env, params: {} });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /double-book/);
  const saved = JSON.parse(store.get('reservations') ?? '[]') as unknown[];
  assert.equal(saved.length, 1);
});

test('a two-house request saves a stay on each house', async () => {
  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    reservations: Array<{ id: string; propertyId: string }>;
    reservationId: string;
  };
  assert.equal(body.reservations.length, 2, 'a two-house accept saved only one stay');
  assert.deepEqual(
    body.reservations.map((row) => row.propertyId).sort(),
    ['ranch', 'river'],
  );

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ propertyId: string; checkOut: string; payout: number }>;
  assert.equal(saved.length, 2, 'the store has one stay for a two-house booking');
  assert.deepEqual(saved.map((row) => row.propertyId).sort(), ['ranch', 'river']);
  // The host net is the request total, not double.
  assert.equal(
    saved.reduce((sum, row) => sum + row.payout, 0),
    9000,
  );
});

test('accepting the same two-house request twice does not save four stays', async () => {
  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  const second = await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  assert.equal(second.status, 409);
  const saved = JSON.parse(store.get('reservations') ?? '[]') as unknown[];
  assert.equal(saved.length, 2);
});

test('a night now on either house blocks the two-house accept', async () => {
  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'res-r', guestName: 'Other', propertyId: 'ranch', checkIn: '2027-12-03', checkOut: '2027-12-06', payout: 900, source: 'Direct', status: 'confirmed' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 100 }), env, params: {} });
  assert.equal(res.status, 409);
});

test('the route is host only, needs an id, and refuses an unknown request', async () => {
  const store: Store = new Map();
  seedRequest(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const open = await onRequestPost!({ request: accept({ id: 'book-1', payout: 1 }, false), env, params: {} });
  assert.equal(open.status, 401);
  const noId = await onRequestPost!({ request: accept({ payout: 1 }), env, params: {} });
  assert.equal(noId.status, 400);
  const missing = await onRequestPost!({ request: accept({ id: 'nope', payout: 1 }), env, params: {} });
  assert.equal(missing.status, 404);
  assert.equal(store.has('reservations'), false);
});

test('a payout that is not a number is refused', async () => {
  const store: Store = new Map();
  seedRequest(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 'free' }), env, params: {} });
  assert.equal(res.status, 409);
  assert.equal(store.has('reservations'), false);
});

test('an unreadable request list refuses instead of booking blind', async () => {
  const store: Store = new Map();
  seedRequest(store);
  const env = { SETTINGS: fakeKv(store, { failKey: 'booking-requests' }), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 1 }), env, params: {} });
  assert.equal(res.status, 503);
  assert.equal(store.has('reservations'), false);
});

test('the inbox marks a request that is already a booking', async () => {
  const store: Store = new Map();
  seedRequest(store);
  store.set(
    'reservations',
    JSON.stringify([
      { id: 'res-1', guestName: 'Direct guest', propertyId: 'river', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, payout: 1, source: 'Direct', status: 'confirmed', note: 'Direct request book-1.' },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const requests = (await import('../../functions/api/book/requests.ts')) as unknown as Record<string, RouteHandler>;
  const res = await requests.onRequestGet!({
    request: new Request('https://x/api/book/requests', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rows: Array<{ id: string; accepted?: boolean; taken: boolean }> };
  const row = body.rows.find((item) => item.id === 'book-1');
  assert.ok(row);
  assert.equal(row.accepted, true);
  assert.equal(row.taken, true);
});

test('a two-house guest gets a stay link for each house', async () => {
  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  store.set('guestGuides', JSON.stringify({ river: { enabled: true }, ranch: { enabled: true } }));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    portalLinks: Array<{ propertyId: string; link: string | null }>;
    portalLink: string | null;
  };
  assert.equal(body.portalLinks.length, 2, 'the second house got no stay page');
  assert.deepEqual(body.portalLinks.map((row) => row.propertyId), ['river', 'ranch']);
  assert.ok(body.portalLinks.every((row) => row.link && /\/stay\/[a-f0-9]{32}$/.test(row.link)));

  // Each link carries its own token, so they are not the same page twice.
  const tokens = body.portalLinks.map((row) => row.link!.split('/stay/')[1]);
  assert.notEqual(tokens[0], tokens[1]);

  // Both stays remember their own token, so the host can resend either one.
  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ propertyId: string; surveyToken?: string }>;
  assert.deepEqual(saved.map((row) => row.propertyId).sort(), ['ranch', 'river']);
  assert.ok(saved.every((row) => row.surveyToken), 'a stay was saved without its token');
});

test('the two-house split matches the figures the desk showed the host', async () => {
  /*
   * Regression: the desk showed River $5,625 / Ranch $1,623 while accept wrote River $5,503.64 /
   * Ranch $1,744.36, because the split weighted by guest total (which carries cleaning) instead of
   * lodging. $121 landed on the wrong house, and per-house revenue reaches the owner statement.
   */
  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30, children: 4 });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();

  // The desk figure for this request, from the same code the inbox uses.
  const desk = suggestedPayouts({ propertyId: 'river', alsoPropertyId: 'ranch', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, guests: 30, children: 4 });
  assert.equal(desk.length, 2, 'the desk did not show two houses');
  const typed = Math.round(desk.reduce((sum, row) => sum + row.hostNet, 0) * 100) / 100;

  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: typed }), env, params: {} });
  assert.equal(res.status, 201);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ propertyId: string; payout: number }>;
  assert.equal(saved.length, 2);
  for (const row of saved) {
    const shown = desk.find((entry) => entry.house === row.propertyId);
    assert.ok(shown, `no desk figure for ${row.propertyId}`);
    assert.equal(
      Math.round(row.payout * 100),
      Math.round(shown.hostNet * 100),
      `${row.propertyId}: desk showed ${shown.hostNet} but the booking stored ${row.payout}`,
    );
  }
  // And the two still add back to what the host typed.
  assert.equal(
    Math.round(saved.reduce((sum, row) => sum + row.payout, 0) * 100),
    Math.round(typed * 100),
  );
});

test('each two-house link opens its own house guide', async () => {  const store: Store = new Map();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  store.set('guestGuides', JSON.stringify({ river: { enabled: true }, ranch: { enabled: true } }));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  const body = (await res.json()) as { portalLinks: Array<{ propertyId: string; link: string }> };
  const guide = (await import('../../functions/api/stay-guide/[token]/index.ts')) as unknown as Record<string, RouteHandler>;
  for (const row of body.portalLinks) {
    const token = row.link.split('/stay/')[1]!;
    const page = await guide.onRequestGet!({
      request: new Request(`https://x/api/stay-guide/${token}`),
      env,
      params: { token },
    });
    assert.equal(page.status, 200);
    const payload = (await page.json()) as { propertyId?: string };
    assert.equal(payload.propertyId, row.propertyId, `${row.propertyId} link opened ${payload.propertyId}`);
  }
});

test('accepting a request records what the guest was quoted', async () => {
  /*
   * Only the host net was stored. The request row carries no price, so once a request became a
   * booking nothing recorded the figure the guest had agreed to: the booking could not be invoiced
   * from, and a payment could not be checked against what was promised.
   */
  const store = new Map<string, string>();
  seedRequest(store);
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 4200 }), env, params: {} });
  assert.equal(res.status, 201);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ guestTotal?: number; payout?: number }>;
  assert.equal(saved.length, 1);
  assert.ok(typeof saved[0]!.guestTotal === 'number', 'the booking did not record a guest total');
  // The exact figure the guest page quotes for those nights: $5,950 lodging + $600 River cleaning.
  assert.equal(saved[0]!.guestTotal, 6550, 'the recorded guest total was not the quoted one');
  // The guest total is what the guest pays; the payout is what the host keeps, so they must differ.
  assert.ok(
    saved[0]!.guestTotal! > saved[0]!.payout!,
    'the guest total was not above the host net, so it is probably the payout',
  );
});

test('a two-house accept records a guest total on each stay, and they add up', async () => {
  /*
   * A party in both houses is quoted two figures. Recording only one would invoice the guest for half
   * the stay; recording the sum on both would invoice it twice.
   */
  const store = new Map<string, string>();
  seedRequest(store, { alsoPropertyId: 'ranch', guests: 30 });
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { onRequestPost } = await route();
  const res = await onRequestPost!({ request: accept({ id: 'book-1', payout: 9000 }), env, params: {} });
  assert.equal(res.status, 201);

  const saved = JSON.parse(store.get('reservations') ?? '[]') as Array<{ house?: string; guestTotal?: number; propertyId?: string }>;
  assert.equal(saved.length, 2);
  for (const row of saved) {
    assert.ok(typeof row.guestTotal === 'number', `${row.propertyId} recorded no guest total`);
    assert.ok(row.guestTotal! > 0, `${row.propertyId} recorded a zero guest total`);
  }
  assert.notEqual(
    saved[0]!.guestTotal,
    saved[1]!.guestTotal,
    'both houses were given the same guest total, so the split did not happen',
  );
});
