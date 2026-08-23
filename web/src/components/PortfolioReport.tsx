import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Copy,
  DollarSign,
  Home,
  Percent,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import { formatCurrency, PROPERTIES, type Expense, type Reservation } from '../lib/api';
import { PAID_BY_LABELS } from '../lib/paid-by';
import { formatMonthLabel } from '../lib/months';
import {
  buildPortfolioReport,
  reportOwnerLabel,
  reportPeriodLabel,
  type ChannelName,
  type ExpenseMonthGroup,
  type PortfolioReportModel,
  type PropertyReportRow,
  type ReportExpenseItem,
  type ReportOwnerFilter,
  type ReportPeriod,
  type ReportPropertyFilter,
} from '../lib/report';

const PERIODS: Array<{ id: ReportPeriod; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'ttm', label: 'Trailing 12' },
];

const CHANNEL_STYLE: Record<ChannelName, { bar: string; text: string }> = {
  Airbnb: { bar: 'bg-red-600', text: 'text-red-400' },
  VRBO: { bar: 'bg-blue-600', text: 'text-blue-400' },
  Other: { bar: 'bg-slate-500', text: 'text-slate-400' },
};

const PROPERTY_FILTERS: Array<{ id: ReportPropertyFilter; label: string; activeClass: string }> = [
  { id: 'all', label: 'All together', activeClass: 'bg-violet-600 text-white shadow-xl' },
  { id: 'ranch', label: 'Ranch', activeClass: 'bg-blue-600 text-white shadow-xl' },
  { id: 'lindon', label: 'Lindon', activeClass: 'bg-emerald-600 text-white shadow-xl' },
  { id: 'river', label: 'River', activeClass: 'bg-cyan-600 text-white shadow-xl' },
];

const OWNER_FILTERS: Array<{ id: ReportOwnerFilter; label: string; activeClass: string }> = [
  { id: 'all', label: 'All together', activeClass: 'bg-violet-600 text-white shadow-xl' },
  { id: 'brandon', label: 'Brandon & Steph', activeClass: 'bg-blue-600 text-white shadow-xl' },
  { id: 'todd', label: 'Todd', activeClass: 'bg-slate-600 text-white shadow-xl' },
];

function FilterChip({
  active,
  disabled,
  onClick,
  activeClass,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  activeClass: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
        disabled
          ? 'bg-slate-950 text-slate-700 border border-slate-800 cursor-not-allowed'
          : active
            ? activeClass
            : 'bg-slate-950 text-slate-500 border border-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

const PROPERTY_ACCENT: Record<string, string> = {
  ranch: 'text-blue-400',
  lindon: 'text-emerald-400',
  river: 'text-cyan-400',
  portfolio: 'text-white',
};

function fmtNights(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'night' : 'nights'}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

function periodRangeLabel(report: PortfolioReportModel): string {
  if (report.period === 'month') return formatMonthLabel(report.endMonth);
  return `${formatMonthLabel(report.startMonth)} – ${formatMonthLabel(report.endMonth)}`;
}

function reportSummaryText(report: PortfolioReportModel): string {
  const t = report.totals;
  const air = t.channels.Airbnb;
  const vrbo = t.channels.VRBO;
  const lines = [
    `${APP_NAME} — ${reportPeriodLabel(report.period)} (${periodRangeLabel(report)})`,
    `Scope: ${report.totals.name} · ${reportOwnerLabel(report.ownerFilter)}`,
    `Revenue: ${formatCurrency(t.revenue)}`,
    `Net profit: ${formatCurrency(t.profit)}`,
    `Occupancy: ${fmtPct(t.occupancy)} · ${fmtNights(t.occupiedNights)} of ${t.availableNights.toLocaleString()} available`,
    `Stays: ${t.stayCount} · ADR ${formatCurrency(t.adr)} · Avg stay ${t.avgLos.toFixed(1)} nights`,
    `Airbnb: ${formatCurrency(air.revenue)} (${air.stays} stays) · VRBO: ${formatCurrency(vrbo.revenue)} (${vrbo.stays} stays)`,
    `Costs: ${formatCurrency(t.mortgage + t.cleaning + t.operating)} (mortgage ${formatCurrency(t.mortgage)} · cleaning ${formatCurrency(t.cleaning)} · other ${formatCurrency(t.operating)})`,
  ];
  for (const cat of report.expensesByCategory) {
    lines.push(`  ${cat.category}: ${formatCurrency(cat.amount)}`);
  }
  for (const group of report.expensesByMonth) {
    const entered = group.items.filter((item) => item.source !== 'cleaning');
    if (entered.length === 0) continue;
    lines.push(`${formatMonthLabel(group.month)} expenses: ${formatCurrency(group.enteredTotal)}`);
    for (const item of entered) {
      const who = item.vendor ? `${item.vendor} · ${item.category}` : item.category;
      lines.push(`  ${item.propertyName}: ${who} ${formatCurrency(item.amount)}`);
    }
  }
  for (const p of report.properties) {
    lines.push(
      `${p.name}: ${formatCurrency(p.revenue)} rev · ${formatCurrency(costsTotal(p))} costs · ${formatCurrency(p.profit)} profit · ${p.stayCount} stays · ${fmtPct(p.occupancy)} occ`,
    );
  }
  if (t.dist) {
    lines.push(
      `Owners: Brandon & Stephanie ${formatCurrency(t.dist.brandon)} · Todd ${formatCurrency(t.dist.todd)} · Mgmt fee ${formatCurrency(t.dist.mgtFee)}`,
    );
  }
  const river = report.riverContributions;
  if (report.propertyIds.includes('river') && river.totalAssigned > 0) {
    lines.push(
      `River House contributions: Brandon & Stephanie ${formatCurrency(river.brandon)} · Todd ${formatCurrency(river.todd)} · each share ${formatCurrency(river.eachShare)}`,
    );
    if (river.toddStillOwes > 0.005) {
      lines.push(`  Todd still needs to contribute ${formatCurrency(river.toddStillOwes)} to stay 50/50`);
    } else if (river.toddStillOwes < -0.005) {
      lines.push(
        `  Brandon & Stephanie still need to contribute ${formatCurrency(Math.abs(river.toddStillOwes))} to stay 50/50`,
      );
    }
  }
  if (report.forward.stays > 0) {
    lines.push(
      `On the books after this period: ${report.forward.stays} stays · ${formatCurrency(report.forward.revenue)} · ${fmtNights(report.forward.nights)}`,
    );
  }
  return lines.join('\n');
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  color = 'text-white',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof DollarSign;
  color?: string;
}) {
  return (
    <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-slate-500" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-xl font-black ${color}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-600 font-bold mt-1">{hint}</p>}
    </div>
  );
}

function ChannelBars({ row }: { row: PropertyReportRow }) {
  const slices = [row.channels.Airbnb, row.channels.VRBO, row.channels.Other];
  const visible = slices.filter((s) => s.channel !== 'Other' || s.revenue > 0 || s.stays > 0);
  const max = Math.max(...visible.map((s) => s.revenue), 1);
  return (
    <div className="space-y-4">
      {visible.map((s) => (
        <div key={s.channel}>
          <div className="flex justify-between items-baseline gap-2 mb-1">
            <p className={`text-xs font-black uppercase tracking-widest ${CHANNEL_STYLE[s.channel].text}`}>
              {s.channel}
            </p>
            <p className="text-sm font-black text-white">{formatCurrency(s.revenue)}</p>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${CHANNEL_STYLE[s.channel].bar}`}
              style={{ width: `${s.revenue > 0 ? (s.revenue / max) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            {s.stays} stays · {fmtNights(s.stayNights)} ·{' '}
            {row.revenue > 0 ? `${((s.revenue / row.revenue) * 100).toFixed(0)}% of revenue` : '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function isRiverPreOpening(row: PropertyReportRow): boolean {
  return row.propertyId === 'river' && row.stayCount === 0 && row.revenue === 0;
}

function PropertyTable({ report }: { report: PortfolioReportModel }) {
  const rows =
    report.properties.length > 1 ? [...report.properties, report.totals] : report.properties;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[720px]">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <th className="py-3 pr-3">Property</th>
            <th className="py-3 px-2 text-right">Revenue</th>
            <th className="py-3 px-2 text-right">Costs</th>
            <th className="py-3 px-2 text-right">Profit</th>
            <th className="py-3 px-2 text-right">Margin</th>
            <th className="py-3 px-2 text-right">Stays</th>
            <th className="py-3 px-2 text-right">Nights booked</th>
            <th className="py-3 px-2 text-right">Occ</th>
            <th className="py-3 px-2 text-right">ADR</th>
            <th className="py-3 pl-2 text-right">Airbnb / VRBO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pre = isRiverPreOpening(row);
            return (
              <tr
                key={row.propertyId}
                className={`border-b border-slate-800/60 ${row.propertyId === 'portfolio' ? 'bg-slate-950/40' : ''}`}
              >
                <td className={`py-3 pr-3 text-xs font-black ${PROPERTY_ACCENT[row.propertyId] ?? 'text-white'}`}>
                  {row.name}
                  {pre && (
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                      First stays Oct 15, 2026
                    </span>
                  )}
                </td>
                <td className="py-3 px-2 text-right text-sm font-black text-white">{formatCurrency(row.revenue)}</td>
                <td className="py-3 px-2 text-right text-xs font-bold text-amber-400">
                  {formatCurrency(row.mortgage + row.cleaning + row.operating)}
                </td>
                <td className={`py-3 px-2 text-right text-sm font-black ${row.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(row.profit)}
                </td>
                <td className="py-3 px-2 text-right text-xs font-bold text-slate-400">
                  {pre ? '—' : fmtPct(row.margin)}
                </td>
                <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{row.stayCount}</td>
                <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{row.occupiedNights}</td>
                <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">
                  {pre ? '—' : fmtPct(row.occupancy)}
                </td>
                <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">
                  {pre ? '—' : formatCurrency(row.adr)}
                </td>
                <td className="py-3 pl-2 text-right text-[10px] font-bold">
                  <span className="text-red-400">{formatCurrency(row.channels.Airbnb.revenue)}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-blue-400">{formatCurrency(row.channels.VRBO.revenue)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function costsTotal(row: { mortgage: number; cleaning: number; operating: number }): number {
  return row.mortgage + row.cleaning + row.operating;
}

function ExpenseLine({ item }: { item: ReportExpenseItem }) {
  const muted = item.source === 'cleaning';
  return (
    <li className="flex justify-between gap-3 py-3 border-b border-slate-800/60 last:border-0">
      <div className="min-w-0">
        <p className={`text-sm font-black truncate ${muted ? 'text-slate-400' : 'text-white'}`}>
          {item.vendor || item.category}
        </p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">
          <span className={PROPERTY_ACCENT[item.propertyId] ?? 'text-slate-500'}>{item.propertyName}</span>
          {' · '}
          {item.category}
          {item.source === 'cleaning' ? ' · turnover' : ''}
          {item.note ? ` · ${item.note}` : ''}
          {item.paidBy ? ` · ${PAID_BY_LABELS[item.paidBy]}` : ''}
        </p>
      </div>
      <p className={`text-sm font-black shrink-0 tabular-nums ${muted ? 'text-slate-400' : 'text-white'}`}>
        {formatCurrency(item.amount)}
      </p>
    </li>
  );
}

function ExpensesByMonth({
  groups,
  endMonth,
  period,
}: {
  groups: ExpenseMonthGroup[];
  endMonth: string;
  period: ReportPeriod;
}) {
  const [showCleaning, setShowCleaning] = useState(false);
  const [openMonths, setOpenMonths] = useState<string[]>(() => {
    if (period === 'month') return [endMonth];
    const withEntered = groups
      .filter((group) => group.items.some((item) => item.source !== 'cleaning'))
      .map((group) => group.month);
    return withEntered.length > 0 ? withEntered : [endMonth];
  });

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: showCleaning ? group.items : group.items.filter((item) => item.source !== 'cleaning'),
    }))
    .map((group) => ({
      ...group,
      total: group.items.reduce((sum, item) => sum + item.amount, 0),
    }))
    .filter((group) => group.items.length > 0 || (period === 'month' && group.month === endMonth));

  const toggle = (month: string) => {
    setOpenMonths((prev) => (prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]));
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
            Bills and costs logged for each month. These are included in profit.
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
      {visibleGroups.every((g) => g.items.length === 0) ? (
        <p className="text-xs text-slate-600 font-bold">No expenses logged in this period.</p>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const open = period === 'month' || openMonths.includes(group.month);
            return (
              <div key={group.month} className="bg-slate-950/60 rounded-3xl border border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(group.month)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left min-h-[52px]"
                >
                  <span className="text-sm font-black text-white">{formatMonthLabel(group.month)}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-black text-amber-400 tabular-nums">
                      {formatCurrency(group.total)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-4">
                    {group.items.length === 0 ? (
                      <p className="text-xs text-slate-600 font-bold">No expenses this month.</p>
                    ) : (
                      <ul>
                        {group.items.map((item) => (
                          <ExpenseLine key={item.id} item={item} />
                        ))}
                      </ul>
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

export function PortfolioReport({
  month,
  reservations,
  expenses,
  extraCleaningFees,
  onToast,
}: {
  month: string;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [period, setPeriod] = useState<ReportPeriod>('ytd');
  const [propertyFilter, setPropertyFilter] = useState<ReportPropertyFilter>('all');
  const [ownerFilter, setOwnerFilter] = useState<ReportOwnerFilter>('all');
  const report = useMemo(
    () =>
      buildPortfolioReport(
        month,
        period,
        reservations,
        expenses,
        extraCleaningFees,
        propertyFilter,
        ownerFilter,
      ),
    [month, period, reservations, expenses, extraCleaningFees, propertyFilter, ownerFilter],
  );
  const t = report.totals;
  const expenseMax = Math.max(...report.expensesByCategory.map((e) => e.amount), 1);
  const profitLabel =
    ownerFilter === 'brandon' ? "Brandon & Stephanie's take" : ownerFilter === 'todd' ? "Todd's take" : 'Net profit';
  const profitHint =
    ownerFilter === 'brandon'
      ? 'Lindon profit + ranch/river fee and 50% leftover'
      : ownerFilter === 'todd'
        ? '50% leftover after Brandon & Stephanie’s 20% fee, including losses'
        : 'After mortgage, cleaning, opex';

  const selectOwner = (owner: ReportOwnerFilter) => {
    setOwnerFilter(owner);
    if (owner === 'todd' && propertyFilter === 'lindon') setPropertyFilter('all');
  };

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-6 sm:p-8 border-b border-slate-800 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{APP_NAME}</p>
            <h2 className="text-2xl font-black text-white mt-1">Management report</h2>
            <p className="text-xs text-slate-500 mt-2 max-w-xl">
              Host-net payouts land in the check-in month. Occupied nights are split when a stay crosses months.
              River House occupancy starts October 2026.
            </p>
            <p className="text-xs text-slate-400 font-bold mt-2">{periodRangeLabel(report)}</p>
            <p className="text-xs text-slate-500 mt-1">{report.totals.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
                  period === p.id
                    ? 'bg-violet-600 text-white shadow-xl'
                    : 'bg-slate-950 text-slate-500 border border-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(reportSummaryText(report)).then(
                  () => onToast('Report copied', 'success'),
                  () => onToast('Copy failed', 'error'),
                )
              }
              className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-950 border border-slate-800 min-h-[44px]"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-4 border-b border-slate-800 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Property</p>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_FILTERS.map((p) => (
                <FilterChip
                  key={p.id}
                  active={propertyFilter === p.id}
                  disabled={ownerFilter === 'todd' && p.id === 'lindon'}
                  activeClass={p.activeClass}
                  onClick={() => setPropertyFilter(p.id)}
                >
                  {p.label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Owner</p>
            <div className="flex flex-wrap gap-2">
              {OWNER_FILTERS.map((o) => (
                <FilterChip
                  key={o.id}
                  active={ownerFilter === o.id}
                  activeClass={o.activeClass}
                  onClick={() => selectOwner(o.id)}
                >
                  {o.label}
                </FilterChip>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 font-bold mt-2">
              {ownerFilter === 'todd'
                ? 'Todd: Ranch and River 50/50 after the 20% fee, including losses. Lindon is Brandon & Stephanie’s.'
                : ownerFilter === 'brandon'
                  ? 'Brandon & Stephanie: Lindon in full, plus ranch/river management fee and 50% leftover (including losses).'
                  : 'All together: full property P&L. Switch owner to see each person’s take.'}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total revenue" value={formatCurrency(t.revenue)} icon={BarChart3} hint="Host-net, check-in month" />
          <Kpi
            label={profitLabel}
            value={formatCurrency(t.profit)}
            icon={DollarSign}
            color={t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
            hint={profitHint}
          />
          <Kpi
            label="Occupancy"
            value={fmtPct(t.occupancy)}
            icon={Percent}
            hint={`${t.occupiedNights.toLocaleString()} / ${t.availableNights.toLocaleString()} nights`}
          />
          <Kpi label="Nights booked" value={t.occupiedNights.toLocaleString()} icon={CalendarDays} hint="Calendar nights occupied" />
          <Kpi label="Stays" value={String(t.stayCount)} icon={Users} hint={`Avg ${t.avgLos.toFixed(1)} nights · ${formatCurrency(t.avgBooking)} / stay`} />
          <Kpi label="ADR" value={formatCurrency(t.adr)} icon={TrendingUp} hint="Revenue ÷ stay nights" />
          <Kpi label="RevPAR" value={formatCurrency(t.revpar)} icon={Home} hint="Revenue ÷ available nights" />
          <Kpi
            label="Costs"
            value={formatCurrency(costsTotal(t))}
            icon={Receipt}
            color="text-amber-400"
            hint={`Mortgage ${formatCurrency(t.mortgage)} · cleaning ${formatCurrency(t.cleaning)} · other ${formatCurrency(t.operating)}`}
          />
          <Kpi
            label="Profit margin"
            value={fmtPct(t.margin)}
            icon={Percent}
            color={t.margin >= 0 ? 'text-white' : 'text-red-400'}
            hint={`${formatCurrency(costsTotal(t))} costs`}
          />
        </div>
        <div className="px-6 sm:px-8 pb-8">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Revenue by property</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {report.properties.map((row) => (
              <div key={row.propertyId} className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800 text-center">
                <p className={`text-2xl font-black ${PROPERTY_ACCENT[row.propertyId] ?? 'text-white'}`}>
                  {formatCurrency(row.revenue)}
                </p>
                <p className="text-[10px] font-bold uppercase mt-2 text-slate-500">{row.name.replace(/^The /, '')}</p>
                {isRiverPreOpening(row) && (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mt-1">
                    First stays Oct 15, 2026
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Airbnb vs VRBO</h3>
          <ChannelBars row={t} />
        </div>
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">Costs by category</h3>
          <p className="text-xs text-slate-500 mb-6">
            Mortgage, cleaning, and every bill logged for this period — included in profit.
          </p>
          {report.expensesByCategory.length === 0 ? (
            <p className="text-xs text-slate-600 font-bold">No costs in this period.</p>
          ) : (
            <div className="space-y-3">
              {report.expensesByCategory.map((e) => (
                <div key={e.category}>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-400 uppercase tracking-widest">{e.category}</span>
                    <span className="text-white">{formatCurrency(e.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-600 rounded-full" style={{ width: `${(e.amount / expenseMax) * 100}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs font-black pt-2 border-t border-slate-800">
                <span className="text-slate-400 uppercase tracking-widest">Total</span>
                <span className="text-amber-400">{formatCurrency(costsTotal(t))}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {report.propertyIds.includes('river') && (
        <section className="bg-cyan-950/30 p-6 sm:p-8 rounded-[40px] border border-cyan-800/50 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-cyan-300 mb-2">
            River House — Brandon &amp; Stephanie ledger
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            All tagged River House bills Brandon &amp; Stephanie or Todd fronted. Settlement is 50/50 on those
            amounts.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-950/70 p-5 rounded-3xl border border-blue-800/40">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Brandon &amp; Stephanie
              </p>
              <p className="text-2xl font-black text-blue-400 mt-1">
                {formatCurrency(report.riverContributions.brandon)}
              </p>
            </div>
            <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-700">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Todd</p>
              <p className="text-2xl font-black text-white mt-1">
                {formatCurrency(report.riverContributions.todd)}
              </p>
            </div>
            <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Each 50% share</p>
              <p className="text-2xl font-black text-cyan-400 mt-1">
                {formatCurrency(report.riverContributions.eachShare)}
              </p>
            </div>
          </div>
          <p className="text-sm font-black text-white">
            {report.riverContributions.totalAssigned <= 0
              ? 'No tagged River House bills yet — add them on the River House tab.'
              : report.riverContributions.toddStillOwes > 0.005
                ? `Todd still needs to contribute ${formatCurrency(report.riverContributions.toddStillOwes)} to stay 50/50.`
                : report.riverContributions.toddStillOwes < -0.005
                  ? `Brandon & Stephanie still need to contribute ${formatCurrency(Math.abs(report.riverContributions.toddStillOwes))} to stay 50/50.`
                  : 'River House contributions are even.'}
          </p>
        </section>
      )}

      <ExpensesByMonth
        key={`${period}-${report.endMonth}-${report.propertyFilter}-${report.ownerFilter}`}
        groups={report.expensesByMonth}
        endMonth={report.endMonth}
        period={period}
      />

      {report.properties.length > 0 && (
      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">By property</h3>
        <PropertyTable report={report} />
      </section>
      )}

      {report.monthly.length > 1 && (
        <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Month by month</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                  <th className="py-3 pr-3">Month</th>
                  {report.propertyIds.includes('ranch') && (
                    <th className="py-3 px-2 text-right text-blue-400">Ranch</th>
                  )}
                  {report.propertyIds.includes('lindon') && (
                    <th className="py-3 px-2 text-right text-emerald-400">Lindon</th>
                  )}
                  {report.propertyIds.includes('river') && (
                    <th className="py-3 px-2 text-right text-cyan-400">River</th>
                  )}
                  <th className="py-3 px-2 text-right">Revenue</th>
                  <th className="py-3 px-2 text-right">Costs</th>
                  <th className="py-3 px-2 text-right">Profit</th>
                  <th className="py-3 px-2 text-right">Stays</th>
                  <th className="py-3 px-2 text-right">Nights</th>
                  <th className="py-3 px-2 text-right">Occ</th>
                  <th className="py-3 pl-2 text-right">Airbnb / VRBO</th>
                </tr>
              </thead>
              <tbody>
                {report.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-slate-800/60">
                    <td className="py-3 pr-3 text-xs font-black text-white">{formatMonthLabel(m.month)}</td>
                    {report.propertyIds.includes('ranch') && (
                      <td className="py-3 px-2 text-right text-xs font-bold text-blue-400">{formatCurrency(m.ranch)}</td>
                    )}
                    {report.propertyIds.includes('lindon') && (
                      <td className="py-3 px-2 text-right text-xs font-bold text-emerald-400">{formatCurrency(m.lindon)}</td>
                    )}
                    {report.propertyIds.includes('river') && (
                      <td className="py-3 px-2 text-right text-xs font-bold text-cyan-400">{formatCurrency(m.river)}</td>
                    )}
                    <td className="py-3 px-2 text-right text-sm font-black text-white">{formatCurrency(m.revenue)}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-amber-400">{formatCurrency(m.costs)}</td>
                    <td className={`py-3 px-2 text-right text-sm font-black ${m.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(m.profit)}
                    </td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{m.stayCount}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{m.occupiedNights}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{fmtPct(m.occupancy)}</td>
                    <td className="py-3 pl-2 text-right text-[10px] font-bold">
                      <span className="text-red-400">{formatCurrency(m.airbnb)}</span>
                      <span className="text-slate-600"> / </span>
                      <span className="text-blue-400">{formatCurrency(m.vrbo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {t.dist && (
        <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">Owner split</h3>
          <p className="text-xs text-slate-500 mb-4">
            Ranch and River: 20% management fee to Brandon &amp; Stephanie, then leftover 50/50 — including
            losses. Lindon is not in this split.
          </p>
          {t.dist.todd < 0 && (
            <p className="text-xs font-bold text-red-400 mb-6">
              Loss after the fee: {formatCurrency(t.dist.todd * 2)} split between the partners.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`bg-slate-950/60 p-5 rounded-3xl border ${
                ownerFilter === 'all'
                  ? 'border-slate-800'
                  : ownerFilter === 'brandon'
                    ? 'border-blue-700/60'
                    : 'border-slate-800 opacity-50'
              }`}
            >
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brandon &amp; Stephanie</p>
              <p className={`text-2xl font-black mt-1 ${t.dist.brandon < 0 ? 'text-red-400' : 'text-blue-400'}`}>{formatCurrency(t.dist.brandon)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">Mgmt fee + 50% leftover</p>
            </div>
            <div
              className={`bg-slate-950/60 p-5 rounded-3xl border ${
                ownerFilter === 'all'
                  ? 'border-slate-800'
                  : ownerFilter === 'todd'
                    ? 'border-slate-500'
                    : 'border-slate-800 opacity-50'
              }`}
            >
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Todd</p>
              <p className={`text-2xl font-black mt-1 ${t.dist.todd < 0 ? 'text-red-400' : 'text-white'}`}>{formatCurrency(t.dist.todd)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">50% leftover (profit or loss)</p>
            </div>
            <div className="bg-slate-950/60 p-5 rounded-3xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Management fee</p>
              <p className="text-2xl font-black text-amber-400 mt-1">{formatCurrency(t.dist.mgtFee)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">Included in Brandon &amp; Stephanie’s total</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Largest stays</h3>
          {report.topStays.length === 0 ? (
            <p className="text-xs text-slate-600 font-bold">No stays in this period.</p>
          ) : (
            <ul className="space-y-3">
              {report.topStays.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{r.guestName}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {PROPERTIES[r.propertyId]?.name ?? r.propertyId} · {r.checkIn} → {r.checkOut} ·{' '}
                      {/airbnb/i.test(r.source) ? 'Airbnb' : /vrbo/i.test(r.source) ? 'VRBO' : r.source}
                    </p>
                  </div>
                  <p className="text-sm font-black text-white shrink-0">{formatCurrency(r.payout)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">On the books</h3>
          <p className="text-xs text-slate-500 mb-6">Confirmed stays checking in after {periodRangeLabel(report)}.</p>
          <p className="text-3xl font-black text-white">{formatCurrency(report.forward.revenue)}</p>
          <p className="text-xs font-bold text-slate-400 mt-2">
            {report.forward.stays} stays · {fmtNights(report.forward.nights)}
          </p>
        </div>
      </section>
    </div>
  );
}
