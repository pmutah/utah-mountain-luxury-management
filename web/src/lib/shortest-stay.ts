import { addDays, isWeekendNight } from './market/dates';
import type { YearPace } from './market/fill';
import { nightAsk } from './market/rates';
import type { HouseId } from './market/types';
import { publishedStayRule, quoteStay } from './quote';

export type ShortestStay = {
  checkOut: string;
  nights: number;
  through: string;
};

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function leadDays(asOf: string, iso: string): number {
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [by, bm, bd] = iso.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd) - Date.UTC(ay!, am! - 1, ad)) / 86_400_000);
}

/** The shortest stay this check-in can start. A booked or closed check-in has none. */
export function shortestStay(
  house: HouseId,
  checkIn: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  guests?: number,
  closed: readonly string[] = [],
  children?: number,
): ShortestStay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const ask = nightAsk(house, checkIn);
  if (ask.closed || taken.includes(checkIn) || closed.includes(checkIn)) return null;
  let nights = Math.max(1, ask.minNights);
  if (nights === 1 && isWeekendNight(checkIn) && leadDays(asOf, checkIn) > 7) nights = 2;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const quote = quoteStay(house, checkIn, addDays(checkIn, nights), taken, {
      asOf,
      pace,
      closed,
      ...(guests !== undefined ? { guests, ...(children !== undefined ? { children } : {}) } : {}),
    });
    if (quote.ok) {
      return { checkOut: quote.checkOut, nights: quote.nights.length, through: longDate(quote.checkOut) };
    }
    if (quote.reason?.includes('at least') && quote.minNights > nights) {
      nights = quote.minNights;
      continue;
    }
    return null;
  }
  return null;
}

/** When these dates fail the rate card, name the shortest stay that check-in can quote. It does not say the house is open. */
export function publishedShortestLine(
  house: HouseId,
  checkIn: string,
  checkOut: string,
  asOf: string,
  guests?: number,
  taken: readonly string[] = [],
  closed: readonly string[] = [],
  children?: number,
): string | null {
  const rule = publishedStayRule(house, checkIn, checkOut, guests, children, asOf);
  if (!rule) return null;
  const next = shortestStay(house, checkIn, taken, asOf, 'unknown', guests, closed, children);
  if (!next || next.checkOut === checkOut) return null;
  const line = `The rate card can quote this check-in through ${next.through}, ${next.nights} nights. This does not say the house is open. Nothing is charged yet.`;
  return line.includes('$') ? null : line;
}
