import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { api, formatCurrency, PROPERTIES, type Expense, type RentalPropertyId } from '../lib/api';
import { isPartnerLoggedExpense, PAID_BY_LABELS, summarizePartnerContributions } from '../lib/paid-by';
import { ExpenseRow } from './ExpenseRow';

export function PartnerContributions({
  propertyId,
  expenses,
  month,
  onRefresh,
  onToast,
  onError,
}: {
  propertyId: Extract<RentalPropertyId, 'ranch' | 'river'>;
  expenses: Expense[];
  month: string;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const [filter, setFilter] = useState<'brandon' | 'todd' | 'all'>('brandon');
  const allTime = useMemo(
    () => summarizePartnerContributions(expenses, propertyId),
    [expenses, propertyId],
  );
  const thisMonth = useMemo(
    () => summarizePartnerContributions(expenses, propertyId, month),
    [expenses, propertyId, month],
  );

  const listed = expenses
    .filter((e) => e.propertyId === propertyId && isPartnerLoggedExpense(e))
    .filter((e) => {
      if (filter === 'all') return true;
      return e.paidBy === filter;
    })
    .sort((a, b) => (a.month === b.month ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '') : b.month.localeCompare(a.month)));

  const settlement =
    allTime.totalAssigned <= 0
      ? 'No partner-tagged bills yet. Add an expense and mark who paid.'
      : allTime.toddStillOwes > 0.005
        ? `To stay 50/50, Todd still needs to contribute ${formatCurrency(allTime.toddStillOwes)}.`
        : allTime.toddStillOwes < -0.005
          ? `To stay 50/50, Brandon & Stephanie still need to contribute ${formatCurrency(Math.abs(allTime.toddStillOwes))}.`
          : 'Contributions are even — 50/50.';

  const deleteExpense = async (id: string) => {
    await api.deleteExpense(id);
    onRefresh();
  };

  return (
    <section
      className={`p-6 sm:p-8 rounded-[40px] border shadow-xl ${
        propertyId === 'river' ? 'bg-cyan-950/30 border-cyan-800/50' : 'bg-slate-900 border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3 mb-2">
        <Scale className={`w-5 h-5 shrink-0 ${propertyId === 'river' ? 'text-cyan-400' : 'text-blue-400'}`} />
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-300">
            {propertyId === 'river' ? 'River House partner ledger' : `${PROPERTIES[propertyId].name} partner ledger`}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Brandon &amp; Stephanie put in a portion, Todd puts in a portion. Tagged bills only —
            50/50 after who actually paid.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6">
        <div className="bg-slate-950/70 p-5 rounded-3xl border border-blue-800/40">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {PAID_BY_LABELS.brandon}
          </p>
          <p className="text-2xl font-black text-blue-400 mt-1">{formatCurrency(allTime.brandon)}</p>
          <p className="text-[10px] text-slate-600 font-bold mt-1">
            {allTime.brandonCount} bill{allTime.brandonCount === 1 ? '' : 's'} · this month{' '}
            {formatCurrency(thisMonth.brandon)}
          </p>
        </div>
        <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-700">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{PAID_BY_LABELS.todd}</p>
          <p className="text-2xl font-black text-white mt-1">{formatCurrency(allTime.todd)}</p>
          <p className="text-[10px] text-slate-600 font-bold mt-1">
            {allTime.toddCount} bill{allTime.toddCount === 1 ? '' : 's'} · this month {formatCurrency(thisMonth.todd)}
          </p>
        </div>
        <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Each 50% share</p>
          <p className="text-2xl font-black text-cyan-400 mt-1">{formatCurrency(allTime.eachShare)}</p>
          <p className="text-[10px] text-slate-600 font-bold mt-1">
            Of {formatCurrency(allTime.totalAssigned)} tagged
          </p>
        </div>
      </div>

      <p className="text-sm font-black text-white mb-4">{settlement}</p>

      {allTime.unassignedCount > 0 && (
        <p className="text-xs font-bold text-amber-400 mb-4">
          {formatCurrency(allTime.unassigned)} on {allTime.unassignedCount} older bill
          {allTime.unassignedCount === 1 ? '' : 's'} is not tagged yet — use Who paid on each row.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            ['brandon', PAID_BY_LABELS.brandon],
            ['todd', PAID_BY_LABELS.todd],
            ['all', 'All tagged bills'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
              filter === id
                ? id === 'brandon'
                  ? 'bg-blue-600 text-white shadow-xl'
                  : id === 'todd'
                    ? 'bg-slate-600 text-white shadow-xl'
                    : 'bg-cyan-600 text-white shadow-xl'
                : 'bg-slate-950 text-slate-500 border border-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {listed.length === 0 ? (
        <p className="text-xs text-slate-600 font-bold">
          {filter === 'brandon'
            ? 'No Brandon & Stephanie expenses logged yet for this house.'
            : filter === 'todd'
              ? 'No Todd expenses logged yet for this house.'
              : 'No partner-tagged expenses yet.'}
        </p>
      ) : (
        <ul>
          {listed.map((expense) => (
            <li key={expense.id}>
              <ExpenseRow
                expense={expense}
                onRefresh={onRefresh}
                onDelete={deleteExpense}
                onToast={onToast}
                onError={onError}
                showPaidBy
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
