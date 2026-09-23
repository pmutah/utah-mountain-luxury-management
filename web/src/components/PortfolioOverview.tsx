import { useState } from 'react';
import { BarChart3, DollarSign, Users } from 'lucide-react';
import { formatCurrency, type HistoryData, type PortfolioData } from '../lib/api';
import { pctChange } from '../lib/months';
import {
  formatWhole,
  morningBriefing,
  portfolioProfit,
  portfolioRevenue,
  propertyHealth,
  type HouseId,
} from '../lib/luxury';
import { StatCard } from './StatCard';
import { TrendCharts } from './TrendCharts';
import { ExportMenu } from './ExportMenu';
import { BatchBillImporter } from './BatchBillImporter';
import { UtilitiesByMonth } from './UtilitiesByMonth';
import { PricingWatch } from './PricingWatch';
import { PropertyPostcards } from './PropertyPostcards';
import { MoneyWaterfall } from './MoneyWaterfall';
import { SeasonRing } from './SeasonRing';
import { SiteView } from './SiteView';
import { HealthDial } from './HealthDial';
import { OwnerLetterButton } from './OwnerLetterButton';

export function PortfolioOverview({
  data,
  history,
  onToast,
  onRefresh,
  onError,
  onOpenHouse,
  onOpenBuild,
}: {
  data: PortfolioData;
  history: HistoryData | null;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onOpenHouse: (id: HouseId) => void;
  onOpenBuild: () => void;
}) {
  const [opsOpen, setOpsOpen] = useState(false);
  const { ranch, lindon, previous } = data;
  const rev = portfolioRevenue(data);
  const profit = portfolioProfit(data);
  const occ = data.avgOccupancy ?? (ranch.occupancy + lindon.occupancy) / 2;
  const year = Number(data.month.slice(0, 4));
  const reservations = history?.reservations?.length ? history.reservations : data.reservations;
  const series = history?.history ?? [];

  return (
    <div className="space-y-8">
      <section className="uml-panel rounded-3xl px-6 py-8 sm:px-10">
        <p className="uml-kicker">This morning</p>
        <p className="font-display text-3xl sm:text-4xl leading-snug mt-3 max-w-3xl">{morningBriefing(data)}</p>
        <div className="mt-5">
          <OwnerLetterButton data={data} onToast={onToast} />
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Host payouts"
          value={formatWhole(rev)}
          icon={BarChart3}
          delta={previous ? pctChange(rev, previous.totalRevenue) : undefined}
          series={series.map((p) => p.totalRevenue)}
        />
        <StatCard
          label="Net after costs"
          value={formatWhole(profit)}
          icon={DollarSign}
          delta={previous ? pctChange(profit, previous.totalProfit) : undefined}
          series={series.map((p) => p.totalProfit)}
        />
        <StatCard
          label="Occupancy"
          value={`${occ.toFixed(0)}%`}
          icon={Users}
          delta={previous ? pctChange(occ, previous.avgOccupancy) : undefined}
          series={series.map((p) => p.avgOccupancy)}
        />
      </div>

      <PropertyPostcards data={data} onOpen={onOpenHouse} onOpenBuild={onOpenBuild} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['ranch', 'lindon', 'river'] as const).map((id) => {
          const health = propertyHealth(id, data[id]);
          return (
            <div key={id} className="uml-panel rounded-3xl p-5">
              <p className="uml-kicker">{id}</p>
              <div className="mt-2 flex items-start justify-between gap-3">
                <HealthDial score={health.score} factors={health.factors} />
                <p className="text-right text-sm text-[var(--uml-muted)]">{formatCurrency(data[id].profit)} net</p>
              </div>
            </div>
          );
        })}
      </div>

      <MoneyWaterfall data={data} />
      <SeasonRing year={year} reservations={reservations} />
      <SiteView
        onOpen={(id) => {
          if (id === 'build') onOpenBuild();
          else onOpenHouse(id);
        }}
      />
      {history && <TrendCharts history={history} />}

      <section className="uml-panel rounded-3xl p-5">
        <button type="button" className="w-full text-left" onClick={() => setOpsOpen((v) => !v)}>
          <p className="uml-kicker">Operations</p>
          <p className="font-display text-2xl">{opsOpen ? 'Hide the tools' : 'Bills, utilities, pricing, export'}</p>
        </button>
        {opsOpen && (
          <div className="space-y-6 mt-6">
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
          </div>
        )}
      </section>
    </div>
  );
}
