import { useEffect, useState } from 'react';
import { BarChart3, DollarSign, Users } from 'lucide-react';
import { api, formatCurrency, type HistoryData, type PortfolioData } from '../lib/api';
import { pctChange } from '../lib/months';
import {
  formatWhole,
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
import { MorningLine } from './MorningLine';
import { AutomationPanel } from './AutomationPanel';
import { RevenueGoals } from './RevenueGoals';
import { YieldMoves } from './YieldMoves';
import { TodayDeskWithSettings } from './TodayDesk';
import { useHealthSignals } from '../hooks/useHealthSignals';

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
  /**
   * Direct booking requests waiting on a reply.
   *
   * The dashboard had **no mention of them at all** — no badge, no line. With email broken (the Gmail secret is
   * invalid, so every request fails to send) a guest request was invisible to a host who opened the page they open
   * every day, and only visible by chance in `#/guests`. Measured: a request waiting since 14:30 produced zero
   * mentions on `#/overview`.
   *
   * `summary` is the line the requests route already writes; this only surfaces it where the host lands.
   */
  const [requestLine, setRequestLine] = useState<{ line: string; count: number } | null>(null);
  useEffect(() => {
    let cancel = false;
    void api
      .getBookingRequests()
      .then((result) => {
        if (cancel) return;
        const count = (result.rows ?? []).filter((row) => !row.accepted && !row.declined).length;
        if (count === 0) return;
        setRequestLine({ line: result.summary ?? `${count} direct requests are waiting.`, count });
      })
      .catch(() => {
        // The dashboard must still render when the inbox cannot be read. It says nothing rather than zero.
      });
    return () => {
      cancel = true;
    };
  }, []);
  const { ranch, lindon, previous } = data;
  const rev = portfolioRevenue(data);
  const profit = portfolioProfit(data);
  const occ = data.avgOccupancy ?? (ranch.occupancy + lindon.occupancy) / 2;
  const year = Number(data.month.slice(0, 4));
  const reservations = history?.reservations?.length ? history.reservations : data.reservations;
  const series = history?.history ?? [];
  const signals = useHealthSignals(data);

  return (
    <div className="space-y-8">
      {/*
        A waiting guest goes **first**, above everything.
        It was inside "This morning" and measured at **1770px** down the page — below the seven-day desk and the
        house-rules form, so a host opening the dashboard would not see it. With email broken there is no other
        notification, and a real request has been sitting since 14:30.
      */}
      {requestLine && (
        <section
          className="uml-panel rounded-3xl border border-[#d4b56a] px-6 py-5"
          data-bot="overview-request-waiting"
          data-count={requestLine.count}
        >
          <p className="uml-kicker">Waiting on you</p>
          <p className="mt-1 text-base font-bold">
            {requestLine.line}{' '}
            <a href="#/guests" className="underline">
              Open Guests to reply
            </a>{' '}
            <span className="font-normal text-[var(--uml-muted)]">— the email may not have reached anyone.</span>
          </p>
        </section>
      )}
      <TodayDeskWithSettings reservations={reservations} />
      <section className="uml-panel rounded-3xl px-6 py-8 sm:px-10">
        <p className="uml-kicker">This morning</p>
        <MorningLine data={data} />
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

      {history && <RevenueGoals reservations={history.reservations} />}
      <YieldMoves />

      <PropertyPostcards data={data} onOpen={onOpenHouse} onOpenBuild={onOpenBuild} signals={signals} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['ranch', 'lindon', 'river'] as const).map((id) => {
          const health = propertyHealth(id, data[id], signals(id));
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

      <AutomationPanel onToast={onToast} />
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
