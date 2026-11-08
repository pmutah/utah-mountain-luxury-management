/**
 * The stay message sender. The pure rules are covered in `stay-message-send.test.ts`; this file drives
 * the route, because the ways a route goes wrong are different: trusting the caller's dates, sending
 * after a refusal, or recording a send that failed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { denverToday } from './market/dates.ts';

type Store = Map<string, string>;
type RouteHandler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const PW = 'pw';
const COOKIE = `wpm_auth=${btoa(`wpm:${PW}`).replace(/=+$/, '')}`;
const TOKEN = 'staye'.padEnd(32, '0');
/*
 * Denver's date, because the route judges the send window with `denverToday()`. Deriving it from UTC
 * put the newest day a day ahead for six hours each evening, which is the same fault that broke the
 * shadow-clock test.
 */
const TODAY = denverToday();

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

/** A stay whose check-in is today, so the arrival and confirmation messages are both fair game. */
function seeded(over: Record<string, unknown> = {}): Store {
  const store: Store = new Map();
  const tomorrow = new Date(`${TODAY}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  store.set(
    'guestSurveys',
    JSON.stringify([
      {
        token: TOKEN,
        reservationId: 'res-1',
        propertyId: 'river',
        guestName: 'Guest',
        checkIn: TODAY,
        checkOut: tomorrow.toISOString().slice(0, 10),
        createdAt: '2026-11-01T00:00:00.000Z',
        ...over,
      },
    ]),
  );
  store.set('reservations', JSON.stringify([]));
  store.set('stayMessageLog', JSON.stringify([]));
  return store;
}

function envFor(store: Store) {
  return { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PW, GMAIL_ACCESS_TOKEN: 'x' };
}

async function route() {
  return (await import('../../functions/api/stay-guide/[token]/stay-message.ts')) as unknown as Record<string, RouteHandler>;
}

function send(store: Store, body: Record<string, unknown>, cookie = COOKIE) {
  return {
    request: new Request(`https://x/api/stay-guide/${TOKEN}/stay-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env: envFor(store),
    params: { token: TOKEN },
  };
}

test('the sender needs the host', async () => {
  const store = seeded();
  const mod = await route();
  const open = await mod.onRequestPost!(send(store, { id: 'arrive', to: 'g@example.com' }, ''));
  assert.equal(open.status, 401);
  // And it fails closed when no password is set, which is the state production is in.
  const unconfigured = await mod.onRequestPost!({
    ...send(store, { id: 'arrive', to: 'g@example.com' }),
    env: { SETTINGS: fakeKv(store) },
  });
  assert.equal(unconfigured.status, 401);
  assert.equal(JSON.parse(store.get('stayMessageLog') ?? '[]').length, 0);
});

test('a message that is not right for today is refused and nothing is recorded', async () => {
  const store = seeded();
  const mod = await route();
  // Checkout is today, so the week note is long past. It is also a stay-page message and the app is
  // off in this fixture, so either refusal is correct; what matters is that it is refused and silent.
  const res = await mod.onRequestPost!(send(store, { id: 'week', to: 'g@example.com' }));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { refused?: boolean; error?: string };
  assert.equal(body.refused, true);
  assert.match(body.error ?? '', /not right to send today|guest app is off/);
  assert.deepEqual(JSON.parse(store.get('stayMessageLog') ?? '[]'), [], 'a refused send was recorded');
});

test('a missing email is refused before anything is read', async () => {
  const store = seeded();
  const mod = await route();
  assert.equal((await mod.onRequestPost!(send(store, { id: 'arrive' }))).status, 400);
  assert.equal((await mod.onRequestPost!(send(store, { id: 'arrive', to: 'not-an-email' }))).status, 400);
});

test('the stay comes from the guest record, not the request body', async () => {
  /*
   * If the route trusted dates from the caller, a host (or a bug) could pass a stay two weeks out and
   * send a message that is wrong for the real stay. The body has no dates here at all; the route reads
   * them from the saved stay.
   */
  const store = seeded();
  const mod = await route();
  const res = await mod.onRequestPost!(
    send(store, { id: 'week', to: 'g@example.com', checkIn: '2027-06-01', checkOut: '2027-06-05' }),
  );
  // The real stay checks in today, so the week note is still refused even though the body says June.
  assert.equal(res.status, 409);
});

test('a stay that is not on file sends nothing', async () => {
  const store = seeded();
  store.set('guestSurveys', JSON.stringify([]));
  const mod = await route();
  assert.equal((await mod.onRequestPost!(send(store, { id: 'arrive', to: 'g@example.com' }))).status, 404);
});

test('a message already sent is refused the second time', async () => {
  const store = seeded();
  store.set(
    'stayMessageLog',
    JSON.stringify([{ token: TOKEN, sent: [{ id: 'arrive', at: '2026-11-07T10:00:00.000Z', to: 'g@example.com' }] }]),
  );
  const mod = await route();
  const res = await mod.onRequestPost!(send(store, { id: 'arrive', to: 'g@example.com' }));
  assert.equal(res.status, 409);
  assert.match(((await res.json()) as { error: string }).error, /already gone to this guest/);
});

test('the ready list reflects what has already gone', async () => {
  const store = seeded();
  store.set(
    'stayMessageLog',
    JSON.stringify([{ token: TOKEN, sent: [{ id: 'arrive', at: '2026-11-07T10:00:00.000Z', to: 'g@example.com' }] }]),
  );
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-guide/${TOKEN}/stay-message`, { headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: { token: TOKEN },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ready: Array<{ id: string }>; line: string; sent: Array<{ id: string }> };
  assert.equal(body.ready.some((row) => row.id === 'arrive'), false, 'an already-sent message was offered again');
  assert.equal(body.sent.length, 1);
  // Whichever line it gives, it must say the sender does not go on its own.
  assert.match(body.line, /Nothing is sent on its own|No other message is right for today/);
});

test('with the guest app off, a stay-page message is not offered or sent', async () => {
  // Week note territory: check-in in seven days.
  const weekOut = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const out = new Date(`${weekOut}T00:00:00Z`);
  out.setUTCDate(out.getUTCDate() + 3);
  const store = seeded({ checkIn: weekOut, checkOut: out.toISOString().slice(0, 10) });
  // No guest app configured means off.
  const mod = await route();

  const list = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-guide/${TOKEN}/stay-message`, { headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: { token: TOKEN },
  });
  const body = (await list.json()) as { ready: Array<{ id: string }>; guestAppOn?: boolean };
  assert.equal(body.guestAppOn, false);
  assert.equal(body.ready.some((row) => row.id === 'week'), false, 'a stay-page message was offered while the app is off');

  // Forcing it through the POST is refused too, and nothing is recorded.
  const post = await mod.onRequestPost!(send(store, { id: 'week', to: 'g@example.com' }));
  assert.equal(post.status, 409);
  assert.match(((await post.json()) as { error: string }).error, /guest app is off/);
  assert.deepEqual(JSON.parse(store.get('stayMessageLog') ?? '[]'), []);
});

test('the sender never carries a price or a code in its subject line', async () => {
  const store = seeded();
  const mod = await route();
  const res = await mod.onRequestGet!({
    request: new Request(`https://x/api/stay-guide/${TOKEN}/stay-message`, { headers: { Cookie: COOKIE } }),
    env: envFor(store),
    params: { token: TOKEN },
  });
  const body = (await res.json()) as { ready: Array<{ subject: string; when: string }> };
  for (const row of body.ready) {
    assert.equal(row.subject.includes('$'), false, `the "${row.subject}" subject carries a price`);
    assert.equal(/\d{3,8}/.test(row.subject), false, `the "${row.subject}" subject looks like it carries a code`);
  }
});
