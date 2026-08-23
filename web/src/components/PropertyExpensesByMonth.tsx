import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Receipt } from 'lucide-react';
import { api, formatCurrency, type Expense, type RentalPropertyId } from '../lib/api';
import { formatMonthLabel } from '../lib/months';
import { groupExpensesByMonth, monthRangeInclusive, type ReportExpenseItem } from '../lib/report';
import { tracksPartnerContributions } from '../lib/paid-by';
import { ExpenseRow } from './ExpenseRow';

function rangeForProperty(expenses: Expense[], propertyId: RentalPropertyId, selectedMonth: string): string[] {
  const months = expenses
    .filter((e) => e.propertyId === propertyId && e.category !== 'Mortgage')
    .map((e) => e.month);
  const start = months.reduce((min, m) => (m < min ? m : min), selectedMonth);
  const end = months.reduce((max, m) => (m > max ? m : max), selectedMonth);
  return monthRangeInclusive(start, end);
}

export function PropertyExpensesByMonth({
  propertyId,
  month,
  expenses,
  extraCleaningFees,
  onRefresh,
  onToast,
  onError,
}: {
  propertyId: RentalPropertyId;
  month: string;
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const [showCleaning, setShowCleaning] = useState(false);
  const [openMonth, setOpenMonth] = useState(month);
  const byId = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);

  useEffect(() => {
    setOpenMonth(month);
  }, [month]);

  const groups = useMemo(() => {
    const months = rangeForProperty(expenses, propertyId, month);
    return groupExpensesByMonth(expenses, months, [propertyId], extraCleaningFees);
  }, [expenses, propertyId, month, extraCleaningFees]);

  const visible = groups
    .map((group) => ({
      ...group,
      items: showCleaning ? group.items : group.items.filter((item) => item.source !== 'cleaning'),
    }))
    .map((group) => ({
      ...group,
      total: group.items.reduce((sum, item) => sum + item.amount, 0),
    }))
    .filter((group) => group.items.length > 0 || group.month === month);

  const deleteExpense = async (id: string) => {
    await api.deleteExpense(id);
    onRefresh();
  };

  const renderItem = (item: ReportExpenseItem) => {
    const expense = byId.get(item.id);
    if (expense) {
      return (
        <li key={item.id}>
          <ExpenseRow
            expense={expense}
            onRefresh={onRefresh}
            onDelete={expense.id.startsWith('exp-') ? deleteExpense : undefined}
            onToast={onToast}
            onError={onError}
            showPaidBy={tracksPartnerContributions(propertyId)}
          />
        </li>
      );
    }
    return (
      <li key={item.id} className="flex justify-between gap-3 py-3 border-b border-slate-800/50 last:border-0">
        <p className="text-sm font-black text-slate-400 min-w-0 truncate">
          {item.vendor || item.category}
          {item.note ? ` — ${item.note}` : ''}
        </p>
        <p className="text-sm font-black text-white shrink-0 tabular-nums">{formatCurrency(item.amount)}</p>
      </li>
    );
  };

  return (
    <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Expenses by month
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Bills for this house. Open a month to see the list — the header month is expanded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCleaning((v) => !v)}
          className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
            showCleaning
              ? 'bg-amber-600 text-white shadow-xl'
              : 'bg-slate-950 text-slate-500 border border-slate-800'
          }`}
        >
          {showCleaning ? 'Showing cleaning' : 'Entered only'}
        </button>
      </div>

      {visible.every((g) => g.items.length === 0) ? (
        <p className="text-xs text-slate-600 font-bold">No expenses logged for this house yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((group) => {
            const isOpen = openMonth === group.month;
            return (
              <div
                key={group.month}
                className={`rounded-3xl border overflow-hidden ${
                  group.month === month ? 'bg-slate-950 border-slate-700' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenMonth((prev) => (prev === group.month ? '' : group.month))}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left min-h-[52px]"
                >
                  <span className="text-sm font-black text-white">
                    {formatMonthLabel(group.month)}
                    {group.month === month ? (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        This month
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-black text-amber-400 tabular-nums">
                      {formatCurrency(group.total)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4">
                    {group.items.length === 0 ? (
                      <p className="text-xs text-slate-600 font-bold">No expenses this month.</p>
                    ) : (
                      <ul>{group.items.map(renderItem)}</ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
