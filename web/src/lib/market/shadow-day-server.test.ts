import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../../functions/api/pricing/push-plan.ts';

/*
 * **The seven-day gate only advanced on a page nobody was told to open.**
 *
 * `#/agents` and `#/market` recorded a shadow day; `#/overview` — the page the dashboard lands on, and the one
 * anyone checks daily — recorded nothing. Verified on production: a full overview visit left the clock at 1 of 7 and
 * saved no day. So the gate that decides whether auto-pricing may ever act was waiting on a habit the host had never
 * been asked to form.
 *
 * The fix puts the write on the server, in `push-plan`, because that route already loads all three live boards, the
 * stays, the blocks, and the pace. The overview now calls it, so checking the dashboard counts.
 *
 * These tests hold the two rules that matter: a day is only saved when all three houses gave a real board, and a
 * day saved by this call is usable immediately rather than on the next visit.
 */

type Store = Map<string, string>;

function fakeKv(store: Store, opts: { failWrites?: boolean } = {}) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      if (opts.failWrites) throw new Error('KV PUT limit exceeded');
      store.set(key, value);
    },
  };
}

type RouteContext = { request: Request; env: unknown; params: Record<string, string> };

/**
 * The bot bearer, which `hostOnly` accepts. The route is host-guarded on purpose and these tests must not weaken
 * that — they authenticate, they do not bypass.
 */
const SECRET = 'test-bot-secret';

function call(store: Store, opts: { failWrites?: boolean; auth?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${SECRET}`;
  return (onRequestGet as unknown as (ctx: RouteContext) => Promise<Response>)({
    request: new Request('https://x/api/pricing/push-plan?days=30', { headers }),
    env: { SETTINGS: fakeKv(store, opts), MUSE_BOT_SECRET: SECRET },
    params: {},
  });
}

const comp = (id: string, sleeps: number) => ({
  id,
  platform: 'airbnb',
  url: `https://airbnb.com/${id}`,
  label: `Saved ${id}`,
  propertyId: 'lindon',
  sleeps,
  distanceMi: 2,
  area: 'Lindon',
});

function seedComps(store: Store) {
  /*
   * All three houses need a saved comp, because a day only counts when every house gave a real board. Seeding one
   * house and expecting a count is exactly the mistake this helper first made.
   */
  const all = [
    ...['c1', 'c2', 'c3'].map((id) => ({ ...comp(id, 10), propertyId: 'lindon' })),
    ...['r1', 'r2', 'r3'].map((id) => ({ ...comp(id, 18), propertyId: 'ranch', area: 'Lindon' })),
    ...['v1', 'v2', 'v3'].map((id) => ({ ...comp(id, 18), propertyId: 'river', area: 'Sundance' })),
  ];
  store.set('compSet', JSON.stringify(all));
}


test('a plan read saves the day when no house falls back to the sample set', async () => {
  /*
   * The saved digest has to name its own source, because a day built from invented comps still counted toward the
   * gate once — the worst version of that bug. This asserts the refusal is on the *text*, so it cannot be talked
   * around by a caller passing the wrong flag.
   */
  const store: Store = new Map();
  seedComps(store);
  const res = await call(store);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { shadowDays: { days: number; recordedToday: boolean } };
  assert.ok(body.shadowDays, 'the response dropped the shadow clock');
  assert.equal(body.shadowDays.recordedToday, true, 'this call did not record the day it had the boards for');
  const stored = JSON.parse(store.get('shadowDays') ?? '[]') as Array<{ date: string; digest: string }>;
  assert.equal(stored.length, 1, 'no day reached the store');
  assert.match(stored[0]!.digest, /Nothing sent to Hospitable\./, 'the stored digest is not a shadow digest');
  assert.equal(/sample comps/.test(stored[0]!.digest), false, 'a sample-based day was stored');
  assert.match(stored[0]!.digest, /saved comps?/, 'a counted day never said it saw saved comps');
  assert.equal(body.shadowDays.days, 1, 'the clock did not count the day this call just saved');
});

test('a house with no saved comps does not get counted', async () => {
  /*
   * With an empty comp set every board is the sample set, so the digest says "sample comps" and no day may be saved.
   * The clock must stay where it is and the response must not claim a day landed.
   */
  const store: Store = new Map();
  const res = await call(store);
  const body = (await res.json()) as { shadowDays: { days: number; recordedToday: boolean } };
  assert.equal(body.shadowDays.recordedToday, false, 'a sample-only day was counted toward the gate');
  const saved = store.get('shadowDays');
  assert.equal(saved, undefined, 'a sample-only day reached the store');
});

test('a failed write leaves the clock alone and does not claim the day', async () => {
  /*
   * The store is the only durable record. A failed write used to be indistinguishable from a saved one in some
   * paths, which is how a host could be told a day was counted when nothing was.
   */
  const store: Store = new Map();
  seedComps(store);
  const res = await call(store, { failWrites: true });
  const body = (await res.json()) as { shadowDays: { recordedToday: boolean; days: number } };
  assert.equal(body.shadowDays.recordedToday, false, 'a failed write reported a saved day');
  assert.equal(store.get('shadowDays'), undefined, 'nothing should have been stored');
});

test('repeat reads in the same day do not double count', async () => {
  /*
   * The overview may call this on every mount. A day is a day: seven visits on one date must not open the gate.
   */
  const store: Store = new Map();
  seedComps(store);
  await call(store);
  const first = JSON.parse(store.get('shadowDays') ?? '[]') as Array<{ date: string }>;
  await call(store);
  await call(store);
  const after = JSON.parse(store.get('shadowDays') ?? '[]') as Array<{ date: string }>;
  assert.equal(after.length, first.length, 'a repeat visit added another day');
  assert.equal(new Set(after.map((row) => row.date)).size, after.length, 'the log holds a duplicate date');
});


