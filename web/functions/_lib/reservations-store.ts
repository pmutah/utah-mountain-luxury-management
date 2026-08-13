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

export async function getAllReservations(env: SettingsEnv): Promise<ReservationRecord[]> {
  const seed = RESERVATIONS.map((r) => ({
    ...r,
    propertyId: r.propertyId as PropertyId,
    status: 'confirmed' as ReservationStatus,
  }));
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
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/** Copy known host payouts and Airbnb/VRBO channel onto iCal rows. */
export async function backfillZeroPayouts(env: SettingsEnv): Promise<number> {
  const custom = await loadCustomReservations(env);
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

export async function createReservation(
  env: SettingsEnv,
  input: Omit<ReservationRecord, 'id' | 'createdAt'>,
): Promise<ReservationRecord> {
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
