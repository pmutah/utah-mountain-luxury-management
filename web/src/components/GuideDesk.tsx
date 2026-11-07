import { useEffect, useState, type FormEvent } from 'react';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { guideDeskAnswer, type DeskCalendar, type DeskPageStay } from '../lib/guide-desk';
import type { HouseId } from '../lib/market/types';

/** Published house facts only. The agents page can also name the split and the rate rules. */
export function GuideDesk({
  host = false,
  house,
  hidden,
  pinned,
  stay = null,
}: {
  host?: boolean;
  house?: HouseId;
  hidden?: Partial<Record<HouseId, readonly string[]>>;
  pinned?: Partial<Record<HouseId, readonly string[]>>;
  stay?: DeskPageStay | null;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [calendar, setCalendar] = useState<DeskCalendar | null>(null);
  const [calendarReady, setCalendarReady] = useState(false);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((rows) => {
        if (cancel) return;
        setCalendar(rows ? { taken: rows.nights, closed: rows.closed } : null);
        setCalendarReady(true);
      })
      .catch(() => {
        if (!cancel) {
          setCalendar(null);
          setCalendarReady(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  function ask(event: FormEvent) {
    event.preventDefault();
    const pageStay = stay && stay.checkIn && stay.checkOut ? { ...stay, pending: !calendarReady } : null;
    setAnswer(guideDeskAnswer(question, undefined, house, host, undefined, hidden, calendar, pageStay, host ? pinned : undefined));
  }

  return (
    <form className="uml-panel rounded-3xl p-6" data-bot="guide-desk" data-host={host ? 'host' : 'guest'} data-house={house ?? 'all'} onSubmit={ask}>
      <p className="uml-kicker">{host ? 'Host desk' : 'House guide'}</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        {host
          ? 'Answers come from the published guide. A split, a rate rule, how many sample comps are close, the lengths a check-in can quote, or a named event is named with no price and no ledger amount. Nothing is sent.'
          : 'Answers come from the published guide. A check-in date can name the lengths the rate card can quote, and a named event can name its shortest stay. A pet question does not invent a rule. An insurance question uses the stay agreement. Nothing is sent, and no price is quoted.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          data-bot="guide-desk-ask"
          className="min-w-0 flex-1 rounded-full border border-[var(--uml-line)] bg-transparent px-4 py-3 text-sm text-[var(--uml-ink)]"
          placeholder="Checkout at the River House"
        />
        <button
          type="submit"
          data-bot="guide-desk-go"
          className="uml-gold-btn rounded-full px-4 py-3 text-xs uppercase tracking-[0.16em]"
        >
          Answer
        </button>
      </div>
      {answer ? (
        <p className="mt-4 text-sm text-[var(--uml-ink)]" data-bot="guide-desk-answer">
          {answer}
        </p>
      ) : null}
    </form>
  );
}
