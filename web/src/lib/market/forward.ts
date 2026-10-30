import { RIVER_FIRST_STAY } from '../brand';
import type { PaceStay } from '../revenue-goals';
import { addDays } from './dates';
import { median } from './stats';
import type { HouseId } from './types';

export type ForwardWindow = {
  days: 30 | 60 | 90;
  /** Nights the house can actually sell in this window. River nights before the first stay are left out. */
  sellable: number;
  booked: number;
  bookedShare: number;
  startingStays: number;
  /** Calendar blocks in the window that are not stays. They are left out of the sellable nights. */
  held: number;
};

const WINDOWS = [30, 60, 90] as const;

function clipNights(stay: PaceStay, from: string, to: string, house: HouseId): string[] {
  const nights: string[] = [];
  let cursor = stay.checkIn < from ? from : stay.checkIn;
  const stop = stay.checkOut < to ? stay.checkOut : to;
  while (cursor < stop) {
    if (house !== 'river' || cursor >= RIVER_FIRST_STAY) nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

export function forwardWindow(
  house: HouseId,
  stays: PaceStay[],
  asOf: string,
  days: 30 | 60 | 90,
  closed: readonly string[] = [],
): ForwardWindow {
  const end = addDays(asOf, days);
  const mine = stays.filter((stay) => stay.propertyId === house && stay.status !== 'cancelled' && stay.checkIn && stay.checkOut);
  const taken = new Set<string>();
  for (const stay of mine) {
    for (const night of clipNights(stay, asOf, end, house)) taken.add(night);
  }
  const blocks = new Set(closed);
  let sellable = 0;
  let held = 0;
  let cursor = asOf;
  while (cursor < end) {
    if (house !== 'river' || cursor >= RIVER_FIRST_STAY) {
      if (blocks.has(cursor) && !taken.has(cursor)) held += 1;
      else sellable += 1;
    }
    cursor = addDays(cursor, 1);
  }
  const startingStays = mine.filter(
    (stay) =>
      stay.status !== 'blocked' &&
      stay.checkIn >= asOf &&
      stay.checkIn < end &&
      (house !== 'river' || stay.checkIn >= RIVER_FIRST_STAY),
  ).length;
  return {
    days,
    sellable,
    booked: taken.size,
    bookedShare: sellable === 0 ? 0 : Math.round((taken.size / sellable) * 100),
    startingStays,
    held,
  };
}

export function forwardWindows(
  house: HouseId,
  stays: PaceStay[],
  asOf: string,
  closed: readonly string[] = [],
): ForwardWindow[] {
  return WINDOWS.map((days) => forwardWindow(house, stays, asOf, days, closed));
}

/** Sample comp occupancy already stored on each night, as a share from 0 to 100. */
export function sampleBookedShare(shares: number[], days: number): number {
  if (shares.length === 0 || days <= 0) return 0;
  return Math.round(median(shares.slice(0, days)));
}
