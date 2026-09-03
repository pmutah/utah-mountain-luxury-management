import { corsJson } from '../../../../../_lib/data';
import { loadCustomExpenses, saveCustomExpenses, withReceiptUrls } from '../../../../../_lib/expenses';
import { deleteStoredReceipt, loadStoredReceipt } from '../../../../../_lib/receipt-store';
import type { FirebaseStorageEnv } from '../../../../../_lib/gcs';
import type { SettingsEnv } from '../../../../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

function findPhoto(envExpense: { itemPhotos?: Array<{ id: string; storagePath: string; contentType: string }> }, photoId: string) {
  return envExpense.itemPhotos?.find((photo) => photo.id === photoId) ?? null;
}

export const onRequestGet: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const photoId = String(params.photoId ?? '');
  const custom = await loadCustomExpenses(env);
  const expense = custom.find((e) => e.id === id);
  const photo = expense ? findPhoto(expense, photoId) : null;
  if (!expense || !photo) {
    return new Response(JSON.stringify({ error: 'Photo not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { bytes, contentType } = await loadStoredReceipt(env, {
      id: `${expense.id}--${photo.id}`,
      receiptStoragePath: photo.storagePath,
    });
    return new Response(bytes, {
      headers: {
        'Content-Type': photo.contentType || contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return corsJson(
      request,
      { error: e instanceof Error ? e.message : 'Could not load photo' },
      404,
    );
  }
};

export const onRequestDelete: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const photoId = String(params.photoId ?? '');
  const custom = await loadCustomExpenses(env);
  const idx = custom.findIndex((e) => e.id === id);
  if (idx === -1) return corsJson(request, { error: 'Expense not found' }, 404);

  const expense = custom[idx]!;
  const photo = findPhoto(expense, photoId);
  if (!photo) return corsJson(request, { error: 'Photo not found' }, 404);

  try {
    await deleteStoredReceipt(env, {
      id: `${expense.id}--${photo.id}`,
      receiptStoragePath: photo.storagePath,
    });
  } catch {
    // still drop the metadata
  }

  custom[idx] = {
    ...expense,
    itemPhotos: (expense.itemPhotos ?? []).filter((p) => p.id !== photoId),
  };
  await saveCustomExpenses(env, custom);
  const [enriched] = withReceiptUrls([custom[idx]!]);
  return corsJson(request, enriched);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
