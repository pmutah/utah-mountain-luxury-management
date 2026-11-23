/**
 * Copy the KV list blobs into D1, once, without writing those blobs back.
 *
 * KV can answer two different copies of the same key for about a minute. The import inserts any
 * id that is not already stored and does not update a row that is. Running it again after the
 * other edge catches up adds only the rows the first read missed. A row deleted after the import
 * is recorded in `ledger_tombstones`, so a later pass does not put it back.
 *
 * A stay or an expense is inserted only when every NOT NULL column has a value. The house is the
 * one `GET /api/reservations` already keeps (`ranch` | `lindon` | `river`), read from the row or
 * from the seed stay an override belongs to. Anything still missing is listed in `unresolved` and
 * kept in `ledger_unresolved`. It is not given a stand-in house, and it does not roll the batch back.
 */
import type { PropertyId, ReservationRecord } from './agent/types';
import { PROPERTIES, RESERVATIONS, isExpenseProperty, isRentalProperty, type ExpensePropertyId } from './data';
import { applyPortfolioVendorNormalization } from './expense-vendors';
import { normalizeYearMonth, parseYearMonthFromText } from './expense-month';
import type { ExpenseRecord } from './expenses';
import type { SettingsEnv } from './kv';
import { kvGet } from './kv-json';
import {
  KV_IMPORTED_AT,
  forgetLedgerLists,
  ledgerDatabase,
  many,
  one,
  run,
  runBatch,
  setLedgerReady,
} from './ledger-db';

const NADYA_DIRECT_DUPLICATE_ID = 'res-1790218853165-k953cr';

/** Keep in step with web/migrations/ledger/0002_unresolved.sql. */
const UNRESOLVED_TABLE = `CREATE TABLE IF NOT EXISTS ledger_unresolved (
  source_key TEXT NOT NULL,
  id TEXT NOT NULL,
  guest TEXT,
  dates TEXT,
  missing TEXT NOT NULL,
  raw_fields TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_key, id)
)`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Keys a raw stay might use for the house. The calendar itself only reads `propertyId`. */
const STAY_HOUSE_KEYS = ['propertyId', 'property', 'propertyName', 'listingId', 'house', 'houseId', 'name'] as const;
const CHECK_IN_KEYS = ['checkIn', 'check_in', 'start', 'arrival'] as const;
const CHECK_OUT_KEYS = ['checkOut', 'check_out', 'end', 'departure'] as const;
const EXPENSE_HOUSE_KEYS = ['propertyId', 'property', 'propertyName', 'listingId', 'house', 'houseId', 'name'] as const;

export type LedgerSourceKey = 'reservations' | 'reservationOverrides' | 'customExpenses';

export interface UnresolvedLedgerRow {
  id: string;
  guest: string | null;
  dates: string | null;
  sourceKey: LedgerSourceKey;
  /** NOT NULL columns that were still empty after the same checks the calendar uses. */
  missing: string[];
  /** The raw values those checks looked at. A key that was absent is null. */
  rawFields: Record<string, unknown>;
}

export interface LedgerImportResult {
  ok: true;
  dryRun: boolean;
  alreadyMigrated: boolean;
  reservationsInserted: number;
  overridesInserted: number;
  expensesInserted: number;
  directDuplicateRemoved: number;
  unresolved: UnresolvedLedgerRow[];
  kvWrites: false;
}

export interface LedgerImportOptions {
  /** Return the counts and `unresolved` without writing D1 or KV. */
  dryRun?: boolean;
}

type Raw = Record<string, unknown>;

interface SeedStay {
  id: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
}

function isNadyaDirectDuplicate(row: ReservationRecord): boolean {
  return (
    row.id === NADYA_DIRECT_DUPLICATE_ID &&
    row.guestName.trim().toLowerCase() === 'nadya lutz' &&
    row.propertyId === 'river' &&
    row.checkIn === '2027-09-14' &&
    row.checkOut === '2027-09-20' &&
    /^direct$/i.test(row.source ?? '')
  );
}

function hasNadyaVrboTwin(list: readonly ReservationRecord[]): boolean {
  return list.some(
    (row) =>
      row.id !== NADYA_DIRECT_DUPLICATE_ID &&
      row.guestName.trim().toLowerCase() === 'nadya lutz' &&
      row.propertyId === 'river' &&
      row.checkIn === '2027-09-14' &&
      row.checkOut === '2027-09-20' &&
      /^vrbo$/i.test(row.source ?? '') &&
      row.status !== 'cancelled',
  );
}

/** Hide the known Direct duplicate from a list. Does not write. */
export function withoutKnownDirectDuplicate(custom: ReservationRecord[]): ReservationRecord[] {
  if (!custom.some(isNadyaDirectDuplicate) || !hasNadyaVrboTwin(custom)) return custom;
  return custom.filter((row) => !isNadyaDirectDuplicate(row));
}

function reservationBody(row: ReservationRecord): string {
  const rest = { ...row } as ReservationRecord & { version?: number; updatedAt?: string };
  delete rest.version;
  delete rest.updatedAt;
  return JSON.stringify(rest);
}

function expenseBody(row: ExpenseRecord): string {
  const rest = { ...row } as ExpenseRecord & { version?: number; updatedAt?: string; receiptUrl?: string | null };
  delete rest.version;
  delete rest.updatedAt;
  delete rest.receiptUrl;
  return JSON.stringify(rest);
}

function asRaw(value: unknown): Raw | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Raw;
}

function asList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asMap(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function picked(raw: Raw, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : null;
  return out;
}

function anonId(sourceKey: string, raw: unknown): string {
  const json = JSON.stringify(raw) ?? 'null';
  let hash = 5381;
  for (let i = 0; i < json.length; i++) hash = ((hash << 5) + hash) ^ json.charCodeAt(i);
  return `anon:${sourceKey}:${(hash >>> 0).toString(16)}`;
}

function labelGuest(raw: Raw): string | null {
  for (const key of ['guestName', 'guest', 'name', 'vendor'] as const) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function labelDates(checkIn: string | null, checkOut: string | null, month: string | null): string | null {
  if (checkIn && checkOut) return `${checkIn} to ${checkOut}`;
  if (checkIn || checkOut) return checkIn ?? checkOut;
  return month;
}

/**
 * A calendar day when one of the keys holds one. Otherwise the first non-blank string, so a value
 * that is present still satisfies NOT NULL. A blank is missing.
 */
function textFrom(raw: Raw, keys: readonly string[]): string | null {
  let fallback: string | null = null;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (DAY.test(trimmed)) return trimmed;
    if (!fallback) fallback = trimmed;
  }
  return fallback;
}

function timestamp(raw: Raw, now: string): string {
  for (const key of ['updatedAt', 'updated_at', 'createdAt', 'created_at'] as const) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return now;
}

function amountFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function idFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** The house id GET keeps, or the published name of that house (`The Lindon House`). */
function stayHouseFromValue(value: unknown): PropertyId | null {
  if (typeof value === 'string' && isRentalProperty(value)) return value;
  if (typeof value !== 'string') return null;
  const norm = value.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ');
  if (!norm) return null;
  for (const id of ['ranch', 'lindon', 'river'] as const) {
    const name = PROPERTIES[id].name.toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ');
    if (norm === name) return id;
  }
  return null;
}

function expenseHouseFromValue(value: unknown): ExpensePropertyId | null {
  if (typeof value === 'string' && isExpenseProperty(value)) return value;
  const rental = stayHouseFromValue(value);
  if (rental) return rental;
  if (typeof value !== 'string') return null;
  const norm = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm === 'household') return 'household';
  if (norm === 'construction' || norm === PROPERTIES.construction.name.toLowerCase()) return 'construction';
  return null;
}

function houseFromFields(raw: Raw, kind: 'stay' | 'expense'): string | null {
  const keys = kind === 'stay' ? STAY_HOUSE_KEYS : EXPENSE_HOUSE_KEYS;
  for (const key of keys) {
    const house = kind === 'stay' ? stayHouseFromValue(raw[key]) : expenseHouseFromValue(raw[key]);
    if (house) return house;
  }
  return null;
}

function seedIndex(): Map<string, SeedStay> {
  const seeds = new Map<string, SeedStay>();
  for (const seed of RESERVATIONS) {
    if (isRentalProperty(seed.propertyId)) seeds.set(seed.id, seed);
  }
  return seeds;
}

/**
 * House for one raw stay.
 *
 * Own fields first (`propertyId`, then `property` / `propertyName` / `listingId`). Then the same
 * fields on the override with this id. Then the seed stay GET merges under that override. That is
 * the calendar's merge: the seed house shows unless the overlay already names a real house.
 */
function stayHouse(raw: Raw, id: string | null, overrides: Record<string, Raw>, seeds: Map<string, SeedStay>): string | null {
  const own = houseFromFields(raw, 'stay');
  if (own) return own;
  if (id && overrides[id]) {
    const over = houseFromFields(overrides[id], 'stay');
    if (over) return over;
  }
  if (id) {
    const seed = seeds.get(id);
    if (seed && isRentalProperty(seed.propertyId)) return seed.propertyId;
  }
  return null;
}

function stayDates(
  raw: Raw,
  id: string | null,
  overrides: Record<string, Raw>,
  seeds: Map<string, SeedStay>,
): { checkIn: string | null; checkOut: string | null } {
  let checkIn = textFrom(raw, CHECK_IN_KEYS);
  let checkOut = textFrom(raw, CHECK_OUT_KEYS);
  const over = id ? overrides[id] : undefined;
  if (!checkIn && over) checkIn = textFrom(over, CHECK_IN_KEYS);
  if (!checkOut && over) checkOut = textFrom(over, CHECK_OUT_KEYS);
  const seed = id ? seeds.get(id) : undefined;
  if (!checkIn && seed) checkIn = seed.checkIn;
  if (!checkOut && seed) checkOut = seed.checkOut;
  return { checkIn, checkOut };
}

function expenseMonth(raw: Raw): string | null {
  const direct = normalizeYearMonth(typeof raw.month === 'string' ? raw.month : null);
  if (direct) return direct;
  const paid = typeof raw.paidDate === 'string' ? raw.paidDate : typeof raw.paid_date === 'string' ? raw.paid_date : '';
  const fromPaid = paid ? normalizeYearMonth(paid.slice(0, 7)) : null;
  if (fromPaid) return fromPaid;
  const note = typeof raw.note === 'string' ? raw.note : '';
  return note ? parseYearMonthFromText(note) : null;
}

function expenseCategory(raw: Raw): string | null {
  const direct = typeof raw.category === 'string' ? raw.category.trim() : '';
  const normalized = applyPortfolioVendorNormalization({
    vendor: typeof raw.vendor === 'string' ? raw.vendor : undefined,
    note: typeof raw.note === 'string' ? raw.note : undefined,
    category: direct || undefined,
  });
  const category = normalized.category?.trim() ?? '';
  return category || null;
}

function stayRawFields(raw: Raw, basePropertyId: string | null): Record<string, unknown> {
  return {
    ...picked(raw, [...STAY_HOUSE_KEYS, ...CHECK_IN_KEYS, ...CHECK_OUT_KEYS, 'createdAt', 'updatedAt']),
    basePropertyId,
  };
}

function expenseRawFields(raw: Raw): Record<string, unknown> {
  return picked(raw, [
    ...EXPENSE_HOUSE_KEYS,
    'month',
    'paidDate',
    'paid_date',
    'note',
    'category',
    'vendor',
    'amount',
    'createdAt',
    'updatedAt',
  ]);
}

async function idSet(env: SettingsEnv, sql: string, ...binds: unknown[]): Promise<Set<string>> {
  const rows = await many<{ id: string }>(env, sql, ...binds);
  return new Set(rows.map((row) => row.id));
}

export async function migrateKvLedger(env: SettingsEnv, options: LedgerImportOptions = {}): Promise<LedgerImportResult> {
  const dryRun = options.dryRun === true;
  if (!ledgerDatabase(env)) {
    throw new Error('LEDGER_DB is not bound. Create the D1 database and put its id in web/wrangler.toml before importing.');
  }
  const tables = await many<{ name: string }>(
    env,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reservations'",
  );
  if (tables.length === 0) {
    throw new Error('Ledger tables are missing. Apply web/migrations/ledger/0001_ledger.sql before importing.');
  }

  const already = await one<{ value: string }>(env, 'SELECT value FROM ledger_meta WHERE key = ?', KV_IMPORTED_AT);

  const customRaw = await kvGet<unknown>(env, 'reservations', []);
  const overrideRaw = await kvGet<unknown>(env, 'reservationOverrides', {});
  const expenseRaw = await kvGet<unknown>(env, 'customExpenses', []);
  if (!Array.isArray(customRaw)) {
    throw new Error('The reservations list in KV is not a list. Nothing was written.');
  }
  if (overrideRaw !== null && (typeof overrideRaw !== 'object' || Array.isArray(overrideRaw))) {
    throw new Error('Reservation overrides in KV are not an object. Nothing was written.');
  }
  if (!Array.isArray(expenseRaw)) {
    throw new Error('The expense list in KV is not a list. Nothing was written.');
  }

  const customList = asList(customRaw) ?? [];
  const overrideMap = asMap(overrideRaw) ?? {};
  const expenseList = asList(expenseRaw) ?? [];
  const overrides: Record<string, Raw> = {};
  for (const [id, patch] of Object.entries(overrideMap)) {
    const raw = asRaw(patch);
    if (raw) overrides[id] = raw;
  }
  const seeds = seedIndex();
  const now = new Date().toISOString();
  const unresolved: UnresolvedLedgerRow[] = [];
  const unresolvedBodies = new Map<string, unknown>();
  const report = (row: UnresolvedLedgerRow, body: unknown) => {
    unresolved.push(row);
    unresolvedBodies.set(`${row.sourceKey}\0${row.id}`, body);
  };
  const resolvedStays: ReservationRecord[] = [];
  const resolvedHouses = new Map<string, string>();

  for (const item of customList) {
    const raw = asRaw(item);
    if (!raw) {
      report(
        {
          id: anonId('reservations', item),
          guest: null,
          dates: null,
          sourceKey: 'reservations',
          missing: ['id', 'property_id', 'check_in', 'check_out'],
          rawFields: { value: item ?? null },
        },
        item ?? null,
      );
      continue;
    }
    const id = idFrom(raw.id);
    const base = id ? (seeds.get(id)?.propertyId ?? null) : null;
    const propertyId = stayHouse(raw, id, overrides, seeds);
    const { checkIn, checkOut } = stayDates(raw, id, overrides, seeds);
    const missing: string[] = [];
    if (!id) missing.push('id');
    if (!propertyId) missing.push('property_id');
    if (!checkIn) missing.push('check_in');
    if (!checkOut) missing.push('check_out');
    if (!id || !propertyId || !checkIn || !checkOut || !isRentalProperty(propertyId)) {
      report(
        {
          id: id ?? anonId('reservations', raw),
          guest: labelGuest(raw),
          dates: labelDates(checkIn, checkOut, null),
          sourceKey: 'reservations',
          missing,
          rawFields: stayRawFields(raw, base && isRentalProperty(base) ? base : null),
        },
        raw,
      );
      continue;
    }
    const status = typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : 'confirmed';
    const row = {
      ...raw,
      id,
      guestName: labelGuest(raw) ?? 'Guest',
      propertyId,
      checkIn,
      checkOut,
      payout: amountFrom(raw.payout) ?? 0,
      source: typeof raw.source === 'string' ? raw.source : '',
      status,
      ...(typeof raw.icalUid === 'string' && raw.icalUid.trim() ? { icalUid: raw.icalUid } : {}),
    } as ReservationRecord;
    resolvedStays.push(row);
    resolvedHouses.set(id, propertyId);
  }

  const dropDirect = resolvedStays.some(isNadyaDirectDuplicate) && hasNadyaVrboTwin(resolvedStays);
  const kept = dropDirect ? resolvedStays.filter((row) => !isNadyaDirectDuplicate(row)) : resolvedStays;

  const overrideRows: Array<{ id: string; body: string; updatedAt: string }> = [];
  for (const [key, patch] of Object.entries(overrideMap)) {
    const id = key.trim();
    const raw = asRaw(patch);
    if (!id || !raw) {
      report(
        {
          id: id || anonId('reservationOverrides', patch),
          guest: raw ? labelGuest(raw) : null,
          dates: null,
          sourceKey: 'reservationOverrides',
          missing: id ? ['property_id'] : ['id'],
          rawFields: raw ? stayRawFields(raw, null) : { value: patch ?? null },
        },
        patch ?? null,
      );
      continue;
    }
    const own = houseFromFields(raw, 'stay');
    const base = resolvedHouses.get(id) ?? (seeds.get(id) && isRentalProperty(seeds.get(id)!.propertyId) ? seeds.get(id)!.propertyId : null);
    const propertyId = own ?? base;
    const { checkIn, checkOut } = stayDates(raw, id, overrides, seeds);
    if (!propertyId) {
      report(
        {
          id,
          guest: labelGuest(raw),
          dates: labelDates(checkIn, checkOut, null),
          sourceKey: 'reservationOverrides',
          missing: ['property_id'],
          rawFields: stayRawFields(raw, null),
        },
        raw,
      );
    }
    overrideRows.push({ id, body: JSON.stringify(raw), updatedAt: timestamp(raw, now) });
  }

  const expenseRows: ExpenseRecord[] = [];
  for (const item of expenseList) {
    const raw = asRaw(item);
    if (!raw) {
      report(
        {
          id: anonId('customExpenses', item),
          guest: null,
          dates: null,
          sourceKey: 'customExpenses',
          missing: ['id', 'property_id', 'month', 'category', 'amount'],
          rawFields: { value: item ?? null },
        },
        item ?? null,
      );
      continue;
    }
    const id = idFrom(raw.id);
    const propertyId = houseFromFields(raw, 'expense');
    const month = expenseMonth(raw);
    const category = expenseCategory(raw);
    const amount = amountFrom(raw.amount);
    const missing: string[] = [];
    if (!id) missing.push('id');
    if (!propertyId) missing.push('property_id');
    if (!month) missing.push('month');
    if (!category) missing.push('category');
    if (amount === null) missing.push('amount');
    if (!id || !propertyId || !month || !category || amount === null || !isExpenseProperty(propertyId)) {
      report(
        {
          id: id ?? anonId('customExpenses', raw),
          guest: labelGuest(raw),
          dates: labelDates(null, null, month),
          sourceKey: 'customExpenses',
          missing,
          rawFields: expenseRawFields(raw),
        },
        raw,
      );
      continue;
    }
    expenseRows.push({
      ...(raw as unknown as ExpenseRecord),
      id,
      propertyId,
      month,
      category,
      amount,
    });
  }

  unresolved.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey) || a.id.localeCompare(b.id));

  const reservationIds = await idSet(env, 'SELECT id FROM reservations');
  const reservationTombstones = await idSet(env, "SELECT id FROM ledger_tombstones WHERE entity = 'reservations'");
  const expenseIds = await idSet(env, 'SELECT id FROM expenses');
  const expenseTombstones = await idSet(env, "SELECT id FROM ledger_tombstones WHERE entity = 'expenses'");
  const overrideIds = await idSet(env, 'SELECT id FROM reservation_overrides');

  const reservationsToInsert = kept.filter((row) => !reservationIds.has(row.id) && !reservationTombstones.has(row.id));
  const expensesToInsert = expenseRows.filter((row) => !expenseIds.has(row.id) && !expenseTombstones.has(row.id));
  const overridesToInsert = overrideRows.filter((row) => !overrideIds.has(row.id));

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      alreadyMigrated: Boolean(already?.value),
      reservationsInserted: reservationsToInsert.length,
      overridesInserted: overridesToInsert.length,
      expensesInserted: expensesToInsert.length,
      directDuplicateRemoved: dropDirect ? 1 : 0,
      unresolved,
      kvWrites: false,
    };
  }

  await run(env, UNRESOLVED_TABLE);

  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  for (const row of kept) {
    statements.push({
      sql: `INSERT INTO reservations (id, version, updated_at, property_id, check_in, check_out, status, source, payout, ical_uid, body)
            SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM ledger_tombstones WHERE entity = 'reservations' AND id = ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [
        row.id,
        timestamp(row as unknown as Raw, now),
        row.propertyId,
        row.checkIn,
        row.checkOut,
        row.status ?? 'confirmed',
        row.source ?? '',
        Number(row.payout ?? 0),
        row.icalUid ?? null,
        reservationBody(row),
        row.id,
      ],
    });
  }
  for (const row of overrideRows) {
    statements.push({
      sql: `INSERT INTO reservation_overrides (id, version, updated_at, body)
            VALUES (?, 1, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [row.id, row.updatedAt, row.body],
    });
  }
  for (const row of expenseRows) {
    const raw = row as unknown as Raw;
    statements.push({
      sql: `INSERT INTO expenses (id, version, updated_at, property_id, month, category, amount, body)
            SELECT ?, 1, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM ledger_tombstones WHERE entity = 'expenses' AND id = ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [
        row.id,
        timestamp(raw, now),
        row.propertyId,
        row.month,
        row.category,
        row.amount,
        expenseBody(row),
        row.id,
      ],
    });
  }
  if (dropDirect) {
    statements.push({
      sql: `INSERT INTO ledger_tombstones (entity, id) VALUES ('reservations', ?) ON CONFLICT(entity, id) DO NOTHING`,
      binds: [NADYA_DIRECT_DUPLICATE_ID],
    });
    statements.push({
      sql: `DELETE FROM reservations WHERE id = ?`,
      binds: [NADYA_DIRECT_DUPLICATE_ID],
    });
    statements.push({
      sql: `DELETE FROM ledger_unresolved WHERE source_key = 'reservations' AND id = ?`,
      binds: [NADYA_DIRECT_DUPLICATE_ID],
    });
  }
  for (const row of kept) {
    statements.push({
      sql: `DELETE FROM ledger_unresolved WHERE source_key = 'reservations' AND id = ?`,
      binds: [row.id],
    });
  }
  for (const row of expenseRows) {
    statements.push({
      sql: `DELETE FROM ledger_unresolved WHERE source_key = 'customExpenses' AND id = ?`,
      binds: [row.id],
    });
  }
  for (const row of overrideRows) {
    const reported = unresolved.some((item) => item.sourceKey === 'reservationOverrides' && item.id === row.id);
    if (!reported) {
      statements.push({
        sql: `DELETE FROM ledger_unresolved WHERE source_key = 'reservationOverrides' AND id = ?`,
        binds: [row.id],
      });
    }
  }
  for (const row of unresolved) {
    const body = unresolvedBodies.get(`${row.sourceKey}\0${row.id}`) ?? row.rawFields;
    statements.push({
      sql: `INSERT INTO ledger_unresolved (source_key, id, guest, dates, missing, raw_fields, body, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_key, id) DO UPDATE SET
              guest = excluded.guest,
              dates = excluded.dates,
              missing = excluded.missing,
              raw_fields = excluded.raw_fields,
              body = excluded.body,
              updated_at = excluded.updated_at`,
      binds: [
        row.sourceKey,
        row.id,
        row.guest,
        row.dates,
        JSON.stringify(row.missing),
        JSON.stringify(row.rawFields),
        JSON.stringify(body),
        now,
      ],
    });
  }

  const insertedBefore = {
    reservations: await count(env, 'reservations'),
    overrides: await count(env, 'reservation_overrides'),
    expenses: await count(env, 'expenses'),
  };
  if (statements.length > 0) await runBatch(env, statements);

  if (!already?.value) {
    await run(
      env,
      `INSERT INTO ledger_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`,
      KV_IMPORTED_AT,
      now,
    );
  }

  const directDuplicateRemoved = dropDirect
    ? (await one<{ id: string }>(env, 'SELECT id FROM reservations WHERE id = ?', NADYA_DIRECT_DUPLICATE_ID))
      ? 0
      : 1
    : 0;

  setLedgerReady(env, true);
  forgetLedgerLists(env);

  return {
    ok: true,
    dryRun: false,
    alreadyMigrated: Boolean(already?.value),
    reservationsInserted: (await count(env, 'reservations')) - insertedBefore.reservations,
    overridesInserted: (await count(env, 'reservation_overrides')) - insertedBefore.overrides,
    expensesInserted: (await count(env, 'expenses')) - insertedBefore.expenses,
    directDuplicateRemoved,
    unresolved,
    kvWrites: false,
  };
}

async function count(env: SettingsEnv, table: 'reservations' | 'reservation_overrides' | 'expenses'): Promise<number> {
  const row = await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n ?? 0);
}
