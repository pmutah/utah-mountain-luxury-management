import { corsJson } from '../../_lib/data';
import {
  loadCustomExpenses,
  mergeAllExpenses,
  newExpenseId,
  saveCustomExpenses,
  type ExpenseRecord,
} from '../../_lib/expenses';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const all = await mergeAllExpenses(env);
  const custom = await loadCustomExpenses(env);
  return corsJson(request, { expenses: all, custom });
};

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    propertyId: 'ranch' | 'lindon';
    month: string;
    category: string;
    amount: number;
    note?: string;
    vendor?: string;
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

  const item: ExpenseRecord = {
    id: newExpenseId(),
    propertyId: body.propertyId,
    month: body.month,
    category: body.category.trim(),
    amount,
    note: body.note?.trim() || undefined,
    vendor: body.vendor?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const custom = await loadCustomExpenses(env);
  custom.push(item);
  await saveCustomExpenses(env, custom);

  return corsJson(request, item, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
