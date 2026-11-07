import { useState } from 'react';
import { formatWhole } from '../lib/luxury';
import { denverToday } from '../lib/market/dates';
import { eventLine, eventNameOn } from '../lib/market/events';
import type { YearPace } from '../lib/market/fill';
import type { QuotedSheetNight } from '../lib/market/rate-sheet';
import type { HouseId } from '../lib/market/types';
import { monthDays, monthLabel, monthNightLabel, pickStay, shiftMonth, arrivalMinimum, checkoutCrosses, checkoutStopLine, rateCardCell, rateCardDays, rateCardNote, stayMonthNote, type StayPick } from '../lib/stay-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RateCardMonth({
  house,
  checkIn,
  checkOut,
  onPick,
  taken = null,
  closed = null,
  quoted = true,
  pace = 'unknown',
  shownMonth,
  onShownMonth,
  sheet = [],
}: {
  house: HouseId;
  checkIn: string;
  checkOut: string;
  onPick: (stay: StayPick) => void;
  taken?: readonly string[] | null;
  closed?: readonly string[] | null;
  quoted?: boolean;
  pace?: YearPace;
  shownMonth?: string;
  onShownMonth?: (month: string) => void;
  /** Host-approved guest rates, so a cell agrees with the quote below it. */
  sheet?: readonly QuotedSheetNight[];
}) {
  const today = denverToday();
  const [localMonth, setLocalMonth] = useState(checkIn.slice(0, 7) || today.slice(0, 7));
  const month = shownMonth && /^\d{4}-\d{2}$/.test(shownMonth) ? shownMonth : localMonth;
  function showMonth(next: string) {
    if (onShownMonth) onShownMonth(next);
    else setLocalMonth(next);
  }
  const stay = { checkIn, checkOut };
  const days = rateCardDays(month, house, today, taken, closed, pace, sheet);
  const choosingCheckout = Boolean(checkIn) && !checkOut;
  const stop = choosingCheckout ? checkoutStopLine(checkIn, house, taken ?? [], closed ?? []) : null;
  const earliest = today.slice(0, 7);
  const latest = shiftMonth(earliest, 17);
  return (
    <div className="mt-4" data-bot="stay-rate-card" data-quoted={quoted ? 'yes' : 'no'} data-month={month}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= earliest}
          onClick={() => showMonth(shiftMonth(month, -1))}
          className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs disabled:opacity-30"
        >
          Prev
        </button>
        <p className="font-display text-2xl">{monthLabel(month)}</p>
        <button
          type="button"
          aria-label="Next month"
          disabled={month >= latest}
          onClick={() => showMonth(shiftMonth(month, 1))}
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
          const selected = day.iso === checkIn || day.iso === checkOut || (Boolean(checkIn) && Boolean(checkOut) && day.iso > checkIn && day.iso < checkOut);
          const goldStay = selected && quoted;
          const crosses = choosingCheckout && checkoutCrosses(checkIn, day.iso, house, taken ?? [], closed ?? []);
          const disabled =
            !day.inMonth ||
            day.past ||
            (day.notYet && !(checkIn && !checkOut && day.iso > checkIn)) ||
            ((day.booked || day.held) && !choosingCheckout) ||
            crosses;
          return (
            <button
              key={day.iso}
              type="button"
              data-bot="stay-rate-day"
              data-date={day.iso}
              data-booked={day.booked ? 'yes' : 'no'}
              data-held={day.held ? 'yes' : 'no'}
              data-cross={crosses ? 'yes' : 'no'}
              data-stay={goldStay ? 'yes' : 'no'}
              data-promo={day.promo ? 'yes' : 'no'}
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onPick(pickStay(stay, day.iso, taken ?? [], house, today, closed ?? []))}
              className={`min-h-14 rounded-xl px-1 py-1 text-left ${day.inMonth ? '' : 'invisible'} ${
                goldStay ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]' : 'border border-[var(--uml-line)]'
              } ${disabled && day.inMonth ? 'opacity-40' : ''}`}
            >
              <span className="block text-sm">{Number(day.iso.slice(8))}</span>
              {day.inMonth ? <span className="block text-[9px] uppercase tracking-wide">{rateCardCell(day)}</span> : null}
              {day.inMonth && day.event ? (
                <span className="block text-[9px] uppercase tracking-wide" data-bot="stay-rate-event">
                  Event
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {stop ? (
        <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-rate-checkout-stop">
          {stop}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-rate-note">
        {rateCardNote(taken !== null)}
        {days.some((day) => day.inMonth && day.promo) ? ' A discounted night says 20% off.' : ''}
      </p>
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-rate-events">
        {eventLine(month)} Nothing extra is added for an event.
      </p>
    </div>
  );
}

export function StayMonth({
  house,
  taken,
  blocked = [],
  checkIn,
  checkOut,
  pace = 'unknown',
  quoted = true,
  prices = true,
  onPick,
  sheet = [],
}: {
  house: HouseId;
  taken: readonly string[];
  blocked?: readonly string[];
  checkIn: string;
  checkOut: string;
  pace?: YearPace;
  quoted?: boolean;
  prices?: boolean;
  onPick: (stay: StayPick) => void;
  /** Host-approved guest rates, so a cell agrees with the quote below it. */
  sheet?: readonly QuotedSheetNight[];
}) {
  const today = denverToday();
  const [month, setMonth] = useState(checkIn.slice(0, 7) || today.slice(0, 7));
  const stay = { checkIn, checkOut };
  const days = monthDays(month, house, taken, stay, today, pace, blocked, sheet);
  const choosingCheckout = Boolean(checkIn) && !checkOut;
  const stop = choosingCheckout ? checkoutStopLine(checkIn, house, taken, blocked) : null;
  const earliest = today.slice(0, 7);
  const latest = shiftMonth(earliest, 17);
  const minimum = arrivalMinimum(house, checkIn);
  const marked = days.some((day) => day.inMonth && (day.startNights ?? 0) > 1);
  const tooShort = days.some((day) => day.inMonth && !day.past && !day.closed && !day.booked && !day.held && day.startNights == null);

  return (
    <div data-bot="stay-month" data-quoted={quoted ? 'yes' : 'no'} data-prices={prices ? 'yes' : 'no'}>
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
          const cannotStart = day.startNights == null && !day.booked && !day.held && !day.closed && !day.past;
          const crosses = choosingCheckout && checkoutCrosses(checkIn, day.iso, house, taken, blocked);
          const disabled = !day.inMonth || day.past || day.closed || ((day.booked || day.held) && !choosingCheckout) || (cannotStart && !choosingCheckout) || crosses;
          const selected = day.isCheckIn || day.isCheckOut || day.inStay;
          const goldStay = selected && quoted;
          return (
            <button
              key={day.iso}
              type="button"
              data-bot="stay-day"
              data-date={day.iso}
              data-cross={crosses ? 'yes' : 'no'}
              data-stay={goldStay ? 'yes' : 'no'}
              data-event={eventNameOn(day.iso) ?? ''}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${day.iso}${day.booked ? ', booked' : day.held || (day.closed && !day.past) ? ', closed' : ''}${
                eventNameOn(day.iso) ? `, ${eventNameOn(day.iso)}` : ''
              }${
                day.startNights && day.startNights > 1
                  ? `, at least ${day.startNights} nights`
                  : day.startNights == null && day.inMonth && !day.past && !day.closed && !day.booked && !day.held
                    ? ', too short to start a stay'
                    : ''
              }`}
              onClick={() => onPick(pickStay(stay, day.iso, taken, house, today, blocked))}
              className={`min-h-14 rounded-xl px-1 py-1 text-left ${
                day.inMonth ? '' : 'invisible'
              } ${goldStay ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)]' : 'border border-[var(--uml-line)]'} ${
                disabled && day.inMonth ? 'opacity-40' : ''
              }`}
            >
              <span className="block text-sm">{Number(day.iso.slice(8))}</span>
              {day.inMonth && day.booked ? (
                <span className="block text-[9px] uppercase tracking-wide">Booked</span>
              ) : day.inMonth && (day.held || day.closed) && !day.past ? (
                <span className="block text-[9px] uppercase tracking-wide">Closed</span>
              ) : day.inMonth && !day.closed && !day.past ? (
                <span className="block text-[9px] tabular-nums">
                  {monthNightLabel(formatWhole(day.direct), day.startNights, prices, day.promo)}
                </span>
              ) : null}
              {day.inMonth && eventNameOn(day.iso) ? (
                <span className="block text-[9px] uppercase tracking-wide" data-bot="stay-day-event">
                  Event
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {stop ? (
        <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-checkout-stop">
          {stop}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="stay-minimum">
        {stayMonthNote(Boolean(checkOut), quoted, prices)}
        {marked ? ' A night marked with nights is the shortest stay that can start that day.' : ''}
        {tooShort ? ' A night marked too short cannot start a stay. It can still be a checkout morning.' : ''}
        {' '}Booked is a stay. Closed is a block or a night the house is not open.
        {prices && days.some((day) => day.inMonth && day.promo) ? ' A discounted night says 20% off.' : ''}
        {minimum ? ` This arrival needs at least ${minimum} nights.` : ''}
      </p>
      <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="stay-month-events">
        {eventLine(month)} Nothing extra is added for an event.
      </p>
    </div>
  );
}
