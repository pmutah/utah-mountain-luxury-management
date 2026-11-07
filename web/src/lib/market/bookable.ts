import { addDays } from './dates';
import type { YearPace } from './fill';
import { nightAsk } from './rates';
import type { HouseId } from './types';
import { MAX_NIGHTS, quoteStay } from '../quote';

function blocked(house: HouseId, iso: string, taken: ReadonlySet<string>, closed: ReadonlySet<string>): boolean {
  return taken.has(iso) || closed.has(iso) || nightAsk(house, iso).closed;
}

/**
 * Nights a guest can actually book. A one-night hole at the River House, or a lone
 * Friday with the Saturday already taken, stays out. The check looks past the board.
 */
export function bookableNights(
  house: HouseId,
  dates: readonly string[],
  taken: readonly string[],
  asOf: string,
  pace: YearPace,
  closed: readonly string[] = [],
): Set<string> {
  const takenSet = new Set(taken);
  const closedSet = new Set(closed);
  const wanted = new Set(dates);
  const bookable = new Set<string>();
  const seen = new Set<string>();

  for (const iso of dates) {
    if (seen.has(iso) || blocked(house, iso, takenSet, closedSet)) continue;
    let start = iso;
    for (let back = 1; back <= MAX_NIGHTS; back += 1) {
      const prev = addDays(iso, -back);
      if (blocked(house, prev, takenSet, closedSet)) break;
      start = prev;
    }
    let end = iso;
    for (let forward = 1; forward <= MAX_NIGHTS; forward += 1) {
      const next = addDays(iso, forward);
      if (blocked(house, next, takenSet, closedSet)) break;
      end = next;
    }
    const checkoutLimit = addDays(end, 1);
    let checkIn = start;
    while (checkIn <= end) {
      seen.add(checkIn);
      for (let length = 1; length <= MAX_NIGHTS; length += 1) {
        const checkOut = addDays(checkIn, length);
        if (checkOut > checkoutLimit) break;
        const quote = quoteStay(house, checkIn, checkOut, taken, { asOf, pace, closed });
        if (!quote.ok) continue;
        for (const night of quote.nights) {
          if (wanted.has(night.date)) bookable.add(night.date);
        }
      }
      checkIn = addDays(checkIn, 1);
    }
  }
  return bookable;
}
