import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestPost } from '../../../functions/api/clean/progress.ts';
import { readFileSync } from 'node:fs';
import { keepDone, stepIds } from '../clean-progress.ts';

/*
 * **The host's own checkboxes changed nothing.**
 *
 * The desk's boxes wrote to `sessionStorage`. The count and the line beside them both read the server. So a host
 * ticking a step saw `0 of 7` before the click and `0 of 7` after it — measured on production — and the box was
 * decorative.
 *
 * Teaching the desk to read two stores would have papered over it. The desk now **writes to the store the cleaner
 * writes to**, so a host's click and a cleaner's phone cannot hold different truths about the same house on the same
 * day. The validation is the same rule on both sides: only a turn that is on the list, and only the ids that turn has.
 */

const SECRET = 'test-bot-secret';
const HOUSE = 'lindon' as const;

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

type Ctx = { request: Request; env: unknown; params: Record<string, string> };

function post(store: Store, body: unknown, opts: { auth?: boolean } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth !== false) headers.Authorization = `Bearer ${SECRET}`;
  return (onRequestPost as unknown as (ctx: Ctx) => Promise<Response>)({
    request: new Request('https://x/api/clean/progress', { method: 'POST', headers, body: JSON.stringify(body) }),
    env: { SETTINGS: fakeKv(store), MUSE_BOT_SECRET: SECRET },
    params: {},
  });
}

function get(store: Store) {
  return (onRequestGet as unknown as (ctx: Ctx) => Promise<Response>)({
    request: new Request('https://x/api/clean/progress', { headers: { Authorization: `Bearer ${SECRET}` } }),
    env: { SETTINGS: fakeKv(store), MUSE_BOT_SECRET: SECRET },
    params: {},
  });
}

test('the host route is guarded and refuses without a session', async () => {
  const store: Store = new Map();
  const res = await post(store, { house: HOUSE, checkout: '2026-11-22', done: ['beds'] }, { auth: false });
  assert.equal(res.status, 401, 'a host write was accepted without a session');
});

test('a malformed body is refused rather than half-saved', async () => {
  const store: Store = new Map();
  assert.equal((await post(store, { house: HOUSE, done: 'beds' })).status, 400);
  assert.equal((await post(store, { house: 'nowhere', checkout: '2026-11-22', done: [] })).status, 400);
  assert.equal(store.get('cleanProgress'), undefined, 'a refused body still wrote');
});

test('a turnover that is not on the list is refused, so a stale tab cannot invent one', async () => {
  /*
   * The same rule the cleaner's route applies. A browser holding an old turn list must not be able to write a tick
   * for a house on a day that no longer has a turnover.
   */
  const store: Store = new Map();
  const res = await post(store, { house: HOUSE, checkout: '1999-01-01', done: ['beds'] });
  assert.equal(res.status, 404, 'a made-up turnover was accepted');
  assert.equal(store.get('cleanProgress'), undefined, 'a refused turnover still wrote');
});

test('the host write and the cleaner write use one validation rule', () => {
  /*
   * The defect was two surfaces with two stores. This checks that the host route calls the same `keepDone` filter the
   * cleaner route does, rather than re-implementing a looser one.
   */
  const route = readFileSync(new URL('../../../functions/api/clean/progress.ts', import.meta.url), 'utf8');
  assert.match(route, /keepDone\(house, checkout, sameDay, body\.done\)/, 'the host write no longer uses the shared rule');
  assert.match(route, /putProgress\(env, next\)/, 'the host write does not persist through the shared store');
});

test('the desk writes to the server, not only to this browser', () => {
  const desk = readFileSync(new URL('../../components/CleanDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /api\s*\.\s*saveCleanProgress\(/, 'the desk still writes only to sessionStorage');
  assert.match(desk, /cleanProgress === null[\s\S]{0,200}jobDoneCount\(job\.steps, checks/, 'the local fallback is not confined to a failed read');
});

test('a tick built from the step ids survives the shared filter', () => {
  // The arithmetic both writers depend on, pinned once here so a change to it cannot pass unnoticed.
  const ids = stepIds(true);
  const kept = keepDone(HOUSE, '2026-11-22', true, ids);
  assert.ok(kept);
  assert.deepEqual(kept!.done, [...ids].sort());
});
