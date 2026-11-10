import { useEffect, useState } from 'react';
import { api, type Reservation } from '../lib/api';
import { formatWhole } from '../lib/luxury';
import { currentDayIso } from '../lib/months';
import { goalGapIsBeyondMarket, grossPace, listPricesForHostNet, type GoalHouse } from '../lib/revenue-goals';

const HOUSES: { id: GoalHouse; name: string }[] = [
  { id: 'lindon', name: 'Lindon' },
  { id: 'ranch', name: 'Ranch' },
  { id: 'river', name: 'River' },
];

export function RevenueGoals({ reservations }: { reservations: Reservation[] }) {
  const asOf = currentDayIso();
  /**
   * What comparable houses actually charge, per house, as a host net.
   *
   * Needed because the goal gap is not a price. Without this the card had no market figure to compare against, so it
   * printed the gap / nights-remaining as an "ask" - $1,920 on the Ranch against a $417 comp median. Loaded rather than
   * passed in so this card stays usable anywhere the reservations already are.
   *
   * `null` means not yet known, and the card then keeps its original wording rather than inventing a comparison.
   */
  const [market, setMarket] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    void api
      .getYieldPlan(90)
      .then((plan) => {
        if (cancelled) return;
        const next: Record<string, number | null> = {};
        for (const { id } of HOUSES) {
          const house = plan.houses.find((row) => row.propertyId === id);
          const median = (house as { compHostNetMedian?: number | null } | undefined)?.compHostNetMedian;
          next[id] = typeof median === 'number' && median > 0 ? Math.round(median) : null;
        }
        setMarket(next);
      })
      .catch(() => {
        // A failed read leaves every figure unknown, so the card keeps its original wording rather than guessing.
        if (!cancelled) setMarket({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
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
          /** What comparable houses charge here, or null until it is known. */
          const marketHostNightly = market[id] ?? null;
          /**
           * True when the goal gap is so far above the market that presenting it as a rate would mislead. Computed once so
           * the sentence and the `data-` attribute cannot disagree about which branch was taken.
           */
          const beyondMarket = goalGapIsBeyondMarket(ask, marketHostNightly);
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
              {/*
                The gap and the market are two different things and this sentence used to merge them.

                It read "$64,011 left across 40 open nights. Ask $1,920 after fees", which is the goal divided by the
                nights remaining - arithmetic, not a price. Measured on 2026-11-10 the Ranch's comps ran $245-$1,201 with
                a median near $515, and our own published rate was $640, so "ask $1,920" was roughly three times both.
                A host acting on it would price the house out of its market and earn nothing.

                So when the gap is far above what comparable houses charge, the card says that instead of dressing the
                gap as a rate. The market figure is named, because it is the number a host can actually act on.
              */}
              <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="revenue-goal-line" data-beyond-market={beyondMarket ? 'yes' : 'no'}>
                {pace.stillNeeded === 0
                  ? 'Goal is on the books. Hold the rate.'
                  : beyondMarket
                    ? `${formatWhole(pace.stillNeeded)} left across ${pace.openNightsLeft} open nights — more than pricing can close.` +
                      ` The gap works out to ${formatWhole(ask ?? 0)} a night, which is far above the ${formatWhole(marketHostNightly ?? 0)} comparable houses here charge.` +
                      ' Price with the market on the Market tab; the shortfall is a booking-count problem, not a rate one.'
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
