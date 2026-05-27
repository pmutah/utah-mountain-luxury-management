import { corsJson } from '../../../_lib/data';
import { loadCustomExpenses, saveCustomExpenses, withReceiptUrls } from '../../../_lib/expenses';
import {
  appendReceiptWarning,
  deleteStoredReceipt,
  storeReceiptForExpense,
} from '../../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

/** Attach or replace a bill PDF/image on an existing expense (e.g. after a save without storage). */
export const onRequestPost: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  if (!env.SETTINGS) {
    return corsJson(request, { error: 'Expense storage not available' }, 503);
  }

  let body: { receiptBase64?: string; receiptMimeType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body' }, 400);
  }

  if (!body.receiptBase64 || !body.receiptMimeType) {
    return corsJson(request, { error: 'receiptBase64 and receiptMimeType required' }, 400);
  }

  const custom = await loadCustomExpenses(env);
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) {
    return corsJson(request, { error: 'Expense not found' }, 404);
  }

  const expense = custom[idx]!;

  if (expense.receiptStoragePath) {
    try {
      await deleteStoredReceipt(env, expense);
    } catch {
      // replace even if old delete fails
    }
  }

  const { meta, warning } = await storeReceiptForExpense(
    env,
    expense.propertyId,
    expense.id,
    body.receiptBase64,
    body.receiptMimeType,
  );

  if (!meta.receiptStoragePath) {
    return corsJson(
      request,
      { error: warning ?? 'Could not store bill file' },
      422,
    );
  }

  custom[idx] = {
    ...expense,
    ...meta,
    note: appendReceiptWarning(expense.note, warning),
  };
  await saveCustomExpenses(env, custom);

  const [enriched] = withReceiptUrls([custom[idx]!]);
  return corsJson(request, { ...enriched, receiptWarning: warning ?? null });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
