import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { formatMonthLabel } from '../lib/months';
import {
  buildUtilitiesReport,
  formatMonthShort,
  type UtilitiesMonthCell,
} from '../lib/utilities-report';
import { ExpenseRow } from './ExpenseRow';

function CellDetail({
  cell,
  onRefresh,
  onToast,
  onError,
}: {
  cell: UtilitiesMonthCell;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  if (cell.expenses.length === 0) return null;

  const deleteExpense = async (id: string) => {
    await api.deleteExpense(id);
    onRefresh();
  };

  return (
    <ul className="mt-2 space-y-2 border-t border-slate-800 pt-2">
      {cell.expenses.map((e) => (
        <li key={e.id}>
          <ExpenseRow
            expense={e}
            onDelete={e.id.startsWith('exp-') ? deleteExpense : undefined}
            onToast={onToast}
            onError={onError}
          />
        </li>
      ))}
    </ul>
  );
}

export function UtilitiesByMonth({
  expenses,
  endMonth,
  onRefresh,
  onToast,
  onError,
}: {
  expenses: Expense[];
  endMonth: string;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const report = useMemo(() => buildUtilitiesReport(expenses, endMonth, 12), [expenses, endMonth]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleCell = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <section className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
      <div className="p-6 border-b border-slate-800 flex items-start gap-3">
        <Zap className="text-amber-400 w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-black uppercase tracking-widest text-white">Monthly utilities</h4>
          <p className="text-xs text-slate-500 mt-1">
            Lindon City, Rocky Mountain Power, Enbridge Gas, X-Mission Internet, and Hospitable — last
            12 months ending {formatMonthLabel(endMonth)}.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky left-0 bg-slate-900 z-10 min-w-[160px]">
                Vendor
              </th>
              {report.months.map((m) => (
                <th
                  key={m}
                  className={`p-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                    m === endMonth ? 'text-amber-400 bg-amber-400/5' : 'text-slate-500'
                  }`}
                >
                  {formatMonthShort(m)}
                </th>
              ))}
              <th className="p-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.vendorId} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                <td className="p-4 font-bold text-white text-xs sticky left-0 bg-slate-900 z-10">
                  {row.label}
                </td>
                {report.months.map((m) => {
                  const cell = row.byMonth[m]!;
                  const key = `${row.vendorId}|${m}`;
                  const hasAmount = cell.amount > 0;
                  const isOpen = expanded === key;
                  return (
                    <td
                      key={m}
                      className={`p-2 text-right align-top ${m === endMonth ? 'bg-amber-400/5' : ''}`}
                    >
                      {hasAmount ? (
                        <button
                          type="button"
                          onClick={() => toggleCell(key)}
                          className={`text-xs font-black tabular-nums rounded-lg px-2 py-1 min-h-[32px] ${
                            isOpen
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-white hover:bg-slate-800'
                          }`}
                          title="Tap to see bills"
                        >
                          {formatCurrency(cell.amount)}
                        </button>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                      {isOpen && (
                        <CellDetail
                          cell={cell}
                          onRefresh={onRefresh}
                          onToast={onToast}
                          onError={onError}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="p-3 text-right font-black text-slate-300 text-xs tabular-nums">
                  {row.total > 0 ? formatCurrency(row.total) : '—'}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-800/30">
              <td className="p-4 text-[10px] font-bold text-slate-400 uppercase sticky left-0 bg-slate-800/30 z-10">
                All utilities
              </td>
              {report.months.map((m) => (
                <td
                  key={m}
                  className={`p-3 text-right font-black text-xs tabular-nums ${
                    m === endMonth ? 'text-amber-400 bg-amber-400/5' : 'text-slate-400'
                  }`}
                >
                  {report.columnTotals[m]! > 0 ? formatCurrency(report.columnTotals[m]!) : '—'}
                </td>
              ))}
              <td className="p-3 text-right font-black text-white text-xs tabular-nums">
                {report.grandTotal > 0 ? formatCurrency(report.grandTotal) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {report.grandTotal === 0 && (
        <p className="p-6 text-xs text-slate-500 text-center border-t border-slate-800">
          No matching utility bills yet. Import PDFs or scan receipts with the vendor name in the
          note.
        </p>
      )}
    </section>
  );
}
