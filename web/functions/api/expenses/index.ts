import { corsJson } from '../../_lib/data';
import {
  RECEIPT_ALLOWED_MIME,
  decodeBase64Receipt,
  receiptStoragePath,
  storageConfigured,
  uploadReceipt,
  type FirebaseStorageEnv,
} from '../../_lib/gcs';
import {
  loadCustomExpenses,
  mergeAllExpenses,
  newExpenseId,
  saveCustomExpenses,
  withReceiptUrls,
  type ExpenseRecord,
} from '../../_lib/expenses';
import type { SettingsEnv } from '../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<ExpenseEnv> = async ({ request, env }) => {
  const all = withReceiptUrls(await mergeAllExpenses(env));
  const custom = withReceiptUrls(await loadCustomExpenses(env));
  return corsJson(request, { expenses: all, custom });
};

export const onRequestPost: PagesFunction<ExpenseEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    propertyId: 'ranch' | 'lindon';
    month: string;
    category: string;
    amount: number;
    note?: string;
    vendor?: string;
    receiptBase64?: string;
    receiptMimeType?: string;
  };

  if (!body.propertyId || !body.month || !body.category) {
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
  let receiptStoragePathValue: string | null = null;
  let receiptContentType: string | null = null;
  let receiptUploadedAt: string | null = null;

  if (body.receiptBase64 && body.receiptMimeType) {
    if (!RECEIPT_ALLOWED_MIME.has(body.receiptMimeType)) {
      return corsJson(request, { error: 'Receipt must be JPEG, PNG, WebP, or PDF' }, 400);
    }
    if (!storageConfigured(env)) {
      return corsJson(
        request,
        { error: 'Receipt storage not configured (set FIREBASE_SERVICE_ACCOUNT_JSON on Pages)' },
        503,
      );
    }
    try {
      const bytes = decodeBase64Receipt(body.receiptBase64);
      receiptStoragePathValue = receiptStoragePath(body.propertyId, id, body.receiptMimeType);
      await uploadReceipt(env, receiptStoragePathValue, bytes, body.receiptMimeType);
      receiptContentType = body.receiptMimeType;
      receiptUploadedAt = new Date().toISOString();
    } catch (e) {
      return corsJson(
        request,
        { error: e instanceof Error ? e.message : 'Receipt upload failed' },
        422,
      );
    }
  }

  const item: ExpenseRecord = {
    id,
    propertyId: body.propertyId,
    month: body.month,
    category: body.category.trim(),
    amount,
    note: body.note?.trim() || undefined,
    vendor: body.vendor?.trim() || undefined,
    createdAt: new Date().toISOString(),
    receiptStoragePath: receiptStoragePathValue,
    receiptContentType,
    receiptUploadedAt,
  };

  const custom = await loadCustomExpenses(env);
  custom.push(item);
  await saveCustomExpenses(env, custom);

  const [enriched] = withReceiptUrls([item]);
  return corsJson(request, enriched, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
