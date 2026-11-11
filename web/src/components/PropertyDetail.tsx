import { Brush, CalendarX } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  formatCurrency,
  PROPERTIES,
  type HistoryData,
  type PortfolioData,
  type PropertyMetrics,
  type RentalPropertyId,
  type Reservation,
} from '../lib/api';
import { loadDateBlocks, type DateBlock } from '../lib/booked-nights';
import { MANAGEMENT_FEE_LABEL } from '../lib/owner-fee';
import { SLEEPS } from '../lib/house-stay';
import { RIVER_UNIT_DETAIL } from '../lib/river-units';
import { currentDayIso } from '../lib/months';
import { RiverPartCalendar } from './RiverPartCalendar';
import { OwnerDistributionPanel } from './OwnerDistribution';
import { ExtraCleaningInput } from './ExtraCleaningInput';
import { ExpenseScanner } from './ExpenseScanner';
import { OccupancyCalendar, RevenueLog } from './OccupancyCalendar';
import { EmptyState } from './EmptyState';
import { PropertyExpensesByMonth } from './PropertyExpensesByMonth';
import { HealthDial } from './HealthDial';
import { MoneyWaterfall } from './MoneyWaterfall';
import { SeasonRing } from './SeasonRing';
import { propertyHealth } from '../lib/luxury';
import { useHealthSignals } from '../hooks/useHealthSignals';

type TabId = RentalPropertyId;

/**
 * Loads the calendar blocks the parts calendar needs, then renders it.
 *
 * `PropertyDetail` is not given blocks and threading them through every caller would touch the Ranch and Lindon paths
 * for a River-only feature. The blocks endpoint is a small read the page already makes elsewhere.
 */
function RiverPartMonth({ month, reservations }: { month: string; reservations: Reservation[] }) {
  const [blocks, setBlocks] = useState<DateBlock[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadDateBlocks().then((rows) => {
      if (live && rows) setBlocks(rows);
    });
    return () => {
      live = false;
    };
  }, [month]);
  /*
   * A block list that could not be read is not an empty one: rendering the month without blocks would paint closed
   * nights as open, which is the one mistake this calendar exists to prevent.
   */
  if (blocks === null) return null;
  return (
    <RiverPartCalendar month={month} reservations={reservations} blocks={blocks} todayIso={currentDayIso()} />
  );
}

export function PropertyDetail({
  tab,
  data,
  history,
  extraCleaningFees,
  onRefresh,
  onToast,
  onError,
}: {
  tab: TabId;
  data: PortfolioData;
  history: HistoryData | null;
  extraCleaningFees: Record<string, number>;
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  /*
   * A house this account may not see arrives as `null`, and this is the page a direct link reaches: an owner could type `#/lindon` or
   * click the chip, and the component read `data.lindon.profit` off a null. Rather than a white screen or a zeroed house, it says the
   * house is not part of this account's view. The server has already withheld every figure, so there is nothing here to show even if the
   * page wanted to.
   */
  const metrics: PropertyMetrics | null = data[tab] ?? null;
  if (!metrics) {
    return (
      <div className="uml-panel rounded-3xl px-6 py-8" data-bot="property-not-visible" data-house={tab}>
        <p className="uml-kicker">{tab}</p>
        <p className="font-display text-3xl mt-1">Not part of this account</p>
        <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
          This account reads the houses its owner is part of. This house is not one of them, so no figure is shown — and none was sent to
          this browser.
        </p>
      </div>
    );
  }
  const monthReservations = data.reservations.filter(
    (r) => r.propertyId === tab && r.checkIn.startsWith(data.month),
  );
  const signals = useHealthSignals(data);
  const health = propertyHealth(tab, metrics, signals(tab));
  const year = Number(data.month.slice(0, 4));
  const yearReservations = history?.reservations?.length ? history.reservations : data.reservations;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="uml-kicker">{PROPERTIES[tab].address}</p>
          <h2 className="font-display text-4xl text-[var(--uml-ink)] mt-1">{PROPERTIES[tab].name}</h2>
          <p className="font-display text-2xl mt-2">{formatCurrency(metrics.profit)} net</p>
        </div>
        <HealthDial score={health.score} factors={health.factors} />
      </div>
        {tab === 'river' && (
          <p className="text-sm text-[var(--uml-muted)] max-w-2xl">
            Provo Riverhouse · sleeps {SLEEPS.river} · three parts:{' '}
            {RIVER_UNIT_DETAIL.map((unit) => `${unit.name.replace(/^River /, '')} ${unit.sleeps}`).join(', ')} · first stays November 1, 2026 · 50/50 Brandon &amp;
            Stephanie and Todd, after a {MANAGEMENT_FEE_LABEL} management fee. Build bills live on the Build costs chip.
          </p>
        )}

      <MoneyWaterfall data={data} only={tab} />
      <SeasonRing
        year={year}
        reservations={yearReservations}
        propertyId={tab}
        title={PROPERTIES[tab].name}
      />

      {metrics.dist && <OwnerDistributionPanel dist={metrics.dist} />}

      <OccupancyCalendar propertyId={tab} month={data.month} reservations={data.reservations} />

      {/*
        The Riverhouse is sold four ways, and a one-colour house calendar cannot show that a night with the Main Lodge
        sold still has two parts for sale. This sits under the house calendar rather than replacing it: the house view is
        still the right answer for "is the house booked", and this one answers "what is left".
      */}
      {tab === 'river' && <RiverPartMonth month={data.month} reservations={data.reservations} />}

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
