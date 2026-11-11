import { corsJson, isExpenseProperty } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { parseConstructionStage } from '../../_lib/construction/types';
import {
  loadCustomExpenses,
  mergeAllExpenses,
  newExpenseId,
  persistMissingPaidDates,
  saveCustomExpenses,
  withReceiptUrls,
  type ExpenseRecord,
} from '../../_lib/expenses';
import { parsePaidDate } from '../../_lib/expense-month';
import { parsePaidBy } from '../../_lib/paid-by';
import { appendReceiptWarning, storeReceiptForExpense } from '../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import type { SettingsEnv } from '../../_lib/kv';
import { allowedHouses, refuseReadOnly, resolveCaller, stripHouses } from '../../_lib/roles';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv & { DASHBOARD_PASSWORD?: string };

const PAUSED =
  'Saved expenses could not be read. Storage reads are paused for the rest of the day. Nothing was written over them.';

export const onRequestGet: PagesFunction<ExpenseEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    await persistMissingPaidDates(env);
    const all = withReceiptUrls(await mergeAllExpenses(env));
    const custom = withReceiptUrls(await loadCustomExpenses(env));
    /*
     * The role decides which houses leave the server.
     *
     * The plan asks for an owner who "sees Ranch and River read-only". Hiding Lindon in the browser would still send it, so the
     * filter is here. An admin, a bot bearer, and the shared password all resolve to admin and see every row, exactly as before.
     */
    const caller = resolveCaller(request, env);
    if (caller.kind === 'denied') return hostDenied(request, env);
    return corsJson(request, {
      expenses: stripHouses(all, caller.role),
      custom: stripHouses(custom, caller.role),
      ...(caller.role === 'owner' ? { houses: allowedHouses(caller.role), readOnly: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/limit exceeded|paused for the rest of the day|could not be read/i.test(message)) {
      return corsJson(request, { error: PAUSED }, 503);
    }
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestPost: PagesFunction<ExpenseEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  // An owner reads and does not write. 403 with a reason, distinct from the 401 an unauthenticated caller gets.
  const readOnly = refuseReadOnly(request, env, corsJson);
  if (readOnly) return readOnly;
  if (!env.SETTINGS) {
    return corsJson(
      request,
      { error: 'Expense storage not available (KV SETTINGS binding missing)' },
      503,
    );
  }

  let body: {
    propertyId: string;
    month: string;
    category: string;
    amount: number;
    note?: string;
    vendor?: string;
    stage?: string;
    paidBy?: string;
    paidDate?: string;
    receiptBase64?: string;
    receiptMimeType?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Request too large or invalid JSON' }, 413);
  }

  if (!isExpenseProperty(body.propertyId) || !body.month || !body.category) {
    return corsJson(request, { error: 'propertyId, month, and category required' }, 400);
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return corsJson(request, { error: 'Invalid amount' }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(body.month)) {
    return corsJson(request, { error: 'month must be YYYY-MM' }, 400);
  }

  const id = newExpenseId();
  const { meta, warning } = await storeReceiptForExpense(
    env,
    body.propertyId,
    id,
    body.receiptBase64,
    body.receiptMimeType,
  );

  const item: ExpenseRecord = {
    id,
    propertyId: body.propertyId,
    month: body.month,
    category: body.category.trim(),
    amount,
    note: appendReceiptWarning(body.note?.trim(), warning),
    vendor: body.vendor?.trim() || undefined,
    stage: parseConstructionStage(body.stage),
    paidBy: parsePaidBy(body.paidBy),
    paidDate: parsePaidDate(body.paidDate),
    createdAt: new Date().toISOString(),
    ...meta,
  };

  let custom: ExpenseRecord[];
  try {
    custom = await loadCustomExpenses(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/limit exceeded|paused for the rest of the day|could not be read/i.test(message)) {
      return corsJson(request, { error: PAUSED }, 503);
    }
    return corsJson(request, { error: message }, 500);
  }
  custom.push(item);
  await saveCustomExpenses(env, custom);

  const [enriched] = withReceiptUrls([item]);
  return corsJson(request, { ...enriched, receiptWarning: warning ?? null }, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
