import { Brush, CalendarX } from 'lucide-react';
import {
  formatCurrency,
  PROPERTIES,
  type PortfolioData,
  type PropertyMetrics,
  type RentalPropertyId,
} from '../lib/api';
import { OwnerDistributionPanel } from './OwnerDistribution';
import { ExtraCleaningInput } from './ExtraCleaningInput';
import { ExpenseScanner } from './ExpenseScanner';
import { ManualExpenseForm } from './ManualExpenseForm';
import { OccupancyCalendar, RevenueLog } from './OccupancyCalendar';
import { EmptyState } from './EmptyState';
import { PropertyExpensesByMonth } from './PropertyExpensesByMonth';

type TabId = RentalPropertyId;

export function PropertyDetail({
  tab,
  data,
  extraCleaningFees,
  onRefresh,
  onToast,
  onError,
}: {
  tab: TabId;
  data: PortfolioData;
  extraCleaningFees: Record<string, number>;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const metrics: PropertyMetrics = data[tab];
  const monthReservations = data.reservations.filter(
    (r) => r.propertyId === tab && r.checkIn.startsWith(data.month),
  );
  const profitColor =
    tab === 'ranch' ? 'text-blue-400' : tab === 'river' ? 'text-cyan-400' : 'text-emerald-400';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black text-white">{PROPERTIES[tab].name}</h2>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{PROPERTIES[tab].address}</p>
          <p className={`text-xl font-black ${profitColor}`}>
            Profit: {formatCurrency(metrics.profit)}
          </p>
        </div>
        {tab === 'river' && (
          <p className="text-xs text-slate-400">
            Provo Riverhouse · sleeps 24 · 7 bedrooms · first stays Oct 15, 2026 · 50/50 Brandon &amp;
            Stephanie and Todd, 20% management fee
          </p>
        )}
      </div>

      {metrics.dist && <OwnerDistributionPanel dist={metrics.dist} />}

      <OccupancyCalendar propertyId={tab} month={data.month} reservations={data.reservations} />

      <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <Brush className="text-slate-500 w-5 h-5" />
          <h4 className="text-sm font-black uppercase tracking-widest">Financial breakdown</h4>
        </div>
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-800/50">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Monthly mortgage</p>
              <p className="text-lg font-black text-white">
                {formatCurrency(PROPERTIES[tab].mortgage)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Cleaning fees</p>
              <p className="text-lg font-black text-red-500">{formatCurrency(metrics.totalCleaning)}</p>
            </div>
          </div>

          <ManualExpenseForm
            propertyId={tab}
            month={data.month}
            onSaved={onRefresh}
            onError={onError}
            onToast={onToast}
          />

          <ExtraCleaningInput
            propertyId={tab}
            month={data.month}
            value={extraCleaningFees[`${tab}-${data.month}`]}
            onSaved={() => {
              onRefresh();
              onToast('Extra cleaning saved', 'success');
            }}
            onError={onError}
          />

          <ExpenseScanner
            propertyId={tab}
            month={data.month}
            expenses={data.expenses}
            onSaved={onRefresh}
            onError={onError}
            onToast={onToast}
          />
        </div>
      </div>

      <PropertyExpensesByMonth
        propertyId={tab}
        month={data.month}
        expenses={data.expenses}
        extraCleaningFees={extraCleaningFees}
        onRefresh={onRefresh}
        onToast={onToast}
        onError={onError}
      />

      <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center px-8">
          <h4 className="text-sm font-black uppercase tracking-widest">Revenue log</h4>
          <p className="text-xl font-black text-white">{formatCurrency(metrics.revenue)}</p>
        </div>
        {monthReservations.length > 0 ? (
          <RevenueLog propertyId={tab} month={data.month} reservations={data.reservations} />
        ) : (
          <EmptyState
            icon={CalendarX}
            title="No stays this month"
            description="Try another month or check overlapping bookings on the calendar above."
          />
        )}
      </div>
    </div>
  );
}
