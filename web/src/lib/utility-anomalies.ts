import type { Expense, Reservation } from './api';

export type Spike = {
  id: string;
  house: string;
  month: string;
  category: string;
  amount: number;
  median: number;
  ratio: number;
  occupancy: number | null;
  reason: 'multiple' | 'vacant';
  receipt: boolean;
};

const UTILITY = /utilit|electric|power|gas|water|sewer|internet|trash|propane|waste/i;

function nightsInMonth(reservations: readonly Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'>[], house: string, month: string): number {
  const start = `${month}-01`;
  const end = monthEnd(month);
  let count = 0;
  for (const stay of reservations) {
    if (stay.propertyId !== house) continue;
    const status = (stay.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'blocked') continue;
    const from = stay.checkIn > start ? stay.checkIn : start;
    const to = stay.checkOut < end ? stay.checkOut : end;
    if (to > from) count += Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
  }
  return count;
}

function monthEnd(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, mon!, 1));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
}

export function utilitySpikes(input: {
  expenses: readonly Pick<Expense, 'id' | 'month' | 'propertyId' | 'category' | 'amount' | 'receiptStoragePath'>[];
  reservations: readonly Pick<Reservation, 'propertyId' | 'checkIn' | 'checkOut' | 'status'>[];
  houses?: readonly string[];
}): Spike[] {
  const houses = new Set(input.houses ?? ['ranch', 'lindon', 'river']);
  const groups = new Map<string, Array<{ id: string; month: string; amount: number; receipt: boolean; category: string; house: string }>>();
  for (const expense of input.expenses) {
    if (!houses.has(expense.propertyId) || !UTILITY.test(expense.category) || !(expense.amount > 0)) continue;
    const key = `${expense.propertyId}:${expense.category.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push({
      id: expense.id,
      month: expense.month,
      amount: expense.amount,
      receipt: Boolean(expense.receiptStoragePath),
      category: expense.category,
      house: expense.propertyId,
    });
    groups.set(key, list);
  }
  const spikes: Spike[] = [];
  for (const rows of groups.values()) {
    const amounts = rows.map((row) => row.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
    for (const row of rows) {
      const occupied = nightsInMonth(input.reservations, row.house, row.month);
      const occupancy = daysInMonth(row.month) > 0 ? occupied / daysInMonth(row.month) : 0;
      const ratio = median > 0 ? row.amount / median : 1;
      if (ratio >= 1.6 && row.amount > median) {
        spikes.push({ ...row, median, ratio, occupancy, reason: 'multiple' });
      } else if (occupancy < 0.15 && row.amount >= median && median > 0 && rows.length > 1) {
        spikes.push({ ...row, median, ratio, occupancy, reason: 'vacant' });
      }
    }
  }
  return spikes.sort((a, b) => b.ratio - a.ratio);
}
