import { useMemo, useState, type ChangeEvent } from 'react';
import { Calculator, CheckCircle2, Download, FileCheck2, Upload } from 'lucide-react';
import { formatCurrency, type Expense } from '../lib/api';
import {
  COST_SEG_PROFILES,
  simulateCostSegregation,
  sumLoggedConstructionSpend,
  UTAH_FLAT_TAX_RATE,
  type BonusRateOption,
  type CostSegProfileId,
} from '../lib/cost-seg';
import {
  missingRowsToCsv,
  reconcileStatementAgainstExpenses,
} from '../lib/statement-reconciler';

export function CostSegAndReconciler({
  expenses,
  onToast,
}: {
  expenses: Expense[];
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const buildLogged = useMemo(() => sumLoggedConstructionSpend(expenses), [expenses]);

  const [grossBasisText, setGrossBasisText] = useState(() =>
    buildLogged.total > 50_000 ? String(Math.round(buildLogged.total)) : '1850000',
  );
  const [landPct, setLandPct] = useState(18);
  const [profileId, setProfileId] = useState<CostSegProfileId>('luxury-lodge');
  const [bonusRate, setBonusRate] = useState<BonusRateOption>(1);
  const [placedMonth, setPlacedMonth] = useState(11); // November 2026 River opening
  const [fedBracket, setFedBracket] = useState(0.32);
  const [ownershipShare, setOwnershipShare] = useState<1 | 0.5>(0.5);

  const [statementText, setStatementText] = useState('');

  const costSeg = useMemo(
    () =>
      simulateCostSegregation({
        grossBasisUsd: Number(grossBasisText.replace(/[^0-9.]/g, '')) || 0,
        landValuePct: landPct / 100,
        profileId,
        bonusRate,
        placedInServiceMonth: placedMonth,
        marginalFedRate: fedBracket,
        includeUtahTax: true,
        ownershipShare,
      }),
    [grossBasisText, landPct, profileId, bonusRate, placedMonth, fedBracket, ownershipShare],
  );

  const reconciliation = useMemo(
    () => (statementText.trim() ? reconcileStatementAgainstExpenses(statementText, expenses) : null),
    [statementText, expenses],
  );

  function onCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      onToast('Statement file is larger than 2 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setStatementText(content);
      onToast(`Loaded ${file.name} locally in browser`, 'success');
    };
    reader.readAsText(file);
  }

  function downloadMissingCsv() {
    if (!reconciliation || reconciliation.missingCount === 0) return;
    const csv = missingRowsToCsv(reconciliation);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uml-unlogged-statement-exceptions.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Downloaded unlogged exceptions CSV', 'success');
  }

  return (
    <div className="space-y-6" data-print-hide>
      {/* 1. Engineering Cost-Segregation & Bonus Depreciation Simulator */}
      <div className="uml-panel rounded-3xl p-6" data-bot="tax-cost-seg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
              <p className="uml-kicker">Form 4562 · IRC §168(k) &amp; Engineering Cost-Segregation</p>
            </div>
            <h3 className="font-display text-3xl mt-1">Cost-Segregation &amp; Bonus Depreciation Simulator</h3>
            <p className="mt-1 max-w-3xl text-xs text-[var(--uml-muted)]">
              Models 5-, 7-, and 15-year MACRS accelerated buckets against 39-year nonresidential STR straight-line depreciation. Planning worksheet for Ben Campbell — requires a formal engineering study and never modifies ledger rows.
            </p>
          </div>
          {buildLogged.total > 0 && (
            <button
              type="button"
              data-bot="tax-cost-seg-use-build"
              onClick={() => {
                setGrossBasisText(String(Math.round(buildLogged.total)));
                onToast(`Loaded ${formatCurrency(buildLogged.total)} from ${buildLogged.count} River build bills`, 'info');
              }}
              className="uml-nav border border-[var(--uml-gold)] text-[var(--uml-gold)]"
            >
              Use logged River build ({formatCurrency(buildLogged.total)})
            </button>
          )}
        </div>

        {/* Simulator Controls */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <label className="text-[var(--uml-muted)]">
            Total property / build basis (USD)
            <input
              type="text"
              inputMode="numeric"
              data-bot="tax-cost-seg-basis"
              value={grossBasisText}
              onChange={(e) => setGrossBasisText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--uml-ink)] uml-num"
            />
          </label>

          <label className="text-[var(--uml-muted)]">
            Non-depreciable land share ({landPct}%)
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={landPct}
              onChange={(e) => setLandPct(Number(e.target.value))}
              className="mt-2.5 w-full accent-[#d4b56a]"
            />
            <span className="block text-[11px] uml-num">
              Depreciable building basis: {formatCurrency(costSeg.depreciableBasisUsd)}
            </span>
          </label>

          <label className="text-[var(--uml-muted)]">
            Engineering study profile
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value as CostSegProfileId)}
              data-bot="tax-cost-seg-profile"
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-3 py-2 text-xs text-[var(--uml-ink)]"
            >
              {COST_SEG_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <div className="text-[var(--uml-muted)]">
            <span>IRC §168(k) Bonus Depreciation scenario</span>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {([1, 0.8, 0.6, 0.4, 0] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  aria-pressed={bonusRate === rate}
                  data-bot={`tax-bonus-${Math.round(rate * 100)}`}
                  onClick={() => setBonusRate(rate)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] uml-num ${
                    bonusRate === rate
                      ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                      : 'border-[var(--uml-line)] text-[var(--uml-muted)]'
                  }`}
                >
                  {Math.round(rate * 100)}%
                </button>
              ))}
            </div>
          </div>

          <label className="text-[var(--uml-muted)]">
            Month placed in service (Year 1)
            <select
              value={placedMonth}
              onChange={(e) => setPlacedMonth(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-3 py-2 text-xs text-[var(--uml-ink)]"
            >
              {[
                [1, 'January (11.5 mo)'],
                [6, 'June (6.5 mo)'],
                [10, 'October (2.5 mo)'],
                [11, 'November — River Opening (1.5 mo)'],
                [12, 'December (0.5 mo)'],
              ].map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[var(--uml-muted)]">
              Fed bracket (+{(UTAH_FLAT_TAX_RATE * 100).toFixed(2)}% UT)
              <select
                value={fedBracket}
                onChange={(e) => setFedBracket(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-2.5 py-2 text-xs text-[var(--uml-ink)]"
              >
                <option value={0.22}>22% Fed</option>
                <option value={0.24}>24% Fed</option>
                <option value={0.32}>32% Fed</option>
                <option value={0.35}>35% Fed</option>
                <option value={0.37}>37% Fed</option>
              </select>
            </label>
            <label className="text-[var(--uml-muted)]">
              Ownership share
              <select
                value={ownershipShare}
                onChange={(e) => setOwnershipShare(Number(e.target.value) as 1 | 0.5)}
                className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-2.5 py-2 text-xs text-[var(--uml-ink)]"
              >
                <option value={0.5}>50% Partner (River/Ranch)</option>
                <option value={1}>100% Sole (Lindon / Full)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Headline Comparison Cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/45 p-4">
            <p className="uml-kicker">39-Yr Straight-Line (Yr 1)</p>
            <p className="font-display text-2xl mt-1 uml-num">{formatCurrency(costSeg.straightLine39Year1Usd)}</p>
            <p className="mt-1 text-[11px] text-[var(--uml-muted)]">Without cost-segregation</p>
          </div>
          <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/45 p-4">
            <p className="uml-kicker">Cost-Seg Total (Yr 1)</p>
            <p className="font-display text-2xl mt-1 text-[var(--uml-gold)] uml-num" data-bot="tax-cost-seg-yr1">
              {formatCurrency(costSeg.acceleratedYear1TotalUsd)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--uml-muted)]">
              +{formatCurrency(costSeg.additionalYear1DeductionUsd)} vs straight-line
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/45 p-4">
            <p className="uml-kicker">Your {Math.round(ownershipShare * 100)}% Deduction</p>
            <p className="font-display text-2xl mt-1 uml-num">{formatCurrency(costSeg.ownerShareYear1DeductionUsd)}</p>
            <p className="mt-1 text-[11px] text-[var(--uml-muted)]">Subject to §469 active STR rules</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-4">
            <p className="uml-kicker text-emerald-300">Est. Yr-1 Cash Tax Shield</p>
            <p className="font-display text-2xl mt-1 text-emerald-300 uml-num" data-bot="tax-cost-seg-shield">
              {formatCurrency(costSeg.estimatedYear1TaxSavingsUsd)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--uml-muted)]">
              At {(costSeg.combinedTaxRate * 100).toFixed(2)}% combined Fed + UT rate
            </p>
          </div>
        </div>

        {/* MACRS Bucket Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--uml-line)]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--uml-line)] bg-[var(--uml-surface-2)]/60 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
                <th className="px-3.5 py-2.5">MACRS Class</th>
                <th className="px-3.5 py-2.5">Typical Property Components</th>
                <th className="px-3 py-2.5 text-right">Allocated Basis</th>
                <th className="px-3 py-2.5 text-right">Bonus ({Math.round(bonusRate * 100)}%)</th>
                <th className="px-3.5 py-2.5 text-right text-[var(--uml-gold)]">Year-1 Write-off</th>
              </tr>
            </thead>
            <tbody>
              {costSeg.buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-[var(--uml-line)]/50 last:border-0">
                  <td className="px-3.5 py-2.5 font-semibold">{b.bucket}</td>
                  <td className="px-3.5 py-2.5 text-[var(--uml-muted)]">{b.examples}</td>
                  <td className="px-3 py-2.5 text-right uml-num">{formatCurrency(b.allocationUsd)}</td>
                  <td className="px-3 py-2.5 text-right uml-num">{formatCurrency(b.bonusUsd)}</td>
                  <td className="px-3.5 py-2.5 text-right font-semibold uml-num">{formatCurrency(b.totalYear1Usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Client-Side Bank & Credit Card CSV Statement Reconciler */}
      <div className="uml-panel rounded-3xl p-6" data-bot="tax-reconciler">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
              <p className="uml-kicker">Audit &amp; Bookkeeping Hygiene · 100% In-Browser</p>
            </div>
            <h3 className="font-display text-3xl mt-1">Bank &amp; Card Statement Reconciler</h3>
            <p className="mt-1 max-w-3xl text-xs text-[var(--uml-muted)]">
              Paste or upload a bank or credit-card CSV (`Date, Merchant, Amount`) to match every charge one-to-one against your {expenses.length} logged bills and spot unlogged deductions before tax filing. Nothing leaves your browser or overwrites the ledger.
            </p>
          </div>

          <label className="uml-nav inline-flex cursor-pointer items-center gap-1.5 border border-[var(--uml-line)]">
            <Upload className="h-3.5 w-3.5 text-[var(--uml-gold)]" aria-hidden="true" />
            <span>Load bank CSV</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={onCsvFile}
              className="sr-only"
              data-bot="tax-reconciler-file"
            />
          </label>
        </div>

        <textarea
          value={statementText}
          onChange={(e) => setStatementText(e.target.value)}
          data-bot="tax-reconciler-input"
          placeholder={`Paste CSV or tab-separated statement lines here, e.g.:\n2026-11-04, Rocky Mountain Power, 312.40\n2026-11-06, Home Depot Orem, 184.15\n2026-11-09, April Jenson Cleaning, 350.00`}
          className="mt-4 min-h-28 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3 font-mono text-xs text-[var(--uml-ink)]"
        />

        {reconciliation && reconciliation.parsedCount > 0 && (
          <div className="mt-4 space-y-4" data-bot="tax-reconciler-results">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3 text-xs uml-num">
                <span className="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 text-emerald-300">
                  {reconciliation.matchedCount} matched ({formatCurrency(reconciliation.matchedTotalUsd)})
                </span>
                <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-amber-200">
                  {reconciliation.missingCount} unlogged ({formatCurrency(reconciliation.missingTotalUsd)})
                </span>
                {reconciliation.skippedCount > 0 && (
                  <span className="px-2 py-1 text-[var(--uml-muted)]">
                    {reconciliation.skippedCount} header/payment rows skipped
                  </span>
                )}
              </div>

              {reconciliation.missingCount > 0 && (
                <button
                  type="button"
                  data-bot="tax-reconciler-export"
                  onClick={downloadMissingCsv}
                  className="uml-gold-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.12em]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export {reconciliation.missingCount} missing rows
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-2xl border border-[var(--uml-line)]">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--uml-line)] bg-[var(--uml-surface-2)]/65 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5">Statement Merchant</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Ledger Status / Schedule E Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.rows.map((row) => (
                    <tr key={`${row.line.rowIndex}-${row.line.dateIso}`} className="border-b border-[var(--uml-line)]/50 last:border-0">
                      <td className="px-3.5 py-2 font-mono uml-num">{row.line.dateIso}</td>
                      <td className="px-3.5 py-2 font-medium">{row.line.description}</td>
                      <td className="px-3 py-2 text-right font-semibold uml-num">{formatCurrency(row.line.amount)}</td>
                      <td className="px-3.5 py-2">
                        {row.status === 'matched' && row.matchedExpense ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>
                              Matched · {row.matchedExpense.propertyId} · {row.matchedExpense.category}
                              {row.matchedExpense.hasReceipt ? ' · receipt on file' : ' · missing receipt scan'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            Not on books → Suggest <strong>{row.suggestedCategory}</strong> ({row.suggestedScheduleELine})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
