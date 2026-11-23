/**
 * Copy the KV list blobs into D1, once, without writing those blobs back.
 *
 * KV can answer two different copies of the same key for about a minute. The import inserts any
 * id that is not already stored and does not update a row that is. Running it again after the
 * other edge catches up adds only the rows the first read missed. A row deleted after the import
 * is recorded in `ledger_tombstones`, so a later pass does not put it back.
 */
import type { ReservationRecord } from './agent/types';
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

export interface LedgerImportResult {
  ok: true;
  alreadyMigrated: boolean;
  reservationsInserted: number;
  overridesInserted: number;
  expensesInserted: number;
  directDuplicateRemoved: number;
  kvWrites: false;
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

export async function migrateKvLedger(env: SettingsEnv): Promise<LedgerImportResult> {
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

  const custom = await kvGet<ReservationRecord[]>(env, 'reservations', []);
  const overrides = await kvGet<Record<string, Partial<ReservationRecord>>>(env, 'reservationOverrides', {});
  const expenses = await kvGet<ExpenseRecord[]>(env, 'customExpenses', []);
  const now = new Date().toISOString();

  const dropDirect = custom.some(isNadyaDirectDuplicate) && hasNadyaVrboTwin(custom);
  const reservations = dropDirect ? custom.filter((row) => !isNadyaDirectDuplicate(row)) : custom;

  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  for (const row of reservations) {
    if (!row?.id) continue;
    statements.push({
      sql: `INSERT INTO reservations (id, version, updated_at, property_id, check_in, check_out, status, source, payout, ical_uid, body)
            SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM ledger_tombstones WHERE entity = 'reservations' AND id = ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [
        row.id,
        row.createdAt ?? now,
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
  for (const [id, patch] of Object.entries(overrides)) {
    if (!id || !patch) continue;
    statements.push({
      sql: `INSERT INTO reservation_overrides (id, version, updated_at, body)
            VALUES (?, 1, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [id, now, JSON.stringify(patch)],
    });
  }
  for (const row of expenses) {
    if (!row?.id) continue;
    statements.push({
      sql: `INSERT INTO expenses (id, version, updated_at, property_id, month, category, amount, body)
            SELECT ?, 1, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM ledger_tombstones WHERE entity = 'expenses' AND id = ?)
            ON CONFLICT(id) DO NOTHING`,
      binds: [
        row.id,
        row.createdAt ?? now,
        row.propertyId,
        row.month,
        row.category,
        Number(row.amount ?? 0),
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
    alreadyMigrated: Boolean(already?.value),
    reservationsInserted: (await count(env, 'reservations')) - insertedBefore.reservations,
    overridesInserted: (await count(env, 'reservation_overrides')) - insertedBefore.overrides,
    expensesInserted: (await count(env, 'expenses')) - insertedBefore.expenses,
    directDuplicateRemoved,
    kvWrites: false,
  };
}

async function count(env: SettingsEnv, table: 'reservations' | 'reservation_overrides' | 'expenses'): Promise<number> {
  const row = await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n ?? 0);
}
