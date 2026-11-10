import { RESERVATIONS } from './data';
import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PropertyId, ReservationRecord, ReservationStatus } from './agent/types';
import { applyHostNetFromSeed, datesOverlap } from './reservation-match';

const KV_RES = 'reservations';
const KV_OVERRIDES = 'reservationOverrides';

export async function loadCustomReservations(env: SettingsEnv): Promise<ReservationRecord[]> {
  return kvGet(env, KV_RES, []);
}

export async function loadReservationOverrides(
  env: SettingsEnv,
): Promise<Record<string, Partial<ReservationRecord>>> {
  return kvGet(env, KV_OVERRIDES, {});
}

export function seedReservations(): ReservationRecord[] {
  return RESERVATIONS.map((r) => ({
    ...r,
    propertyId: r.propertyId as PropertyId,
    status: 'confirmed' as ReservationStatus,
  }));
}

/** A real calendar day. The literal string `"undefined"` is not one, and it used to count as a stay. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function getAllReservations(env: SettingsEnv): Promise<ReservationRecord[]> {
  const seed = seedReservations();
  const custom = await loadCustomReservations(env);
  const overrides = await loadReservationOverrides(env);

  const merged = seed.map((r) => ({
    ...r,
    ...overrides[r.id],
    status: (overrides[r.id]?.status ?? r.status ?? 'confirmed') as ReservationStatus,
  }));

  const cancelledIds = new Set(
    Object.entries(overrides)
      .filter(([, o]) => o.status === 'cancelled')
      .map(([id]) => id),
  );

  const icalSyncedCustom = custom.filter((r) => r.icalUid && r.status !== 'cancelled');

  const activeSeed = merged.filter((r) => {
    if (cancelledIds.has(r.id) && r.status === 'cancelled') return false;
    // Drop seed row when an iCal-imported custom row already represents the same stay.
    const duplicatedByIcal = icalSyncedCustom.some(
      (ic) => ic.propertyId === r.propertyId && datesOverlap(ic, r) && !overrides[r.id]?.icalUid,
    );
    return !duplicatedByIcal;
  });

  const seedIds = new Set(activeSeed.map((r) => r.id));
  const extraCustom = custom.filter((r) => !seedIds.has(r.id) && r.status !== 'cancelled');

  return [...activeSeed, ...extraCustom]
    .map((r) => applyHostNetFromSeed(r))
    /*
     * A stay needs a real daytime date and a real house. The old test was `typeof === 'string'`, and the
     * literal string `"undefined"` passes that: production held `res-1790218847843-tei46q` with
     * checkIn/checkOut of `"undefined"`, no house, and a confirmed status, so it counted toward the
     * **87 bookings** shown on the dashboard when only 86 were real. `stayNights("undefined", …)` returns
     * NaN, so anything that did arithmetic on it would poison a total.
     *
     * It never reached a P&L because every property report filters by house first, which this row had none
     * of — but a count that includes a row no calendar can show is still wrong. The row stays in the store
     * (nothing is deleted); it simply stops being counted as a booking.
     */
    .filter((r) => {
      if (!DAY.test(String(r.checkIn)) || !DAY.test(String(r.checkOut))) return false;
      if (!(r.propertyId === 'ranch' || r.propertyId === 'lindon' || r.propertyId === 'river')) return false;
      return r.checkOut > r.checkIn;
    })
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/**
 * Find one stay by id **whatever its status**, including cancelled.
 *
 * `getAllReservations` deliberately drops cancelled rows so they stop counting as bookings. That is right for
 * the calendar and wrong for money: a guest who cancels after paying still needs a refund recorded against the
 * booking they paid for, and looking in `getAllReservations` would answer "not on the calendar" for a stay that
 * is sitting in the store with a payment against it.
 */
export async function findReservationAnyStatus(
  env: SettingsEnv,
  id: string,
): Promise<ReservationRecord | null> {
  if (!id) return null;

  const custom = await loadCustomReservations(env);
  const stored = custom.find((r) => r.id === id);
  if (stored) return applyHostNetFromSeed(stored);

  const overrides = await loadReservationOverrides(env);
  const seedMatch = RESERVATIONS.find((r) => r.id === id);
  if (!seedMatch) return null;

  return applyHostNetFromSeed({
    ...seedMatch,
    propertyId: seedMatch.propertyId as PropertyId,
    ...overrides[id],
    status: (overrides[id]?.status ?? 'confirmed') as ReservationStatus,
  });
}

/** Fill $0 iCal payouts and placeholder channels from seed. Stored payouts and explicit channels are left alone. */
export async function backfillZeroPayouts(env: SettingsEnv): Promise<number> {  const custom = await loadCustomReservations(env);
  let n = 0;
  for (let i = 0; i < custom.length; i++) {
    const r = custom[i]!;
    if (r.status === 'cancelled' || r.status === 'blocked') continue;
    const next = applyHostNetFromSeed(r);
    if (next.payout !== r.payout || next.source !== r.source) {
      custom[i] = next;
      n++;
    }
  }
  if (n > 0) await kvPut(env, KV_RES, custom);

  const overrides = await loadReservationOverrides(env);
  let oChanged = 0;
  for (const [id, o] of Object.entries(overrides)) {
    if (!o) continue;
    const seed = RESERVATIONS.find((s) => s.id === id);
    if (!seed) continue;
    const applied = applyHostNetFromSeed({
      propertyId: seed.propertyId,
      guestName: o.guestName ?? seed.guestName,
      checkIn: o.checkIn ?? seed.checkIn,
      checkOut: o.checkOut ?? seed.checkOut,
      payout: Number(o.payout ?? seed.payout),
      source: o.source ?? seed.source,
    });
    const next = { ...o, payout: applied.payout, source: applied.source };
    if (next.payout !== o.payout || next.source !== o.source) {
      overrides[id] = next;
      oChanged++;
    }
  }
  if (oChanged > 0) await kvPut(env, KV_OVERRIDES, overrides);
  return n + oChanged;
}

/**
 * A day that can actually be used: a real calendar date, not `2026-13-45` and not the string
 * `undefined`.
 */
function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

const HOUSES = new Set(['ranch', 'lindon', 'river']);

/**
 * Save a stay, refusing one that cannot be used.
 *
 * The store used to write whatever it was handed. One imported stay ended up with no house, no
 * check-in, and no check-out — it is filtered out of every calendar, so it is invisible, but it still
 * sits in the saved list and counts toward the total. A stay with no house produces a turnover cleaning
 * expense for no house, and a missing date can only be a bug upstream.
 *
 * The check is here rather than at each caller because the iCal import, the accept route, and the
 * reservations API all write through this one function.
 */
export async function createReservation(
  env: SettingsEnv,
  input: Omit<ReservationRecord, 'id' | 'createdAt'>,
): Promise<ReservationRecord> {
  if (!HOUSES.has(String(input.propertyId ?? ''))) {
    throw new Error(`A stay needs a real house. Refusing to save one with "${String(input.propertyId)}".`);
  }
  if (!isRealDay(input.checkIn) || !isRealDay(input.checkOut)) {
    throw new Error('A stay needs a real check-in and check-out. Refusing to save a row without them.');
  }
  if (input.checkOut <= input.checkIn) {
    throw new Error('A stay has to check out after it checks in. Refusing to save it.');
  }
  const item: ReservationRecord = {
    ...input,
    id: newId('res'),
    status: input.status ?? 'confirmed',
    createdAt: new Date().toISOString(),
  };
  const list = await loadCustomReservations(env);
  list.push(item);
  await kvPut(env, KV_RES, list);
  return item;
}

export async function updateReservationStatus(
  env: SettingsEnv,
  id: string,
  status: ReservationStatus,
  patch?: Partial<ReservationRecord>,
): Promise<ReservationRecord | null> {
  return updateReservation(env, id, { ...patch, status });
}

export async function updateReservation(
  env: SettingsEnv,
  id: string,
  patch: Partial<ReservationRecord>,
): Promise<ReservationRecord | null> {
  const custom = await loadCustomReservations(env);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx >= 0) {
    custom[idx] = { ...custom[idx]!, ...patch };
    await kvPut(env, KV_RES, custom);
    return custom[idx]!;
  }

  const seedMatch = RESERVATIONS.find((r) => r.id === id);
  if (!seedMatch) return null;

  const overrides = await loadReservationOverrides(env);
  overrides[id] = { ...overrides[id], ...patch };
  await kvPut(env, KV_OVERRIDES, overrides);
  return {
    ...seedMatch,
    propertyId: seedMatch.propertyId as PropertyId,
    ...overrides[id],
    status: (overrides[id]?.status ?? 'confirmed') as ReservationStatus,
  };
}

/**
 * Patch many stays in at most **two** writes — one for the custom list, one for the seed overrides.
 *
 * `updateReservation` reads and writes the whole list it touches, so calling it per stay is one write
 * per stay to the same key. Cloudflare allows one write per key per second, which is how the first
 * portal backfill lost 14 of 25 stays to `KV PUT failed: 429`.
 *
 * Every patch is a merge into the existing row, so a payout, note, or date is never dropped: only the
 * fields named in the patch change.
 */
export async function updateReservations(
  env: SettingsEnv,
  patches: ReadonlyArray<{ id: string; patch: Partial<ReservationRecord> }>,
): Promise<number> {
  if (patches.length === 0) return 0;
  let touched = 0;

  const custom = await loadCustomReservations(env);
  const customById = new Map(custom.map((row, index) => [row.id, index]));
  let customDirty = false;
  const seedPatches: Array<{ id: string; patch: Partial<ReservationRecord> }> = [];

  for (const { id, patch } of patches) {
    const idx = customById.get(id);
    if (idx !== undefined) {
      custom[idx] = { ...custom[idx]!, ...patch };
      customDirty = true;
      touched += 1;
    } else if (RESERVATIONS.some((row) => row.id === id)) {
      seedPatches.push({ id, patch });
    }
  }

  if (customDirty) await kvPut(env, KV_RES, custom);

  if (seedPatches.length > 0) {
    const overrides = await loadReservationOverrides(env);
    for (const { id, patch } of seedPatches) {
      overrides[id] = { ...overrides[id], ...patch };
      touched += 1;
    }
    await kvPut(env, KV_OVERRIDES, overrides);
  }

  return touched;
}

export function filterReservations(
  list: ReservationRecord[],
  opts: {
    propertyId?: PropertyId;
    when?: 'upcoming' | 'current' | 'past' | 'checkout_today';
    from?: string;
    to?: string;
  },
): ReservationRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return list.filter((r) => {
    if (r.status === 'cancelled') return false;
    if (opts.propertyId && r.propertyId !== opts.propertyId) return false;
    if (opts.from && r.checkOut < opts.from) return false;
    if (opts.to && r.checkIn > opts.to) return false;
    if (opts.when === 'upcoming') return r.checkIn > today;
    if (opts.when === 'past') return r.checkOut < today;
    if (opts.when === 'current') return r.checkIn <= today && r.checkOut > today;
    if (opts.when === 'checkout_today') return r.checkOut === today;
    return true;
  });
}

export function getOccupancySummary(list: ReservationRecord[], today: string): Record<PropertyId, string> {
  const summary = { ranch: 'Vacant', lindon: 'Vacant', river: 'Vacant' } as Record<PropertyId, string>;
  for (const pid of ['ranch', 'lindon', 'river'] as PropertyId[]) {
    const current = list.find(
      (r) => r.propertyId === pid && r.checkIn <= today && r.checkOut > today && r.status !== 'cancelled',
    );
    if (current) {
      summary[pid] = `${current.guestName} (checkout ${current.checkOut})`;
      continue;
    }
    const next = list
      .filter((r) => r.propertyId === pid && r.checkIn > today && r.status !== 'cancelled')
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
    summary[pid] = next ? `Vacant — next: ${next.guestName} ${next.checkIn}` : 'Vacant — no upcoming';
  }
  return summary;
}
