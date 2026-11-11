import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import { loadCustomExpenses, saveCustomExpenses, withReceiptUrls } from '../../_lib/expenses';
import { parsePaidDate } from '../../_lib/expense-month';
import { parseConstructionStage } from '../../_lib/construction/types';
import { isPaidBy } from '../../_lib/paid-by';
import { archiveExpense } from '../../_lib/expense-archive';
import { readOrRefuse } from '../../_lib/read-guard';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { audit } from '../../_lib/platform/audit-store';
import { resolveCaller } from '../../_lib/roles';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

/** Who to record. A role and, when the caller signed in by email, that address — never a guest or a phone. */
function auditActor(request: Request, env: unknown): { role: 'admin' | 'owner' | 'cleaner' | 'vendor'; email?: string } {
  const caller = resolveCaller(request, env);
  if (caller.kind !== 'host') return { role: 'admin' };
  return caller.via === 'email' && caller.role !== 'admin' ? { role: caller.role, email: caller.email } : { role: caller.role };
}

export const onRequestPatch: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  if (!env.SETTINGS) {
    return corsJson(request, { error: 'Expense storage not available' }, 503);
  }

  let body: {
    paidBy?: string | null;
    stage?: string | null;
    paidDate?: string | null;
    note?: string | null;
    vendor?: string | null;
    category?: string;
    amount?: number | string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body' }, 400);
  }

  const read = await readOrRefuse(request, () => loadCustomExpenses(env), 'Saved expenses');
  if (!read.ok) return read.response;
  const custom = read.value;
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) {
    return corsJson(request, { error: 'Expense not found' }, 404);
  }

  if (body.paidBy === null || body.paidBy === '') {
    const next = { ...custom[idx]! };
    delete next.paidBy;
    custom[idx] = next;
  } else if (isPaidBy(body.paidBy)) {
    custom[idx] = { ...custom[idx]!, paidBy: body.paidBy };
  } else if (body.paidBy !== undefined) {
    return corsJson(request, { error: 'paidBy must be brandon or todd' }, 400);
  }

  if (body.stage === null || body.stage === '') {
    const next = { ...custom[idx]! };
    delete next.stage;
    custom[idx] = next;
  } else if (body.stage !== undefined) {
    custom[idx] = { ...custom[idx]!, stage: parseConstructionStage(body.stage) };
  }

  if (body.note !== undefined) {
    const note = body.note == null ? '' : String(body.note).trim();
    const next = { ...custom[idx]! };
    if (note) next.note = note;
    else delete next.note;
    custom[idx] = next;
  }

  if (body.vendor !== undefined) {
    const vendor = body.vendor == null ? '' : String(body.vendor).trim();
    const next = { ...custom[idx]! };
    if (vendor) next.vendor = vendor;
    else delete next.vendor;
    custom[idx] = next;
  }

  if (body.category !== undefined) {
    const category = String(body.category).trim();
    if (!category) return corsJson(request, { error: 'category is required' }, 400);
    custom[idx] = { ...custom[idx]!, category };
  }

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return corsJson(request, { error: 'amount must be a positive number' }, 400);
    }
    custom[idx] = { ...custom[idx]!, amount };
  }

  if (body.paidDate === null || body.paidDate === '') {
    const next = { ...custom[idx]! };
    delete next.paidDate;
    custom[idx] = next;
  } else if (body.paidDate !== undefined) {
    const paidDate = parsePaidDate(body.paidDate);
    if (!paidDate) {
      return corsJson(request, { error: 'paidDate must be YYYY-MM-DD' }, 400);
    }
    custom[idx] = { ...custom[idx]!, paidDate, month: paidDate.slice(0, 7) };
  }

  await saveCustomExpenses(env, custom);
  /*
   * Record the edit. The entry names the row and which fields changed — not their values, because an amount is the private
   * detail this log exists to leave in one place.
   */
  const changed = Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined);
  const logged = await audit(env, {
    actor: auditActor(request, env),
    action: 'expense.update',
    target: id,
    note: changed.length > 0 ? `Fields changed: ${changed.slice(0, 8).join(', ')}.` : 'A patch with no changed field.',
  });
  const [enriched] = withReceiptUrls([custom[idx]!]);
  return corsJson(request, { ...enriched, ...(logged.ok ? {} : { auditFailed: logged.reason }) });
};

export const onRequestDelete: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  // A reason is optional but useful later, and it is kept with the archived row.
  const reason = new URL(request.url).searchParams.get('reason') ?? '';

  const read = await readOrRefuse(request, () => loadCustomExpenses(env), 'Saved expenses');
  if (!read.ok) return read.response;
  const custom = read.value;
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) {
    return corsJson(request, { error: 'Expense not found or cannot delete built-in expense' }, 404);
  }

  const expense = custom[idx]!;
  /*
   * Archive first. A removal that cannot be archived does not happen, so a storage failure leaves the
   * expense on the books instead of losing the row and its receipt with nothing to restore.
   */
  try {
    await archiveExpense(env, expense, reason);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The expense could not be archived, so it was not removed. Nothing was written.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The archive failed';
    return corsJson(request, { error: `The expense was not removed: ${message}` }, 500);
  }

  /*
   * The receipt file is deliberately NOT deleted here. Deleting it would make the archive a lie: the
   * row would come back on a restore pointing at a file that no longer exists. The bytes are small
   * next to losing a bill, so they stay in storage until the archived row is purged on purpose.
   * Storage is not a ledger, and nothing reads an orphaned file.
   */
  custom.splice(idx, 1);
  // Archived above, so this is a deletion we mean. The reason is what lets the ledger guard tell
  // this apart from a wipe caused by a bad read.
  await saveCustomExpenses(env, custom, { allowShrinkReason: `Expense ${id} archived, then removed.` });
  /*
   * Record it. The entry names the row and the reason, never the amount or the vendor — an audit trail that repeats the
   * detail is a second copy of the thing it exists to protect. A failed log does not undo the removal, and the response says so,
   * because the archive above is the restore path and losing that would be worse than a missing log line.
   */
  const logged = await audit(env, {
    actor: auditActor(request, env),
    action: 'expense.remove',
    target: id,
    note: reason ? `Reason given. Archived and restorable.` : 'Archived and restorable.',
  });
  // The row is restorable, and the answer says so, so a host who deleted by mistake knows the way back.
  return corsJson(request, {
    ok: true,
    id,
    archived: true,
    restore: `POST /api/expenses/archive?restore=${id}`,
    ...(logged.ok ? {} : { auditFailed: logged.reason }),
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
