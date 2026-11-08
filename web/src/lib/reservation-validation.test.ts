/**
 * A stay that cannot be used must not be saved.
 *
 * The store wrote whatever it was handed. Production ended up holding a stay with no house and no
 * dates — `res-1790218847843-tei46q`, `source: "Direct"`, everything else `undefined`. It is filtered
 * out of every calendar, so it was invisible, but it still sat in the saved list and counted toward the
 * total, and a stay with no house produces a turnover cleaning expense for no house.
 *
 * The check lives in `createReservation` because the accept route, the reservations API, and the
 * direct-request path all write through it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createReservation } from '../../functions/_lib/reservations-store.ts';

function memoryEnv() {
  const store: Record<string, string> = {};
  return {
    store,
    env: {
      SETTINGS: {
        get: async (key: string) => store[key] ?? null,
        put: async (key: string, value: string) => {
          store[key] = value;
        },
      },
    } as never,
  };
}

const GOOD = {
  propertyId: 'ranch',
  checkIn: '2026-12-01',
  checkOut: '2026-12-03',
  guestName: 'Ada',
  payout: 500,
  source: 'Direct',
} as const;

test('a stay with no house is refused', async () => {
  const { env, store } = memoryEnv();
  await assert.rejects(
    () => createReservation(env, { ...GOOD, propertyId: undefined } as never),
    /needs a real house/,
    'a stay with no house was saved',
  );
  assert.equal(store.reservations, undefined, 'a refused stay still wrote a row');
});

test('a stay with no dates, or the word "undefined", is refused', async () => {
  /*
   * The broken row on production had `undefined` in the fields — and `typeof undefined === 'string'` is
   * false, so the old read filter let it through only because both fields were the *string* "undefined"
   * somewhere upstream. Either shape is refused now.
   */
  for (const bad of [
    { checkIn: undefined, checkOut: undefined },
    { checkIn: 'undefined', checkOut: 'undefined' },
    { checkIn: '2026-13-01', checkOut: '2026-13-05' },
    { checkIn: '2026-11-31', checkOut: '2026-12-02' },
  ]) {
    const { env, store } = memoryEnv();
    await assert.rejects(
      () => createReservation(env, { ...GOOD, ...bad } as never),
      /real check-in and check-out/,
      `a stay with ${JSON.stringify(bad)} was saved`,
    );
    assert.equal(store.reservations, undefined);
  }
});

test('a stay that checks out before it checks in is refused', async () => {
  const { env } = memoryEnv();
  await assert.rejects(
    () => createReservation(env, { ...GOOD, checkIn: '2026-12-05', checkOut: '2026-12-01' } as never),
    /check out after it checks in/,
  );
});

test('a real stay still saves', async () => {
  // The guard must not block the working path: the accept route and the API both save real stays.
  const { env, store } = memoryEnv();
  const saved = await createReservation(env, GOOD as never);
  assert.equal(saved.propertyId, 'ranch');
  const rows = JSON.parse(store.reservations ?? '[]') as unknown[];
  assert.equal(rows.length, 1, 'the valid stay was not written');
});

test('every house is accepted, and nothing else is', async () => {
  for (const house of ['ranch', 'lindon', 'river']) {
    const { env } = memoryEnv();
    await assert.doesNotReject(() => createReservation(env, { ...GOOD, propertyId: house } as never));
  }
  for (const bogus of ['garage', 'RANCH', '', 'both']) {
    const { env } = memoryEnv();
    await assert.rejects(
      () => createReservation(env, { ...GOOD, propertyId: bogus } as never),
      /needs a real house/,
      `"${bogus}" was accepted as a house`,
    );
  }
});
