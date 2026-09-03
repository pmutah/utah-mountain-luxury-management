import { corsJson } from '../../_lib/data';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import { loadCustomExpenses, saveCustomExpenses, withReceiptUrls } from '../../_lib/expenses';
import { parsePaidDate } from '../../_lib/expense-month';
import { parseConstructionStage } from '../../_lib/construction/types';
import { isPaidBy } from '../../_lib/paid-by';
import { deleteStoredReceipt } from '../../_lib/receipt-store';
import type { SettingsEnv } from '../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

export const onRequestPatch: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
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

  const custom = await loadCustomExpenses(env);
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
  const [enriched] = withReceiptUrls([custom[idx]!]);
  return corsJson(request, enriched);
};

export const onRequestDelete: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  if (!id) return corsJson(request, { error: 'id required' }, 400);

  const custom = await loadCustomExpenses(env);
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) {
    return corsJson(request, { error: 'Expense not found or cannot delete built-in expense' }, 404);
  }

  const expense = custom[idx]!;
  if (expense.receiptStoragePath) {
    try {
      await deleteStoredReceipt(env, expense);
    } catch {
      // continue even if storage delete fails
    }
  }
  for (const photo of expense.itemPhotos ?? []) {
    try {
      await deleteStoredReceipt(env, {
        id: `${expense.id}--${photo.id}`,
        receiptStoragePath: photo.storagePath,
      });
    } catch {
      // continue
    }
  }

  custom.splice(idx, 1);
  await saveCustomExpenses(env, custom);
  return corsJson(request, { ok: true, id });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
