import { addDays, weekdayIndex } from './market/dates';
import { nightAsk } from './market/rates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { directNight } from './quote';

export type StayPick = {
  checkIn: string;
  checkOut: string;
};

export type StayDay = {
  iso: string;
  inMonth: boolean;
  guest: number;
  direct: number;
  minNights: number;
  booked: boolean;
  closed: boolean;
  past: boolean;
  isCheckIn: boolean;
  isCheckOut: boolean;
  inStay: boolean;
};

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(yearMonth: string): string {
  return new Date(`${yearMonth}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Six weeks, Sunday through Saturday, with a guest price on every night. */
export function monthDays(
  yearMonth: string,
  house: HouseId,
  taken: readonly string[],
  stay: StayPick,
  today: string,
  pace: YearPace = 'unknown',
): StayDay[] {
  const first = `${yearMonth}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const booked = new Set(taken);
  const days: StayDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const iso = addDays(gridStart, i);
    const ask = nightAsk(house, iso);
    const priced = directNight(house, iso, taken, today, pace);
    days.push({
      iso,
      inMonth: iso.slice(0, 7) === yearMonth,
      guest: ask.guest,
      direct: priced.direct,
      minNights: ask.minNights,
      booked: booked.has(iso),
      closed: ask.closed,
      past: iso < today,
      isCheckIn: iso === stay.checkIn,
      isCheckOut: iso === stay.checkOut,
      inStay: Boolean(stay.checkIn && stay.checkOut && iso >= stay.checkIn && iso < stay.checkOut),
    });
  }
  return days;
}

/** The arrival night's minimum, when that house asks for more than one night. */
export function arrivalMinimum(house: HouseId, checkIn: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const ask = nightAsk(house, checkIn);
  if (ask.closed || ask.minNights <= 1) return null;
  return ask.minNights;
}

/**
 * First click chooses check-in. The next click chooses the morning of check-out.
 * A booked or closed night can be a checkout morning, and it cannot be a night in the stay.
 */
export function pickStay(
  stay: StayPick,
  iso: string,
  taken: readonly string[],
  house: HouseId,
  today: string,
): StayPick {
  const ask = nightAsk(house, iso);
  const blockedStart = iso < today || ask.closed || taken.includes(iso);
  const choosingCheckout = Boolean(stay.checkIn) && !stay.checkOut;

  if (!choosingCheckout) {
    if (blockedStart) return stay;
    return { checkIn: iso, checkOut: '' };
  }
  if (iso <= stay.checkIn) {
    if (blockedStart) return { checkIn: stay.checkIn, checkOut: '' };
    return { checkIn: iso, checkOut: '' };
  }

  let cursor = stay.checkIn;
  while (cursor < iso) {
    const night = nightAsk(house, cursor);
    if (taken.includes(cursor) || night.closed) return stay;
    cursor = addDays(cursor, 1);
  }
  return { checkIn: stay.checkIn, checkOut: iso };
}
