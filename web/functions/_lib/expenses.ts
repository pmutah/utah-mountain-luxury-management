import { EXPENSES, PROPERTIES, type ExpensePropertyId } from './data';
import type { SettingsEnv } from './kv';
import type { ReservationRecord } from './agent/types';
import type { PaidBy } from './paid-by';

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
}

/** Client-facing expense with optional same-origin receipt URL. */
export type ExpenseWithReceipt = ExpenseRecord & { receiptUrl?: string | null };

const KV_KEY = 'customExpenses';

export async function loadCustomExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  if (!env.SETTINGS) return [];
  try {
    const raw = await env.SETTINGS.get(KV_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExpenseRecord[];
  } catch {
    return [];
  }
}

export async function saveCustomExpenses(env: SettingsEnv, items: ExpenseRecord[]): Promise<ExpenseRecord[]> {
  if (env.SETTINGS) {
    await env.SETTINGS.put(KV_KEY, JSON.stringify(items));
  }
  return items;
}

export async function mergeAllExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  const custom = await loadCustomExpenses(env);
  const base = EXPENSES.map((e) => ({
    ...e,
    propertyId: e.propertyId as ExpensePropertyId,
  }));
  return [...base, ...custom];
}

export function withReceiptUrls(expenses: ExpenseRecord[]): ExpenseWithReceipt[] {
  return expenses.map((e) => ({
    ...e,
    receiptUrl: e.receiptStoragePath ? `/api/expenses/${encodeURIComponent(e.id)}/receipt` : null,
  }));
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
    const fee = PROPERTIES[r.propertyId].cleaningFee;
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
    await saveCustomExpenses(env, merged);
  }
  return written;
}
