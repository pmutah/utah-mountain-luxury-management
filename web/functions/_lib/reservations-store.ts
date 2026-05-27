import { RESERVATIONS } from './data';
import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PropertyId, ReservationRecord, ReservationStatus } from './agent/types';

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

  const activeSeed = merged.filter((r) => !cancelledIds.has(r.id) || r.status !== 'cancelled');
  const seedIds = new Set(activeSeed.map((r) => r.id));
  const extraCustom = custom.filter((r) => !seedIds.has(r.id) && r.status !== 'cancelled');

  return [...activeSeed, ...extraCustom].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
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
  const custom = await loadCustomReservations(env);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx >= 0) {
    custom[idx] = { ...custom[idx]!, ...patch, status };
    await kvPut(env, KV_RES, custom);
    return custom[idx]!;
  }

  const seedMatch = RESERVATIONS.find((r) => r.id === id);
  if (!seedMatch) return null;

  const overrides = await loadReservationOverrides(env);
  overrides[id] = { ...overrides[id], ...patch, status };
  await kvPut(env, KV_OVERRIDES, overrides);
  return { ...seedMatch, propertyId: seedMatch.propertyId as PropertyId, ...overrides[id], status };
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
  const summary: Record<PropertyId, string> = { ranch: 'Vacant', lindon: 'Vacant' };
  for (const pid of ['ranch', 'lindon'] as PropertyId[]) {
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
