import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadCustomExpenses, saveCustomExpenses } from '../../_lib/expenses';
import { archiveLine, findArchivedExpense, loadArchivedExpenses, unarchiveExpense } from '../../_lib/expense-archive';
import { deleteStoredReceipt } from '../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { allowedHouses, resolveCaller } from '../../_lib/roles';

type ArchiveEnv = SettingsEnv & FirebaseStorageEnv;

/**
 * The archive of removed expenses, and the way back. A delete used to be permanent, so a mistaken
 * one lost the ledger row and its receipt with nothing to recover from. This lists what can be
 * restored and puts one row back exactly as it was.
 *
 * Nothing here is a total. An archived row is not in any report, statement, or P&L while it sits.
 */
export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let rows;
  try {
    rows = await loadArchivedExpenses(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { archived: null, line: null, storageReads: 'paused', error: 'The archive could not be read.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The archive failed';
    return corsJson(request, { error: message }, 500);
  }
  const caller = resolveCaller(request, env);
  if (caller.kind === 'denied') return hostDenied(request, env);
  /*
   * An owner reads Ranch and River. The archive listed every removed expense with its house, note, and amount — so a deleted Lindon bill
   * came back here even though the live ledger would not show it. It is filtered the same way, and the line is rebuilt from the rows that
   * remain so the count and the list agree.
   *
   * The house sits on the nested `expense`, not on the archive row, so the filter reads that path rather than the generic `stripHouses`.
   */
  const readable = allowedHouses(caller.role);
  const visible =
    readable === null
      ? rows
      : rows.filter((row) => {
          const house = row.expense.propertyId;
          return !house || readable.includes(house as 'ranch' | 'lindon' | 'river');
        });
  return corsJson(
    request,
    {
      // Only what a host needs to recognize the row. No receipt bytes, and no second ledger.
      archived: visible.map((row) => ({
        id: row.expense.id,
        removedAt: row.removedAt,
        ...(row.reason ? { reason: row.reason } : {}),
        description: row.expense.note ?? row.expense.category ?? '',
        amount: row.expense.amount,
        propertyId: row.expense.propertyId ?? null,
        date: row.expense.paidDate ?? row.expense.month ?? null,
        hasReceipt: Boolean(row.expense.receiptStoragePath),
      })),
      line: archiveLine(visible),
      storageReads: 'ok',
      ...(caller.role === 'owner' ? { houses: allowedHouses(caller.role) } : {}),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Put one removed expense back. `?restore=<id>` names the archived row. It returns the row to
 * `customExpenses` exactly as it was saved, including its receipt path, and then drops it from the
 * archive so it cannot be restored twice.
 *
 * A row that is already on the books is not duplicated: that is a refusal with a reason, not a
 * silent second copy.
 */
export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = new URL(request.url).searchParams.get('restore')?.trim() ?? '';
  if (!id) {
    return corsJson(request, { error: 'Name the archived expense to restore: ?restore=<id>' }, 400);
  }

  let row;
  let custom;
  try {
    row = await findArchivedExpense(env, id);
    custom = await loadCustomExpenses(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The archive could not be read, so nothing was restored.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The restore failed';
    return corsJson(request, { error: message }, 500);
  }
  if (!row) return corsJson(request, { error: 'That expense is not in the archive.' }, 404);

  if (custom.some((entry) => entry.id === id)) {
    // Already on the books. Drop the stale archive row so the list matches reality, and say so.
    await unarchiveExpense(env, id).catch(() => null);
    return corsJson(request, { error: 'That expense is already on the books. Nothing was added twice.' }, 409);
  }

  try {
    await saveCustomExpenses(env, [...custom, row.expense]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The expense could not be saved';
    return corsJson(request, { error: `Nothing was restored: ${message}` }, 500);
  }
  await unarchiveExpense(env, id).catch(() => null);

  return corsJson(
    request,
    { ok: true, restored: row.expense.id, line: 'That expense is back on the books with its receipt path.' },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Permanently drop one archived row and the files that belong to it. This is the only place a
 * receipt is deleted now, so losing a bill takes a deliberate second act on a row already removed
 * from the books, not a single mistake.
 *
 * `?purge=<id>` names it. The row must already be in the archive: a live expense is never purged
 * from here, because that would bypass the archive entirely.
 */
export const onRequestDelete: PagesFunction<ArchiveEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = new URL(request.url).searchParams.get('purge')?.trim() ?? '';
  if (!id) return corsJson(request, { error: 'Name the archived expense to purge: ?purge=<id>' }, 400);

  let row;
  try {
    row = await findArchivedExpense(env, id);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The archive could not be read, so nothing was purged.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The purge failed';
    return corsJson(request, { error: message }, 500);
  }
  if (!row) {
    return corsJson(
      request,
      { error: 'That expense is not in the archive. A live expense is removed, not purged.' },
      404,
    );
  }

  // The row leaves the archive first, so a file failure cannot leave a row that points at nothing.
  await unarchiveExpense(env, id);
  const failed: string[] = [];
  if (row.expense.receiptStoragePath) {
    try {
      await deleteStoredReceipt(env, row.expense);
    } catch {
      failed.push('receipt');
    }
  }
  for (const photo of row.expense.itemPhotos ?? []) {
    try {
      await deleteStoredReceipt(env, { id: `${row.expense.id}--${photo.id}`, receiptStoragePath: photo.storagePath });
    } catch {
      failed.push('photo');
    }
  }

  return corsJson(
    request,
    {
      ok: true,
      purged: id,
      line: failed.length
        ? 'The row is gone from the archive. A file could not be deleted and is now unused; it is not on any books.'
        : 'The row and its files are gone. That cannot be undone.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);