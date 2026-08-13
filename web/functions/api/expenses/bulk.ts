import { corsJson } from '../../_lib/data';
import {
  loadCustomExpenses,
  newExpenseId,
  saveCustomExpenses,
  withReceiptUrls,
  type ExpenseRecord,
} from '../../_lib/expenses';
import { appendReceiptWarning, storeReceiptForExpense } from '../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import type { SettingsEnv } from '../../_lib/kv';

type BulkInput = {
  propertyId: 'ranch' | 'lindon' | 'river';
  month: string;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
  receiptBase64?: string;
  receiptMimeType?: string;
};

type BulkEnv = SettingsEnv & FirebaseStorageEnv;

function expenseKey(e: { propertyId: string; month: string; vendor?: string; amount: number }) {
  return `${e.propertyId}|${e.month}|${(e.vendor ?? '').toLowerCase()}|${e.amount.toFixed(2)}`;
}

export const onRequestPost: PagesFunction<BulkEnv> = async ({ request, env }) => {
  let body: { expenses?: BulkInput[] };
  try {
    body = (await request.json()) as { expenses?: BulkInput[] };
  } catch {
    return corsJson(request, { error: 'Request too large or invalid JSON — try importing fewer PDFs at once' }, 413);
  }

  const incoming = body.expenses ?? [];
  if (incoming.length === 0) {
    return corsJson(request, { error: 'expenses array required' }, 400);
  }

  if (!env.SETTINGS) {
    return corsJson(
      request,
      {
        error:
          'Expense storage not available — KV SETTINGS binding missing. Check web/wrangler.toml and redeploy.',
      },
      503,
    );
  }

  const custom = await loadCustomExpenses(env);
  const existingKeys = new Set(custom.map(expenseKey));
  const saved: ExpenseRecord[] = [];
  const skipped: Array<{ reason: string; expense: BulkInput }> = [];
  const warnings: string[] = [];

  for (const row of incoming) {
    if (row.propertyId !== 'ranch' && row.propertyId !== 'lindon') {
      skipped.push({ reason: 'Invalid propertyId', expense: row });
      continue;
    }
    if (!/^\d{4}-\d{2}$/.test(row.month)) {
      skipped.push({ reason: 'Invalid month', expense: row });
      continue;
    }
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped.push({ reason: 'Invalid amount', expense: row });
      continue;
    }
    if (!row.category?.trim()) {
      skipped.push({ reason: 'Missing category', expense: row });
      continue;
    }

    const candidate = {
      propertyId: row.propertyId,
      month: row.month,
      category: row.category.trim(),
      amount,
      note: row.note?.trim() || undefined,
      vendor: row.vendor?.trim() || undefined,
    };

    const key = expenseKey(candidate);
    if (existingKeys.has(key)) {
      skipped.push({ reason: 'Duplicate', expense: row });
      continue;
    }

    const id = newExpenseId();
    const { meta, warning } = await storeReceiptForExpense(
      env,
      row.propertyId,
      id,
      row.receiptBase64,
      row.receiptMimeType,
    );

    if (warning) {
      warnings.push(warning);
    }

    const item: ExpenseRecord = {
      id,
      ...candidate,
      note: appendReceiptWarning(candidate.note, warning),
      createdAt: new Date().toISOString(),
      ...meta,
    };

    custom.push(item);
    existingKeys.add(key);
    saved.push(item);
  }

  if (saved.length > 0) {
    await saveCustomExpenses(env, custom);
  }

  return corsJson(request, { saved: withReceiptUrls(saved), skipped, warnings }, saved.length > 0 ? 201 : 200);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
