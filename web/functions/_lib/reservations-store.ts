import { RESERVATIONS, isRentalProperty } from './data';
import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PropertyId, ReservationRecord, ReservationStatus } from './agent/types';
import { applyHostNetFromSeed, datesOverlap } from './reservation-match';
import { earnsOnCancellation } from '../../src/lib/cancellation-income';
import {
  VersionConflictError,
  canonicalJson,
  forgetLedgerLists,
  ledgerReady,
  many,
  one,
  run,
} from './ledger-db';
import { withoutKnownDirectDuplicate } from './ledger-migrate';

const KV_RES = 'reservations';
const KV_OVERRIDES = 'reservationOverrides';

type VersionedReservation = ReservationRecord & { version?: number; updatedAt?: string };

function cleanPatch(patch: Partial<ReservationRecord>): Partial<ReservationRecord> {
  const next = { ...patch } as VersionedReservation;
  delete next.version;
  delete next.updatedAt;
  return next;
}

function storedReservation(row: VersionedReservation): ReservationRecord {
  const rest = { ...row };
  delete rest.version;
  delete rest.updatedAt;
  return rest;
}

function reservationJson(row: ReservationRecord): string {
  return JSON.stringify(storedReservation(row));
}

function parseReservation(body: string, version: number, updatedAt: string): VersionedReservation {
  return { ...(JSON.parse(body) as ReservationRecord), version, updatedAt };
}

async function readReservationRows(env: SettingsEnv): Promise<VersionedReservation[]> {
  const rows = await many<{ body: string; version: number; updated_at: string }>(
    env,
    'SELECT body, version, updated_at FROM reservations',
  );
  return rows.map((row) => parseReservation(row.body, Number(row.version), row.updated_at));
}

/** Every call reads D1. The list is not memoized on the isolate or on `env`. */
async function d1ReservationRows(env: SettingsEnv): Promise<VersionedReservation[]> {
  return readReservationRows(env);
}

async function readOverrideRows(
  env: SettingsEnv,
): Promise<Record<string, Partial<ReservationRecord> & { version?: number; updatedAt?: string }>> {
  const rows = await many<{ id: string; body: string; version: number; updated_at: string }>(
    env,
    'SELECT id, body, version, updated_at FROM reservation_overrides',
  );
  const out: Record<string, Partial<ReservationRecord> & { version?: number; updatedAt?: string }> = {};
  for (const row of rows) {
    out[row.id] = { ...(JSON.parse(row.body) as Partial<ReservationRecord>), version: Number(row.version), updatedAt: row.updated_at };
  }
  return out;
}

/** Every call reads D1. Overrides are not memoized on the isolate or on `env`. */
async function d1OverrideRows(
  env: SettingsEnv,
): Promise<Record<string, Partial<ReservationRecord> & { version?: number; updatedAt?: string }>> {
  return readOverrideRows(env);
}

async function reservationById(env: SettingsEnv, id: string): Promise<VersionedReservation | null> {
  const row = await one<{ body: string; version: number; updated_at: string }>(
    env,
    'SELECT body, version, updated_at FROM reservations WHERE id = ?',
    id,
  );
  return row ? parseReservation(row.body, Number(row.version), row.updated_at) : null;
}

export async function loadCustomReservations(env: SettingsEnv): Promise<ReservationRecord[]> {
  if (await ledgerReady(env)) return d1ReservationRows(env);
  return kvGet(env, KV_RES, []);
}

export async function loadReservationOverrides(
  env: SettingsEnv,
): Promise<Record<string, Partial<ReservationRecord>>> {
  if (await ledgerReady(env)) return d1OverrideRows(env);
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
  const fromD1 = await ledgerReady(env);
  const seed = seedReservations();
  const custom = withoutKnownDirectDuplicate(await loadCustomReservations(env));
  const overrides = await loadReservationOverrides(env);
  /*
   * A stay that has its own D1 row is that row. The seed entry with the same id is a second copy,
   * and showing the seed one drops the stored version and the stored fields.
   */
  const storedIds = fromD1 ? new Set(custom.map((r) => r.id)) : null;

  const merged = seed
    .filter((r) => !storedIds?.has(r.id))
    .map((r) => ({
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

  /*
   * A cancelled stay leaves the book, because nothing downstream may read it as a booking — the calendar, the
   * turnover list, and the `stays × fee` cleaning fallback all ask "is this cancelled" and must keep getting no.
   *
   * One exception, and only one: a cancelled stay whose channel still kept a cancellation fee and paid it out. That
   * money is real, and the revenue lines are the only place it can be counted, so the row is kept. It keeps its
   * `cancelled` status, so every stay-shaped question still answers no; it carries the fee in `cancellationIncome`,
   * never in `payout`, so no invented figure enters revenue.
   */
  const activeSeed = merged.filter((r) => {
    if (cancelledIds.has(r.id) && r.status === 'cancelled' && !earnsOnCancellation(r)) return false;
    // Drop seed row when an iCal-imported custom row already represents the same stay.
    const duplicatedByIcal = icalSyncedCustom.some(
      (ic) => ic.propertyId === r.propertyId && datesOverlap(ic, r) && !overrides[r.id]?.icalUid,
    );
    return !duplicatedByIcal;
  });

  const seedIds = new Set(activeSeed.map((r) => r.id));
  const extraCustom = custom.filter((r) => !seedIds.has(r.id) && (r.status !== 'cancelled' || earnsOnCancellation(r)));

  /*
   * Before the import, a $0 iCal row still borrows the seed payout. After it, the stored row is
   * the row: a seed stay on the same dates must not replace a D1 payout, channel, or version.
   */
  const rows = [...activeSeed, ...extraCustom];
  return (fromD1 ? rows : rows.map((r) => applyHostNetFromSeed(r)))
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
      // Same house check the KV import uses before it writes `reservations.property_id`.
      if (typeof r.propertyId !== 'string' || !isRentalProperty(r.propertyId)) return false;
      return r.checkOut > r.checkIn;
    })
    .map((r) => ({ ...r, version: (r as VersionedReservation).version ?? 0 }))
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

  if (await ledgerReady(env)) {
    const stored = await reservationById(env, id);
    if (stored) return { ...stored, version: stored.version ?? 0 };
    const d1Overrides = await loadReservationOverrides(env);
    const d1Seed = RESERVATIONS.find((r) => r.id === id);
    if (!d1Seed) return null;
    const overlay = d1Overrides[id] as (Partial<ReservationRecord> & { version?: number; updatedAt?: string }) | undefined;
    return {
      ...d1Seed,
      propertyId: d1Seed.propertyId as PropertyId,
      ...overlay,
      status: (overlay?.status ?? 'confirmed') as ReservationStatus,
      version: overlay?.version ?? 0,
      updatedAt: overlay?.updatedAt,
    };
  }

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
  if (n > 0) await persistCustomReservations(env, custom);

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
  if (oChanged > 0) await persistReservationOverrides(env, overrides);
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
  if (await ledgerReady(env)) {
    await insertReservationRow(env, item);
    return { ...item, version: 1, updatedAt: item.createdAt };
  }
  const list = await loadCustomReservations(env);
  list.push(item);
  await kvPut(env, KV_RES, list);
  return item;
}

async function insertReservationRow(env: SettingsEnv, item: ReservationRecord): Promise<void> {
  const now = item.createdAt ?? new Date().toISOString();
  await run(env, `DELETE FROM ledger_tombstones WHERE entity = 'reservations' AND id = ?`, item.id);
  const changes = await run(
    env,
    `INSERT INTO reservations (id, version, updated_at, property_id, check_in, check_out, status, source, payout, ical_uid, body)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    item.id,
    now,
    item.propertyId,
    item.checkIn,
    item.checkOut,
    item.status ?? 'confirmed',
    item.source,
    Number(item.payout ?? 0),
    item.icalUid ?? null,
    reservationJson(item),
  );
  forgetLedgerLists(env);
  if (changes !== 1) throw new Error(`A stay with id ${item.id} is already stored.`);
}

async function writeReservationRow(
  env: SettingsEnv,
  row: ReservationRecord,
  expectedVersion: number,
): Promise<VersionedReservation> {
  const now = new Date().toISOString();
  const nextVersion = expectedVersion + 1;
  const changes = await run(
    env,
    `UPDATE reservations
        SET version = ?, updated_at = ?, property_id = ?, check_in = ?, check_out = ?, status = ?, source = ?, payout = ?, ical_uid = ?, body = ?
      WHERE id = ? AND version = ?`,
    nextVersion,
    now,
    row.propertyId,
    row.checkIn,
    row.checkOut,
    row.status ?? 'confirmed',
    row.source,
    Number(row.payout ?? 0),
    row.icalUid ?? null,
    reservationJson(row),
    row.id,
    expectedVersion,
  );
  forgetLedgerLists(env);
  if (changes !== 1) {
    const fresh = await reservationById(env, row.id);
    throw new VersionConflictError(fresh ? { ...fresh, version: fresh.version ?? 0 } : null);
  }
  return { ...storedReservation(row), version: nextVersion, updatedAt: now };
}

async function writeOverrideRow(
  env: SettingsEnv,
  id: string,
  patch: Partial<ReservationRecord>,
  expectedVersion: number | undefined,
): Promise<VersionedReservation> {
  const seed = RESERVATIONS.find((row) => row.id === id);
  if (!seed) throw new VersionConflictError(null);
  const overrides = await d1OverrideRows(env);
  const current = overrides[id];
  const currentVersion = current?.version ?? 0;
  const claimed = expectedVersion ?? currentVersion;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new VersionConflictError(applyHostNetFromSeed(mergedSeed(seed, current)));
  }
  const prev = { ...(current ?? {}) };
  delete prev.version;
  delete prev.updatedAt;
  const nextPatch = { ...prev, ...cleanPatch(patch) };
  const now = new Date().toISOString();
  const nextVersion = currentVersion + 1;
  let changes: number;
  if (currentVersion === 0) {
    changes = await run(
      env,
      `INSERT INTO reservation_overrides (id, version, updated_at, body) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      id,
      nextVersion,
      now,
      JSON.stringify(nextPatch),
    );
  } else {
    changes = await run(
      env,
      `UPDATE reservation_overrides SET version = ?, updated_at = ?, body = ? WHERE id = ? AND version = ?`,
      nextVersion,
      now,
      JSON.stringify(nextPatch),
      id,
      claimed,
    );
  }
  forgetLedgerLists(env);
  const merged = mergedSeed(seed, { ...nextPatch, version: nextVersion, updatedAt: now });
  if (changes !== 1) {
    const fresh = (await d1OverrideRows(env))[id];
    throw new VersionConflictError(applyHostNetFromSeed(mergedSeed(seed, fresh)));
  }
  return applyHostNetFromSeed(merged);
}

function mergedSeed(
  seed: (typeof RESERVATIONS)[number],
  override?: Partial<ReservationRecord> & { version?: number; updatedAt?: string },
): VersionedReservation {
  return {
    ...seed,
    propertyId: seed.propertyId as PropertyId,
    ...override,
    status: (override?.status ?? 'confirmed') as ReservationStatus,
    version: override?.version ?? 0,
    updatedAt: override?.updatedAt,
  };
}

export async function updateReservationStatus(
  env: SettingsEnv,
  id: string,
  status: ReservationStatus,
  patch?: Partial<ReservationRecord>,
  expectedVersion?: number,
): Promise<ReservationRecord | null> {
  return updateReservation(env, id, { ...patch, status }, expectedVersion);
}

export async function updateReservation(
  env: SettingsEnv,
  id: string,
  patch: Partial<ReservationRecord>,
  expectedVersion?: number,
): Promise<ReservationRecord | null> {
  if (await ledgerReady(env)) {
    try {
      return await updateReservationRow(env, id, patch, expectedVersion);
    } catch (err) {
      if (expectedVersion !== undefined || !(err instanceof VersionConflictError)) throw err;
      return updateReservationRow(env, id, patch, undefined);
    }
  }
  return updateReservationKv(env, id, patch);
}

async function updateReservationRow(
  env: SettingsEnv,
  id: string,
  patch: Partial<ReservationRecord>,
  expectedVersion?: number,
): Promise<ReservationRecord | null> {
  const custom = await reservationById(env, id);
  if (custom) {
    const claimed = expectedVersion ?? custom.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== (custom.version ?? 0)) {
      throw new VersionConflictError({ ...custom, version: custom.version ?? 0 });
    }
    return writeReservationRow(env, { ...storedReservation(custom), ...cleanPatch(patch), id }, claimed);
  }
  if (!RESERVATIONS.some((row) => row.id === id)) return null;
  return writeOverrideRow(env, id, patch, expectedVersion);
}

async function updateReservationKv(
  env: SettingsEnv,
  id: string,
  patch: Partial<ReservationRecord>,
): Promise<ReservationRecord | null> {
  const custom = await loadCustomReservations(env);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx >= 0) {
    custom[idx] = { ...custom[idx]!, ...cleanPatch(patch) };
    await kvPut(env, KV_RES, custom);
    return custom[idx]!;
  }

  const seedMatch = RESERVATIONS.find((r) => r.id === id);
  if (!seedMatch) return null;

  const overrides = await loadReservationOverrides(env);
  overrides[id] = { ...overrides[id], ...cleanPatch(patch) };
  await kvPut(env, KV_OVERRIDES, overrides);
  return {
    ...seedMatch,
    propertyId: seedMatch.propertyId as PropertyId,
    ...overrides[id],
    status: (overrides[id]?.status ?? 'confirmed') as ReservationStatus,
  };
}

/**
 * Custom stays are removed. Seed stays are marked cancelled, which GET already hides, so the
 * built-in row does not come back. A live iCal UID can still be linked again on the next sync.
 */
export async function deleteReservation(
  env: SettingsEnv,
  id: string,
  expectedVersion?: number,
): Promise<{ id: string; removed: 'custom' | 'seed' } | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (await ledgerReady(env)) return deleteReservationRow(env, trimmed, expectedVersion);

  const custom = await loadCustomReservations(env);
  const idx = custom.findIndex((r) => r.id === trimmed);
  if (idx >= 0) {
    custom.splice(idx, 1);
    await kvPut(env, KV_RES, custom, { allowShrinkReason: `Reservation ${trimmed} removed from the board.` });
    return { id: trimmed, removed: 'custom' };
  }
  if (!RESERVATIONS.some((row) => row.id === trimmed)) return null;
  const overrides = await loadReservationOverrides(env);
  overrides[trimmed] = { ...overrides[trimmed], status: 'cancelled' };
  await kvPut(env, KV_OVERRIDES, overrides);
  return { id: trimmed, removed: 'seed' };
}

async function deleteReservationRow(
  env: SettingsEnv,
  id: string,
  expectedVersion?: number,
): Promise<{ id: string; removed: 'custom' | 'seed' } | null> {
  const custom = await reservationById(env, id);
  if (custom) {
    const claimed = expectedVersion ?? custom.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== (custom.version ?? 0)) {
      throw new VersionConflictError({ ...custom, version: custom.version ?? 0 });
    }
    const changes = await run(env, `DELETE FROM reservations WHERE id = ? AND version = ?`, id, claimed);
    if (changes !== 1) {
      const fresh = await reservationById(env, id);
      if (!fresh) return null;
      throw new VersionConflictError({ ...fresh, version: fresh.version ?? 0 });
    }
    await run(
      env,
      `INSERT INTO ledger_tombstones (entity, id) VALUES ('reservations', ?) ON CONFLICT(entity, id) DO NOTHING`,
      id,
    );
    forgetLedgerLists(env);
    return { id, removed: 'custom' };
  }
  if (!RESERVATIONS.some((row) => row.id === id)) return null;
  await writeOverrideRow(env, id, { status: 'cancelled' }, expectedVersion);
  return { id, removed: 'seed' };
}

/** Write the lists the iCal sync built. On D1 each changed row is its own UPDATE. KV is the pre-import path. */
export async function persistReservationLists(
  env: SettingsEnv,
  custom: ReservationRecord[],
  overrides: Record<string, Partial<ReservationRecord>>,
): Promise<void> {
  await persistCustomReservations(env, custom);
  await persistReservationOverrides(env, overrides);
}

async function persistCustomReservations(env: SettingsEnv, custom: ReservationRecord[]): Promise<void> {
  if (!(await ledgerReady(env))) {
    await kvPut(env, KV_RES, custom);
    return;
  }
  forgetLedgerLists(env);
  const existing = new Map((await readReservationRows(env)).map((row) => [row.id, row]));
  for (const row of custom) {
    const prev = existing.get(row.id);
    const body = storedReservation(row);
    if (!prev) {
      await insertReservationRow(env, body);
      continue;
    }
    if (canonicalJson(storedReservation(prev)) === canonicalJson(body)) continue;
    const held = (row as VersionedReservation).version;
    if (held !== undefined && held !== (prev.version ?? 0)) continue;
    await writeReservationRow(env, { ...body, id: row.id }, prev.version ?? 0);
  }
  forgetLedgerLists(env);
}

async function persistReservationOverrides(
  env: SettingsEnv,
  overrides: Record<string, Partial<ReservationRecord>>,
): Promise<void> {
  if (!(await ledgerReady(env))) {
    await kvPut(env, KV_OVERRIDES, overrides);
    return;
  }
  forgetLedgerLists(env);
  const existing = await readOverrideRows(env);
  for (const [id, patch] of Object.entries(overrides)) {
    if (!patch || !RESERVATIONS.some((row) => row.id === id)) continue;
    const prev = existing[id];
    const prevBody = { ...(prev ?? {}) };
    delete prevBody.version;
    delete prevBody.updatedAt;
    const nextBody = { ...(patch as VersionedReservation) };
    delete nextBody.version;
    delete nextBody.updatedAt;
    if (prev && canonicalJson(prevBody) === canonicalJson(nextBody)) continue;
    const held = (patch as VersionedReservation).version;
    if (held !== undefined && held !== (prev?.version ?? 0)) continue;
    await writeOverrideRow(env, id, nextBody, prev?.version);
  }
  forgetLedgerLists(env);
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
  if (await ledgerReady(env)) {
    let touched = 0;
    for (const { id, patch } of patches) {
      const saved = await updateReservation(env, id, patch);
      if (saved) touched += 1;
    }
    return touched;
  }
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
