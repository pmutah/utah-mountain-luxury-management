import { EXPENSES } from './data';
import type { SettingsEnv } from './kv';

export interface ExpenseRecord {
  id: string;
  month: string;
  propertyId: 'ranch' | 'lindon';
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
  createdAt?: string;
}

const KV_KEY = 'customExpenses';

export async function loadCustomExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  if (!env.SETTINGS) return [];
  try {
    const raw = await env.SETTINGS.get(KV_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExpenseRecord[];
  } catch {
    return [];
  }
}

export async function saveCustomExpenses(env: SettingsEnv, items: ExpenseRecord[]): Promise<ExpenseRecord[]> {
  if (env.SETTINGS) {
    await env.SETTINGS.put(KV_KEY, JSON.stringify(items));
  }
  return items;
}

export async function mergeAllExpenses(env: SettingsEnv): Promise<ExpenseRecord[]> {
  const custom = await loadCustomExpenses(env);
  const base = EXPENSES.map((e) => ({
    ...e,
    propertyId: e.propertyId as 'ranch' | 'lindon',
  }));
  return [...base, ...custom];
}

export function newExpenseId(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
