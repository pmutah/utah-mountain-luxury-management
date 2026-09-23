import type { Reservation } from '../lib/api';
import { formatWhole } from '../lib/luxury';
import { currentDayIso } from '../lib/months';
import { grossPace, listPricesForHostNet, type GoalHouse } from '../lib/revenue-goals';

const HOUSES: { id: GoalHouse; name: string }[] = [
  { id: 'lindon', name: 'Lindon' },
  { id: 'ranch', name: 'Ranch' },
  { id: 'river', name: 'River' },
];

export function RevenueGoals({ reservations }: { reservations: Reservation[] }) {
  const asOf = currentDayIso();
  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="revenue-goals">
      <p className="uml-kicker">Annual gross</p>
      <p className="mt-1 text-sm text-[var(--uml-muted)]">Host payout before mortgage and bills.</p>
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {HOUSES.map(({ id, name }) => {
          const pace = grossPace(id, reservations, asOf);
          const pct = Math.min(100, Math.round((pace.booked / pace.target) * 100));
          const ask =
            pace.sellOutHostNightly == null
              ? null
              : Math.max(Math.round(pace.sellOutHostNightly * 1.2), id === 'river' ? 1500 : 0);
          return (
            <div key={id}>
              <p className="font-display text-2xl">{name}</p>
              <p className="text-sm text-[var(--uml-muted)]">{pace.label}</p>
              <p className="mt-2 text-lg">
                {formatWhole(pace.booked)}{' '}
                <span className="text-[var(--uml-muted)]">of {formatWhole(pace.target)}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-[#d4b56a]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-[var(--uml-muted)]">
                {pace.stillNeeded === 0
                  ? 'Goal is on the books. Hold the rate.'
                  : ask != null
                    ? `${formatWhole(pace.stillNeeded)} left across ${pace.openNightsLeft} open nights. ${id === 'river' ? 'Lowest base' : 'Ask'} ${formatWhole(ask)} after fees (${formatWhole(listPricesForHostNet(ask).airbnb)} Airbnb, ${formatWhole(listPricesForHostNet(ask).vrbo)} VRBO).${id === 'river' ? ' Holidays, summer, and ski weekends price higher.' : ' A 20% promotion fills from there.'}`
                    : `${formatWhole(pace.stillNeeded)} left and no open nights remain.`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
