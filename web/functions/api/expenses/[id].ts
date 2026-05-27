import { corsJson } from '../../_lib/data';
import { deleteReceipt, type FirebaseStorageEnv } from '../../_lib/gcs';
import { loadCustomExpenses, saveCustomExpenses } from '../../_lib/expenses';
import type { SettingsEnv } from '../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

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
      await deleteReceipt(env, expense.receiptStoragePath);
    } catch {
      // continue even if storage delete fails
    }
  }

  custom.splice(idx, 1);
  await saveCustomExpenses(env, custom);
  return corsJson(request, { ok: true, id });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
