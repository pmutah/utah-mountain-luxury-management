import { EXPENSES, PROPERTIES, type ExpensePropertyId } from './data';
import type { SettingsEnv } from './kv';
import { kvPut, StorageReadError, storageReadPaused } from './kv-json';
import type { ReservationRecord } from './agent/types';
import type { PaidBy } from './paid-by';
import { parsePaidDateFromNote } from './expense-month';
import { ledgerSafeToSave } from './ledger-guard';
import { cachedGet } from './request-cache';
import {
  VersionConflictError,
  canonicalJson,
  forgetLedgerLists,
  ledgerReady,
  many,
  one,
  run,
} from './ledger-db';

export interface ExpenseRecord {
  id: string;
  month: string;
  propertyId: ExpensePropertyId;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
  /** Construction phase (construction expenses only). */
  stage?: string;
  /** Who fronted the bill. Brandon & Stephanie share one side of the 50/50. */
  paidBy?: PaidBy;
  /** Calendar date the bill was paid (YYYY-MM-DD). Used for carrying-cost / interest. */
  paidDate?: string;
  createdAt?: string;
  receiptStoragePath?: string | null;
  receiptContentType?: string | null;
  receiptUploadedAt?: string | null;
  /** Product / item photos (separate from the store receipt). */
  itemPhotos?: ItemPhoto[];
  /** Present once the row lives in D1. The board sends it back as If-Match. */
  version?: number;
  updatedAt?: string;
}

export interface ItemPhoto {
  id: string;
  storagePath: string;
  contentType: string;
  uploadedAt: string;
  url?: string;
}

/** Client-facing expense with optional same-origin receipt URL. */
export type ExpenseWithReceipt = ExpenseRecord & { receiptUrl?: string | null };

const KV_KEY = 'customExpenses';

type VersionedExpense = ExpenseRecord & { version?: number; updatedAt?: string };

function expenseBody(row: VersionedExpense): ExpenseRecord {
  const next = { ...row };
  delete next.version;
  delete next.updatedAt;
  delete (next as ExpenseWithReceipt).receiptUrl;
  return next;
}

function parseExpense(body: string, version: number, updatedAt: string): VersionedExpense {
  return { ...(JSON.parse(body) as ExpenseRecord), version, updatedAt };
}

/** Every call reads D1. The list is not memoized on the isolate or on `env`. */
async function d1Expenses(env: SettingsEnv): Promise<VersionedExpense[]> {
  const rows = await many<{ body: string; version: number; updated_at: string }>(
    env,
    'SELECT body, version, updated_at FROM expenses',
  );
  return rows.map((row) => parseExpense(row.body, Number(row.version), row.updated_at));
}

export async function getExpenseById(env: SettingsEnv, id: string): Promise<VersionedExpense | null> {
  if (!(await ledgerReady(env))) {
    const custom = await loadCustomExpenses(env);
    return custom.find((row) => row.id === id) ?? null;
  }
  const row = await one<{ body: string; version: number; updated_at: string }>(
    env,
    'SELECT body, version, updated_at FROM expenses WHERE id = ?',
    id,
  );
  return row ? parseExpense(row.body, Number(row.version), row.updated_at) : null;
}

export async function loadCustomExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  if (await ledgerReady(env)) return d1Expenses(env);
  if (!env.SETTINGS) return [];
  /*
   * Read through the request cache. `/api/expenses` calls `mergeAllExpenses` and `loadCustomExpenses`,
   * and both read this key: three KV GETs for one request before the cache, one after. On a deployment
   * at its daily read limit that difference is the whole problem.
   */
  return cachedGet(
    env,
    async () => {
      try {
        const raw = await env.SETTINGS!.get(KV_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as ExpenseRecord[];
      } catch (err) {
        if (storageReadPaused(err)) throw err instanceof StorageReadError ? err : new StorageReadError();
        return [];
      }
    },
    `kv:${KV_KEY}`,
  );
}

export async function saveCustomExpenses(
  env: SettingsEnv,
  items: ExpenseRecord[],
  /**
   * Set only by a path that is deleting a row on purpose, and it must say why. Every other save
   * leaves it unset, so a shrink that nobody meant is refused rather than written.
   */
  options: { allowShrinkReason?: string } = {},
): Promise<ExpenseRecord[]> {
  if (await ledgerReady(env)) return syncExpenseRows(env, items, options);
  // Delegate to `kvPut`, which owns the "do not shrink the ledger" guard. This function used to
  // write to KV directly, so the guard never covered the expense ledger at all — the registry said
  // expenses were protected and only bookings actually were.
  return kvPut(env, KV_KEY, items, options);
}

/**
 * One UPDATE per changed expense. A row whose version moved since this list was loaded is left
 * alone, so a turnover-cleaning save cannot put a stale copy over a bill someone just edited.
 */
async function syncExpenseRows(
  env: SettingsEnv,
  items: ExpenseRecord[],
  options: { allowShrinkReason?: string },
): Promise<ExpenseRecord[]> {
  const existing = await many<{ id: string; body: string; version: number; updated_at: string }>(
    env,
    'SELECT id, body, version, updated_at FROM expenses',
  );
  const byId = new Map(existing.map((row) => [row.id, parseExpense(row.body, Number(row.version), row.updated_at)]));
  const incomingIds = new Set(items.map((row) => row.id));
  const removed = existing.filter((row) => !incomingIds.has(row.id));
  const removedKept = removed.filter((row) => !row.id.startsWith('clean-'));
  if (removedKept.length > 0 && !(options.allowShrinkReason ?? '').trim()) {
    throw new Error(
      `Refusing to write ${items.filter((row) => !row.id.startsWith('clean-')).length} saved rows over ${existing.filter((row) => !row.id.startsWith('clean-')).length}: this would lose records. Nothing was written.`,
    );
  }
  for (const row of items) {
    const prev = byId.get(row.id);
    const body = expenseBody(row);
    if (!prev) {
      await insertExpenseRow(env, body);
      continue;
    }
    if (canonicalJson(expenseBody(prev)) === canonicalJson(body)) continue;
    const held = (row as VersionedExpense).version;
    if (held !== undefined && held !== prev.version) continue;
    await updateExpenseRow(env, { ...body, id: row.id }, prev.version);
  }
  for (const row of removed) {
    await deleteExpenseRow(env, row.id, Number(row.version));
  }
  return items;
}

export async function insertExpenseRow(env: SettingsEnv, item: ExpenseRecord): Promise<ExpenseRecord> {
  const now = item.createdAt ?? new Date().toISOString();
  await run(env, `DELETE FROM ledger_tombstones WHERE entity = 'expenses' AND id = ?`, item.id);
  const changes = await run(
    env,
    `INSERT INTO expenses (id, version, updated_at, property_id, month, category, amount, body)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    item.id,
    now,
    item.propertyId,
    item.month,
    item.category,
    Number(item.amount),
    JSON.stringify(expenseBody(item)),
  );
  forgetLedgerLists(env);
  if (changes !== 1) throw new VersionConflictError({ ...item, version: 1 });
  return { ...expenseBody(item), version: 1, updatedAt: now };
}

export async function updateExpenseRow(
  env: SettingsEnv,
  row: ExpenseRecord,
  expectedVersion?: number,
): Promise<VersionedExpense> {
  const current = await getExpenseById(env, row.id);
  if (!current) throw new VersionConflictError(null);
  const currentVersion = current.version ?? 0;
  const claimed = expectedVersion ?? currentVersion;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new VersionConflictError(current);
  }
  const now = new Date().toISOString();
  const nextVersion = currentVersion + 1;
  const body = expenseBody(row);
  const changes = await run(
    env,
    `UPDATE expenses
        SET version = ?, updated_at = ?, property_id = ?, month = ?, category = ?, amount = ?, body = ?
      WHERE id = ? AND version = ?`,
    nextVersion,
    now,
    body.propertyId,
    body.month,
    body.category,
    Number(body.amount),
    JSON.stringify(body),
    row.id,
    claimed,
  );
  forgetLedgerLists(env);
  if (changes !== 1) {
    const fresh = await getExpenseById(env, row.id);
    throw new VersionConflictError(fresh);
  }
  return { ...body, version: nextVersion, updatedAt: now };
}

export async function deleteExpenseRow(
  env: SettingsEnv,
  id: string,
  expectedVersion?: number,
): Promise<VersionedExpense | null> {
  const current = await getExpenseById(env, id);
  if (!current) return null;
  const currentVersion = current.version ?? 0;
  const claimed = expectedVersion ?? currentVersion;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new VersionConflictError(current);
  }
  const changes = await run(env, `DELETE FROM expenses WHERE id = ? AND version = ?`, id, claimed);
  if (changes !== 1) {
    const fresh = await getExpenseById(env, id);
    if (!fresh) return null;
    throw new VersionConflictError(fresh);
  }
  await run(
    env,
    `INSERT INTO ledger_tombstones (entity, id) VALUES ('expenses', ?) ON CONFLICT(entity, id) DO NOTHING`,
    id,
  );
  forgetLedgerLists(env);
  return current;
}

export async function mergeAllExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  const custom = await loadCustomExpenses(env);
  const base = EXPENSES.map((e) => ({
    ...e,
    propertyId: e.propertyId as ExpensePropertyId,
  }));
  return [...base, ...custom];
}

export function hydratePaidDate(expense: ExpenseRecord): ExpenseRecord {
  if (expense.paidDate) return expense;
  const fromNote = parsePaidDateFromNote(expense.note);
  return fromNote ? { ...expense, paidDate: fromNote } : expense;
}

export function withReceiptUrls(expenses: ExpenseRecord[]): ExpenseWithReceipt[] {
  return expenses.map((e) => {
    const hydrated = hydratePaidDate(e);
    return {
      ...hydrated,
      version: hydrated.version ?? 0,
      receiptUrl: hydrated.receiptStoragePath
        ? `/api/expenses/${encodeURIComponent(hydrated.id)}/receipt`
        : null,
      itemPhotos: (Array.isArray(hydrated.itemPhotos) ? hydrated.itemPhotos : []).map((photo) => ({
        ...photo,
        url: `/api/expenses/${encodeURIComponent(hydrated.id)}/photos/${encodeURIComponent(photo.id)}`,
      })),
    };
  });
}

/** Persist note-derived paid dates in one KV write so later PATCHes don't race. */
export async function persistMissingPaidDates(env: SettingsEnv): Promise<number> {
  const custom = await loadCustomExpenses(env);
  let written = 0;
  const next = custom.map((e) => {
    const hydrated = hydratePaidDate(e);
    if (hydrated.paidDate && hydrated.paidDate !== e.paidDate) written++;
    return hydrated;
  });
  // Same-length hydration, so this can only drop a row if the mapping itself changed. If a future
  // edit ever made it unsafe, returning `written` would claim dates were saved when they were not.
  if (written > 0) {
    if (!ledgerSafeToSave(custom, next)) {
      throw new Error('Refusing to save paid dates over the saved ledger. Nothing was written.');
    }
    await saveCustomExpenses(env, next);
  }
  return written;
}

export function newExpenseId(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CLEAN_PREFIX = 'clean-';

/** One turnover Cleaning expense per stay (what we pay the cleaner). Idempotent. */
export async function ensureTurnoverCleaningExpenses(
  env: SettingsEnv,
  reservations: ReservationRecord[],
): Promise<number> {
  const custom = await loadCustomExpenses(env);
  const byId = new Map(custom.map((e) => [e.id, e]));
  let written = 0;

  const active = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'blocked' && r.propertyId !== undefined,
  );

  const keepIds = new Set(active.map((r) => `${CLEAN_PREFIX}${r.id}`));

  for (const r of active) {
    const property = PROPERTIES[r.propertyId as keyof typeof PROPERTIES];
    const fee = property?.cleaningFee;
    if (!fee) continue;
    const id = `${CLEAN_PREFIX}${r.id}`;
    const month = r.checkOut.slice(0, 7);
    const next: ExpenseRecord = {
      id,
      month,
      propertyId: r.propertyId,
      category: 'Cleaning',
      amount: fee,
      vendor: 'Turnover cleaning',
      note: `${r.guestName} · ${r.checkIn} to ${r.checkOut}`,
      createdAt: byId.get(id)?.createdAt ?? new Date().toISOString(),
    };
    const prev = byId.get(id);
    if (
      !prev ||
      prev.amount !== next.amount ||
      prev.month !== next.month ||
      prev.note !== next.note
    ) {
      byId.set(id, { ...prev, ...next });
      written++;
    }
  }

  const merged = [...byId.values()].filter((e) => {
    if (!e.id.startsWith(CLEAN_PREFIX)) return true;
    return keepIds.has(e.id);
  });

  if (written > 0 || merged.length !== custom.length) {
    /*
     * A refused save used to return 0, which is indistinguishable from "there was nothing to do".
     * That is how a whole class of silent loss stayed invisible: the caller saw success, the desk
     * showed no cleaning rows, and nobody was told. A refusal now says so.
     */
    if (!ledgerSafeToSave(custom, merged)) {
      throw new Error(
        `Refusing to save turnover cleaning over the saved ledger: it would leave fewer expenses than it found. Nothing was written.`,
      );
    }
    await saveCustomExpenses(env, merged);
    return written;
  }
  return 0;
}
