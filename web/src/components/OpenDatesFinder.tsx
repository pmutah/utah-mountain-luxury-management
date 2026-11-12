import { useMemo, useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { FINDER_LENGTHS, findOpenWindows, type FinderLength } from '../lib/open-dates-finder';
import type { YearPace } from '../lib/market/fill';
import type { HouseId } from '../lib/market/types';

/**
 * "Show me what's open" — the next stays this house can quote at the length the guest wants.
 *
 * A guest planning around a group usually knows how long, not when. The month calendar makes them hunt night by
 * night; this lists the next six windows and fills the reserve card with one tap. It shows no price: the card
 * quotes whatever dates land in it, so the number a guest reads always comes from one place.
 */
export function OpenDatesFinder({
  house,
  asOf,
  pace,
  taken,
  blocked,
  guests,
  children,
  checkIn,
  onPick,
}: {
  house: HouseId;
  asOf: string;
  pace: YearPace;
  taken: readonly string[];
  blocked: readonly string[];
  guests?: number;
  children?: number;
  checkIn: string;
  onPick: (stay: { checkIn: string; checkOut: string }) => void;
}) {
  const [nights, setNights] = useState<FinderLength>(3);
  const [weekendsOnly, setWeekendsOnly] = useState(false);
  const windows = useMemo(
    () => findOpenWindows({ house, nights, weekendsOnly, asOf, pace, taken, blocked, guests, children }),
    [house, nights, weekendsOnly, asOf, pace, taken, blocked, guests, children],
  );

  return (
    <div className="uml-panel mt-4 rounded-3xl p-5" data-bot="open-dates-finder" data-house={house}>
      <p className="uml-kicker flex items-center gap-1.5">
        <CalendarSearch className="h-3.5 w-3.5" aria-hidden />
        Find open dates
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Length of stay">
        {FINDER_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            onClick={() => setNights(length)}
            aria-pressed={nights === length}
            data-bot={`finder-nights-${length}`}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              nights === length
                ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)]/15 text-[var(--uml-ink)]'
                : 'border-white/15 text-[var(--uml-muted)] hover:border-white/35'
            }`}
          >
            {length === 7 ? 'A week' : `${length} nights`}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-[var(--uml-muted)]">
          <input
            type="checkbox"
            checked={weekendsOnly}
            onChange={(event) => setWeekendsOnly(event.target.checked)}
            data-bot="finder-weekends"
            className="accent-[var(--uml-gold)]"
          />
          Friday arrivals
        </label>
      </div>
      {windows.length > 0 ? (
        <ul className="mt-3 grid gap-1.5" data-bot="finder-windows">
          {windows.map((stay) => {
            const active = stay.checkIn === checkIn;
            return (
              <li key={stay.checkIn}>
                <button
                  type="button"
                  onClick={() => onPick({ checkIn: stay.checkIn, checkOut: stay.checkOut })}
                  aria-current={active ? 'true' : undefined}
                  data-bot="finder-window"
                  data-check-in={stay.checkIn}
                  data-check-out={stay.checkOut}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                    active ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)]/10' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <span>{stay.label}</span>
                  <span className="text-xs text-[var(--uml-muted)]">
                    {stay.nights} nights{stay.stretched ? ' · minimum' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="finder-none">
          {guests !== undefined
            ? 'Nothing in the next six months fits that length and party here. Try another length, or ask us about the other houses.'
            : 'Nothing in the next six months fits that length here. Try another length.'}
        </p>
      )}
      <p className="mt-2 text-[11px] text-[var(--uml-muted)]">Tapping a stay fills the dates above. It does not hold them.</p>
    </div>
  );
}
