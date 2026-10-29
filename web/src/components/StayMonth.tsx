import { useState } from 'react';
import { formatWhole } from '../lib/luxury';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';
import { monthDays, monthLabel, pickStay, shiftMonth, type StayPick } from '../lib/stay-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StayMonth({
  house,
  taken,
  checkIn,
  checkOut,
  onPick,
}: {
  house: HouseId;
  taken: readonly string[];
  checkIn: string;
  checkOut: string;
  onPick: (stay: StayPick) => void;
}) {
  const today = denverToday();
  const [month, setMonth] = useState(checkIn.slice(0, 7) || today.slice(0, 7));
  const stay = { checkIn, checkOut };
  const days = monthDays(month, house, taken, stay, today);
  const earliest = today.slice(0, 7);
  const latest = shiftMonth(earliest, 17);

  return (
    <div data-bot="stay-month">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= earliest}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs disabled:opacity-30"
        >
          Prev
        </button>
        <p className="font-display text-2xl">{monthLabel(month)}</p>
        <button
          type="button"
          aria-label="Next month"
          disabled={month >= latest}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs disabled:opacity-30"
        >
          Next
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--uml-muted)]">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const choosingCheckout = Boolean(checkIn) && !checkOut;
          const disabled = !day.inMonth || day.past || day.closed || (day.booked && !choosingCheckout);
          const selected = day.isCheckIn || day.isCheckOut || day.inStay;
          return (
            <button
              key={day.iso}
              type="button"
              data-bot="stay-day"
              data-date={day.iso}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${day.iso}${day.booked ? ', booked' : ''}`}
              onClick={() => onPick(pickStay(stay, day.iso, taken, house, today))}
              className={`min-h-14 rounded-xl px-1 py-1 text-left ${
                day.inMonth ? '' : 'invisible'
              } ${selected ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]' : 'border border-[var(--uml-line)]'} ${
                disabled && day.inMonth ? 'opacity-40' : ''
              }`}
            >
              <span className="block text-sm">{Number(day.iso.slice(8))}</span>
              {day.inMonth && day.booked ? (
                <span className="block text-[9px] uppercase tracking-wide">Booked</span>
              ) : day.inMonth && !day.closed && !day.past ? (
                <span className="block text-[9px] tabular-nums">{formatWhole(day.guest)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--uml-muted)]">
        {checkOut ? 'Gold nights are the stay. Check-out morning is the last gold day.' : 'Choose the check-out morning.'}
      </p>
    </div>
  );
}
