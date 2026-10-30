import { addDays, isWeekendNight } from './market/dates';
import { nightAsk } from './market/rates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

export type OpenArrival = {
  checkIn: string;
  checkOut: string;
  nights: number;
  direct: number;
  label: string;
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

/** The next shortest stays this page will quote. Picking one does not hold the dates. */
export function openArrivals(
  house: HouseId,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  limit = 3,
): OpenArrival[] {
  const found: OpenArrival[] = [];
  const horizon = addDays(asOf, 180);
  let cursor = asOf;
  while (cursor < horizon && found.length < limit) {
    const ask = nightAsk(house, cursor);
    if (ask.closed || taken.includes(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    let nights = Math.max(1, ask.minNights);
    if (nights === 1 && isWeekendNight(cursor) && leadDays(asOf, cursor) > 7) nights = 2;
    let quote = quoteStay(house, cursor, addDays(cursor, nights), taken, { asOf, pace });
    if (!quote.ok && quote.minNights > nights && quote.reason?.includes('at least')) {
      nights = quote.minNights;
      quote = quoteStay(house, cursor, addDays(cursor, nights), taken, { asOf, pace });
    }
    if (!quote.ok) {
      cursor = addDays(cursor, 1);
      continue;
    }
    found.push({
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights.length,
      direct: quote.stayTotal,
      label: `${longDate(quote.checkIn)} · ${quote.nights.length} ${quote.nights.length === 1 ? 'night' : 'nights'}`,
    });
    cursor = quote.checkOut;
  }
  return found;
}
