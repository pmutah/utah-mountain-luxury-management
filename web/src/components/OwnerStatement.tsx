import { useEffect, useMemo, useState } from 'react';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { formatCurrency, type Expense, type Reservation } from '../lib/api';
import { loadDateBlocks } from '../lib/booked-nights';
import { denverToday } from '../lib/market/dates';
import { aheadChannelsLine, aheadLine, gapLine, ownerAhead, type ClosedSpan } from '../lib/owner-ahead';
import { ownerArrivalLines, ownerOfferLines, ownerStartLines, ownerTurnLines } from '../lib/owner-offers';
import { buildOwnerStatement } from '../lib/owner-statement';
import { ownerStatementCsv, ownerStatementFilename } from '../lib/owner-statement-file';
import type { ReportPeriod } from '../lib/report';

const PERIODS: Array<{ id: ReportPeriod; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'ytd', label: 'Year to date' },
];

/**
 * Is the published share exactly half of the leftover, to the cent?
 *
 * It usually is not, by a cent or two: the share is rounded to cents **per month** and then summed, so the annual figure agrees
 * with the monthly column an owner can add up. The sentence around it must say so rather than claiming a halving that does not
 * hold — measured on production 2026-11-10, `leftover -6472.33` against `todd -3236.18`.
 *
 * The comparison is on the raw difference, not on two independently rounded values. A first version compared
 * `leftover/2` rounded to cents against `todd`, which turned the production pair into a 1.5c gap (`-3236.165` rounds to
 * `-3236.17`) and called the exact case an error. Here the tolerance is the rounding itself: anything inside a cent of a true
 * halving is reported as exact, and a cent or more is not.
 */
function halfIsExact(leftover: number, todd: number): boolean {
  return Math.abs(leftover / 2 - todd) <= 0.005;
}

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
  const [closed, setClosed] = useState<ClosedSpan[]>([]);
  const [blocksReady, setBlocksReady] = useState<boolean | null>(null);
  const preferenceTimes = usePreferenceTimes();
  const statement = useMemo(
    () => buildOwnerStatement(month, period, reservations, expenses, extraCleaningFees),
    [month, period, reservations, expenses, extraCleaningFees],
  );
  const ahead = useMemo(() => ownerAhead(reservations, denverToday(), closed), [reservations, closed]);
  const offers = useMemo(() => ownerOfferLines(reservations, denverToday(), closed), [reservations, closed]);
  const starts = useMemo(() => ownerStartLines(reservations, denverToday(), closed), [reservations, closed]);
  const turns = useMemo(
    () => ownerTurnLines(reservations, denverToday(), preferenceTimes?.departure, closed),
    [reservations, preferenceTimes, closed],
  );
  const arrivals = useMemo(
    () => ownerArrivalLines(reservations, denverToday(), preferenceTimes?.arrival, closed),
    [reservations, preferenceTimes, closed],
  );

  useEffect(() => {
    let cancel = false;
    loadDateBlocks()
      .then((blocks) => {
        if (cancel) return;
        if (!blocks) {
          setBlocksReady(false);
          return;
        }
        setClosed(blocks);
        setBlocksReady(true);
      })
      .catch(() => {
        if (!cancel) setBlocksReady(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section className="space-y-6" data-bot="owner-statement">
      <div>
        <p className="uml-kicker">Owner statement</p>
        <h2 className="font-display text-5xl">Todd Wilhite</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
          Ranch and River, after the 20% management fee, then half. The fee is 20% of rent after cleaning — not 20% of the guest payout — so it reads lower than a fifth of the revenue line. Lindon, household purchases, and construction bills are not on this page. Nothing here can be edited.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" data-bot="owner-controls">
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
        <button type="button" className="uml-nav" data-bot="owner-print" onClick={() => window.print()}>
          Print
        </button>
        <button
          type="button"
          className="uml-nav"
          data-bot="owner-file"
          onClick={() => {
            const file = new Blob([ownerStatementCsv(statement)], { type: 'text/csv' });
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = ownerStatementFilename(statement.rangeLabel);
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download
        </button>
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
            {/*
              The working, so the headline can be checked without a spreadsheet. Cleaning is inside
              `costs` and is also taken out before the fee, which is why the two lines below reconcile
              to the number above instead of looking a couple of thousand light.

              The half is described as the figure that is paid, not as an arithmetic identity. `leftover / 2` and the published
              `todd` differ by a cent or two, because the share is rounded to cents **per month** and then summed — the same
              choice the fee makes, so the annual figure agrees with the monthly column an owner can add up. The old sentence
              said "Half is $3,236.18" beside "-$6,472.33 left", which does not halve: an owner checking that sentence found a
              3¢ disagreement in the very line written to prove the numbers. Measured on production 2026-11-10.
            */}
            <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot={`owner-working-${house.id}`}>
              {formatCurrency(house.leftover)} left after the {formatCurrency(house.fee)} fee and costs.{' '}
              {halfIsExact(house.leftover, house.todd)
                ? `Half is ${formatCurrency(house.todd)}.`
                : `Todd's half is ${formatCurrency(house.todd)}, rounded to the cent in each month.`}
            </p>
          </article>
        ))}
      </div>
      <div className="uml-panel rounded-3xl p-6" data-bot="owner-ahead">
        <p className="uml-kicker">On the books</p>
        <p className="mt-2 text-sm text-[var(--uml-muted)]">
          Stays that still have a night left. Names stay off this page. This count is not in the spreadsheet.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {ahead.houses.map((house) => (
            <li
              key={house.id}
              data-bot={`owner-ahead-${house.id}`}
              data-in={house.inHouse}
              data-coming={house.coming}
              data-nights={house.nights}
            >
              {aheadLine(house)}
            </li>
          ))}
        </ul>
        <p
          className="mt-4 text-sm"
          data-bot="owner-ahead-channels"
          data-airbnb={ahead.channels.find((channel) => channel.name === 'Airbnb')?.stays ?? 0}
          data-vrbo={ahead.channels.find((channel) => channel.name === 'VRBO')?.stays ?? 0}
          data-other={ahead.channels
            .filter((channel) => channel.name !== 'Airbnb' && channel.name !== 'VRBO')
            .reduce((sum, channel) => sum + channel.stays, 0)}
        >
          {aheadChannelsLine(ahead)}
        </p>
        {blocksReady === false ? (
          <p className="mt-4 text-sm" data-bot="owner-blocks-unread">
            Calendar blocks could not be read. This page will not call those nights open. Nothing was written over them.
          </p>
        ) : blocksReady ? (
        <>
        <p className="mt-4 text-sm text-[var(--uml-muted)]" data-bot="owner-gaps-note">
          Blocked nights stay off this stretch.
        </p>
        <ul className="mt-2 space-y-2 text-sm" data-bot="owner-gaps" data-blocks={closed.length}>
          {ahead.houses.flatMap((house) =>
            house.gaps.map((gap) => (
              <li key={`${house.id}-${gap.start}`} data-bot={`owner-gap-${house.id}`} data-start={gap.start} data-nights={gap.nights}>
                {gapLine(house.name, gap)}
              </li>
            )),
          )}
        </ul>
        <p className="mt-4 text-sm text-[var(--uml-muted)]">
          Lengths and add-ons the next open arrival can take. No prices. Lindon is not on this list. This is not in the spreadsheet.
        </p>
        <ul className="mt-2 space-y-2 text-sm" data-bot="owner-offers">
          {offers.map((line) => (
            <li key={line.id} data-bot={`owner-offer-${line.id}`}>
              {line.text}
            </li>
          ))}
        </ul>
        {starts.length > 0 && (
          <>
            <p className="mt-4 text-sm text-[var(--uml-muted)]">
              Where the booking calendar asks for a longer start. No prices. Lindon is not on this list. This is not in the spreadsheet.
            </p>
            <ul className="mt-2 space-y-2 text-sm" data-bot="owner-starts">
              {starts.map((line) => (
                <li key={line.id} data-bot={`owner-start-${line.id}`}>
                  {line.text}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-sm text-[var(--uml-muted)]">
          The next checkout, including a departure time when the preference card named one, and whether a 2:00 PM leave is open. No names and no prices. Lindon is not on this list. This is not in the spreadsheet.
        </p>
        <ul className="mt-2 space-y-2 text-sm" data-bot="owner-turns">
          {turns.map((line) => (
            <li key={line.id} data-bot={`owner-turn-${line.id}`}>
              {line.text}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--uml-muted)]">
          Stays that begin in the next 90 days, including an arrival time when the preference card named one, and whether a 1:00 PM arrival is open. No names and no prices. Lindon is not on this list. This is not in the spreadsheet.
        </p>
        <ul className="mt-2 space-y-2 text-sm" data-bot="owner-arrivals">
          {arrivals.map((line) => (
            <li key={line.id} data-bot="owner-arrival" data-id={line.id}>
              {line.text}
            </li>
          ))}
        </ul>
        </>
        ) : null}
      </div>
      {statement.months.length > 0 && (
        <div className="uml-panel rounded-3xl p-6" data-bot="owner-months">
          <p className="uml-kicker">Each month</p>
          <p className="mt-2 text-sm text-[var(--uml-muted)]">Ranch and River on each line add up to that month.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {statement.months.map((row) => (
              <li key={row.month} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" data-bot="owner-month">
                <span>{row.label}</span>
                <span className="text-[var(--uml-muted)]">
                  Ranch <span className="uml-num" data-bot="owner-month-ranch">{formatCurrency(row.ranch)}</span>
                  {' · '}
                  River <span className="uml-num" data-bot="owner-month-river">{formatCurrency(row.river)}</span>
                </span>
                <span className="uml-num" data-bot="owner-month-total">{formatCurrency(row.todd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
