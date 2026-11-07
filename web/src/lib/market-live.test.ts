/**
 * The market board with saved comps, run against an in-memory KV. It proves a saved ask reaches the
 * band, that an unfittable comp is dropped, and that a night with no ask keeps the sample.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketBoard } from './market/board.ts';
import { liveAsk, indexSnaps, toLiveSnaps } from './market/live.ts';
import { bandSource } from './market/live.ts';

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

const riverComp = (id: string, sleeps: number, distanceMi: number) => ({
  id,
  platform: 'airbnb',
  url: `https://airbnb.com/${id}`,
  label: `Saved ${id}`,
  propertyId: 'river',
  sleeps,
  distanceMi,
  area: 'Sundance',
});

test('a saved comp with an ask sets the band for that night', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([riverComp('c1', 18, 2.4), riverComp('c2', 16, 3.1), riverComp('c3', 20, 1.2)]));
  const from = '2026-12-01';
  // Seed every night in the window, so the whole board is live rather than mixed.
  const dates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 11, 1 + index));
    return date.toISOString().slice(0, 10);
  });
  store.set(
    'priceSnapshots',
    JSON.stringify(
      ['c1', 'c2', 'c3'].flatMap((compId) =>
        dates.map((date) => ({
          compId,
          date,
          nightlyRate: 3000,
          fetchedAt: '2026-11-01T00:00:00.000Z',
          source: 'manual',
        })),
      ),
    ),
  );
  const { loadLiveNights } = await import('../../functions/_lib/pricing-store.ts');
  const live = await loadLiveNights({ SETTINGS: fakeKv(store) } as never, 'river', from, 30);
  assert.equal(live.comps.length, 3);

  const board = buildMarketBoard('river', from, 30, undefined, live);
  const night = board.nights[0]!;
  assert.equal(night.date, from);
  assert.equal(night.source, 'live');
  assert.equal(board.source, 'live');
  assert.equal(board.summary.liveComps, 3);
  assert.equal(board.summary.liveNights, 30);
  // Every saved ask is 3000, so the band is exactly that, and every night's median is the saved ask.
  assert.equal(night.median, 3000);
  assert.ok(night.compRates.every((rate) => rate === 3000));
});

test('a comp without a sleep count or a distance never enters the band', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([
      riverComp('good', 18, 2.4),
      { ...riverComp('noSleeps', 0, 2.4), sleeps: undefined },
      { ...riverComp('noDistance', 18, 0), distanceMi: undefined },
      riverComp('tooFar', 18, 60),
      riverComp('tooSmall', 4, 2),
      { ...riverComp('otherHouse', 18, 2.4), propertyId: 'lindon' },
    ]),
  );
  const { loadLiveNights } = await import('../../functions/_lib/pricing-store.ts');
  const live = await loadLiveNights({ SETTINGS: fakeKv(store) } as never, 'river', '2026-12-01', 30);
  assert.deepEqual(
    live.comps.map((comp) => comp.id),
    ['good'],
  );
});

test('a night no saved comp watched keeps the sample and says so', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([riverComp('c1', 18, 2.4), riverComp('c2', 16, 3.1), riverComp('c3', 20, 1.2)]));
  // Only the first night has saved asks.
  store.set(
    'priceSnapshots',
    JSON.stringify(
      ['c1', 'c2', 'c3'].map((compId) => ({
        compId,
        date: '2026-12-01',
        nightlyRate: 5000,
        fetchedAt: '2026-11-01T00:00:00.000Z',
        source: 'manual',
      })),
    ),
  );
  const { loadLiveNights } = await import('../../functions/_lib/pricing-store.ts');
  const live = await loadLiveNights({ SETTINGS: fakeKv(store) } as never, 'river', '2026-12-01', 30);
  const board = buildMarketBoard('river', '2026-12-01', 30, undefined, live);
  assert.equal(board.nights[0]!.source, 'live');
  assert.equal(board.nights[0]!.median, 5000);
  assert.equal(board.nights[1]!.source, 'sample');
  assert.equal(board.source, 'mixed');
  assert.equal(board.summary.liveNights, 1);
});

test('a saved ask outside the window is not used', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([riverComp('c1', 18, 2.4)]));
  store.set(
    'priceSnapshots',
    JSON.stringify([
      { compId: 'c1', date: '2027-06-01', nightlyRate: 9000, fetchedAt: '2026-11-01T00:00:00.000Z', source: 'manual' },
    ]),
  );
  const { loadLiveNights } = await import('../../functions/_lib/pricing-store.ts');
  const live = await loadLiveNights({ SETTINGS: fakeKv(store) } as never, 'river', '2026-12-01', 30);
  assert.equal(live.comps.length, 1);
  assert.equal(liveAsk(live.index, 'c1', '2026-12-01'), null);
});

test('the overview route serves a live board and a paused read is named', async () => {
  const store: Store = new Map();
  store.set('compSet', JSON.stringify([riverComp('c1', 18, 2.4)]));
  store.set(
    'priceSnapshots',
    JSON.stringify([
      { compId: 'c1', date: '2026-11-07', nightlyRate: 2600, fetchedAt: '2026-11-01T00:00:00.000Z', source: 'manual' },
    ]),
  );
  const route = (await import('../../functions/api/market/overview.ts')) as unknown as Record<string, RouteHandler>;
  const ok = await route.onRequestGet!({
    request: new Request('https://x/api/market/overview?house=river'),
    env: { SETTINGS: fakeKv(store) },
    params: {},
  });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { storageReads: string; nights: Array<{ source: string }>; house: string };
  assert.equal(body.storageReads, 'ok');
  assert.equal(body.house, 'river');
  assert.ok(body.nights.length > 0);

  const paused = await route.onRequestGet!({
    request: new Request('https://x/api/market/overview?house=river'),
    env: { SETTINGS: fakeKv(store, { failReads: true }) },
    params: {},
  });
  assert.equal(paused.status, 200);
  const pausedBody = (await paused.json()) as { storageReads: string; source: string };
  assert.equal(pausedBody.storageReads, 'paused');
  assert.equal(pausedBody.source, 'sample');
});

test('the index keeps a bad month out so a phantom ask cannot move a rate', () => {
  const snaps = toLiveSnaps([
    { compId: 'c1', date: '2026-12-01', nightlyRate: 2400 },
    { compId: 'c1', date: '2026-13-01', nightlyRate: 9900 },
  ]);
  const index = indexSnaps(snaps);
  assert.equal(liveAsk(index, 'c1', '2026-12-01'), 2400);
  assert.equal(liveAsk(index, 'c1', '2026-13-01'), null);
  assert.equal(bandSource(0), 'sample');
});
