import { useState } from 'react';
import { formatCurrency, type Expense, type PortfolioData, type Reservation } from '../lib/api';
import { MANAGEMENT_FEE_LABEL } from '../lib/owner-fee';
import { formatWhole, hostPayout, waterfallBands, type HouseId } from '../lib/luxury';

export function MoneyWaterfall({ data, only }: { data: PortfolioData; only?: HouseId }) {
  const [open, setOpen] = useState<string | null>(null);
  const all = waterfallBands(data, only);
  const bands = all.filter((b) => b.value > 0);
  const quiet = all.filter((b) => b.value <= 0);
  const payout = hostPayout(data, only);
  const total = bands.reduce((s, b) => s + b.value, 0) || 1;
  const H = 220;
  let left = 8;
  let right = 8;
  const ribbons = bands.map((band) => {
    const h = Math.max(10, (band.value / total) * H);
    const shape = { band, h, left, right };
    left += h;
    right += h;
    return shape;
  });

  return (
    <section className="uml-panel rounded-3xl p-6 sm:p-8">
      <p className="uml-kicker">Where the money goes</p>
      <h2 className="font-display text-3xl mt-1">From host payout to partners</h2>
      <p className="text-sm text-[var(--uml-muted)] mt-2 max-w-xl">
        Ranch and River pay a {MANAGEMENT_FEE_LABEL} management fee to Brandon, then split what remains 50/50 with Todd.
        Lindon stays with Brandon. Hover a ribbon for the dollars behind it.
      </p>
      <div className="mt-6 overflow-x-auto">
        <svg viewBox="0 0 640 280" className="w-full min-w-[520px]" role="img" aria-label="Owner distribution">
          <text x="16" y="20" fill="var(--uml-muted)" fontSize="11">
            Host payout {formatWhole(payout)}
          </text>
          {ribbons.map(({ band, h, left: y0, right: y1 }) => {
            const d = `M 36 ${y0 + 28} C 180 ${y0 + 28}, 180 ${y1 + 28}, 300 ${y1 + 28} L 300 ${y1 + h + 28} C 180 ${y1 + h + 28}, 180 ${y0 + h + 28}, 36 ${y0 + h + 28} Z`;
            return (
              <path key={band.key} d={d} fill={band.color} opacity="0.9">
                <title>{`${band.label}: ${formatCurrency(band.value)}`}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2 mt-2">
        {bands.map((band) => (
          <li key={band.key}>
            <button type="button" className="w-full rounded-2xl border border-[var(--uml-line)] px-3 py-2 text-left text-xs" onClick={() => setOpen(band.key)} data-bot={`waterfall-${band.key}`}>
              <span className="text-[var(--uml-ink)]">{band.label}.</span> {band.detail}. {formatCurrency(band.value)}
            </button>
          </li>
        ))}
        {quiet.map((band) => (
          <li key={band.key} className="text-xs text-[var(--uml-muted)]">
            <span className="text-[var(--uml-ink)]">{band.label}.</span> {formatCurrency(band.value)} this month.
          </li>
        ))}
      </ul>
      {open ? <WaterfallDrawer data={data} band={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function WaterfallDrawer({ data, band, onClose }: { data: PortfolioData; band: string; onClose: () => void }) {
  const houses = (['ranch', 'lindon', 'river'] as const).filter((house) => data[house] != null);
  const rental = (expense: Expense) => houses.includes(expense.propertyId as (typeof houses)[number]) && expense.month === data.month;
  const expenses =
    band === 'cleaning'
      ? data.expenses.filter((expense) => rental(expense) && /clean/i.test(expense.category))
      : band === 'mortgage'
        ? data.expenses.filter((expense) => rental(expense) && /mortgage|loan/i.test(expense.category))
        : band === 'ops'
          ? data.expenses.filter((expense) => rental(expense) && !/clean|mortgage|loan/i.test(expense.category))
          : [];
  const stayHouses = band === 'brandon' ? houses : houses.filter((house) => house !== 'lindon');
  const stays =
    band === 'todd' || band === 'brandon'
      ? data.reservations.filter((stay) => stayHouses.includes(stay.propertyId as (typeof houses)[number]) && stay.checkIn.startsWith(data.month) && stay.status !== 'cancelled')
      : [];
  return (
    <div className="mt-4 rounded-2xl border border-[var(--uml-line)] p-4" data-bot="waterfall-drawer">
      <div className="flex items-center justify-between">
        <p className="uml-kicker">What adds up</p>
        <button type="button" className="uml-nav" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        These are the rows in {data.month} behind this band. Household and construction stay off the statement.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {expenses.map((expense) => (
          <li key={expense.id}>
            {expense.propertyId} · {expense.category} · {formatCurrency(expense.amount)}
            {expense.receiptStoragePath ? (
              <>
                {' '}
                <a className="underline" href={`/api/expenses/${encodeURIComponent(expense.id)}/receipt`}>
                  Receipt
                </a>
              </>
            ) : null}
          </li>
        ))}
        {stays.map((stay: Reservation) => (
          <li key={stay.id}>
            {stay.propertyId} · {stay.guestName} · {stay.checkIn} · {formatCurrency(stay.payout)}
          </li>
        ))}
        {expenses.length === 0 && stays.length === 0 ? <li>No matching row is in this month&apos;s books.</li> : null}
      </ul>
    </div>
  );
}
