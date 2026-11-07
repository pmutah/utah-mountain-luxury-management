/**
 * An unreadable ledger must never render as real money.
 *
 * `/api/portfolio/metrics` used to answer **200 with the seed data** when the KV read failed: 75
 * stand-in stays and 25 stand-in expenses. The `storageReads: 'paused'` flag was set, but no component
 * in the app read it, so a dashboard showing fabricated figures looked exactly like a healthy one.
 *
 * That is the worst shape a bug can take here: the numbers reconcile, the page loads, and the owner
 * believes them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/portfolio/metrics.ts';
import { seedReservations } from '../../functions/_lib/reservations-store.ts';
import { EXPENSES } from '../../functions/_lib/data.ts';

type Handler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const COOKIE = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;

function healthyKv(store: Map<string, string>) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };
}

/** KV that fails the way the live one did: a read-limit error, which becomes StorageReadError. */
const limitedKv = {
  async get() {
    throw new Error('KV GET limit exceeded');
  },
  async put() {},
  async delete() {},
  async list() {
    return { keys: [], list_complete: true };
  },
};

function get(env: unknown) {
  return {
    request: new Request('https://x/api/portfolio/metrics?month=2026-11', { headers: { Cookie: COOKIE } }),
    env,
    params: {},
  };
}

test('an unreadable ledger is refused, not replaced with seed figures', async () => {
  const res = await (onRequestGet as unknown as Handler)(get({ SETTINGS: limitedKv, DASHBOARD_PASSWORD: 'pw' }));
  assert.equal(res.status, 503, 'a paused read answered 200, so a stand-in rendered as real money');

  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.storageReads, 'paused');
  assert.match(String(body.error), /could not be read/);
  assert.match(String(body.error), /Nothing was written over them/);

  // The decisive check: none of the fabricated figures may appear.
  for (const key of ['reservations', 'expenses', 'ranch', 'lindon', 'river', 'totalRevenue', 'totalProfit']) {
    assert.equal(key in body, false, `a paused read still returned "${key}"`);
  }
});

test('the seed set is exactly what the old answer would have shown', () => {
  // Keeping the numbers here documents the bug: these are what the route used to present as the books.
  assert.equal(seedReservations().length, 75);
  assert.equal(EXPENSES.length, 25);
});

test('a limit failure while reading the cleaning fees is refused, not defaulted', async () => {
  /*
   * `loadExtraCleaningFees` used to swallow every error and return the defaults, so a store at its
   * read limit quietly reverted the fees. The page showed cleaning costs that were not the saved ones,
   * with no flag set. It now raises on a limit failure, so this route refuses instead.
   */
  const { loadExtraCleaningFees } = await import('../../functions/_lib/kv.ts');
  const limited = {
    SETTINGS: {
      async get() {
        throw new Error('KV GET limit exceeded');
      },
    },
  };
  await assert.rejects(
    () => loadExtraCleaningFees(limited as never),
    /could not be read|Storage reads are paused/i,
    'a limit failure returned the default fees instead of raising',
  );

  // A malformed value is a data problem, not a pause: the defaults are the safe answer there.
  const malformed = {
    SETTINGS: {
      async get() {
        return 'not json';
      },
    },
  };
  const fees = await loadExtraCleaningFees(malformed as never);
  assert.ok(typeof fees === 'object');
});

test('a healthy read still answers with the real figures and says it read the store', async () => {
  const store = new Map<string, string>();
  store.set(
    'reservations',
    JSON.stringify([
      {
        id: 'test-live-1',
        guestName: 'Real Guest',
        propertyId: 'ranch',
        checkIn: '2026-11-10',
        checkOut: '2026-11-13',
        payout: 2400,
        source: 'Airbnb',
        status: 'confirmed',
      },
    ]),
  );
  store.set(
    'customExpenses',
    JSON.stringify([
      { id: 'test-exp-1', month: '2026-11', propertyId: 'ranch', category: 'Repair', amount: 100 },
    ]),
  );

  const res = await (onRequestGet as unknown as Handler)(get({ SETTINGS: healthyKv(store), DASHBOARD_PASSWORD: 'pw' }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    storageReads: string;
    ranch: { revenue: number };
    reservations: Array<{ id: string }>;
    expenses: Array<{ id: string }>;
  };
  assert.equal(body.storageReads, 'ok');
  assert.ok(body.ranch.revenue > 0, 'a healthy read returned no revenue');
  // The real row is there, and the seed set is not.
  assert.ok(body.reservations.some((row) => row.id === 'test-live-1'));
  assert.equal(body.reservations.some((row) => row.id === 'r-mtg-2026-01'), false);
});
