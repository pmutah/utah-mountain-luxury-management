import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Copy,
  DollarSign,
  Home,
  Percent,
  TrendingUp,
  Users,
} from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import { formatCurrency, PROPERTIES, type Expense, type Reservation } from '../lib/api';
import { formatMonthLabel } from '../lib/months';
import {
  buildPortfolioReport,
  reportPeriodLabel,
  type ChannelName,
  type PortfolioReportModel,
  type PropertyReportRow,
  type ReportPeriod,
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
    `Revenue: ${formatCurrency(t.revenue)}`,
    `Net profit: ${formatCurrency(t.profit)}`,
    `Occupancy: ${fmtPct(t.occupancy)} · ${fmtNights(t.occupiedNights)} of ${t.availableNights.toLocaleString()} available`,
    `Stays: ${t.stayCount} · ADR ${formatCurrency(t.adr)} · Avg stay ${t.avgLos.toFixed(1)} nights`,
    `Airbnb: ${formatCurrency(air.revenue)} (${air.stays} stays) · VRBO: ${formatCurrency(vrbo.revenue)} (${vrbo.stays} stays)`,
  ];
  for (const p of report.properties) {
    lines.push(
      `${p.name}: ${formatCurrency(p.revenue)} rev · ${formatCurrency(p.profit)} profit · ${p.stayCount} stays · ${fmtPct(p.occupancy)} occ`,
    );
  }
  if (t.dist) {
    lines.push(
      `Owners: Brandon ${formatCurrency(t.dist.brandon)} · Todd ${formatCurrency(t.dist.todd)} · Mgmt fee ${formatCurrency(t.dist.mgtFee)}`,
    );
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
  const slices = [row.channels.Airbnb, row.channels.VRBO, row.channels.Other].filter((s) => s.revenue > 0 || s.stays > 0);
  const max = Math.max(...slices.map((s) => s.revenue), 1);
  if (slices.length === 0) {
    return <p className="text-xs text-slate-600 font-bold">No stays in this period.</p>;
  }
  return (
    <div className="space-y-4">
      {slices.map((s) => (
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
              style={{ width: `${(s.revenue / max) * 100}%` }}
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

function PropertyTable({ report }: { report: PortfolioReportModel }) {
  const rows = [...report.properties, report.totals];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[720px]">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <th className="py-3 pr-3">Property</th>
            <th className="py-3 px-2 text-right">Revenue</th>
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
          {rows.map((row) => (
            <tr
              key={row.propertyId}
              className={`border-b border-slate-800/60 ${row.propertyId === 'portfolio' ? 'bg-slate-950/40' : ''}`}
            >
              <td className={`py-3 pr-3 text-xs font-black ${PROPERTY_ACCENT[row.propertyId] ?? 'text-white'}`}>
                {row.name}
              </td>
              <td className="py-3 px-2 text-right text-sm font-black text-white">{formatCurrency(row.revenue)}</td>
              <td className={`py-3 px-2 text-right text-sm font-black ${row.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(row.profit)}
              </td>
              <td className="py-3 px-2 text-right text-xs font-bold text-slate-400">{fmtPct(row.margin)}</td>
              <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{row.stayCount}</td>
              <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{row.occupiedNights}</td>
              <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{fmtPct(row.occupancy)}</td>
              <td className="py-3 px-2 text-right text-xs font-bold text-slate-300">{formatCurrency(row.adr)}</td>
              <td className="py-3 pl-2 text-right text-[10px] font-bold">
                <span className="text-red-400">{formatCurrency(row.channels.Airbnb.revenue)}</span>
                <span className="text-slate-600"> / </span>
                <span className="text-blue-400">{formatCurrency(row.channels.VRBO.revenue)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const report = useMemo(
    () => buildPortfolioReport(month, period, reservations, expenses, extraCleaningFees),
    [month, period, reservations, expenses, extraCleaningFees],
  );
  const t = report.totals;
  const expenseMax = Math.max(...report.expensesByCategory.map((e) => e.amount), 1);

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

        <div className="p-6 sm:p-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total revenue" value={formatCurrency(t.revenue)} icon={BarChart3} hint="Host-net, check-in month" />
          <Kpi
            label="Net profit"
            value={formatCurrency(t.profit)}
            icon={DollarSign}
            color={t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
            hint="After mortgage, cleaning, opex"
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
            label="Profit margin"
            value={fmtPct(t.margin)}
            icon={Percent}
            color={t.margin >= 0 ? 'text-white' : 'text-red-400'}
            hint={`${formatCurrency(t.cleaning + t.mortgage + t.operating)} costs`}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Airbnb vs VRBO</h3>
          <ChannelBars row={t} />
        </div>
        <div className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Costs</h3>
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
            </div>
          )}
        </div>
      </section>

      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">By property</h3>
        <PropertyTable report={report} />
      </section>

      {report.monthly.length > 1 && (
        <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Month by month</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                  <th className="py-3 pr-3">Month</th>
                  <th className="py-3 px-2 text-right">Revenue</th>
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
                    <td className="py-3 px-2 text-right text-sm font-black text-white">{formatCurrency(m.revenue)}</td>
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
          <p className="text-xs text-slate-500 mb-6">
            Ranch and River: 20% management fee to Brandon, then leftover 50/50. Lindon is not in this split.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 p-5 rounded-3xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brandon</p>
              <p className="text-2xl font-black text-blue-400 mt-1">{formatCurrency(t.dist.brandon)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">Mgmt fee + 50% leftover</p>
            </div>
            <div className="bg-slate-950/60 p-5 rounded-3xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Todd</p>
              <p className="text-2xl font-black text-white mt-1">{formatCurrency(t.dist.todd)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">50% leftover</p>
            </div>
            <div className="bg-slate-950/60 p-5 rounded-3xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Management fee</p>
              <p className="text-2xl font-black text-amber-400 mt-1">{formatCurrency(t.dist.mgtFee)}</p>
              <p className="text-[10px] text-slate-600 font-bold mt-1">Included in Brandon’s total</p>
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
