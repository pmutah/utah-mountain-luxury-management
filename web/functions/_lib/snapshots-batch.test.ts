import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost } from '../api/pricing/snapshots.ts';

/*
 * Cloudflare KV allows one write per key per second. The ask route used to loop `addPriceSnapshot`,
 * which is a read-modify-write of `priceSnapshots` per night, so a five-night run wrote the same key
 * five times inside a second, the later writes failed, and the route answered 503 `saved: 1`. It
 * half-saved a run while its own error message promised that nothing was written.
 *
 * These tests count the writes, because the defect was the number of them.
 */

const PASSWORD = 'test-password';
const COOKIE = `wpm_auth=${btoa(`wpm:${PASSWORD}`).replace(/=+$/, '')}`;

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failPutAfter?: number } = {}) {
  let puts = 0;
  return {
    /** Every put this request made, so a test can assert the count rather than the shape. */
    get putCount() {
      return puts;
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      puts += 1;
      if (opts.failPutAfter !== undefined && puts > opts.failPutAfter) {
        throw new Error('KV PUT limit exceeded');
      }
      store.set(key, value);
    },
  };
}

function eachNight(from: string, count: number): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; i < count; i += 1) {
    out.push(new Date(Date.UTC(y!, m! - 1, d! + i)).toISOString().slice(0, 10));
  }
  return out;
}

function request(compId: string, asks: Array<{ date: string; nightlyRate: number }>) {
  return new Request('https://x/api/pricing/snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ compId, asks }),
  });
}

test('a five-night run is saved in one write, not one per night', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]),
  );
  const kv = fakeKv(store);
  const res = await onRequestPost!({
    request: request('c1', eachNight('2026-12-01', 5).map((date) => ({ date, nightlyRate: 2400 }))),
    env: { SETTINGS: kv, DASHBOARD_PASSWORD: PASSWORD },
    params: {},
  } as never);

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, saved: 5, compId: 'c1' });
  assert.equal(
    kv.putCount,
    1,
    `the run made ${kv.putCount} writes; KV allows one write per key per second, so a second write inside the same save is how the run half-saved`,
  );

  const saved = JSON.parse(store.get('priceSnapshots')!) as Array<{ date: string }>;
  assert.equal(saved.length, 5, 'the run did not save every night');
});

test('recording the same night again replaces its ask instead of duplicating it', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]),
  );
  const env = { SETTINGS: fakeKv(store), DASHBOARD_PASSWORD: PASSWORD };

  await onRequestPost!({
    request: request('c1', [{ date: '2026-12-01', nightlyRate: 2000 }]),
    env,
    params: {},
  } as never);
  await onRequestPost!({
    request: request('c1', [{ date: '2026-12-01', nightlyRate: 2600 }]),
    env,
    params: {},
  } as never);

  const saved = JSON.parse(store.get('priceSnapshots')!) as Array<{ date: string; nightlyRate: number }>;
  assert.equal(saved.length, 1, 'the same night stacked a second row instead of correcting the first');
  assert.equal(saved[0]!.nightlyRate, 2600);
});

test('a write that fails saves nothing and says so', async () => {
  const store: Store = new Map();
  store.set(
    'compSet',
    JSON.stringify([{ id: 'c1', platform: 'airbnb', url: 'https://a/1', label: 'One', propertyId: 'river', sleeps: 18, distanceMi: 2 }]),
  );
  // Fails the very first put, which is now the only one.
  const env = { SETTINGS: fakeKv(store, { failPutAfter: 0 }), DASHBOARD_PASSWORD: PASSWORD };
  const res = await onRequestPost!({
    request: request('c1', eachNight('2026-12-01', 5).map((date) => ({ date, nightlyRate: 2400 }))),
    env,
    params: {},
  } as never);

  assert.equal(res.status, 503);
  const body = (await res.json()) as { saved: number };
  assert.equal(body.saved, 0, 'a failed save reported nights as saved');
  assert.equal(store.get('priceSnapshots'), undefined, 'a failed save wrote a partial run');
});
