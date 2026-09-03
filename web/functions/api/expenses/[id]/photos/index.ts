import { corsJson } from '../../../../_lib/data';
import { loadCustomExpenses, saveCustomExpenses, withReceiptUrls } from '../../../../_lib/expenses';
import { storeReceiptForExpense } from '../../../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../../../_lib/gcs';
import type { SettingsEnv } from '../../../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

const MAX_PHOTOS = 8;

export const onRequestPost: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  if (!env.SETTINGS) {
    return corsJson(request, { error: 'Expense storage not available' }, 503);
  }

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body' }, 400);
  }

  if (!body.imageBase64 || !body.mimeType) {
    return corsJson(request, { error: 'imageBase64 and mimeType required' }, 400);
  }
  if (body.mimeType === 'application/pdf') {
    return corsJson(request, { error: 'Use a photo of the item, not a PDF.' }, 400);
  }

  const custom = await loadCustomExpenses(env);
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) return corsJson(request, { error: 'Expense not found' }, 404);

  const expense = custom[idx]!;
  const photos = expense.itemPhotos ?? [];
  if (photos.length >= MAX_PHOTOS) {
    return corsJson(request, { error: `You can attach up to ${MAX_PHOTOS} item photos.` }, 400);
  }

  const photoId = `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const { meta, warning } = await storeReceiptForExpense(
    env,
    expense.propertyId,
    `${expense.id}--${photoId}`,
    body.imageBase64,
    body.mimeType,
  );

  if (!meta.receiptStoragePath) {
    return corsJson(request, { error: warning ?? 'Could not store that photo' }, 422);
  }

  custom[idx] = {
    ...expense,
    itemPhotos: [
      ...photos,
      {
        id: photoId,
        storagePath: meta.receiptStoragePath,
        contentType: meta.receiptContentType ?? body.mimeType,
        uploadedAt: meta.receiptUploadedAt ?? new Date().toISOString(),
      },
    ],
  };
  await saveCustomExpenses(env, custom);

  const [enriched] = withReceiptUrls([custom[idx]!]);
  return corsJson(request, { ...enriched, photoWarning: warning ?? null }, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
