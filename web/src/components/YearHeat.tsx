import type { HeatKind, HeatMonth } from '../lib/market/year-heat';

const SWATCH: Record<HeatKind, string> = {
  booked: 'bg-[#d4b56a]',
  closed: 'bg-white/15',
  open: 'bg-[#3d8f8a]',
  above: 'bg-[#9ec9c6]',
  below: 'bg-[#1d4f4c]',
};

export function YearHeat({ months, calendarLive }: { months: HeatMonth[]; calendarLive: boolean }) {
  return (
    <div className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-heat">
      <p className="uml-kicker">Next 12 months</p>
      <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
        {calendarLive
          ? 'Booked nights and calendar blocks come from the live calendar. Above and below compare our ask with the sample comp band. Named events from the rate card sit under the month. No price is shown here, and nothing is posted.'
          : 'The calendar could not be read. These months do not say which nights are booked or open. Named events from the rate card still sit under the month. Nothing is posted.'}
      </p>
      {!calendarLive && (
        <p className="mt-3 text-sm" data-bot="market-heat-unread">
          The calendar could not be read. No night is raised or promoted.
        </p>
      )}
      {calendarLive && (
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--uml-muted)]">
        <li><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.booked}`} />Booked</li>
        <li><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.closed}`} />Closed</li>
        <li><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.open}`} />Inside the band</li>
        <li><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.above}`} />Above</li>
        <li><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SWATCH.below}`} />Below</li>
      </ul>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((month) => (
          <section key={month.month} data-bot="market-heat-month" data-month={month.month} {...(calendarLive ? { 'data-booked': month.booked, 'data-closed': month.closed } : {})}>
            <p className="text-sm">{month.label}</p>
            {calendarLive && (
              <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
                {month.days.map((day) => (
                  <span key={day.date} title={`${day.date} ${day.kind}`} className={`h-2.5 w-2.5 rounded-sm ${SWATCH[day.kind]}`} />
                ))}
              </div>
            )}
            {calendarLive && <p className="mt-2 text-xs text-[var(--uml-muted)]">{month.line}</p>}
            <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="market-heat-events">{month.events}</p>
            <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="market-heat-minimum">{month.minimum}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
