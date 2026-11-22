/**
 * A sync that saves bookings and then reports failure is worse than one that fails cleanly.
 *
 * `syncReservationsFromIcal` writes the stays first and derives the turnover cleaning expenses after.
 * When the cleaning write throws — a KV limit, a shrink refusal — the whole function used to throw,
 * *after* the bookings had already landed. Called from the background refresh wired in the previous
 * change, that rejection is caught and discarded, so the calendar would quietly change and nothing
 * would say so. The cleaning rows are derived from the stays, so their failure must not turn a saved
 * sync into an apparent no-op.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { syncReservationsFromIcal } from '../../functions/_lib/ical-reservation-sync.ts';

const EVENT = {
  uid: 'uid-1',
  propertyId: 'river',
  start: '2027-12-01',
  end: '2027-12-04',
  summary: 'Reserved - Ada Lovelace',
  description: '',
} as never;

/**
 * A KV where the reservation writes succeed and one chosen key fails on write. That is the shape of
 * a deployment at its limit partway through a sync.
 */
function envWherePutFailsOn(failKey: string, store: Record<string, string> = {}) {
  return {
    store,
    env: {
      SETTINGS: {
        get: async (key: string) => store[key] ?? null,
        put: async (key: string, value: string) => {
          if (key === failKey) throw new Error(`KV PUT failed on ${key}`);
          store[key] = value;
        },
      },
    } as never,
  };
}

test('the stays are saved even when the cleaning rows cannot be', async () => {
  const { env, store } = envWherePutFailsOn('customExpenses');
  const result = await syncReservationsFromIcal(env, [EVENT]);

  assert.equal(result.created, 1, 'the stay was not created');
  assert.equal(result.cleaningExpenses, 0);
  assert.ok(result.cleaningError, 'the cleaning failure was not reported at all');
  assert.match(result.cleaningError!, /customExpenses|KV PUT failed/);

  const saved = JSON.parse(store.reservations ?? '[]') as unknown[];
  assert.equal(saved.length, 1, 'the booking was not actually saved');
});

test('a cleaning failure does not throw out of the sync', async () => {
  /*
   * This is the specific harm: the background refresh catches every rejection and discards it, so a
   * throw here means a calendar that changed with no report anywhere.
   */
  const { env } = envWherePutFailsOn('customExpenses');
  let threw = false;
  try {
    await syncReservationsFromIcal(env, [EVENT]);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'the sync threw after saving its bookings');
});

test('a normal sync reports no cleaning error', async () => {
  const { env } = envWherePutFailsOn('__never__');
  const result = await syncReservationsFromIcal(env, [EVENT]);
  assert.equal(result.created, 1);
  assert.equal(result.cleaningError, undefined);
  assert.ok(result.cleaningExpenses > 0, 'no turnover cleaning rows were written');
});

test('a sync is idempotent, so the refresh cannot double-write', async () => {
  // The background refresh may run on every dashboard load inside a window, so a repeat must be free.
  const { env, store } = envWherePutFailsOn('__never__');
  const first = await syncReservationsFromIcal(env, [EVENT]);
  const rowsAfterFirst = JSON.parse(store.customExpenses ?? '[]').length;
  const second = await syncReservationsFromIcal(env, [EVENT]);
  assert.equal(second.created, 0, 'a repeat sync created a second stay');
  assert.equal(second.cleaningExpenses, 0, 'a repeat sync rewrote cleaning rows');
  assert.equal(JSON.parse(store.customExpenses ?? '[]').length, rowsAfterFirst);
  assert.equal(first.created, 1);
});

test('a $0 Hospitable event does not create a second stay for the same dates', async () => {
  const { env, store } = envWherePutFailsOn('__never__');
  store.reservations = JSON.stringify([
    {
      id: 'res-real',
      guestName: 'Ada Lovelace',
      propertyId: 'river',
      checkIn: '2027-12-01',
      checkOut: '2027-12-04',
      payout: 1200,
      source: 'Airbnb',
      status: 'confirmed',
    },
  ]);
  const result = await syncReservationsFromIcal(env, [
    {
      uid: 'uid-duplicate',
      propertyId: 'river',
      start: '2027-12-01',
      end: '2027-12-04',
      summary: 'Reserved',
      description: '',
      source: 'ical',
    } as never,
  ]);
  assert.equal(result.created, 0, 'a second $0 row was created for dates that were already booked');
  const rows = JSON.parse(store.reservations ?? '[]') as Array<{ id: string; payout: number; source: string; icalUid?: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, 'res-real');
  assert.equal(rows[0]!.payout, 1200);
  assert.equal(rows[0]!.source, 'Airbnb');
  assert.equal(rows[0]!.icalUid, 'uid-duplicate');
});

test('a disappeared event is cancelled, not deleted', async () => {
  /*
   * The calendar drops a stay when its iCal event goes away. It must cancel rather than remove:
   * `kvPut` refuses a shorter reservation list, and a cancelled stay is what keeps the books
   * reconcilable and the history intact.
   */
  const { env, store } = envWherePutFailsOn('__never__');
  await syncReservationsFromIcal(env, [EVENT]);
  const after = await syncReservationsFromIcal(env, []);
  assert.equal(after.cancelled, 1, 'the vanished stay was not cancelled');
  const rows = JSON.parse(store.reservations ?? '[]') as Array<{ status?: string }>;
  assert.equal(rows.length, 1, 'the stay was deleted instead of cancelled');
  assert.equal(rows[0]!.status, 'cancelled');
});
