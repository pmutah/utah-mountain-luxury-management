/**
 * No route reads the same store key more than once in one request.
 *
 * Production hit its daily KV read limit on 2026-11-07, so a redundant read is not a style problem:
 * it is the difference between the dashboard working and refusing. `/api/expenses` read
 * `customExpenses` **three times** for one request, because the route calls `mergeAllExpenses` and
 * `loadCustomExpenses` and both read the same key. Through the request cache it is one.
 *
 * This walks the routes that touch the ledger and counts real `SETTINGS.get` calls, so a route that
 * starts double-reading fails here rather than at the KV limit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type Handler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const COOKIE = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;

function countingStore() {
  const reads: string[] = [];
  const store = new Map<string, string>();
  store.set(
    'customExpenses',
    JSON.stringify([{ id: 'e1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 100 }]),
  );
  store.set('reservations', JSON.stringify([]));
  return {
    reads,
    kv: {
      async get(key: string) {
        reads.push(key);
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {},
      async list() {
        return { keys: [], list_complete: true };
      },
    },
  };
}

/** The ledger routes, with the path each expects. */
const ROUTES: Array<[string, string, string]> = [
  ['/api/expenses', 'expenses/index.ts', 'GET'],
  ['/api/reservations', 'reservations/index.ts', 'GET'],
  ['/api/portfolio/metrics?month=2026-11&compare=1', 'portfolio/metrics.ts', 'GET'],
  ['/api/portfolio/history?end=2026-11&count=12', 'portfolio/history.ts', 'GET'],
  ['/api/book/requests', 'book/requests.ts', 'GET'],
  ['/api/market/overview?house=river', 'market/overview.ts', 'GET'],
  ['/api/pricing/snapshots?house=river', 'pricing/snapshots.ts', 'GET'],
];

for (const [path, file, method] of ROUTES) {
  test(`${path} reads each store key at most once`, async () => {
    const mod = (await import(`../../functions/api/${file}`)) as Record<string, unknown>;
    const handler = mod[method === 'GET' ? 'onRequestGet' : 'onRequestPost'] as Handler | undefined;
    assert.ok(handler, `${file} has no ${method} handler`);

    const { reads, kv } = countingStore();
    // A fresh env per request, which is what Cloudflare gives: the cache cannot carry over.
    const env = { SETTINGS: kv, DASHBOARD_PASSWORD: 'pw' };
    await handler({
      request: new Request(`https://x${path}`, { headers: { Cookie: COOKIE, Accept: 'application/json' } }),
      env,
      params: { token: 'a'.repeat(32), house: 'river' },
    });

    const counts = new Map<string, number>();
    for (const key of reads) counts.set(key, (counts.get(key) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, n]) => n > 1);
    assert.deepEqual(
      repeated,
      [],
      `${path} reads a key more than once in one request (${repeated.map(([k, n]) => `${k} x${n}`).join(', ')}). Every repeated read is another count against the daily KV limit.`,
    );
  });
}

test('a save clears the cached value, so a read after a write is not stale', async () => {
  /*
   * The cache lives on the per-request env, which is safe because Cloudflare makes a fresh one per
   * request. The risk inside one request is a read that follows its own save: that must see the new
   * value, not the one cached before it.
   */
  const { cachedGet, forgetCached, readStats } = await import('../../functions/_lib/request-cache.ts');
  const env: Record<string, unknown> = {};
  let stored = 'first';

  const load = () => cachedGet(env, async () => stored, 'kv:test');
  assert.equal(await load(), 'first');
  assert.equal(await load(), 'first');
  assert.equal(readStats(env).hits, 1);

  stored = 'second';
  // Without a save, the cache holds the first value, which is what it is for.
  assert.equal(await load(), 'first');

  forgetCached(env, 'kv:test');
  assert.equal(await load(), 'second');
});

test('a failed read is not cached, so a retry in the same request can succeed', async () => {
  const { cachedGet } = await import('../../functions/_lib/request-cache.ts');
  const env: Record<string, unknown> = {};
  let attempt = 0;
  const load = () =>
    cachedGet(
      env,
      async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('transient');
        return 'ok';
      },
      'kv:flaky',
    );

  await assert.rejects(() => load(), /transient/);
  assert.equal(await load(), 'ok', 'a failed read was cached, so the retry replayed the failure');
});

test('the cache cannot leak between requests', async () => {
  const { cachedGet } = await import('../../functions/_lib/request-cache.ts');
  let stored = 'request one';
  const first: Record<string, unknown> = {};
  assert.equal(await cachedGet(first, async () => stored, 'kv:x'), 'request one');
  // A second request gets its own env, which is what Cloudflare provides.
  stored = 'request two';
  const second: Record<string, unknown> = {};
  assert.equal(await cachedGet(second, async () => stored, 'kv:x'), 'request two');
});
