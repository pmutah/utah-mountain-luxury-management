import { useEffect, useState } from 'react';
import { loadQuoteCalendar, type QuoteTurn } from '../lib/booked-nights';
import { ownerEvents } from '../lib/event-plan';
import { denverToday } from '../lib/market/dates';
import { ownerAgreementLines, ownerCheckoutLine, ownerRules, ownerTurnLine } from '../lib/owner-rules';
import { ownerRateWeek, ownerRateWeekNote, type RateWeekCalendar } from '../lib/rate-week';
import { ownerTrialHouses } from '../lib/owner-trial';
import { OwnerLink } from './OwnerLink';

export function OwnerRules() {
  const [ranch, setRanch] = useState('');
  const [river, setRiver] = useState('');
  const [turns, setTurns] = useState<QuoteTurn[] | null | undefined>(undefined);
  const [week, setWeek] = useState<RateWeekCalendar | null>(null);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((calendar) => {
        if (cancel) return;
        setTurns(calendar ? calendar.turns : null);
        setWeek(calendar ? { taken: calendar.nights, closed: calendar.closed } : null);
      })
      .catch(() => {
        if (!cancel) setTurns(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const trial = ownerTrialHouses(ranch, river);
  return (
    <section className="uml-panel mb-6 rounded-3xl p-6" data-bot="owner-rules">
      <p className="uml-kicker">How the houses split</p>
      <h2 className="mt-2 font-display text-4xl">Todd Wilhite</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {ownerRules().map((line) => (
          <li key={line} data-bot="owner-rule">
            {line}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2 text-sm" data-bot="owner-agreement">
        {ownerAgreementLines().map((line) => (
          <li key={line} data-bot="owner-agreement-line">
            {line}
          </li>
        ))}
      </ul>
      {turns !== undefined && (
        <p className="mt-4 text-sm" data-bot="owner-checkouts">
          {ownerCheckoutLine(turns)}
        </p>
      )}
      <p className="mt-4 text-sm" data-bot="owner-turn-clock">
        {ownerTurnLine()}
      </p>
      <ul className="mt-4 space-y-2 text-sm" data-bot="owner-events">
        {ownerEvents(denverToday(), week ?? undefined).map((event) => (
          <li key={event.label} data-bot="owner-event">
            <p>{event.label}.</p>
            {event.stays.map((stay) =>
              stay.href ? (
                <a key={stay.house} href={stay.href} className="underline" data-bot="owner-event-link" data-house={stay.house}>
                  {stay.line} This link does not hold the dates.
                </a>
              ) : (
                <p key={stay.house} data-bot="owner-event-miss" data-house={stay.house}>
                  {stay.line}
                </p>
              ),
            )}
            <p>{event.tail}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6" data-bot="owner-rate-week">
        <p className="text-sm text-[var(--uml-muted)]" data-bot="owner-rate-week-note">
          {ownerRateWeekNote(week != null)}
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {ownerRateWeek(denverToday(), week).map((line) => (
            <li key={line} data-bot="owner-rate-week-day">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <form className="mt-6" data-bot="owner-trial" onSubmit={(event) => event.preventDefault()}>
        <p className="text-sm text-[var(--uml-muted)]">
          A Ranch amount and a River amount, added before the fee. This is not Todd’s statement.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            value={ranch}
            onChange={(event) => setRanch(event.target.value)}
            inputMode="numeric"
            aria-label="Ranch amount before the fee"
            data-bot="owner-trial-ranch"
            className="w-full max-w-xs rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3 text-sm"
          />
          <input
            value={river}
            onChange={(event) => setRiver(event.target.value)}
            inputMode="numeric"
            aria-label="River amount before the fee"
            data-bot="owner-trial-river"
            className="w-full max-w-xs rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3 text-sm"
          />
        </div>
        {trial && (
          <p className="mt-3 text-sm" data-bot="owner-trial-result">
            {trial.line}
          </p>
        )}
      </form>
      <OwnerLink />
    </section>
  );
}
