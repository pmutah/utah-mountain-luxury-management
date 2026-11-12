import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { formatCurrency, type Expense, type RentalPropertyId, type Reservation } from '../lib/api';
import { currentDayIso } from '../lib/months';
import { MANAGEMENT_FEE_LABEL } from '../lib/owner-fee';
import {
  buildTaxYearPacket,
  evaluateMaterialParticipation,
  IRS_MILEAGE_RATE_ESTIMATE,
  SCHEDULE_E_LINES,
  taxPacketToCsv,
  UTAH_MILEAGE_PRESETS,
  type MileageTripEntry,
  type ParticipationEntry,
} from '../lib/tax-prep';
import { CostSegAndReconciler } from './CostSegAndReconciler';

const HOURS_STORAGE_KEY = 'uml-tax-participation-v1';
const MILES_STORAGE_KEY = 'uml-tax-mileage-v1';

function loadStored<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function saveStored<T>(key: string, rows: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Degrade gracefully when storage is unavailable
  }
}

export function TaxPrepDesk({
  month,
  reservations,
  expenses,
  extraCleaningFees,
  hideLindon,
  onOpenBuild,
  onToast,
}: {
  month: string;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
  hideLindon: boolean;
  onOpenBuild: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const defaultYear = Math.max(2026, Number(month.slice(0, 4)) || 2026);
  const [year, setYear] = useState<number>(defaultYear);
  const [hoursEntries, setHoursEntries] = useState<ParticipationEntry[]>(() => loadStored<ParticipationEntry>(HOURS_STORAGE_KEY));
  const [mileageEntries, setMileageEntries] = useState<MileageTripEntry[]>(() => loadStored<MileageTripEntry>(MILES_STORAGE_KEY));

  // Participation quick-entry state
  const [hourDate, setHourDate] = useState(currentDayIso);
  const [hourHouse, setHourHouse] = useState<RentalPropertyId | 'portfolio'>('river');
  const [hourVal, setHourVal] = useState('2.0');
  const [hourCat, setHourCat] = useState<ParticipationEntry['category']>('ops-pricing');
  const [hourNote, setHourNote] = useState('');

  // Mileage quick-entry state
  const [mileDate, setMileDate] = useState(currentDayIso);
  const [presetId, setPresetId] = useState(UTAH_MILEAGE_PRESETS[2]!.id);
  const [customMiles, setCustomMiles] = useState(String(UTAH_MILEAGE_PRESETS[2]!.roundTripMiles));
  const [milePurpose, setMilePurpose] = useState(UTAH_MILEAGE_PRESETS[2]!.defaultPurpose);

  useEffect(() => {
    saveStored(HOURS_STORAGE_KEY, hoursEntries);
  }, [hoursEntries]);

  useEffect(() => {
    saveStored(MILES_STORAGE_KEY, mileageEntries);
  }, [mileageEntries]);

  /*
   * Strict role isolation: personal MFJ returns, Schedule E worksheets, and Lindon figures belong strictly to the
   * managing admin account, never to a partner read-only role (`hideLindon`).
   */
  if (hideLindon) {
    return (
      <section className="uml-panel rounded-3xl px-6 py-8" data-bot="tax-not-visible">
        <p className="uml-kicker">Tax &amp; CPA</p>
        <h2 className="font-display text-3xl mt-1">Not part of this account</h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
          Personal tax worksheets include properties outside the Ranch and River partnership. Your Ranch and River partner figures live on the Owner tab.
        </p>
      </section>
    );
  }

  const packet = useMemo(
    () =>
      buildTaxYearPacket({
        year,
        reservations,
        expenses,
        extraCleaningFees,
        mileageTrips: mileageEntries,
      }),
    [year, reservations, expenses, extraCleaningFees, mileageEntries],
  );

  const participation = useMemo(
    () =>
      evaluateMaterialParticipation({
        entries: hoursEntries,
        year,
        cleanerHoursByProperty: packet.cleanerEstimatedHours,
      }),
    [hoursEntries, year, packet.cleanerEstimatedHours],
  );

  const yearMiles = useMemo(
    () =>
      mileageEntries
        .filter((row) => row.date.startsWith(`${year}-`))
        .reduce((sum, row) => sum + (Number(row.miles) || 0), 0),
    [mileageEntries, year],
  );

  function addParticipation(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(hourVal);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 24) {
      onToast('Enter hours between 0.1 and 24', 'error');
      return;
    }
    const entry: ParticipationEntry = {
      id: `hr-${Date.now()}`,
      date: hourDate,
      propertyId: hourHouse,
      hours: Math.round(numeric * 100) / 100,
      category: hourCat,
      note: hourNote.trim() || 'STR management & operations',
    };
    setHoursEntries((prev) => [entry, ...prev]);
    setHourNote('');
    onToast('Logged §469 participation hours', 'success');
  }

  function addMileage(event: FormEvent) {
    event.preventDefault();
    const preset = UTAH_MILEAGE_PRESETS.find((p) => p.id === presetId) ?? UTAH_MILEAGE_PRESETS[0]!;
    const numeric = Number(customMiles);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1500) {
      onToast('Enter a valid mileage distance', 'error');
      return;
    }
    const trip: MileageTripEntry = {
      id: `mi-${Date.now()}`,
      date: mileDate,
      propertyId: preset.propertyId,
      routeLabel: preset.label,
      miles: Math.round(numeric * 10) / 10,
      purpose: milePurpose.trim() || preset.defaultPurpose,
    };
    setMileageEntries((prev) => [trip, ...prev]);
    onToast(`Logged ${trip.miles} business miles`, 'success');
  }

  function downloadCpaCsv() {
    if (packet.locked2025) {
      onToast('2025 is filed and locked — select 2026+ for live CPA exports', 'info');
      return;
    }
    const csv = taxPacketToCsv(packet, participation.totalHours, yearMiles);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uml-cpa-schedule-e-${year}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast(`Downloaded ${year} CPA Schedule E CSV`, 'success');
  }

  return (
    <section className="space-y-6" data-bot="tax-desk">
      {/* Header & Year Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="uml-kicker">STR Tax Preparation, §469 Compliance &amp; CPA Accounting</p>
          <h2 className="font-display text-5xl mt-1">Tax &amp; CPA Desk</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
            IRS Schedule E Part I worksheet, §1.469-1T(e)(3)(ii)(A) 7-day average stay qualification, §280A(d)(1) personal-use safe harbor, §469 material participation hours, IRS mileage, and 1099-NEC vendor tracking for Ben Campbell.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          {[2025, 2026, 2027].map((yr) => (
            <button
              key={yr}
              type="button"
              data-bot={`tax-year-${yr}`}
              aria-pressed={year === yr}
              onClick={() => setYear(yr)}
              className={`uml-nav inline-flex items-center gap-1.5 ${
                year === yr ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold' : 'border border-[var(--uml-line)]'
              }`}
            >
              {yr === 2025 && <Lock className="h-3 w-3" aria-hidden="true" />}
              {yr === 2025 ? '2025 (Filed Lock)' : `Tax Year ${yr}`}
            </button>
          ))}
          {!packet.locked2025 && (
            <>
              <button
                type="button"
                data-bot="tax-download-csv"
                onClick={downloadCpaCsv}
                className="uml-gold-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs uppercase tracking-[0.14em]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CPA CSV
              </button>
              <button
                type="button"
                data-bot="tax-print"
                onClick={() => window.print()}
                className="uml-nav inline-flex items-center gap-1.5 border border-[var(--uml-line)]"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                Print Packet
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2025 Locked View */}
      {packet.locked2025 ? (
        <div className="uml-panel rounded-3xl border border-[var(--uml-gold)]/50 p-6 sm:p-8 space-y-5" data-bot="tax-2025-locked">
          <div className="flex items-start gap-3">
            <Lock className="mt-1 h-5 w-5 shrink-0 text-[var(--uml-gold)]" aria-hidden="true" />
            <div>
              <p className="uml-kicker text-[var(--uml-gold)]">Filed &amp; Immutable · Prepared by Ben Campbell</p>
              <h3 className="font-display text-3xl mt-1">2025 Tax Return Is Locked (Filed Sept 15, 2026)</h3>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">
                {packet.lockReason} Live dashboard calculations never alter or re-export 2025. Switch to <strong>Tax Year 2026</strong> above for live Schedule E and §469 tracking.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
              <p className="uml-kicker">Ranch House · 2025 Sch E</p>
              <p className="font-display text-2xl mt-1 text-[var(--uml-ink)] uml-num">+$35,675</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Filed 100% on Schedule E; cash operations continue {MANAGEMENT_FEE_LABEL} management fee to Brandon then 50/50 split.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
              <p className="uml-kicker">Lindon House · 2025 Sch E</p>
              <p className="font-display text-2xl mt-1 text-[var(--uml-ink)]">100% Brandon</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Clive $27,969.07 expensed as repair. PenFed Form 1098 mortgage interest $16,868.54. Personal-use nights = 0.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
              <p className="uml-kicker">River House · 2025 Pre-Opening</p>
              <p className="font-display text-2xl mt-1 text-[var(--uml-ink)]">Vacant / Build</p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                $0 STR income and $0 STR insurance in 2025; land tax excluded from Schedule E. Placed in service Nov 1, 2026.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Top Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="uml-panel rounded-3xl p-5">
              <p className="uml-kicker">Line 3 · Gross Rents ({year})</p>
              <p className="font-display text-3xl mt-2 uml-num" data-bot="tax-total-rents">
                {formatCurrency(packet.totalRents)}
              </p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Host-net payouts + retained cancellation fees
              </p>
            </div>

            <div className="uml-panel rounded-3xl p-5">
              <p className="uml-kicker">Logged Operating Deductions</p>
              <p className="font-display text-3xl mt-2 text-amber-300 uml-num" data-bot="tax-total-opex">
                {formatCurrency(packet.totalDeductibleBefore1098)}
              </p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Before Form 1098 interest &amp; Form 4562 depreciation
              </p>
            </div>

            <div className="uml-panel rounded-3xl p-5">
              <p className="uml-kicker">§469 Material Participation</p>
              <p className="font-display text-3xl mt-2 uml-num" data-bot="tax-total-hours">
                {participation.totalHours.toFixed(1)} hrs
              </p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                {participation.passes500HourSafeHarbor
                  ? '500h safe harbor met'
                  : participation.passes100HourAndMoreThanOthers
                    ? `100h + > cleaner (${packet.totalCleanerEstimatedHours}h) met`
                    : `${participation.hoursTo100.toFixed(1)}h to 100h · cleaner est. ${packet.totalCleanerEstimatedHours}h`}
              </p>
            </div>

            <div className="uml-panel rounded-3xl p-5">
              <p className="uml-kicker">Logged IRS Mileage ({year})</p>
              <p className="font-display text-3xl mt-2 uml-num" data-bot="tax-total-miles">
                {yearMiles.toFixed(1)} mi
              </p>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Est. {formatCurrency(yearMiles * IRS_MILEAGE_RATE_ESTIMATE)} at ${IRS_MILEAGE_RATE_ESTIMATE.toFixed(2)}/mi preview
              </p>
            </div>
          </div>

          {/* §1.469-1T(e)(3)(ii)(A) 7-Day Average Stay & §280A(d)(1) Safe Harbor */}
          <div className="uml-panel rounded-3xl p-6" data-bot="tax-str-loophole">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="uml-kicker">§1.469-1T(e)(3)(ii)(A) &amp; §280A(d)(1) Qualification</p>
                <h3 className="font-display text-3xl mt-1">7-Day Average Stay &amp; Personal-Use Safe Harbor</h3>
                <p className="mt-1 max-w-3xl text-xs text-[var(--uml-muted)]">
                  A property whose average period of customer use is <strong>7.0 days or less</strong> is excluded from the IRC §469 definition of a “rental activity” — enabling non-passive treatment when paired with material participation. §280A(d)(1) caps personal use at the greater of 14 days or 10% of fair-rental days.
                </p>
              </div>
              {year === 2026 && (
                <button
                  type="button"
                  onClick={onOpenBuild}
                  className="uml-nav border border-[var(--uml-gold)] text-[var(--uml-gold)]"
                  data-print-hide
                >
                  River Build Basis &amp; Cost-Seg →
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {packet.strRules.map((rule) => (
                <article
                  key={rule.propertyId}
                  className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4"
                  data-bot={`tax-str-card-${rule.propertyId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-2xl">{rule.name.replace(/^The /, '')}</h4>
                    {rule.status === 'qualifies-7day' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> ≤ 7.0d STR
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--uml-muted)]">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" /> {rule.averageStayDays ? `${rule.averageStayDays}d avg` : 'No stays'}
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[var(--uml-muted)]">Avg stay length</dt>
                      <dd className="font-semibold text-sm uml-num">
                        {rule.averageStayDays !== null ? `${rule.averageStayDays.toFixed(2)} days` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--uml-muted)]">Stays / nights</dt>
                      <dd className="font-semibold text-sm uml-num">
                        {rule.stayCount} stays · {rule.totalStayNights}n
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--uml-muted)]">Fair-rental days</dt>
                      <dd className="font-semibold uml-num">{rule.occupiedCalendarNights} days</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--uml-muted)]">§280A personal cap</dt>
                      <dd className="font-semibold text-[var(--uml-gold)] uml-num">
                        ≤ {rule.personalUseCeilingDays} days
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs leading-relaxed text-[var(--uml-muted)]">{rule.statusLabel}</p>

                  {rule.longStaysOver7.length > 0 && (
                    <p className="mt-2 text-[11px] text-amber-300/90">
                      {rule.longStaysOver7.length} stay{rule.longStaysOver7.length === 1 ? '' : 's'} over 7 nights ({rule.longStaysOver7.map((s) => `${s.checkIn} ${s.nights}n`).join(', ')}).
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>

          {/* IRS Schedule E Part I Line-by-Line Table */}
          <div className="uml-panel rounded-3xl p-6" data-bot="tax-schedule-e">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="uml-kicker">Form 1040 · Schedule E Part I</p>
                <h3 className="font-display text-3xl mt-1">Line-by-Line Rental Income &amp; Expense Worksheet</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--uml-muted)]">
                <FileSpreadsheet className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
                Categorized from live expenses &amp; confirmed payouts
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--uml-line)]">
              <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[var(--uml-line)] bg-[var(--uml-surface-2)]/65 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
                    <th className="px-4 py-3 w-24">IRS Line</th>
                    <th className="px-4 py-3">Category</th>
                    {packet.properties.map((p) => (
                      <th key={p.propertyId} className="px-3 py-3 text-right">
                        {p.name.replace(/^The /, '')}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[var(--uml-gold)]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {SCHEDULE_E_LINES.map((meta) => (
                    <tr
                      key={meta.key}
                      className={`border-b border-[var(--uml-line)]/50 ${
                        meta.isIncome ? 'bg-emerald-950/20 font-semibold' : meta.isNoteOnly ? 'bg-amber-950/15 text-[var(--uml-muted)] italic' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--uml-muted)]">{meta.irsLine}</td>
                      <td className="px-4 py-2.5 text-xs">{meta.label}</td>
                      {packet.properties.map((p) => (
                        <td key={p.propertyId} className="px-3 py-2.5 text-right uml-num">
                          {formatCurrency(p.lines[meta.key])}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-semibold uml-num">
                        {formatCurrency(packet.portfolioLines[meta.key])}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 font-semibold">
                    <td className="px-4 py-3 text-xs">Line 20*</td>
                    <td className="px-4 py-3 text-xs">Logged operating expenses (excl. Form 1098 &amp; depreciation)</td>
                    {packet.properties.map((p) => (
                      <td key={p.propertyId} className="px-3 py-3 text-right text-amber-300 uml-num">
                        {formatCurrency(p.deductibleOperatingTotal)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-amber-300 uml-num">
                      {formatCurrency(packet.totalDeductibleBefore1098)}
                    </td>
                  </tr>
                  <tr className="bg-[var(--uml-surface-2)]/80 font-bold">
                    <td className="px-4 py-3 text-xs text-[var(--uml-gold)]">Pre-1098</td>
                    <td className="px-4 py-3 text-xs">Net rental cash before Form 1098 interest &amp; Form 4562 depreciation</td>
                    {packet.properties.map((p) => (
                      <td
                        key={p.propertyId}
                        className={`px-3 py-3 text-right uml-num ${
                          p.netBefore1098AndDepreciation >= 0 ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {formatCurrency(p.netBefore1098AndDepreciation)}
                      </td>
                    ))}
                    <td
                      className={`px-4 py-3 text-right uml-num ${
                        packet.netBefore1098AndDepreciation >= 0 ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {formatCurrency(packet.netBefore1098AndDepreciation)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs text-[var(--uml-muted)]">
              {packet.properties.map((p) => (
                <div key={p.propertyId} className="rounded-2xl border border-[var(--uml-line)] px-3.5 py-2.5">
                  <p className="font-semibold text-[var(--uml-ink)]">{p.name.replace(/^The /, '')} CPA Notes</p>
                  <p className="mt-1">
                    Receipts: {p.enteredExpenseCount - p.missingReceiptsCount}/{p.enteredExpenseCount} bills have files attached
                    {p.missingReceiptsCount > 0 ? ` (${p.missingReceiptsCount} missing scan)` : ''}.
                  </p>
                  {p.assumedCleaningMemo > 0 && (
                    <p className="mt-1">
                      Unbilled forecast cleaning ({formatCurrency(p.assumedCleaningMemo)}) is excluded from Line 7 until a receipt is logged.
                    </p>
                  )}
                  {p.partnerManagementFeeMemo > 0 && (
                    <p className="mt-1">
                      Partner cash-split {MANAGEMENT_FEE_LABEL} mgmt fee memo: {formatCurrency(p.partnerManagementFeeMemo)}.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive §469 Material Participation & IRS Mileage Loggers */}
          <div className="grid gap-6 lg:grid-cols-2" data-print-hide>
            {/* Participation Logger */}
            <div className="uml-panel rounded-3xl p-6" data-bot="tax-participation-panel">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
                <p className="uml-kicker">IRC §469 Material Participation Log</p>
              </div>
              <h3 className="font-display text-3xl mt-1">100-Hour &amp; 500-Hour Safe Harbors</h3>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Test 3 requires ≥ 100 hours AND more hours than any other individual (estimated cleaner turnover hours for {year}:{' '}
                <strong>{packet.totalCleanerEstimatedHours}h</strong>). Test 1 requires ≥ 500 hours across grouped STR activities.
              </p>

              {/* Progress bars */}
              <div className="mt-4 space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between uml-num">
                    <span>100-hour threshold (&gt; cleaner {packet.totalCleanerEstimatedHours}h)</span>
                    <span>{Math.min(100, Math.round(participation.totalHours))}% ({participation.totalHours}h / 100h)</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--uml-surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--uml-gold)]"
                      style={{ width: `${Math.min(100, (participation.totalHours / 100) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between uml-num">
                    <span>500-hour gold-standard safe harbor</span>
                    <span>{Math.min(100, Math.round((participation.totalHours / 500) * 100))}% ({participation.totalHours}h / 500h)</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--uml-surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--uml-glacier)]"
                      style={{ width: `${Math.min(100, (participation.totalHours / 500) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <form onSubmit={addParticipation} className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
                <label className="text-[var(--uml-muted)]">
                  Date
                  <input
                    type="date"
                    value={hourDate}
                    onChange={(e) => setHourDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                  />
                </label>
                <label className="text-[var(--uml-muted)]">
                  Hours
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    value={hourVal}
                    onChange={(e) => setHourVal(e.target.value)}
                    data-bot="tax-hours-input"
                    className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                  />
                </label>
                <label className="text-[var(--uml-muted)]">
                  Property
                  <select
                    value={hourHouse}
                    onChange={(e) => setHourHouse(e.target.value as RentalPropertyId | 'portfolio')}
                    className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-3 py-2 text-xs text-[var(--uml-ink)]"
                  >
                    <option value="river">River House</option>
                    <option value="ranch">Ranch House</option>
                    <option value="lindon">Lindon House</option>
                    <option value="portfolio">All STR Properties</option>
                  </select>
                </label>
                <label className="text-[var(--uml-muted)]">
                  Activity
                  <select
                    value={hourCat}
                    onChange={(e) => setHourCat(e.target.value as ParticipationEntry['category'])}
                    className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-3 py-2 text-xs text-[var(--uml-ink)]"
                  >
                    <option value="ops-pricing">Guest Ops &amp; Pricing</option>
                    <option value="river-setup">River Furnishing &amp; Launch</option>
                    <option value="repairs-maint">Repairs &amp; Maintenance</option>
                    <option value="turnover-inspection">Property Inspection</option>
                    <option value="bookkeeping-tax">Bookkeeping &amp; Vendor Mgmt</option>
                  </select>
                </label>
                <input
                  type="text"
                  placeholder="What you worked on (contemporaneous audit note)"
                  value={hourNote}
                  onChange={(e) => setHourNote(e.target.value)}
                  className="col-span-2 rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                />
                <button
                  type="submit"
                  data-bot="tax-hours-add"
                  className="col-span-2 uml-gold-btn rounded-full py-2 text-xs uppercase tracking-[0.14em]"
                >
                  + Log §469 Participation Entry
                </button>
              </form>

              {hoursEntries.filter((e) => e.date.startsWith(`${year}-`)).length > 0 && (
                <ul className="mt-4 max-h-44 space-y-1.5 overflow-y-auto text-xs">
                  {hoursEntries
                    .filter((e) => e.date.startsWith(`${year}-`))
                    .slice(0, 12)
                    .map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--uml-line)]/60 px-3 py-1.5">
                        <span className="truncate">
                          <strong className="uml-num">{entry.date}</strong> · {entry.propertyId} · {entry.hours}h — {entry.note}
                        </span>
                        <button
                          type="button"
                          aria-label="Remove entry"
                          onClick={() => setHoursEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                          className="text-[var(--uml-muted)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* IRS Business Mileage Logger */}
            <div className="uml-panel rounded-3xl p-6" data-bot="tax-mileage-panel">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
                <p className="uml-kicker">Line 6 · IRS Standard Mileage Log</p>
              </div>
              <h3 className="font-display text-3xl mt-1">Utah Property Trip Presets</h3>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                One-click round-trip distances between Lindon and each property. Previewed on Schedule E Line 6 at ${IRS_MILEAGE_RATE_ESTIMATE.toFixed(2)}/mi (stored in this browser and included in CPA CSV export).
              </p>

              <form onSubmit={addMileage} className="mt-4 space-y-2.5 text-xs">
                <label className="block text-[var(--uml-muted)]">
                  Route preset
                  <select
                    value={presetId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setPresetId(nextId);
                      const found = UTAH_MILEAGE_PRESETS.find((p) => p.id === nextId);
                      if (found) {
                        setCustomMiles(String(found.roundTripMiles));
                        setMilePurpose(found.defaultPurpose);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] px-3 py-2 text-xs text-[var(--uml-ink)]"
                  >
                    {UTAH_MILEAGE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label} ({preset.roundTripMiles} mi R/T)
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="text-[var(--uml-muted)]">
                    Trip date
                    <input
                      type="date"
                      value={mileDate}
                      onChange={(e) => setMileDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                    />
                  </label>
                  <label className="text-[var(--uml-muted)]">
                    Round-trip miles
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={customMiles}
                      onChange={(e) => setCustomMiles(e.target.value)}
                      data-bot="tax-miles-input"
                      className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={milePurpose}
                  onChange={(e) => setMilePurpose(e.target.value)}
                  placeholder="Business purpose"
                  className="w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-xs text-[var(--uml-ink)]"
                />
                <button
                  type="submit"
                  data-bot="tax-miles-add"
                  className="w-full uml-gold-btn rounded-full py-2 text-xs uppercase tracking-[0.14em]"
                >
                  + Log Property Trip
                </button>
              </form>

              {mileageEntries.filter((e) => e.date.startsWith(`${year}-`)).length > 0 && (
                <ul className="mt-4 max-h-44 space-y-1.5 overflow-y-auto text-xs">
                  {mileageEntries
                    .filter((e) => e.date.startsWith(`${year}-`))
                    .slice(0, 12)
                    .map((trip) => (
                      <li key={trip.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--uml-line)]/60 px-3 py-1.5">
                        <span className="truncate">
                          <strong className="uml-num">{trip.date}</strong> · {trip.miles} mi · {trip.routeLabel}
                        </span>
                        <button
                          type="button"
                          aria-label="Remove trip"
                          onClick={() => setMileageEntries((prev) => prev.filter((item) => item.id !== trip.id))}
                          className="text-[var(--uml-muted)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          {/* 1099-NEC Vendor Radar & Utah Lodging Tax */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="uml-panel rounded-3xl p-6" data-bot="tax-1099-panel">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
                <p className="uml-kicker">Form 1099-NEC Readiness ($600+ Threshold)</p>
              </div>
              <h3 className="font-display text-3xl mt-1">Vendor &amp; Contractor Totals</h3>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Aggregated from logged vendor bills and cleaner turn rates. Payments made by credit card or third-party network are reported by the processor on Form 1099-K rather than 1099-NEC.
              </p>

              {packet.vendors1099.length === 0 ? (
                <p className="mt-4 text-xs text-[var(--uml-muted)]">No vendor payouts logged for {year} yet.</p>
              ) : (
                <ul className="mt-4 space-y-2 text-xs">
                  {packet.vendors1099.slice(0, 12).map((v) => (
                    <li
                      key={v.vendor}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--uml-line)] px-3.5 py-2.5"
                    >
                      <div>
                        <p className="font-semibold text-sm">{v.vendor}</p>
                        <p className="text-[11px] text-[var(--uml-muted)]">{v.note}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm uml-num">{formatCurrency(v.amount)}</p>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                            v.status === 'requires-1099-review'
                              ? 'bg-amber-950/80 text-[var(--uml-gold)] border border-[var(--uml-gold)]/40'
                              : 'text-[var(--uml-muted)]'
                          }`}
                        >
                          {v.status === 'requires-1099-review' ? 'W-9 / 1099 Check' : `${v.count} items`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="uml-panel rounded-3xl p-6" data-bot="tax-lodging-panel">
              <p className="uml-kicker">Utah State Sales &amp; County Transient Room Tax</p>
              <h3 className="font-display text-3xl mt-1">Channel Remittance vs Direct Stays</h3>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                Airbnb and VRBO collect and remit Utah transient room and sales taxes as Marketplace Facilitators. Direct bookings require host remittance once Ben Campbell confirms exact municipal/county rates.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
                  <p className="uml-kicker">OTA Stays (Tax Remitted by Channel)</p>
                  <p className="font-display text-3xl mt-1 uml-num">{packet.lodgingTax.channelCollectedByOta}</p>
                  <p className="mt-1 text-[11px] text-[var(--uml-muted)]">Airbnb &amp; VRBO stays in {year}</p>
                </div>
                <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4">
                  <p className="uml-kicker">Direct Stay Tax Estimate</p>
                  <p className="font-display text-3xl mt-1 text-[var(--uml-gold)] uml-num">
                    {formatCurrency(packet.lodgingTax.directEstimate)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--uml-muted)]">Unconfirmed placeholder rate — nothing collected yet</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--uml-line)] p-4 text-xs text-[var(--uml-muted)]">
                <p className="font-semibold text-[var(--uml-ink)]">River House Depreciation &amp; Cost-Segregation Note</p>
                <p className="mt-1 leading-relaxed">
                  First stays at the River House begin November 1, 2026. When average guest stays are ≤ 7.0 days, the building depreciates over 39 years (nonresidential real property) — making a formal engineering cost-segregation study (reclassifying 5-, 7-, and 15-year site, sauna, hot tub, cabinetry, and land improvements) a high-leverage conversation with Ben Campbell.
                </p>
              </div>
            </div>
          </div>

          <CostSegAndReconciler expenses={expenses} onToast={onToast} />
        </>
      )}
    </section>
  );
}
