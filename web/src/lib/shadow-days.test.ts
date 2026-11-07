/**
 * The durable shadow clock. A Denver day saves to the server, so clearing a browser tab cannot
 * reset the week that authorizes a Hospitable write.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSavedShadowDay, shadowClockFromSaved, SHADOW_UNREAD } from './market/shadow-log.ts';

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failReads?: boolean } = {}) {
  return {
    async get(key: string) {
      if (opts.failReads) throw new Error('KV GET limit exceeded');
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

const DIGEST = 'UML shadow 2026-11-07\nRiver: 0 raises\nNothing sent to Hospitable.';

async function route() {
  return (await import('../../functions/api/pricing/shadow-days.ts')) as unknown as Record<string, RouteHandler>;
}

function post(body: unknown) {
  return new Request('https://x/api/pricing/shadow-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

test('the saved clock refuses an unauthenticated call and writes nothing', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const days = await route();
  const get = await days.onRequestGet!({ request: new Request('https://x/api/pricing/shadow-days'), env, params: {} });
  assert.equal(get.status, 401);
  const postRes = await days.onRequestPost!({
    request: new Request('https://x/api/pricing/shadow-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-11-07', digest: DIGEST }),
    }),
    env,
    params: {},
  });
  assert.equal(postRes.status, 401);
  assert.equal(store.has('shadowDays'), false);
});

test('a digest that could be sent is refused and nothing is saved', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const days = await route();
  const res = await days.onRequestPost!({ request: post({ date: '2026-11-07', digest: 'Send the new rate.' }), env, params: {} });
  assert.equal(res.status, 400);
  const badDate = await days.onRequestPost!({ request: post({ date: 'not-a-day', digest: DIGEST }), env, params: {} });
  assert.equal(badDate.status, 400);
  assert.equal(store.has('shadowDays'), false);
});

test('seven saved days make the server clock ready and never leak the token', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD, HOSPITABLE_WRITE_TOKEN: 'secret-token' };
  const days = await route();
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() - back);
    const date = day.toISOString().slice(0, 10);
    const res = await days.onRequestPost!({ request: post({ date, digest: `${DIGEST} ${date}` }), env, params: {} });
    assert.equal(res.status, 200);
  }
  const read = await days.onRequestGet!({ request: new Request('https://x/api/pricing/shadow-days', { headers: { Cookie: cookie } }), env, params: {} });
  assert.equal(read.status, 200);
  const text = await read.text();
  assert.equal(text.includes('secret-token'), false);
  const body = JSON.parse(text) as {
    clock: { days: number; required: number; ready: boolean };
    hasWriteToken: boolean;
    storageReads: string;
  };
  assert.equal(body.clock.days, 7);
  assert.equal(body.clock.ready, true);
  assert.equal(body.hasWriteToken, true);
  assert.equal(body.storageReads, 'ok');
});

test('an unread day removes its date so a replay cannot invent the week', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const days = await route();
  await days.onRequestPost!({ request: post({ date: '2026-11-06', digest: DIGEST }), env, params: {} });
  const unread = await days.onRequestPost!({
    request: post({ date: '2026-11-06', digest: `${SHADOW_UNREAD} Nothing sent to Hospitable.` }),
    env,
    params: {},
  });
  assert.equal(unread.status, 200);
  const body = (await unread.json()) as { clock: { days: number; dates: string[] } };
  assert.equal(body.clock.days, 0);
  assert.deepEqual(body.clock.dates, []);
});

test('a paused store is named instead of looking like no shadow days', async () => {
  const env = { SETTINGS: fakeKv(new Map(), { failReads: true }), DASHBOARD_PASSWORD: PASSWORD };
  const days = await route();
  const res = await days.onRequestGet!({
    request: new Request('https://x/api/pricing/shadow-days', { headers: { Cookie: cookie } }),
    env,
    params: {},
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { clock: unknown; storageReads: string };
  assert.equal(body.clock, null);
  assert.equal(body.storageReads, 'paused');
});

test('merging keeps one row per day and drops a future day from the clock', () => {
  const merged = mergeSavedShadowDay([], { date: '2026-11-07', digest: DIGEST });
  assert.equal(merged.length, 1);
  const replaced = mergeSavedShadowDay(merged, { date: '2026-11-07', digest: `${DIGEST} updated` });
  assert.equal(replaced.length, 1);
  assert.match(replaced[0]!.digest, /updated/);
  const clock = shadowClockFromSaved([{ date: '2026-12-01', digest: DIGEST }], '2026-11-07');
  assert.equal(clock.days, 0);
  assert.equal(clock.ready, false);
});
