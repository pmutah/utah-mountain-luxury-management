import { addDays } from './market/dates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';
import { shortestStay } from './shortest-stay';

const MAX_NIGHTS = 28;

export type LongestStay = {
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

/** How far this check-in can run before the next taken night, up to 28 nights. */
export function longestStay(
  house: HouseId,
  checkIn: string,
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  guests?: number,
): LongestStay | null {
  const floor = shortestStay(house, checkIn, taken, asOf, pace, guests);
  if (!floor) return null;
  const options = { asOf, pace, ...(guests !== undefined ? { guests } : {}) };
  let best: LongestStay = floor;
  let nights = floor.nights + 1;
  while (nights <= MAX_NIGHTS) {
    const quote = quoteStay(house, checkIn, addDays(checkIn, nights), taken, options);
    if (quote.ok) {
      best = { checkOut: quote.checkOut, nights: quote.nights.length, through: longDate(quote.checkOut) };
      nights += 1;
      continue;
    }
    if (quote.reason?.includes('at least') && quote.minNights > nights && quote.minNights <= MAX_NIGHTS) {
      nights = quote.minNights;
      continue;
    }
    break;
  }
  return best;
}
