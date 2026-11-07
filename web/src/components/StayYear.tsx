import { stayYear, type StayYearKind } from '../lib/stay-year';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';

const SWATCH: Record<StayYearKind, string> = {
  booked: 'bg-[#d4b56a]',
  closed: 'bg-white/20',
  plain: 'border border-[var(--uml-line)] bg-transparent',
};

/** Booked and closed nights for the next year. A blank night still needs a quote. Nothing is held. */
export function StayYear({
  house,
  taken,
  closed,
  calendar,
  activeMonth,
  onMonth,
  rulesHouse,
}: {
  house: HouseId;
  taken: readonly string[];
  closed: readonly string[];
  calendar: 'loading' | 'ready' | 'unread';
  activeMonth?: string;
  onMonth?: (month: string) => void;
  rulesHouse?: HouseId;
}) {
  const months = calendar === 'ready' ? stayYear(rulesHouse ?? house, denverToday(), taken, closed) : [];
  const note =
    calendar === 'loading'
      ? 'Checking the calendar.'
      : calendar === 'unread'
        ? 'The calendar could not be read. These months do not mark booked nights. Nothing is held.'
        : 'Booked nights and calendar blocks are marked. A blank night still needs a quote. Choosing a month shows it below. The dates stay. Nothing is held.';
  return (
    <section className="uml-panel mt-6 rounded-3xl p-5 sm:p-6" data-bot="house-year" data-house={house} data-ready={calendar}>
      <p className="uml-kicker">Next 12 months</p>
      <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">{note}</p>
      {calendar === 'ready' && (
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--uml-muted)]">
          <li>
            <span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.booked}`} />
            Booked
          </li>
          <li>
            <span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.closed}`} />
            Closed
          </li>
        </ul>
      )}
      {months.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((month) => (
            <section key={month.month} data-bot="house-year-month" data-month={month.month} data-booked={month.booked} data-closed={month.closed}>
              {onMonth ? (
                <button
                  type="button"
                  className={`text-sm ${month.month === activeMonth ? 'underline' : ''}`}
                  data-bot="house-year-jump"
                  aria-current={month.month === activeMonth ? 'true' : undefined}
                  onClick={() => {
                    onMonth(month.month);
                    document.querySelector('[data-bot="stay-rate-card"]')?.scrollIntoView({ block: 'start' });
                  }}
                >
                  {month.label}
                </button>
              ) : (
                <p className="text-sm">{month.label}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
                {month.days.map((day) => (
                  <span
                    key={day.date}
                    title={day.kind === 'plain' ? day.date : `${day.date} ${day.kind}`}
                    data-date={day.date}
                    data-kind={day.kind}
                    className={`h-2.5 w-2.5 rounded-sm ${SWATCH[day.kind]}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--uml-muted)]">{month.line}</p>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
