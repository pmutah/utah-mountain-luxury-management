import type { ExpenseRecord } from './expenses';
import { kvGet, kvPut, storageReadPaused, StorageReadError } from './kv-json';
import type { SettingsEnv } from './kv';

/**
 * Deleting an expense used to be permanent. The route removed the row from `customExpenses` and then
 * deleted the receipt file from storage, so a mistaken delete lost the ledger row and the receipt
 * with nothing to recover from.
 *
 * This archive keeps the row, the reason, and the time on a separate key. It is written before the
 * row is removed, so a failure to archive leaves the expense in place: the delete fails closed.
 * Restoring puts the row back exactly as it was.
 *
 * The archive is not a second ledger. Nothing reads it for a total, a report, or an owner statement.
 */
const KV_KEY = 'expenseArchive';

/** How many removed rows are kept. Enough to cover a bad afternoon, bounded so the key cannot grow. */
const KEEP = 200;

export type ArchivedExpense = {
  /** The row exactly as it was, including its receipt path and photo list. */
  expense: ExpenseRecord;
  /** When it was removed. */
  removedAt: string;
  /** Why it was removed, when the host said. */
  reason?: string;
};

export async function loadArchivedExpenses(env: SettingsEnv): Promise<ArchivedExpense[]> {
  if (!env.SETTINGS) return [];
  try {
    const rows = await kvGet<ArchivedExpense[]>(env, KV_KEY, []);
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row): row is ArchivedExpense =>
        Boolean(row) && typeof row === 'object' && Boolean(row.expense) && typeof row.removedAt === 'string',
    );
  } catch (err) {
    if (storageReadPaused(err)) throw err instanceof StorageReadError ? err : new StorageReadError();
    return [];
  }
}

/**
 * Save one row before the caller removes it. This throws rather than swallowing a failure, because a
 * delete that cannot be archived must not go ahead.
 */
export async function archiveExpense(
  env: SettingsEnv,
  expense: ExpenseRecord,
  reason?: string,
  now = new Date(),
): Promise<ArchivedExpense[]> {
  const rows = await loadArchivedExpenses(env);
  const trimmed = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
  const row: ArchivedExpense = {
    expense,
    removedAt: now.toISOString(),
    ...(trimmed ? { reason: trimmed } : {}),
  };
  // A row removed twice keeps one entry, keyed by its own id, so a restore cannot duplicate it.
  const next = [...rows.filter((entry) => entry.expense?.id !== expense.id), row].slice(-KEEP);
  await kvPut(env, KV_KEY, next);
  return next;
}

/** Find one archived row by its expense id. Null when it was never archived. */
export async function findArchivedExpense(env: SettingsEnv, id: string): Promise<ArchivedExpense | null> {
  const rows = await loadArchivedExpenses(env);
  return rows.find((row) => row.expense?.id === id) ?? null;
}

/** Drop one archived row, after its expense has been put back. */
export async function unarchiveExpense(env: SettingsEnv, id: string): Promise<ArchivedExpense[]> {
  const next = (await loadArchivedExpenses(env)).filter((row) => row.expense?.id !== id);
  await kvPut(env, KV_KEY, next);
  return next;
}

/** A line for the desk. It counts what can be restored and never shows an amount. */
export function archiveLine(rows: readonly ArchivedExpense[]): string {
  if (rows.length === 0) return 'No expense has been removed. Nothing can be restored.';
  const noun = rows.length === 1 ? '1 removed expense can be restored.' : `${rows.length} removed expenses can be restored.`;
  return `${noun} They are not counted in any total while they sit here.`;
}
