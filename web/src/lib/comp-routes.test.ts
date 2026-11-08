/**
 * The comp-set and snapshot routes against an in-memory KV. It proves a saved comp reaches the
 * cards, that a comp without a sleep count or a distance is refused, and that a paused read is named.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;
const ENV_PASS = { DASHBOARD_PASSWORD: PASSWORD };

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

async function routes() {
  const compSet = (await import('../../functions/api/pricing/comp-set.ts')) as unknown as Record<string, RouteHandler>;
  const snaps = (await import('../../functions/api/pricing/snapshots.ts')) as unknown as Record<string, RouteHandler>;
  return { compSet, snaps };
}

function post(body: unknown) {
  return new Request('https://x/api/pricing/comp-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(body),
  });
}

function get(url: string) {
  return new Request(url, { headers: { Cookie: COOKIE } });
}

test('a comp must name a house, because a house-less comp sets no band', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), ...ENV_PASS };
  const { compSet } = await routes();

  const refused = await compSet.onRequestPost!({
    request: post({
      platform: 'airbnb',
      url: 'https://airbnb.com/rooms/9',
      label: 'No house',
      sleeps: 18,
      distanceMi: 2,
    }),
    env,
    params: {},
  });
  assert.equal(refused.status, 400, 'a comp with no house used to be counted for every house');
  assert.equal(store.has('compSet'), false, 'a refused save wrote something');

  const bogus = await compSet.onRequestPost!({
    request: post({
      platform: 'airbnb',
      url: 'https://airbnb.com/rooms/9',
      label: 'Bogus house',
      propertyId: 'all',
      sleeps: 18,
      distanceMi: 2,
    }),
    env,
    params: {},
  });
  assert.equal(bogus.status, 400, 'a house value that is not a house has to be refused');

  const river = await compSet.onRequestPost!({
    request: post({
      platform: 'airbnb',
      url: 'https://airbnb.com/rooms/9',
      label: 'River lodge',
      propertyId: 'river',
      sleeps: 18,
      distanceMi: 2,
    }),
    env,
    params: {},
  });
  assert.equal(river.status, 201, 'a comp that does name its house still saves');
});

test('a comp without a sleep count or a distance is refused', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), ...ENV_PASS };
  const { compSet } = await routes();
  const noUrl = await compSet.onRequestPost!({
    request: post({ platform: 'airbnb', label: 'X', sleeps: 16, distanceMi: 2 }),
    env,
    params: {},
  });
  assert.equal(noUrl.status, 400);
  const noLabel = await compSet.onRequestPost!({
    request: post({ platform: 'airbnb', url: 'https://airbnb.com/x', sleeps: 16, distanceMi: 2 }),
    env,
    params: {},
  });
  assert.equal(noLabel.status, 400);
  const badPlatform = await compSet.onRequestPost!({
    request: post({ platform: 'booking', url: 'https://airbnb.com/x', label: 'X' }),
    env,
    params: {},
  });
  assert.equal(badPlatform.status, 400);
  // A refused save writes nothing.
  assert.equal(store.has('compSet'), false);
});

test('a saved comp keeps its sleep count and distance and reads back as a card', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), ...ENV_PASS };
  const { compSet, snaps } = await routes();
  const created = await compSet.onRequestPost!({
    request: post({
      platform: 'airbnb',
      url: 'https://airbnb.com/rooms/1',
      label: 'Sundance lodge',
      sleeps: 18,
      distanceMi: 2.4,
      area: 'Sundance',
      propertyId: 'river',
    }),
    env,
    params: {},
  });
  assert.equal(created.status, 201);
  const saved = (await created.json()) as { id: string; label: string; sleeps: number; distanceMi: number };
  assert.equal(saved.sleeps, 18);
  assert.equal(saved.distanceMi, 2.4);

  const read = await snaps.onRequestGet!({
    request: get('https://x/api/pricing/snapshots?house=river'),
    env,
    params: {},
  });
  assert.equal(read.status, 200);
  const body = (await read.json()) as {
    liveComps: Array<{ id: string; sleeps: number; distanceMi: number; area: string }>;
    snaps: unknown[];
    storageReads: string;
  };
  assert.equal(body.storageReads, 'ok');
  assert.equal(body.liveComps.length, 1);
  assert.equal(body.liveComps[0]!.sleeps, 18);
  assert.equal(body.liveComps[0]!.area, 'Sundance');
  assert.deepEqual(body.snaps, []);
});

test('a comp saved for another house stays out of this house read', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([
      { id: 'r1', platform: 'airbnb', url: 'https://a/1', label: 'River one', propertyId: 'river', sleeps: 18, distanceMi: 2 },
      { id: 'l1', platform: 'airbnb', url: 'https://a/2', label: 'Lindon one', propertyId: 'lindon', sleeps: 10, distanceMi: 3 },
      { id: 'b1', platform: 'airbnb', url: 'https://a/3', label: 'Both', propertyId: 'both', sleeps: 16, distanceMi: 4 },
    ]),
  );
  const env = { SETTINGS: fakeKv(store), ...ENV_PASS };
  const { snaps } = await routes();
  const river = await snaps.onRequestGet!({
    request: get('https://x/api/pricing/snapshots?house=river'),
    env,
    params: {},
  });
  const body = (await river.json()) as { liveComps: Array<{ id: string }> };
  assert.deepEqual(
    body.liveComps.map((comp) => comp.id).sort(),
    ['b1', 'r1'],
  );
});

test('a saved ask is returned with its comp and a paused read is named', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([{ id: 'r1', platform: 'airbnb', url: 'https://a/1', label: 'River one', propertyId: 'river', sleeps: 18, distanceMi: 2 }]),
  );
  store.set(
    'priceSnapshots',
    JSON.stringify([
      { compId: 'r1', date: '2026-12-01', nightlyRate: 2400, fetchedAt: '2026-11-01T00:00:00.000Z', source: 'manual' },
      { compId: 'gone', date: '2026-12-01', nightlyRate: 9999, fetchedAt: '2026-11-01T00:00:00.000Z', source: 'manual' },
    ]),
  );
  const { snaps } = await routes();
  const ok = await snaps.onRequestGet!({
    request: get('https://x/api/pricing/snapshots?house=river'),
    env: { SETTINGS: fakeKv(store), ...ENV_PASS },
    params: {},
  });
  const body = (await ok.json()) as { snaps: Array<{ compId: string; nightlyRate: number }> };
  assert.equal(body.snaps.length, 1);
  assert.equal(body.snaps[0]!.compId, 'r1');
  assert.equal(body.snaps[0]!.nightlyRate, 2400);

  const paused = await snaps.onRequestGet!({
    request: get('https://x/api/pricing/snapshots?house=river'),
    env: { SETTINGS: fakeKv(store, { failReads: true }), ...ENV_PASS },
    params: {},
  });
  assert.equal(paused.status, 503);
  const pausedBody = (await paused.json()) as { liveComps: unknown; storageReads: string };
  assert.equal(pausedBody.liveComps, null);
  assert.equal(pausedBody.storageReads, 'paused');
});

test('recording an ask needs the host and a real comp', async () => {
  const store: Store = new Map();
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { snaps } = await routes();
  const open = await snaps.onRequestPost!({
    request: new Request('https://x/api/pricing/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compId: 'c1', asks: [{ date: '2026-12-01', nightlyRate: 2000 }] }),
    }),
    env,
    params: {},
  });
  assert.equal(open.status, 401);

  const wrongComp = await snaps.onRequestPost!({
    request: new Request('https://x/api/pricing/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({ compId: 'not-saved', asks: [{ date: '2026-12-01', nightlyRate: 2000 }] }),
    }),
    env,
    params: {},
  });
  assert.equal(wrongComp.status, 404, 'an ask attached itself to a comp that is not saved');
});

test('a bad night refuses the whole save rather than half-saving it', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { snaps } = await routes();
  const res = await snaps.onRequestPost!({
    request: new Request('https://x/api/pricing/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({
        compId: 'c1',
        asks: [
          { date: '2026-12-01', nightlyRate: 2000 },
          { date: '2026-13-01', nightlyRate: 2100 },
        ],
      }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 400);
  assert.equal(store.get('priceSnapshots'), undefined, 'a refused save wrote some rows');
});

test('a recorded ask activates the live band', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([
    { id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 },
    { id: 'c2', platform: 'airbnb', url: 'https://a/2', label: 'Two', propertyId: 'river', sleeps: 18, distanceMi: 3 },
    { id: 'c3', platform: 'airbnb', url: 'https://a/3', label: 'Three', propertyId: 'river', sleeps: 18, distanceMi: 4 },
  ]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { snaps } = await routes();
  const dates = ['2026-12-01', '2026-12-02'];
  for (const compId of ['c1', 'c2', 'c3']) {
    const res = await snaps.onRequestPost!({
      request: new Request('https://x/api/pricing/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
        body: JSON.stringify({ compId, asks: dates.map((date) => ({ date, nightlyRate: 2500 })) }),
      }),
      env,
      params: {},
    });
    assert.equal(res.status, 201);
  }
  const { loadLiveNights } = await import('../../functions/_lib/pricing-store.ts');
  const live = await loadLiveNights({ SETTINGS: fakeKv(store) } as never, 'river', '2026-12-01', 3);
  assert.equal(live.comps.length, 3);
  assert.equal(live.index.size, 3, 'the recorded asks did not reach the band input');
  const { buildMarketBoard } = await import('./market/board.ts');
  const board = buildMarketBoard('river', '2026-12-01', 3, undefined, live);
  assert.equal(board.nights[0]!.source, 'live', 'a recorded ask did not activate the live band');
  assert.equal(board.nights[0]!.median, 2500);
});

test('a run of nights saves in one call and covers every night in it', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { snaps } = await routes();
  const { eachNight } = await import('./market/dates.ts');
  const run = eachNight('2026-12-01', 14);
  const res = await snaps.onRequestPost!({
    request: new Request('https://x/api/pricing/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({ compId: 'c1', asks: run.map((date) => ({ date, nightlyRate: 2400 })) }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, saved: 14, compId: 'c1' });
  const { loadPriceSnapshots } = await import('../../functions/_lib/pricing-store.ts');
  const saved = await loadPriceSnapshots({ SETTINGS: fakeKv(store) });
  assert.equal(saved.length, 14, 'a run of nights did not save every night');
  assert.deepEqual(
    saved.map((snap) => snap.date),
    run,
    'the saved nights are not the run that was sent',
  );
});

test('a run longer than the cap is refused whole', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]));
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };
  const { snaps } = await routes();
  const { MAX_ASK_NIGHTS } = await import('./market/live.ts');
  const { eachNight } = await import('./market/dates.ts');
  const tooMany = eachNight('2026-12-01', MAX_ASK_NIGHTS + 1);
  const res = await snaps.onRequestPost!({
    request: new Request('https://x/api/pricing/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      body: JSON.stringify({ compId: 'c1', asks: tooMany.map((date) => ({ date, nightlyRate: 2400 })) }),
    }),
    env,
    params: {},
  });
  assert.equal(res.status, 400);
  assert.equal(store.get('priceSnapshots'), undefined, 'an overlong save wrote some nights');
});
