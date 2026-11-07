import { EXPENSES, PROPERTIES, type ExpensePropertyId } from './data';
import type { SettingsEnv } from './kv';
import { kvPut, StorageReadError, storageReadPaused } from './kv-json';
import type { ReservationRecord } from './agent/types';
import type { PaidBy } from './paid-by';
import { parsePaidDateFromNote } from './expense-month';
import { ledgerSafeToSave } from './ledger-guard';
import { cachedGet } from './request-cache';

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

export async function loadCustomExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
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
  // Delegate to `kvPut`, which owns the "do not shrink the ledger" guard. This function used to
  // write to KV directly, so the guard never covered the expense ledger at all — the registry said
  // expenses were protected and only bookings actually were.
  return kvPut(env, KV_KEY, items, options);
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
