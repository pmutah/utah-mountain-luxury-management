import { useMemo, useState } from 'react';
import { formatCurrency, type Expense, type Reservation } from '../lib/api';
import { buildOwnerStatement } from '../lib/owner-statement';
import type { ReportPeriod } from '../lib/report';

const PERIODS: Array<{ id: ReportPeriod; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'ytd', label: 'Year to date' },
];

export function OwnerStatement({
  month,
  reservations,
  expenses,
  extraCleaningFees,
}: {
  month: string;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
}) {
  const [period, setPeriod] = useState<ReportPeriod>('ytd');
  const statement = useMemo(
    () => buildOwnerStatement(month, period, reservations, expenses, extraCleaningFees),
    [month, period, reservations, expenses, extraCleaningFees],
  );

  return (
    <section className="space-y-6" data-bot="owner-statement">
      <div>
        <p className="uml-kicker">Owner statement</p>
        <h2 className="font-display text-5xl">Todd Wilhite</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
          Ranch and River, after the 20% management fee, then half. Lindon, household purchases, and construction bills are not on this page. Nothing here can be edited.
        </p>
      </div>
      <div className="flex gap-2">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-bot={`owner-period-${item.id}`}
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
            className={`uml-nav ${period === item.id ? 'ring-1 ring-[var(--uml-gold)]' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="uml-panel rounded-[32px] px-6 py-8">
        <p className="uml-kicker">{statement.rangeLabel}</p>
        <p className="mt-2 font-display text-6xl uml-num">{formatCurrency(statement.todd)}</p>
        <p className="mt-2 text-sm text-[var(--uml-muted)]">Todd’s share · management fee {formatCurrency(statement.fee)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {statement.houses.map((house) => (
          <article key={house.id} className="uml-panel rounded-3xl p-6" data-bot={`owner-house-${house.id}`}>
            <p className="uml-kicker">{house.id}</p>
            <h3 className="font-display text-3xl">{house.name}</h3>
            <p className="mt-3 font-display text-4xl uml-num">{formatCurrency(house.todd)}</p>
            <p className="mt-2 text-sm text-[var(--uml-muted)]">
              {formatCurrency(house.revenue)} host payout · {formatCurrency(house.costs)} costs · {house.stays} stays
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
