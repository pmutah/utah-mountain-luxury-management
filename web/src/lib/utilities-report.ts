import type { Expense } from './api';
import { addMonths } from './months';
import {
  classifyUtilityVendor,
  PORTFOLIO_UTILITY_VENDOR_ORDER,
  utilityVendorLabel,
  type UtilityVendorId,
} from './utility-vendors';

export type UtilitiesMonthCell = {
  amount: number;
  expenses: Expense[];
};

export type UtilitiesReportRow = {
  vendorId: UtilityVendorId;
  label: string;
  byMonth: Record<string, UtilitiesMonthCell>;
  total: number;
};

export type UtilitiesReport = {
  months: string[];
  rows: UtilitiesReportRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
};

export function monthRange(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1));
}

export function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function emptyCell(): UtilitiesMonthCell {
  return { amount: 0, expenses: [] };
}

export function buildUtilitiesReport(
  expenses: Expense[],
  endMonth: string,
  monthCount = 12,
): UtilitiesReport {
  const months = monthRange(endMonth, monthCount);
  const monthSet = new Set(months);

  const rows: UtilitiesReportRow[] = PORTFOLIO_UTILITY_VENDOR_ORDER.map((vendorId) => ({
    vendorId,
    label: utilityVendorLabel(vendorId),
    byMonth: Object.fromEntries(months.map((m) => [m, emptyCell()])),
    total: 0,
  }));

  const columnTotals: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));

  for (const expense of expenses) {
    if (expense.category === 'Mortgage') continue;
    if (!monthSet.has(expense.month)) continue;

    const vendorId = classifyUtilityVendor(expense);
    if (!vendorId) continue;

    const row = rows.find((r) => r.vendorId === vendorId);
    if (!row) continue;

    const cell = row.byMonth[expense.month]!;
    cell.amount += expense.amount;
    cell.expenses.push(expense);
    row.total += expense.amount;
    columnTotals[expense.month]! += expense.amount;
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return { months, rows, columnTotals, grandTotal };
}
