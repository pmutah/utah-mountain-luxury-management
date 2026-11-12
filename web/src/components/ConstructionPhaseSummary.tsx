import { useMemo } from 'react';
import { Download, Layers } from 'lucide-react';
import { formatCurrency, type Expense } from '../lib/api';
import {
  constructionBasisCsv,
  summarizeConstructionPhases,
} from '../lib/construction-analytics';

export function ConstructionPhaseSummary({
  expenses,
  activePhase,
  onSelectPhase,
  onToast,
}: {
  expenses: Expense[];
  activePhase: string;
  onSelectPhase: (phase: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const analytics = useMemo(() => summarizeConstructionPhases(expenses), [expenses]);

  if (analytics.phases.length === 0) return null;

  const maxPhaseUsd = Math.max(...analytics.phases.map((p) => p.totalUsd), 1);

  function exportBasisCsv() {
    const csv = constructionBasisCsv(expenses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uml-river-construction-basis.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Downloaded River construction basis & partner CSV', 'success');
  }

  return (
    <div
      className="mb-6 rounded-3xl border border-slate-800 bg-slate-950/65 p-5"
      data-bot="construction-phase-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Capitalized Basis &amp; Cost-Segregation by Phase
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {analytics.overallReceiptPct}% of dollars have receipts attached ·{' '}
            {formatCurrency(analytics.acceleratedCandidateUsd)} sits in Furnishings, Finishes &amp; Site stages.
          </p>
        </div>

        <button
          type="button"
          data-bot="construction-export-csv"
          onClick={exportBasisCsv}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-700/60 bg-amber-950/40 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:bg-amber-900/50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export CPA Basis CSV
        </button>
      </div>

      <div className="mt-4 space-y-2.5">
        {analytics.phases.map((row) => {
          const isSelected = activePhase === row.stage;
          return (
            <button
              key={row.stage}
              type="button"
              onClick={() => onSelectPhase(isSelected ? 'all' : row.stage)}
              className={`block w-full rounded-2xl border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-amber-500/70 bg-amber-950/25'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-black text-white">{row.stage}</span>
                  <span className="ml-2 text-[11px] text-slate-500">{row.macrsHint}</span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="font-black text-white">{formatCurrency(row.totalUsd)}</span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    ({row.count} {row.count === 1 ? 'bill' : 'bills'} · {row.receiptPct}% receipted)
                  </span>
                </div>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.max(3, (row.totalUsd / maxPhaseUsd) * 100)}%` }}
                />
              </div>

              <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 tabular-nums">
                <span>Todd: {formatCurrency(row.toddUsd)}</span>
                <span>Brandon &amp; Steph: {formatCurrency(row.brandonUsd)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
