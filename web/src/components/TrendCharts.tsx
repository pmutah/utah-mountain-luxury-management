import { formatCurrency, type HistoryData } from '../lib/api';
import { formatMonthLabel } from '../lib/months';

function shortMonth(ym: string) {
  const [, m] = ym.split('-');
  return new Date(2000, Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function maxOf(values: number[]) {
  return Math.max(...values, 1);
}

export function TrendCharts({ history }: { history: HistoryData }) {
  const points = history.history;
  const maxRev = maxOf(points.map((h) => h.totalRevenue));
  const maxProfit = maxOf(points.map((h) => Math.abs(h.totalProfit)));

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-6 rounded-[40px] border border-slate-800">
        <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">
          Revenue trend (12 months)
        </h4>
        <div className="flex items-end gap-1 h-48">
          {points.map((h) => (
            <div key={h.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex flex-col justify-end h-40 gap-0.5">
                <div
                  className="w-full bg-blue-600 rounded-t-sm"
                  style={{ height: `${(h.ranch.revenue / maxRev) * 100}%` }}
                  title={`Ranch ${formatCurrency(h.ranch.revenue)}`}
                />
                <div
                  className="w-full bg-emerald-600 rounded-t-sm"
                  style={{ height: `${(h.lindon.revenue / maxRev) * 100}%` }}
                  title={`Lindon ${formatCurrency(h.lindon.revenue)}`}
                />
                <div
                  className="w-full bg-cyan-600 rounded-t-sm"
                  style={{ height: `${((h.river?.revenue ?? 0) / maxRev) * 100}%` }}
                  title={`River ${formatCurrency(h.river?.revenue ?? 0)}`}
                />
              </div>
              <span className="text-[8px] font-bold text-slate-600 truncate w-full text-center">
                {shortMonth(h.month)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 justify-center mt-4 text-[9px] font-bold uppercase text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-600 rounded-sm" /> Ranch</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-600 rounded-sm" /> Lindon</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan-600 rounded-sm" /> River</span>
        </div>
      </div>

      <div className="bg-slate-900 p-6 rounded-[40px] border border-slate-800">
        <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">
          Net profit & occupancy
        </h4>
        <div className="space-y-3">
          {points.map((h) => (
            <div key={h.month} className="grid grid-cols-[3rem_1fr_2.5rem] gap-2 items-center text-[10px]">
              <span className="font-bold text-slate-600">{shortMonth(h.month)}</span>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${h.totalProfit >= 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                  style={{ width: `${(Math.abs(h.totalProfit) / maxProfit) * 100}%` }}
                />
              </div>
              <span className="font-black text-slate-400 text-right">{Math.round(h.avgOccupancy)}%</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-600 font-bold mt-4 text-center">
          Bar = net profit magnitude · % = avg occupancy · Ending {formatMonthLabel(history.endMonth)}
        </p>
      </div>
    </div>
  );
}
