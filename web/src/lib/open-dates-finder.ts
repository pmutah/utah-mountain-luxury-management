import { addDays, weekdayIndex } from './market/dates';
import type { YearPace } from './market/fill';
import type { HouseId } from './market/types';
import { partyFits } from './house-stay';
import { quoteStay } from './quote';

/** The stay lengths a guest can ask the finder for. A week is the longest a family usually plans around. */
export const FINDER_LENGTHS = [2, 3, 4, 7] as const;
export type FinderLength = (typeof FINDER_LENGTHS)[number];

export type FinderWindow = {
  checkIn: string;
  checkOut: string;
  nights: number;
  /** "Fri, Dec 4 – Sun, Dec 6", for the chip. */
  label: string;
  /** Set when the house's minimum stretched the stay past what the guest asked for. */
  stretched: boolean;
};

export type FinderInput = {
  house: HouseId;
  nights: FinderLength;
  weekendsOnly: boolean;
  asOf: string;
  pace: YearPace;
  taken: readonly string[];
  /** Closed nights and nights another guest is holding. Neither can be offered. */
  blocked: readonly string[];
  guests?: number;
  children?: number;
  limit?: number;
  horizonDays?: number;
};

function chipDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The next stays this house can actually quote at the length the guest wants.
 *
 * Every window is run through `quoteStay` with the same taken and blocked nights the reserve card uses, so a chip
 * the finder offers is one the card will quote rather than refuse. A weekend window arrives on a Friday. When the
 * house's minimum for that arrival is longer than the ask, the window is stretched to the minimum and says so,
 * instead of being dropped — a guest asking for two nights over a holiday would rather see "3 nights" than nothing.
 *
 * No price is returned. Picking a window only fills the dates; the card does the quoting.
 */
export function findOpenWindows(input: FinderInput): FinderWindow[] {
  const { house, nights, weekendsOnly, asOf, pace, taken } = input;
  if (input.guests !== undefined && !partyFits(house, input.guests, input.children).ok) return [];
  const limit = input.limit ?? 6;
  const horizon = addDays(asOf, input.horizonDays ?? 180);
  const blocked = [...input.blocked];
  const options = {
    asOf,
    pace,
    closed: blocked,
    ...(input.guests !== undefined ? { guests: input.guests, ...(input.children !== undefined ? { children: input.children } : {}) } : {}),
  };
  const found: FinderWindow[] = [];
  let cursor = addDays(asOf, 1);
  while (cursor < horizon && found.length < limit) {
    if (weekendsOnly && weekdayIndex(cursor) !== 5) {
      cursor = addDays(cursor, 1);
      continue;
    }
    let length: number = nights;
    let quote = quoteStay(house, cursor, addDays(cursor, length), taken, options);
    if (!quote.ok && quote.minNights > length) {
      length = quote.minNights;
      quote = quoteStay(house, cursor, addDays(cursor, length), taken, options);
    }
    if (!quote.ok) {
      cursor = addDays(cursor, 1);
      continue;
    }
    found.push({
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      nights: quote.nights.length,
      label: `${chipDate(quote.checkIn)} – ${chipDate(quote.checkOut)}`,
      stretched: quote.nights.length > nights,
    });
    cursor = weekendsOnly ? addDays(cursor, 7) : quote.checkOut;
  }
  return found;
}
