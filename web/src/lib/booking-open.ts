import { addDays, weekdayIndex } from './market/dates';
import type { HouseId } from './market/types';
import { quoteStay } from './quote';

/** The next Friday the booking page can start from. River stays begin November 1, 2026. */
export function nextOpenFriday(today: string): string {
  let cursor = today < '2026-11-01' ? '2026-11-01' : today;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayIndex(cursor) === 5) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

const BLOCKED = /already booked|closed on the calendar|already passed|first stays/i;

/** Check-in and checkout for a blank booking page. The stay is one the quote accepts. Nothing is held. */
export function openingStay(
  house: HouseId,
  asOf: string,
  taken: readonly string[] = [],
  closed: readonly string[] = [],
): { checkIn: string; checkOut: string } {
  let checkIn = nextOpenFriday(asOf);
  let last = { checkIn, checkOut: addDays(checkIn, 2) };
  for (let week = 0; week < 18; week += 1) {
    let nights = 2;
    for (let step = 0; step < 8; step += 1) {
      const checkOut = addDays(checkIn, nights);
      const quote = quoteStay(house, checkIn, checkOut, taken, { asOf, pace: 'unknown', closed });
      last = { checkIn, checkOut };
      if (quote.ok) return last;
      const reason = quote.reason ?? '';
      if (quote.minNights > nights && quote.minNights <= 28 && !BLOCKED.test(reason)) {
        nights = quote.minNights;
        continue;
      }
      break;
    }
    const next = nextOpenFriday(addDays(checkIn, 1));
    if (next <= checkIn) break;
    checkIn = next;
  }
  return last;
}
