import { BarChart3, DollarSign, Users } from 'lucide-react';
import { formatCurrency, type HistoryData, type PortfolioData } from '../lib/api';
import { pctChange } from '../lib/months';
import { StatCard } from './StatCard';
import { TrendCharts } from './TrendCharts';
import { ExportMenu } from './ExportMenu';
import { BatchBillImporter } from './BatchBillImporter';
import { UtilitiesByMonth } from './UtilitiesByMonth';
import { PricingWatch } from './PricingWatch';

export function PortfolioOverview({
  data,
  history,
  onToast,
  onRefresh,
  onError,
}: {
  data: PortfolioData;
  history: HistoryData | null;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onRefresh: () => void;
  onError: (msg: string) => void;
}) {
  const { ranch, lindon, previous } = data;
  const rev = ranch.revenue + lindon.revenue;
  const profit = ranch.profit + lindon.profit;
  const occ = (ranch.occupancy + lindon.occupancy) / 2;

  const revDelta = previous ? pctChange(rev, previous.totalRevenue) : undefined;
  const profitDelta = previous ? pctChange(profit, previous.totalProfit) : undefined;
  const occDelta = previous ? pctChange(occ, previous.avgOccupancy) : undefined;

  return (
    <div className="space-y-6">
      <PricingWatch onError={onError} />
      <ExportMenu data={data} onToast={onToast} />
      <BatchBillImporter
        expenses={data.expenses}
        onRefresh={onRefresh}
        onToast={onToast}
        onError={onError}
      />
      <UtilitiesByMonth
        expenses={data.expenses}
        endMonth={data.month}
        onRefresh={onRefresh}
        onToast={onToast}
        onError={onError}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(rev)} icon={BarChart3} delta={revDelta} />
        <StatCard label="Net Profit" value={formatCurrency(profit)} icon={DollarSign} color="text-blue-400" delta={profitDelta} />
        <StatCard label="Avg Occupancy" value={`${occ.toFixed(0)}%`} icon={Users} delta={occDelta} />
      </div>
      <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 text-center">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-10">Revenue contribution</p>
        <div className="flex justify-center items-center gap-12 flex-wrap">
          <div className="text-center">
            <p className="text-3xl font-black text-blue-500">{formatCurrency(ranch.revenue)}</p>
            <p className="text-[10px] font-bold uppercase mt-2 text-slate-500">Ranch House</p>
          </div>
          <div className="h-12 w-px bg-slate-800 hidden sm:block" />
          <div className="text-center">
            <p className="text-3xl font-black text-emerald-500">{formatCurrency(lindon.revenue)}</p>
            <p className="text-[10px] font-bold uppercase mt-2 text-slate-500">Lindon House</p>
          </div>
        </div>
      </div>
      {history && <TrendCharts history={history} />}
    </div>
  );
}
