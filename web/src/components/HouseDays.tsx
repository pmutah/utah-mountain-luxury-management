import { useState } from 'react';
import { houseDay, houseDayNote, type DayKind } from '../lib/house-day';
import type { HouseId } from '../lib/market/types';

const KINDS: Array<{ id: DayKind; label: string }> = [
  { id: 'ski', label: 'Ski day' },
  { id: 'out', label: 'Outdoors' },
  { id: 'sunday', label: 'Sunday' },
];

/** A published day plan. The choice stays in this view. Nothing is sent. */
export function HouseDays({
  house,
  where,
  onChoose,
}: {
  house: HouseId;
  where: 'house' | 'quote' | 'phone';
  onChoose?: (day: { title: string; lines: string[] }) => void;
}) {
  const [kind, setKind] = useState<DayKind | null>(null);
  const day = kind ? houseDay(house, kind) : null;
  const bot = where === 'house' ? 'house' : where === 'quote' ? 'stay' : 'stay-phone';
  const phone = where === 'phone';
  function choose(id: DayKind) {
    setKind(id);
    onChoose?.(houseDay(house, id));
  }
  return (
    <section
      className={phone ? 'mt-4' : 'uml-panel mt-6 rounded-3xl p-6'}
      data-bot={`${bot}-days`}
      data-house={house}
    >
      <p className={phone ? 'text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]' : 'uml-kicker'}>
        A day here
      </p>
      <p className={phone ? 'mt-2 text-sm leading-relaxed text-[#d7cfc3]' : 'mt-2 text-sm text-[var(--uml-muted)]'}>
        {houseDayNote(where)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={phone ? 'rounded-full border border-[#d4b56a]/50 px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#d4b56a]' : 'uml-nav'}
            data-bot={`${bot}-day-${item.id}`}
            aria-pressed={kind === item.id}
            onClick={() => choose(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {day && (
        <div className={phone ? 'mt-4 text-sm text-[#f6f1e8]' : 'mt-4 text-sm'} data-bot={`${bot}-day`}>
          <p className={phone ? 'text-lg' : 'font-display text-2xl'}>{day.title}</p>
          <ul className="mt-2 space-y-2">
            {day.lines.map((line) => (
              <li key={line} data-bot={`${bot}-day-line`}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
