import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { BookingHold, HoldWithState } from '../../src/lib/booking-hold';
import { activeHolds } from '../../src/lib/booking-hold';

const KV_HOLDS = 'bookingHolds';
/** Holds are cheap to keep and easy to misread if they vanish, so the list keeps a week of them. */
const KEEP = 200;

export async function loadHolds(env: SettingsEnv): Promise<HoldWithState[]> {
  return kvGet<HoldWithState[]>(env, KV_HOLDS, []);
}

export async function saveHolds(env: SettingsEnv, holds: HoldWithState[]): Promise<HoldWithState[]> {
  return kvPut(env, KV_HOLDS, holds.slice(-KEEP));
}

/**
 * Add the holds for one request. A house is keyed by request *and* house, so a two-house request
 * keeps both rows. Saving the same house twice replaces the row rather than stacking a second one.
 */
export async function addHolds(env: SettingsEnv, next: readonly BookingHold[]): Promise<HoldWithState[]> {
  if (next.length === 0) return loadHolds(env);
  const holds = await loadHolds(env);
  const requestId = next[0]!.requestId;
  const wanted = new Set(next.map((hold) => hold.propertyId));
  const kept = holds.filter((row) => !(row.requestId === requestId && wanted.has(row.propertyId)));
  return saveHolds(env, [...kept, ...next]);
}

/** Let a hold go. The row stays, so the board can say the guest gave it up. */
export async function releaseHold(env: SettingsEnv, id: string): Promise<boolean> {
  const holds = await loadHolds(env);
  const index = holds.findIndex((row) => row.id === id);
  if (index < 0) return false;
  holds[index] = { ...holds[index]!, released: true };
  await saveHolds(env, holds);
  return true;
}

/** Let every hold for one request go, including both houses of a two-house request. */
export async function releaseHoldsForRequest(env: SettingsEnv, requestId: string): Promise<number> {
  const holds = await loadHolds(env);
  let count = 0;
  const next = holds.map((row) => {
    if (row.requestId !== requestId || row.released) return row;
    count += 1;
    return { ...row, released: true };
  });
  if (count > 0) await saveHolds(env, next);
  return count;
}

/** The holds that still block, for the public calendar and the host desk. */
export async function loadActiveHolds(env: SettingsEnv, now = new Date()): Promise<BookingHold[]> {
  return activeHolds(await loadHolds(env), now);
}
